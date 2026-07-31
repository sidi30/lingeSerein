/**
 * Client de l'endpoint transactionnel du mailer.
 *
 * L'API n'embarque AUCUN SMTP : le transport vit dans `apps/mailer`, qui a déjà un
 * compte Gmail configuré en production. Dupliquer un second SMTP ici, ce serait
 * dupliquer les secrets et garantir qu'ils divergent un jour. L'API se contente
 * donc d'appeler le mailer en HTTP interne — le motif exact de l'intake de devis
 * (mailer → API), pris en sens inverse.
 *
 * Partage de responsabilité : l'API envoie des DONNÉES, le mailer possède les
 * GABARITS. Aucun HTML n'est fabriqué ici — c'est ce qui permet de retoucher un
 * email sans redéployer l'API.
 *
 * Variables d'environnement :
 *   - `INTERNAL_INTAKE_SECRET` (requis) — le MÊME secret que l'intake de devis,
 *     rien à générer. Absent ⇒ aucun email n'est tenté (fail-closed silencieux :
 *     l'email est un complément, jamais le canal principal).
 *   - `MAILER_INTERNAL_URL` (optionnel) — défaut `http://ls-mailer:3010`, nom du
 *     conteneur sur le réseau Docker. Ce n'est PAS localhost : l'API et le mailer
 *     sont deux conteneurs distincts.
 */

/**
 * Gabarits exposés par le mailer — union fermée, il refuse tout autre nom.
 *
 * ⚠️ Ajouter un nom ICI ne suffit PAS : `apps/mailer` valide le corps en union
 * discriminée `.strict()` et répond 400 pour un `template` qu'il ne connaît pas,
 * ou pour un champ de données qu'il n'attend pas. Tout ajout ici doit avoir son
 * pendant dans `apps/mailer/src/app.ts` (schéma + `renderNotify`) ET
 * `apps/mailer/src/templates.ts` (gabarit HTML) — sans quoi l'envoi échoue
 * proprement (l'appelant journalise et poursuit) mais l'email n'arrive jamais.
 *
 * Charges utiles, à garder synchronisées avec les schémas du mailer :
 *   - `order_confirmation_client` : clientNom, orderNumber, dateLivraison
 *     (AAAA-MM-JJ), creneau?, lignes[{designation, qty}], sousTotalCents,
 *     livraisonCents, totalCents, livraisonSurDevis ;
 *   - `order_notification_owner`  : idem + clientEmail?, clientTel?,
 *     clientAdresse?, source ;
 *   - `round_assigned_driver`     : livreurNom, datePassage (AAAA-MM-JJ),
 *     stopsCount, zone?.
 */
export type MailTemplate =
  | "rotation_reminder_client"
  | "rotation_reminder_owner"
  | "rotation_overdue"
  /** Confirmation envoyée au client dès l'enregistrement de sa commande. */
  | "order_confirmation_client"
  /** Détail complet de la commande envoyé aux gestionnaires. */
  | "order_notification_owner"
  /** Prévient un livreur qu'une tournée vient de lui être affectée. */
  | "round_assigned_driver";

export interface SendMailInput {
  to: string;
  subject: string;
  template: MailTemplate;
  /** Charge utile du gabarit. Le mailer valide en `.strict()` : tout champ inconnu = 400. */
  data: Record<string, unknown>;
}

export interface SendMailResult {
  ok: boolean;
  status?: number;
  messageId?: string;
  error?: string;
}

const DEFAULT_MAILER_URL = "http://ls-mailer:3010";

/** Délai au-delà duquel on abandonne l'email : un cron ne doit pas rester pendu. */
const TIMEOUT_MS = 10_000;

/**
 * Formate une date pour le mailer : STRICTEMENT `AAAA-MM-JJ`.
 *
 * Le mailer rend les dates en français sans `Intl` (pour rester déterministe entre
 * environnements) et refuse un ISO complet. `toISOString()` est proscrit ici : il
 * convertit en UTC et décale d'un jour toute date du soir en heure d'été — le
 * client recevrait « passage le 12 » pour un passage le 13.
 */
export function toMailDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Envoie un email transactionnel. **Ne lève jamais** : renvoie `ok: false`.
 *
 * L'appelant écrit la notification in-app AVANT d'appeler cette fonction. Un
 * mailer indisponible ne doit donc jamais faire échouer un cron, ni empêcher la
 * notification qui, elle, fonctionne. Le résultat est renvoyé fidèlement (et non
 * « best effort optimiste ») parce que l'appelant s'en sert pour décider s'il
 * horodate l'envoi : marquer un email non parti le supprimerait pour toujours.
 */
export async function sendTransactionalMail(input: SendMailInput): Promise<SendMailResult> {
  const secret = process.env["INTERNAL_INTAKE_SECRET"];
  if (!secret) {
    return { ok: false, error: "INTERNAL_INTAKE_SECRET absent — email non tenté" };
  }

  const baseUrl = process.env["MAILER_INTERNAL_URL"] ?? DEFAULT_MAILER_URL;
  const url = `${baseUrl.replace(/\/+$/, "")}/api/internal/notify`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": secret,
      },
      body: JSON.stringify(input),
      signal: controller.signal,
    });

    if (!response.ok) {
      // 400 corps invalide · 401 mauvais secret · 503 secret absent côté mailer
      // · 502 échec SMTP. Le détail part dans les logs : c'est la seule trace
      // exploitable quand un rappel n'arrive pas chez un client.
      const body = await response.text().catch(() => "");
      return {
        ok: false,
        status: response.status,
        error: `Mailer HTTP ${response.status}${body ? ` — ${body.slice(0, 300)}` : ""}`,
      };
    }

    const payload = (await response.json().catch(() => ({}))) as { messageId?: string };
    return { ok: true, status: response.status, messageId: payload.messageId };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: controller.signal.aborted ? `Mailer injoignable (timeout ${TIMEOUT_MS} ms)` : reason,
    };
  } finally {
    clearTimeout(timer);
  }
}
