import { Worker, type ConnectionOptions, type Job } from "bullmq";
import type { PrismaClient, NotificationType, NotificationChannel, Prisma } from "@prisma/client";
import { QUEUE_NAMES } from "./queue.js";
import { notify } from "../utils/notify.js";

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
): Worker<NotificationJobData> {
  const worker = new Worker<NotificationJobData>(
    QUEUE_NAMES.NOTIFICATIONS,
    async (job: Job<NotificationJobData>) => {
      const result = await notify(prisma, job.data);

      if (result.skipped) {
        console.log(
          `[notification] Ignorée — l'utilisateur ${job.data.userId} a désactivé ${job.data.type}`,
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
