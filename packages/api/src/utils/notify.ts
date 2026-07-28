import type { PrismaClient, Prisma, NotificationChannel, NotificationType } from "@prisma/client";

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
 * ⚠️ POINT DE BRANCHEMENT PUSH — non câblé.
 *
 * La table `DeviceToken` existe désormais et se remplit (POST
 * /api/v1/notifications/device-token), mais l'appel à l'API Expo Push reste à
 * écrire, et le mobile doit d'abord embarquer `expo-notifications` — ce qui exige
 * un rebuild EAS, un OTA crasherait. `EXPO_ACCESS_TOKEN` est déjà prévu dans le
 * schéma d'environnement (packages/shared/src/env.ts).
 *
 * Volontairement silencieux : un push est un confort, son absence ne doit pas
 * noyer les logs d'un cron qui, lui, a bien fait son travail.
 */
async function deliverPush(_notification: { id: string; userId: string }): Promise<void> {
  // Intentionnellement vide — voir le commentaire ci-dessus.
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

  if (effectiveChannel === "PUSH" || effectiveChannel === "BOTH") {
    await deliverPush(notification);
  }

  return { notificationId: notification.id, skipped: false };
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

  if (!setting) return true;
  return setting.enabled && (setting.channel === "EMAIL" || setting.channel === "BOTH");
}
