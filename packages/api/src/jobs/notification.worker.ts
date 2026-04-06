import { Worker, type ConnectionOptions, type Job } from "bullmq";
import type { PrismaClient, NotificationType, NotificationChannel, Prisma } from "@prisma/client";
import { QUEUE_NAMES } from "./queue.js";

export interface NotificationJobData {
  userId: string;
  type: NotificationType;
  channel: NotificationChannel;
  title: string;
  body: string;
  data?: Prisma.InputJsonValue;
}

/**
 * Notification dispatch worker.
 *
 * - Creates a Notification record in the database.
 * - Placeholder for Expo push notification dispatch.
 * - Placeholder for Resend email dispatch.
 */
export function createNotificationWorker(
  connection: ConnectionOptions,
  prisma: PrismaClient,
): Worker<NotificationJobData> {
  const worker = new Worker<NotificationJobData>(
    QUEUE_NAMES.NOTIFICATIONS,
    async (job: Job<NotificationJobData>) => {
      const { userId, type, channel, title, body, data } = job.data;

      // Check notification settings for this user/type
      const setting = await prisma.notificationSetting.findUnique({
        where: { userId_type: { userId, type } },
      });

      if (setting && !setting.enabled) {
        console.log(`[notification] Skipped — user ${userId} disabled ${type} notifications`);
        return;
      }

      const effectiveChannel = setting?.channel ?? channel;

      // Create notification record
      const notification = await prisma.notification.create({
        data: {
          userId,
          type,
          channel: effectiveChannel,
          title,
          body,
          data: data ?? {},
          sentAt: new Date(),
        },
      });

      // Dispatch based on channel
      if (effectiveChannel === "PUSH" || effectiveChannel === "BOTH") {
        // TODO: Integrate Expo push notifications
        console.log(`[notification] PUSH placeholder — id=${notification.id}, user=${userId}, title="${title}"`);
      }

      if (effectiveChannel === "EMAIL" || effectiveChannel === "BOTH") {
        // TODO: Integrate Resend email service
        console.log(`[notification] EMAIL placeholder — id=${notification.id}, user=${userId}, title="${title}"`);
      }

      return { notificationId: notification.id };
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
