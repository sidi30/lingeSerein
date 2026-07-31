import type { PrismaClient, Prisma, NotificationChannel, NotificationType } from "@prisma/client";
import { sendExpoPush, type PushMessage } from "./push.js";
import { getPushQueue, JOB_PUSH } from "../jobs/push-queue.js";

/**
 * Point d'émission UNIQUE d'une notification IN-APP.
 *
 * Tout ce qui notifie passe par ici — les crons de rotation comme le worker de la
 * file `notifications`. Un seul chemin signifie une seule lecture des préférences
 * utilisateur et un seul endroit à corriger.
 *
 * ⚠️ Cette fonction n'envoie PAS d'email. L'email de rotation vise très souvent un
 * client qui n'a AUCUN compte (`Rotation.userId` est null : rencontré sur un
 * marché, devis au téléphone) : son adresse vit dans le snapshot
 * `Rotation.clientEmail`, pas dans `users`. Un envoi indexé sur `userId` ne
 * l'atteindrait donc jamais — c'est-à-dire la majorité des destinataires réels.
 * L'email part séparément, via `utils/mailer.ts`, avec l'adresse de la rotation.
 */
export interface NotifyInput {
  userId: string;
  type: NotificationType;
  /** Canal souhaité — la préférence de l'utilisateur reste prioritaire. */
  channel: NotificationChannel;
  title: string;
  body: string;
  /**
   * Charge utile du deep-link mobile. DOIT contenir au minimum `{type, rotationId}`
   * (ou l'identifiant d'entité correspondant) : sans elle, le tap sur la
   * notification n'ouvre rien côté mobile.
   */
  data?: Prisma.InputJsonValue;
}

export interface NotifyResult {
  /** null quand l'utilisateur a désactivé ce type de notification. */
  notificationId: string | null;
  skipped: boolean;
}

/**
 * Canal Android sur lequel le mobile a déclaré ses notifications
 * (`Notifications.setNotificationChannelAsync("default", …)`). Un `channelId`
 * inconnu de l'appareil rend la notification MUETTE au lieu de la faire échouer :
 * ce littéral doit rester aligné sur `apps/mobile/lib/notifications.ts`.
 */
const CANAL_ANDROID = "default";

/** Notification telle que Prisma vient de la créer — tout ce dont le push a besoin. */
interface NotificationEnvoyee {
  id: string;
  userId: string;
  title: string;
  body: string;
  data: Prisma.JsonValue;
}

/**
 * Distribue la notification aux appareils de l'utilisateur via Expo Push.
 *
 * **Ne lève jamais.** Un push est un confort : son échec ne doit ni faire échouer
 * le cron appelant, ni empêcher la notification in-app, qui elle est déjà en base
 * au moment où l'on arrive ici.
 *
 * Deux effets de bord assumés :
 *   - les jetons morts (`DeviceNotRegistered`) sont SUPPRIMÉS. C'est le seul
 *     mécanisme qui empêche la table de se remplir d'appareils fantômes ;
 *   - la pastille iOS porte le nombre réel de notifications non lues. L'index
 *     `(userId, readAt)` existe précisément pour ce comptage.
 */
export async function deliverPush(
  prisma: PrismaClient,
  notification: NotificationEnvoyee,
): Promise<void> {
  try {
    const appareils = await prisma.deviceToken.findMany({
      where: { userId: notification.userId },
      select: { token: true },
    });

    if (appareils.length === 0) return;

    const badge = await prisma.notification.count({
      where: { userId: notification.userId, readAt: null },
    });

    // `data` part TEL QUEL : c'est ce que le mobile lit pour ouvrir le bon écran
    // au tap. Le vider ou le réécrire ici, c'est une notification qui n'ouvre
    // rien. Seule une valeur non-objet (null, tableau, scalaire) est écartée,
    // faute d'être transmissible.
    const data =
      notification.data !== null &&
      typeof notification.data === "object" &&
      !Array.isArray(notification.data)
        ? (notification.data as Record<string, unknown>)
        : {};

    const messages: PushMessage[] = appareils.map((appareil) => ({
      to: appareil.token,
      title: notification.title,
      body: notification.body,
      data,
      sound: "default",
      channelId: CANAL_ANDROID,
      badge,
    }));

    const result = await sendExpoPush(messages);

    if (result.jetonsMorts.length > 0) {
      const { count } = await prisma.deviceToken.deleteMany({
        where: { token: { in: result.jetonsMorts } },
      });
      console.log(`[push] ${count} jeton(s) mort(s) supprimé(s) (DeviceNotRegistered)`);
    }

    for (const erreur of result.erreurs) {
      // Erreurs non fatales pour le jeton : on trace sans rien supprimer. C'est
      // la seule piste exploitable quand un push n'arrive pas.
      console.error(`[push] Échec partiel (notification ${notification.id}) : ${erreur}`);
    }
  } catch (err) {
    // Filet de dernier recours : même une panne Prisma ne doit pas remonter.
    const raison = err instanceof Error ? err.message : String(err);
    console.error(`[push] Distribution abandonnée (notification ${notification.id}) : ${raison}`);
  }
}

/**
 * Crée la notification in-app et déclenche la distribution push.
 *
 * La préférence de l'utilisateur (`NotificationSetting`) fait autorité : elle peut
 * désactiver le type entièrement, ou imposer un canal différent de celui demandé
 * par l'appelant.
 */
export async function notify(prisma: PrismaClient, input: NotifyInput): Promise<NotifyResult> {
  const setting = await prisma.notificationSetting.findUnique({
    where: { userId_type: { userId: input.userId, type: input.type } },
  });

  if (setting && !setting.enabled) {
    return { notificationId: null, skipped: true };
  }

  const effectiveChannel = setting?.channel ?? input.channel;

  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      channel: effectiveChannel,
      title: input.title,
      body: input.body,
      data: input.data ?? {},
      sentAt: new Date(),
    },
  });

  // Le filtrage par canal est fait ICI, une seule fois : `deliverPush` ne
  // relit pas les préférences, il ne les connaît même pas.
  if (effectiveChannel === "PUSH" || effectiveChannel === "BOTH") {
    const queue = getPushQueue();
    let misEnFile = false;

    if (queue) {
      // Sortie du fil de la requête : joindre Expo peut prendre jusqu'à 10 s
      // (son timeout), et rien ne justifie de faire attendre l'utilisateur qui
      // vient de valider une commande. La notification, elle, est DÉJÀ écrite —
      // le badge bouge tout de suite. En prime, BullMQ réessaie trois fois là où
      // l'appel direct perdait le push au premier hoquet réseau.
      try {
        await queue.add(JOB_PUSH, { notificationId: notification.id });
        misEnFile = true;
      } catch (err) {
        // Redis indisponible. Le contrat de ce module est qu'un échec de push ne
        // remonte JAMAIS à l'appelant : une commande validée ne doit pas échouer
        // parce qu'une notification n'a pas pu partir. On retombe donc sur
        // l'envoi direct, qui absorbe déjà ses propres erreurs.
        console.error(
          `[notify] Mise en file du push impossible (${err instanceof Error ? err.message : "inconnu"}) — envoi direct`,
        );
      }
    }

    if (!misEnFile) {
      // Ni file, ni Redis (tests, scripts, seed), ou file en panne : envoi
      // direct, comportement identique à celui d'avant.
      await deliverPush(prisma, notification);
    }
  }

  return { notificationId: notification.id, skipped: false };
}

/**
 * Règle UNIQUE de l'autorisation d'email, appliquée à un réglage déjà lu.
 *
 * Aucune préférence enregistrée ⇒ autorisé : c'est le cas de tous les comptes
 * qui n'ont jamais ouvert l'écran des réglages, et de tous les destinataires
 * sans compte du tout.
 */
function autoriseParReglage(setting: { enabled: boolean; channel: string } | undefined): boolean {
  if (!setting) return true;
  return setting.enabled && (setting.channel === "EMAIL" || setting.channel === "BOTH");
}

/**
 * Vrai si ce destinataire accepte de recevoir ce type par email.
 *
 * Consultée AVANT d'appeler le mailer. Un client sans compte n'a par construction
 * aucune préférence enregistrée : il reçoit l'email, puisque c'est le seul canal
 * par lequel on puisse l'atteindre.
 */
export async function emailAutorise(
  prisma: PrismaClient,
  userId: string | null,
  type: NotificationType,
): Promise<boolean> {
  if (!userId) return true;

  const setting = await prisma.notificationSetting.findUnique({
    where: { userId_type: { userId, type } },
  });

  return autoriseParReglage(setting ?? undefined);
}

/**
 * Même règle, en LOT : une seule requête pour N destinataires.
 *
 * Existe pour les envois collectifs (l'alerte « nouvelle commande » aux
 * gestionnaires), où l'appel unitaire faisait une requête Prisma PAR admin — un
 * N+1 sur le chemin de création de commande. La règle n'est pas réécrite ici :
 * les deux fonctions partagent `autoriseParReglage`, sans quoi elles finiraient
 * par ne plus dire la même chose.
 *
 * @returns les identifiants AUTORISÉS, dans un ensemble.
 */
export async function emailsAutorises(
  prisma: PrismaClient,
  userIds: string[],
  type: NotificationType,
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();

  const settings = await prisma.notificationSetting.findMany({
    where: { userId: { in: userIds }, type },
    select: { userId: true, enabled: true, channel: true },
  });

  const parUtilisateur = new Map(settings.map((s) => [s.userId, s]));
  return new Set(userIds.filter((id) => autoriseParReglage(parUtilisateur.get(id))));
}
