import { Worker, type ConnectionOptions } from "bullmq";
import type { PrismaClient } from "@prisma/client";
import { QUEUE_NAMES } from "./queue.js";

/**
 * Quote expiry worker — cron quotidien à ~03:00.
 * Met à jour les devis ENVOYE dont dateEnvoi + validiteJours < now() → EXPIRE.
 * Réutilise la même logique que QuotesService.expireOverdue() mais s'exécute
 * sur tous les opérateurs actifs (job système, userId=null dans l'audit).
 */
export function createQuoteExpiryWorker(
  connection: ConnectionOptions,
  prisma: PrismaClient,
): Worker {
  const worker = new Worker(
    QUEUE_NAMES.QUOTE_EXPIRY,
    async () => {
      const now = new Date();

      // Récupérer tous les devis ENVOYE non supprimés
      const candidates = await prisma.quote.findMany({
        where: {
          status: "ENVOYE",
          deletedAt: null,
          dateEnvoi: { not: null },
        },
        select: { id: true, dateEnvoi: true, validiteJours: true },
      });

      const toExpire = candidates.filter((q) => {
        if (!q.dateEnvoi) return false;
        const expiresAt = new Date(q.dateEnvoi);
        expiresAt.setDate(expiresAt.getDate() + q.validiteJours);
        return expiresAt < now;
      });

      if (toExpire.length === 0) {
        console.log("[quote-expiry] No quotes to expire");
        return;
      }

      await prisma.quote.updateMany({
        where: { id: { in: toExpire.map((q) => q.id) } },
        data: { status: "EXPIRE" },
      });

      // Audit groupé (action système, userId=null)
      for (const quote of toExpire) {
        await prisma.auditLog.create({
          data: {
            userId: null,
            action: "UPDATE",
            entity: "Quote",
            entityId: quote.id,
            changes: {
              previousStatus: "ENVOYE",
              newStatus: "EXPIRE",
              reason: "Auto-expiration cron",
            },
          },
        });
      }

      console.log(`[quote-expiry] Expired ${toExpire.length} quote(s)`);
    },
    { connection },
  );

  worker.on("completed", (job) => {
    console.log(`[quote-expiry] Job ${job?.id ?? "unknown"} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[quote-expiry] Job ${job?.id ?? "unknown"} failed:`, err.message);
  });

  return worker;
}
