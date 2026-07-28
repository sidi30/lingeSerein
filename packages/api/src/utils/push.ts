/**
 * Client de l'API Expo Push.
 *
 * Même philosophie que `utils/mailer.ts` : la notification est écrite EN BASE
 * d'abord, le push part ensuite en best-effort. Cette fonction **ne lève jamais**
 * — un service Expo indisponible ne doit pas faire échouer un cron de rotation
 * qui, lui, a correctement fait son travail.
 *
 * Différence avec le mailer : celui-ci ne connaît PAS la base. Il reçoit des
 * messages, rend compte de ce qui s'est passé, et laisse l'appelant décider quoi
 * persister (`utils/notify.ts` supprime les jetons morts). Le mailer applique la
 * même séparation, pour la même raison : c'est ce qui rend le tout testable sans
 * base ni réseau.
 *
 * Variables d'environnement :
 *   - `EXPO_ACCESS_TOKEN` (optionnel) — jeton de compte Expo, envoyé en
 *     `Authorization: Bearer`. Sans lui l'envoi fonctionne, mais Expo applique un
 *     quota plus strict par adresse IP et recommande donc de le poser en
 *     production. Il se génère depuis expo.dev (Account settings → Access tokens)
 *     et n'a rien à voir avec les identifiants EAS Build.
 *
 * ⚠️ ACCUSÉS DE RÉCEPTION (receipts) — VOLONTAIREMENT NON IMPLÉMENTÉS.
 *
 * Expo répond en deux temps : un *ticket* synchrone (accepté / refusé par Expo),
 * puis un *receipt* asynchrone récupérable ~15 min plus tard via
 * `POST /--/api/v2/push/getReceipts`, qui seul porte le verdict final d'APNs et
 * de FCM. Un `status: "ok"` ici ne garantit donc PAS la remise.
 *
 * Ce que ça implique concrètement, et qu'il faut assumer : un appareil dont
 * l'application a été désinstallée n'est pas toujours signalé dans le ticket. Son
 * jeton peut survivre en base jusqu'à ce que la purge quotidienne
 * (`jobs/device-token.worker.ts`, 90 jours sans réenregistrement) l'élimine.
 *
 * Pourquoi s'en contenter : cette purge borne déjà la table, ce qui était le seul
 * vrai risque (une table de jetons qui grossit indéfiniment). Le mobile
 * réenregistre son jeton à chaque lancement — un appareil désinstallé cesse donc
 * mécaniquement de rafraîchir `lastSeenAt` et sort du parc. Traiter les receipts
 * demanderait de persister les identifiants de tickets (table + migration) et un
 * second cron différé, pour gagner « quelques semaines » sur la suppression d'un
 * jeton dont le coût réel est une ligne dans un lot de 100. Le jour où ce coût
 * deviendra mesurable, l'endroit où brancher les receipts est ici, à partir des
 * `ticketIds` déjà renvoyés par `PushResult`.
 */

/** Point d'entrée de l'API Expo Push. */
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/** Délai au-delà duquel on abandonne un lot : un cron ne doit pas rester pendu. */
const TIMEOUT_MS = 10_000;

/**
 * Taille maximale d'un lot imposée par Expo. Au-delà, la requête entière est
 * refusée : on découpe donc, sans jamais faire un appel réseau par jeton.
 */
const TAILLE_LOT = 100;

/**
 * Forme d'un jeton Expo valide.
 *
 * Filtré AVANT l'envoi pour deux raisons : Expo rejette la requête complète
 * lorsqu'un `to` est syntaxiquement invalide (99 messages légitimes perdus à
 * cause d'un seul), et un jeton qui n'a pas cette forme ne pourra jamais rien
 * recevoir — il est traité comme mort, donc supprimé. La route
 * d'enregistrement accepte n'importe quelle chaîne : c'est ici qu'on s'en protège.
 */
const FORMAT_JETON = /^Expo(nent)?PushToken\[[^\]]+\]$/;

export interface PushMessage {
  /** Jeton Expo de l'appareil destinataire. */
  to: string;
  title: string;
  body: string;
  /**
   * Charge utile du deep-link. Transmise TELLE QUELLE au mobile, qui y lit
   * `type` et l'identifiant d'entité pour ouvrir le bon écran au tap.
   */
  data?: Record<string, unknown>;
  sound?: "default" | null;
  /** Canal Android — doit exister côté mobile, sinon la notification est muette. */
  channelId?: string;
  /** Pastille iOS. Le compte des non-lues, pas un incrément. */
  badge?: number;
}

export interface PushResult {
  /** Messages acceptés par Expo (acceptés ≠ remis — voir la note sur les receipts). */
  envoyes: number;
  /**
   * Jetons définitivement morts (`DeviceNotRegistered` ou format invalide).
   * L'appelant DOIT les supprimer : sans cela la table grossit indéfiniment et
   * chaque envoi paie le coût de destinataires qui ne recevront jamais rien.
   */
  jetonsMorts: string[];
  /**
   * Échecs qui ne condamnent PAS le jeton (`MessageTooBig`,
   * `MessageRateExceeded`, `InvalidCredentials`, HTTP, réseau). Journalisés,
   * jamais transformés en suppression : effacer un jeton sur une erreur passagère
   * couperait le push d'un appareil parfaitement vivant.
   */
  erreurs: string[];
  /** Identifiants de tickets — point d'accroche si les receipts sont un jour traités. */
  ticketIds: string[];
}

/** Un ticket Expo, positionnellement aligné sur les messages du lot envoyé. */
interface ExpoTicket {
  status?: string;
  id?: string;
  message?: string;
  details?: { error?: string };
}

interface ExpoResponse {
  data?: ExpoTicket[];
  errors?: { code?: string; message?: string }[];
}

/** En-têtes de la requête, avec le jeton de compte s'il est configuré. */
function entetes(): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
  };

  const accessToken = process.env["EXPO_ACCESS_TOKEN"];
  if (accessToken) {
    headers["authorization"] = `Bearer ${accessToken}`;
  }

  return headers;
}

/**
 * Envoie UN lot (≤ 100 messages) et consigne le résultat dans `result`.
 * Ne lève pas : toute panne devient une entrée dans `result.erreurs`.
 */
async function envoyerLot(lot: PushMessage[], result: PushResult): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: entetes(),
      body: JSON.stringify(lot),
      signal: controller.signal,
    });

    if (!response.ok) {
      // 400 corps invalide · 401/403 EXPO_ACCESS_TOKEN erroné · 429 quota
      // dépassé · 5xx panne Expo. Aucun de ces cas ne condamne un jeton : le lot
      // entier est simplement perdu, il repartira au prochain événement.
      const corps = await response.text().catch(() => "");
      result.erreurs.push(
        `HTTP ${response.status} sur un lot de ${lot.length}${corps ? ` — ${corps.slice(0, 300)}` : ""}`,
      );
      return;
    }

    const payload = (await response.json().catch(() => ({}))) as ExpoResponse;

    // Erreur globale : Expo a refusé la requête entière, aucun ticket à lire.
    if (payload.errors?.length) {
      for (const e of payload.errors) {
        result.erreurs.push(`Expo a refusé le lot : ${e.code ?? "?"} — ${e.message ?? "?"}`);
      }
      return;
    }

    const tickets = payload.data;
    if (!Array.isArray(tickets)) {
      result.erreurs.push(`Réponse Expo inattendue sur un lot de ${lot.length}`);
      return;
    }

    // Les tickets sont alignés sur l'ordre d'envoi : c'est le SEUL lien entre un
    // verdict et le jeton concerné, Expo ne réémet pas l'adresse.
    tickets.forEach((ticket, index) => {
      const message = lot[index];
      if (!message) return;

      if (ticket.status === "ok") {
        result.envoyes++;
        if (ticket.id) result.ticketIds.push(ticket.id);
        return;
      }

      const code = ticket.details?.error;
      if (code === "DeviceNotRegistered") {
        // Application désinstallée, jeton révoqué ou réattribué : il ne
        // redeviendra jamais valide.
        result.jetonsMorts.push(message.to);
        return;
      }

      result.erreurs.push(`${code ?? "ErreurInconnue"} — ${ticket.message ?? "sans détail"}`);
    });
  } catch (err) {
    const raison = err instanceof Error ? err.message : String(err);
    result.erreurs.push(
      controller.signal.aborted ? `Expo injoignable (timeout ${TIMEOUT_MS} ms)` : raison,
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Envoie des notifications push via Expo. **Ne lève jamais.**
 *
 * Découpe automatiquement en lots de 100 et rend compte fidèlement : c'est
 * l'appelant qui décide quoi faire des jetons morts, comme le mailer laisse
 * l'appelant décider s'il horodate l'envoi.
 */
export async function sendExpoPush(messages: PushMessage[]): Promise<PushResult> {
  const result: PushResult = { envoyes: 0, jetonsMorts: [], erreurs: [], ticketIds: [] };

  if (messages.length === 0) return result;

  const valides: PushMessage[] = [];
  for (const message of messages) {
    if (FORMAT_JETON.test(message.to)) valides.push(message);
    else result.jetonsMorts.push(message.to);
  }

  for (let i = 0; i < valides.length; i += TAILLE_LOT) {
    await envoyerLot(valides.slice(i, i + TAILLE_LOT), result);
  }

  return result;
}

/** Exporté pour les tests : la taille de lot réellement appliquée. */
export const __pushInternals = { TAILLE_LOT, FORMAT_JETON };
