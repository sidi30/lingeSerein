import { Worker, type ConnectionOptions } from "bullmq";
import type { PrismaClient } from "@prisma/client";
import { QUEUE_NAMES } from "./queue.js";

/**
 * Stock alert worker — runs as a repeatable CRON job (every hour).
 *
 * For each active client, checks if cleanSets / totalInCirculation
 * falls below the user's stockAlertThreshold and creates a STOCK_LOW
 * notification when it does.
 */
export function createStockAlertWorker(
  connection: ConnectionOptions,
  prisma: PrismaClient,
): Worker {
  const worker = new Worker(
    QUEUE_NAMES.STOCK_ALERTS,
    async () => {
      const clientStocks = await prisma.clientStock.findMany({
        where: {
          totalInCirculation: { gt: 0 },
        },
      });

      for (const stock of clientStocks) {
        // Fetch the user to check active status and threshold
        const user = await prisma.user.findFirst({
          where: {
            id: stock.userId,
            role: "ROLE_CLIENT",
            isActive: true,
            deletedAt: null,
          },
          include: {
            subscription: true,
          },
        });

        if (!user || !user.subscription || user.subscription.status !== "ACTIVE") {
          continue;
        }

        const ratio = (stock.cleanSets / stock.totalInCirculation) * 100;

        if (ratio < user.stockAlertThreshold) {
          // Check if we already sent a STOCK_LOW notification in the last 24h
          const recentNotif = await prisma.notification.findFirst({
            where: {
              userId: user.id,
              type: "STOCK_LOW",
              createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            },
          });

          if (!recentNotif) {
            await prisma.notification.create({
              data: {
                userId: user.id,
                type: "STOCK_LOW",
                channel: "BOTH",
                title: "Stock bas",
                body: `Votre stock ${stock.productRange} est bas (${Math.round(ratio)}%). Seulement ${stock.cleanSets} sets propres sur ${stock.totalInCirculation} en circulation.`,
                data: {
                  productRange: stock.productRange,
                  cleanSets: stock.cleanSets,
                  totalInCirculation: stock.totalInCirculation,
                  ratio: Math.round(ratio),
                },
                sentAt: new Date(),
              },
            });

            console.log(
              `[stock-alert] Notification created for user ${user.id} — ${stock.productRange} at ${Math.round(ratio)}%`,
            );
          }
        }
      }
    },
    { connection },
  );

  worker.on("completed", (job) => {
    console.log(`[stock-alert] Job ${job?.id ?? "unknown"} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[stock-alert] Job ${job?.id ?? "unknown"} failed:`, err.message);
  });

  return worker;
}
