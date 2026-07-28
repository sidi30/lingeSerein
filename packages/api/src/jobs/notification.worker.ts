import { Worker, type ConnectionOptions, type Job } from "bullmq";
import type { PrismaClient, NotificationType, NotificationChannel, Prisma } from "@prisma/client";
import { QUEUE_NAMES } from "./queue.js";
import { deliverPush, notify } from "../utils/notify.js";
import { JOB_PUSH } from "./push-queue.js";

/** Données du job `deliver-push` — la notification est déjà en base. */
export interface PushJobData {
  notificationId: string;
}

export interface NotificationJobData {
  userId: string;
  type: NotificationType;
  channel: NotificationChannel;
  title: string;
  body: string;
  data?: Prisma.InputJsonValue;
}

/**
 * Worker de distribution des notifications.
 *
 * Il ne fait qu'exécuter en asynchrone le chemin d'émission commun
 * (`utils/notify.ts`) : préférences utilisateur, création de l'enregistrement,
 * puis distribution push/email. Les appelants synchrones (crons de rotation)
 * appellent `notify()` directement — même code, mêmes règles.
 */
export function createNotificationWorker(
  connection: ConnectionOptions,
  prisma: PrismaClient,
): Worker<NotificationJobData | PushJobData> {
  const worker = new Worker<NotificationJobData | PushJobData>(
    QUEUE_NAMES.NOTIFICATIONS,
    async (job: Job<NotificationJobData | PushJobData>) => {
      // Distribution push d'une notification DÉJÀ écrite : c'est le chemin que
      // prend `notify()` depuis une requête HTTP, pour ne pas y laisser traîner
      // l'appel à Expo et son timeout de 10 s.
      if (job.name === JOB_PUSH) {
        const { notificationId } = job.data as PushJobData;
        const notification = await prisma.notification.findUnique({
          where: { id: notificationId },
        });
        // Disparue entre-temps (purge, suppression de compte) : rien à envoyer,
        // et surtout pas de quoi faire échouer le job.
        if (!notification) return { delivered: false };
        await deliverPush(prisma, notification);
        return { delivered: true };
      }

      const data = job.data as NotificationJobData;
      const result = await notify(prisma, data);

      if (result.skipped) {
        console.log(
          `[notification] Ignorée — l'utilisateur ${data.userId} a désactivé ${data.type}`,
        );
      }

      return { notificationId: result.notificationId };
    },
    { connection },
  );

  worker.on("completed", (job) => {
    console.log(`[notification] Job ${job?.id ?? "unknown"} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[notification] Job ${job?.id ?? "unknown"} failed:`, err.message);
  });

  return worker;
}
