import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import type { Worker } from "bullmq";
import { createQueue, QUEUE_NAMES } from "../jobs/queue.js";
import { createStockAlertWorker } from "../jobs/stock-alert.worker.js";
import { createNotificationWorker } from "../jobs/notification.worker.js";
import { createInvoiceWorker } from "../jobs/invoice.worker.js";

/**
 * Plugin Fastify — BullMQ queues and workers.
 *
 * Registers all job queues, workers, and CRON schedules.
 * Handles graceful shutdown on app close.
 */
export default fp(async (app: FastifyInstance) => {
  const connection = {
    host: app.redis.options.host ?? "localhost",
    port: app.redis.options.port ?? 6379,
    password: app.redis.options.password,
    db: app.redis.options.db ?? 0,
  };

  // ---- Queues ----
  const notificationsQueue = createQueue(QUEUE_NAMES.NOTIFICATIONS, connection);
  const stockAlertsQueue = createQueue(QUEUE_NAMES.STOCK_ALERTS, connection);
  const invoicesQueue = createQueue(QUEUE_NAMES.INVOICES, connection);

  // ---- Workers ----
  const workers: Worker[] = [];

  workers.push(createStockAlertWorker(connection, app.prisma));
  workers.push(createNotificationWorker(connection, app.prisma));
  workers.push(createInvoiceWorker(connection, app.prisma));

  // ---- CRON Schedules ----

  // Stock alert check — every hour
  await stockAlertsQueue.upsertJobScheduler(
    "stock-alert-cron",
    { pattern: "0 * * * *" },
    {
      name: "stock-alert-check",
      data: {},
      opts: { removeOnComplete: true, removeOnFail: { count: 100 } },
    },
  );

  app.log.info("BullMQ workers and CRON schedules registered");

  // ---- Expose queues on app for route handlers ----
  app.decorate("queues", {
    notifications: notificationsQueue,
    stockAlerts: stockAlertsQueue,
    invoices: invoicesQueue,
  });

  // ---- Graceful shutdown ----
  app.addHook("onClose", async () => {
    app.log.info("Shutting down BullMQ workers...");

    // Close all workers gracefully
    await Promise.all(workers.map((w) => w.close()));

    // Close all queues
    await Promise.all([
      notificationsQueue.close(),
      stockAlertsQueue.close(),
      invoicesQueue.close(),
    ]);

    app.log.info("BullMQ workers shut down");
  });
});

// ---- Type augmentation ----
declare module "fastify" {
  interface FastifyInstance {
    queues: {
      notifications: ReturnType<typeof createQueue>;
      stockAlerts: ReturnType<typeof createQueue>;
      invoices: ReturnType<typeof createQueue>;
    };
  }
}
