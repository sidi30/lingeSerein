import { Worker, type ConnectionOptions } from "bullmq";
import type { PrismaClient } from "@prisma/client";
import { QUEUE_NAMES } from "./queue.js";
import { QuotesService } from "../services/quotes.service.js";

/**
 * Expiration des devis — cron horaire.
 *
 * Ne porte AUCUNE logique propre : la règle vit dans
 * `QuotesService.expireOverdue`, appelée ici sans opérateur, donc sur tous. La
 * copie qui vivait dans ce fichier avait déjà divergé de l'originale (elle seule
 * écrivait l'audit), ce qui est exactement ce qu'on veut ne plus pouvoir faire.
 */
export function createQuoteExpiryWorker(
  connection: ConnectionOptions,
  prisma: PrismaClient,
): Worker {
  const service = new QuotesService(prisma);

  const worker = new Worker(
    QUEUE_NAMES.QUOTE_EXPIRY,
    async () => {
      const { expired } = await service.expireOverdue();
      if (expired.length > 0) {
        console.warn(`[quote-expiry] ${expired.length} devis expiré(s)`);
      }
      return { expired: expired.length };
    },
    { connection },
  );

  worker.on("failed", (job, err) => {
    console.error(`[quote-expiry] Job ${job?.id ?? "unknown"} failed:`, err.message);
  });

  return worker;
}
