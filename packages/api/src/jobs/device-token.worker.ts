import { Worker, type ConnectionOptions, type Job } from "bullmq";
import type { PrismaClient } from "@prisma/client";
import { QUEUE_NAMES } from "./queue.js";

/**
 * Purge quotidienne des jetons push dormants.
 *
 * Sans elle, `device_tokens` ne perd jamais une ligne : chaque réinstallation,
 * chaque téléphone changé y laisse un jeton qui ne recevra plus rien mais que
 * chaque envoi continue de payer. La suppression sur `DeviceNotRegistered`
 * (`utils/notify.ts`) n'attrape que ce qu'Expo signale de façon synchrone ; les
 * receipts n'étant volontairement pas traités (voir l'en-tête de `utils/push.ts`),
 * ce cron est le filet qui borne réellement la table.
 *
 * ⚠️ COUPLAGE À CONNAÎTRE : la purge ne vaut que parce que le mobile
 * réenregistre son jeton à CHAQUE lancement (`apps/mobile/lib/notifications.ts`),
 * ce qui rafraîchit `lastSeenAt`. Si le mobile cessait un jour de le faire, ce
 * cron se mettrait à supprimer des jetons parfaitement vivants et le push
 * s'éteindrait en silence après 90 jours.
 */

/**
 * Au-delà de ce silence, l'appareil est considéré comme parti.
 *
 * 90 jours : assez long pour ne pas couper un client saisonnier qui n'ouvre
 * l'application qu'entre deux locations, assez court pour que la table reste à
 * la taille du parc réellement actif. Un jeton supprimé à tort se réinscrit
 * seul au lancement suivant — l'erreur se répare, elle ne se paie pas.
 */
export const RETENTION_JETONS_JOURS = 90;

export interface DeviceTokenJobData {
  /** Date de référence — injectable pour rejouer un cron manqué. */
  now?: string;
}

/** Supprime les jetons qui ne se sont pas manifestés depuis la période de rétention. */
async function runCleanup(prisma: PrismaClient, now: Date) {
  const limite = new Date(now);
  limite.setDate(limite.getDate() - RETENTION_JETONS_JOURS);

  const { count } = await prisma.deviceToken.deleteMany({
    where: { lastSeenAt: { lt: limite } },
  });

  if (count === 0) {
    console.log(`[device-token-cleanup] Aucun jeton dormant depuis ${RETENTION_JETONS_JOURS} j`);
  } else {
    console.log(
      `[device-token-cleanup] ${count} jeton(s) supprimé(s) — inactifs depuis plus de ` +
        `${RETENTION_JETONS_JOURS} j (avant le ${limite.toISOString().slice(0, 10)})`,
    );
  }

  return { supprimes: count };
}

/**
 * Worker de maintenance des jetons push — un seul rendez-vous quotidien.
 *
 * Idempotent par nature : rejouer le job ne supprime que ce qui reste éligible,
 * c'est-à-dire plus rien.
 */
export function createDeviceTokenWorker(
  connection: ConnectionOptions,
  prisma: PrismaClient,
): Worker<DeviceTokenJobData> {
  const worker = new Worker<DeviceTokenJobData>(
    QUEUE_NAMES.DEVICE_TOKENS,
    async (job: Job<DeviceTokenJobData>) => {
      const now = job.data.now ? new Date(job.data.now) : new Date();
      return runCleanup(prisma, now);
    },
    { connection },
  );

  worker.on("failed", (job, err) => {
    console.error(`[device-token] Job ${job?.name ?? "unknown"} failed:`, err.message);
  });

  return worker;
}

/**
 * Exporté pour les tests : c'est exactement la fonction câblée au cron, pas une
 * copie — un test qui passerait sur une réimplémentation ne prouverait rien.
 */
export const __deviceTokenCron = { runCleanup };
