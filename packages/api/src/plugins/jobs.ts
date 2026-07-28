import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import type { Worker } from "bullmq";
import { createQueue, QUEUE_NAMES } from "../jobs/queue.js";
import { createStockAlertWorker } from "../jobs/stock-alert.worker.js";
import { createNotificationWorker } from "../jobs/notification.worker.js";
import { createInvoiceWorker } from "../jobs/invoice.worker.js";
import { createQuoteExpiryWorker } from "../jobs/quote-expiry.worker.js";
import { createRotationWorker } from "../jobs/rotation.worker.js";
import { createDeviceTokenWorker, RETENTION_JETONS_JOURS } from "../jobs/device-token.worker.js";

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
  const quoteExpiryQueue = createQueue(QUEUE_NAMES.QUOTE_EXPIRY, connection);
  const rotationsQueue = createQueue(QUEUE_NAMES.ROTATIONS, connection);
  const deviceTokensQueue = createQueue(QUEUE_NAMES.DEVICE_TOKENS, connection);

  // ---- Workers ----
  const workers: Worker[] = [];

  workers.push(createStockAlertWorker(connection, app.prisma));
  workers.push(createNotificationWorker(connection, app.prisma));
  workers.push(createInvoiceWorker(connection, app.prisma));
  workers.push(createQuoteExpiryWorker(connection, app.prisma));
  workers.push(createRotationWorker(connection, app.prisma));
  workers.push(createDeviceTokenWorker(connection, app.prisma));

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

  // Quote expiry check — every day at 03:00
  await quoteExpiryQueue.upsertJobScheduler(
    "quote-expiry-cron",
    { pattern: "0 3 * * *" },
    {
      name: "quote-expiry-check",
      data: {},
      opts: { removeOnComplete: true, removeOnFail: { count: 100 } },
    },
  );

  // ---- Calendrier de rotations ----
  // Trois rendez-vous quotidiens sur la même file. Les heures ne sont pas
  // interchangeables : 18 h laisse au client sa soirée pour préparer le linge,
  // 07 h le rattrape le matin même, 09 h laisse la tournée de la veille se
  // clôturer avant de déclarer quoi que ce soit en retard.
  //
  // `tz: Europe/Paris` est OBLIGATOIRE : le conteneur tourne en UTC, sans lui le
  // rappel du soir partirait à 20 h locales l'été et le rappel du matin à 08 h.
  // C'est aussi ce qui garde l'heure stable de part et d'autre du changement
  // d'heure.

  // Rappel J-1 — tous les jours à 18:00
  await rotationsQueue.upsertJobScheduler(
    "rotation-reminder-cron",
    { pattern: "0 18 * * *", tz: "Europe/Paris" },
    {
      name: "rotation-reminder",
      data: { kind: "reminder" },
      opts: { removeOnComplete: true, removeOnFail: { count: 100 } },
    },
  );

  // Rappel du jour J — tous les jours à 07:00
  await rotationsQueue.upsertJobScheduler(
    "rotation-morning-cron",
    { pattern: "0 7 * * *", tz: "Europe/Paris" },
    {
      name: "rotation-morning",
      data: { kind: "morning" },
      opts: { removeOnComplete: true, removeOnFail: { count: 100 } },
    },
  );

  // Retards — tous les jours à 09:00
  await rotationsQueue.upsertJobScheduler(
    "rotation-overdue-cron",
    { pattern: "0 9 * * *", tz: "Europe/Paris" },
    {
      name: "rotation-overdue",
      data: { kind: "overdue" },
      opts: { removeOnComplete: true, removeOnFail: { count: 100 } },
    },
  );

  // ---- Facturation des abonnements ----
  // Le worker de facturation existait sans AUCUN producteur : aucune facture
  // d'abonnement récurrent n'a jamais été générée depuis la mise en service.
  //
  // Quotidien et non mensuel : les abonnements ne démarrent pas le même jour du
  // mois, et chacun est facturé sur SA propre période (`currentPeriodEnd`), pas
  // sur un calendrier commun. Le job ne fait rien les jours sans échéance.
  //
  // 05:00 Europe/Paris : après la purge des jetons (04:00), avant le rappel du
  // matin (07:00). `tz` obligatoire — le conteneur tourne en UTC.
  await invoicesQueue.upsertJobScheduler(
    "invoice-cycle-cron",
    { pattern: "0 5 * * *", tz: "Europe/Paris" },
    {
      name: "invoice-cycle",
      data: {},
      opts: { removeOnComplete: true, removeOnFail: { count: 100 } },
    },
  );

  // Purge des jetons push dormants — tous les jours à 04:00
  // `tz` obligatoire ici aussi (conteneur en UTC). 04:00 : après l'expiration des
  // devis (03:00) et bien avant le rappel du matin (07:00), donc hors de toute
  // fenêtre où un envoi push pourrait lire la table pendant qu'on la purge.
  await deviceTokensQueue.upsertJobScheduler(
    "device-token-cleanup-cron",
    { pattern: "0 4 * * *", tz: "Europe/Paris" },
    {
      name: "device-token-cleanup",
      data: {},
      opts: { removeOnComplete: true, removeOnFail: { count: 100 } },
    },
  );

  app.log.info(
    `BullMQ workers and CRON schedules registered (rétention jetons push : ${RETENTION_JETONS_JOURS} j)`,
  );

  // ---- Expose queues on app for route handlers ----
  app.decorate("queues", {
    notifications: notificationsQueue,
    stockAlerts: stockAlertsQueue,
    invoices: invoicesQueue,
    quoteExpiry: quoteExpiryQueue,
    rotations: rotationsQueue,
    deviceTokens: deviceTokensQueue,
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
      quoteExpiryQueue.close(),
      rotationsQueue.close(),
      deviceTokensQueue.close(),
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
      quoteExpiry: ReturnType<typeof createQueue>;
      rotations: ReturnType<typeof createQueue>;
      deviceTokens: ReturnType<typeof createQueue>;
    };
  }
}
