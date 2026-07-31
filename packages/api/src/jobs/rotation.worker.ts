import { Worker, type ConnectionOptions, type Job } from "bullmq";
import type {
  PrismaClient,
  NotificationType,
  Prisma,
  Rotation,
  RotationLine,
} from "@prisma/client";
import { RETARD_ESCALADE_JOURS, joursDeRetard, jourCalendaire, startOfDay } from "@lingengo/shared";
import { QUEUE_NAMES } from "./queue.js";
import { notify, emailAutorise } from "../utils/notify.js";
import { sendTransactionalMail, toMailDate } from "../utils/mailer.js";
import { RotationsService } from "../services/rotations.service.js";
import { PassagesService } from "../services/passages.service.js";

/** Les trois rendez-vous quotidiens du calendrier de rotations. */
export type RotationJobKind = "reminder" | "morning" | "overdue" | "passages";

export interface RotationJobData {
  kind: RotationJobKind;
  /** Date de référence — injectable pour rejouer un cron manqué. */
  now?: string;
}

type RotationWithLines = Rotation & { lignes: RotationLine[] };

/** Créneau annoncé au client faute de créneau de tournée précis. */
const CRENEAU_PAR_DEFAUT = "dans la journée";

function formatDateFr(date: Date): string {
  return date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

/** Lignes triées, forme attendue par les gabarits du mailer. */
function lignesPourMail(rotation: RotationWithLines): { designation: string; qty: number }[] {
  return rotation.lignes
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((l) => ({ designation: l.designation, qty: l.qtyLivree }));
}

/** Résumé imprimable des articles d'une rotation (notification in-app). */
function resumeLignes(rotation: RotationWithLines): string {
  return lignesPourMail(rotation)
    .map((l) => `${l.qty} × ${l.designation}`)
    .join(", ");
}

/**
 * Garde d'idempotence des notifications IN-APP : les destinataires déjà notifiés
 * AUJOURD'HUI pour ce type.
 *
 * Un cron relancé à la main, un redémarrage du conteneur ou un `attempts: 3` de
 * BullMQ ne doivent pas produire deux relances au même client le même jour —
 * c'est la différence entre un service qui prévient et un service qui harcèle.
 *
 * La clé est (rotationId, type, jour), lue depuis `Notification.data.rotationId`.
 * Une seule requête pour toute la journée plutôt qu'un SELECT par rotation.
 *
 * L'idempotence de l'EMAIL est SÉPARÉE (`reminderSentAt` / `overdueNotifiedAt`) :
 * un mailer indisponible doit pouvoir être retenté au passage suivant alors que
 * la notification in-app, elle, est déjà partie.
 */
async function dejaNotifiees(
  prisma: PrismaClient,
  type: NotificationType,
  now: Date,
): Promise<Set<string>> {
  const debutJour = startOfDay(now);

  const envoyees = await prisma.notification.findMany({
    where: { type, createdAt: { gte: debutJour } },
    select: { data: true },
  });

  const ids = new Set<string>();
  for (const n of envoyees) {
    const data = n.data as { rotationId?: unknown } | null;
    if (data && typeof data.rotationId === "string") {
      ids.add(data.rotationId);
    }
  }
  return ids;
}

/** Rotations dont la reprise est prévue dans la plage [debut, fin[ et pas encore soldée. */
async function rotationsAReprendre(
  prisma: PrismaClient,
  debut: Date,
  fin: Date,
): Promise<RotationWithLines[]> {
  return prisma.rotation.findMany({
    where: {
      deletedAt: null,
      dateRepriseReelle: null,
      status: { notIn: ["REPRISE", "ANNULEE"] },
      dateReprisePrevue: { gte: debut, lt: fin },
    },
    include: { lignes: true },
    orderBy: { clientNom: "asc" },
  });
}

/** Administrateurs actifs — destinataires des récapitulatifs d'exploitation. */
async function gestionnaires(
  prisma: PrismaClient,
): Promise<{ id: string; email: string | null }[]> {
  return prisma.user.findMany({
    where: {
      role: { in: ["ROLE_ADMIN", "ROLE_SUPER_ADMIN"] },
      isActive: true,
      deletedAt: null,
    },
    select: { id: true, email: true },
  });
}

/**
 * Notifie le client d'une rotation IN-APP, s'il a un compte.
 *
 * Un client sans compte ne peut rien recevoir in-app, mais il reçoit bien l'email
 * (adresse du snapshot de la rotation) et figure dans le récapitulatif du
 * gestionnaire. Silence possible côté application, jamais côté exploitation.
 */
async function notifierClientInApp(
  prisma: PrismaClient,
  rotation: RotationWithLines,
  type: NotificationType,
  title: string,
  body: string,
  extra: Record<string, unknown> = {},
): Promise<boolean> {
  if (!rotation.userId) return false;

  await notify(prisma, {
    userId: rotation.userId,
    type,
    channel: "BOTH",
    title,
    body,
    // `type` et `rotationId` sont le minimum vital : sans eux, le tap sur la
    // notification côté mobile n'ouvre aucun écran.
    data: {
      type,
      rotationId: rotation.id,
      dateReprisePrevue: toMailDate(rotation.dateReprisePrevue),
      ...extra,
    } as Prisma.InputJsonValue,
  });

  return true;
}

// ============================================================================
// 18:00 — rappel de la veille
// ============================================================================

/**
 * Prévient chaque client dont la reprise est prévue DEMAIN, et envoie au
 * gestionnaire le récapitulatif des passages du lendemain (adresses + articles).
 *
 * 18 h : assez tard pour que la journée soit soldée (les reprises du jour ne
 * polluent plus la liste), assez tôt pour que le client prépare son linge le soir.
 */
async function runReminder(prisma: PrismaClient, now: Date) {
  // Bornes sur des JOURS CANONIQUES (minuit UTC), comme les colonnes
  // `@db.Date` interrogées : un minuit LOCAL viserait la veille depuis un
  // serveur en avance sur UTC et le rappel J-1 partirait un jour trop tôt.
  const demain = new Date(jourCalendaire(now).getTime() + 86_400_000);
  const apresDemain = new Date(demain.getTime() + 86_400_000);

  const rotations = await rotationsAReprendre(prisma, demain, apresDemain);

  if (rotations.length === 0) {
    console.log("[rotation-reminder] Aucun passage prévu demain");
    return { clients: 0, emails: 0, gestionnaires: 0, passages: 0 };
  }

  const deja = await dejaNotifiees(prisma, "ROTATION_REMINDER", now);
  let clientsNotifies = 0;
  let emailsEnvoyes = 0;

  for (const rotation of rotations) {
    if (deja.has(rotation.id)) continue;

    // 1) Notification in-app D'ABORD — c'est le canal qui fonctionne à coup sûr.
    const notifie = await notifierClientInApp(
      prisma,
      rotation,
      "ROTATION_REMINDER",
      "Reprise de votre linge demain",
      `Votre passage est prévu demain (${formatDateFr(rotation.dateReprisePrevue)}). ` +
        `Merci de préparer le linge sale à reprendre : ${resumeLignes(rotation)}. ` +
        `Si cela ne vous convient pas, contactez-nous pour convenir d'un autre créneau.`,
    );
    if (notifie) clientsNotifies++;

    // 2) Email ensuite, en best-effort. L'adresse vient du SNAPSHOT de la
    //    rotation : la majorité des clients n'ont pas de compte, les chercher
    //    dans `users` reviendrait à ne jamais les prévenir.
    if (!rotation.clientEmail || rotation.reminderSentAt) continue;
    if (!(await emailAutorise(prisma, rotation.userId, "ROTATION_REMINDER"))) continue;

    const envoi = await sendTransactionalMail({
      to: rotation.clientEmail,
      subject: "Reprise de votre linge demain",
      template: "rotation_reminder_client",
      data: {
        clientNom: rotation.clientNom,
        datePassage: toMailDate(rotation.dateReprisePrevue),
        creneau: CRENEAU_PAR_DEFAUT,
        lignes: lignesPourMail(rotation),
      },
    });

    if (envoi.ok) {
      // Horodaté UNIQUEMENT sur un 200 : si le mailer était à terre, la tentative
      // doit pouvoir être rejouée demain plutôt que d'être perdue en silence.
      await prisma.rotation.update({
        where: { id: rotation.id },
        data: { reminderSentAt: new Date() },
      });
      emailsEnvoyes++;
    } else {
      console.error(`[rotation-reminder] Email client échoué (${rotation.id}) : ${envoi.error}`);
    }
  }

  // Récapitulatif gestionnaire — un seul message par jour, pas un par passage.
  // Même type que le rappel client (c'est le même rendez-vous J-1) ; la clé de
  // récap ne peut pas entrer en collision avec un identifiant de rotation.
  const cleRecap = `recap-${toMailDate(demain)}`;
  let gestionnairesNotifies = 0;

  if (!deja.has(cleRecap)) {
    const detail = rotations
      .map(
        (r) =>
          `• ${r.clientNom}${r.clientAdresse ? ` — ${r.clientAdresse}` : ""} : ${resumeLignes(r)}`,
      )
      .join("\n");

    const admins = await gestionnaires(prisma);
    for (const admin of admins) {
      await notify(prisma, {
        userId: admin.id,
        type: "ROTATION_REMINDER",
        channel: "BOTH",
        title: `${rotations.length} reprise(s) prévue(s) demain`,
        body: `Passages du ${formatDateFr(demain)} :\n${detail}`,
        data: {
          type: "ROTATION_REMINDER",
          rotationId: cleRecap,
          date: toMailDate(demain),
          passages: rotations.length,
        } as Prisma.InputJsonValue,
      });
      gestionnairesNotifies++;

      if (!admin.email) continue;
      const envoi = await sendTransactionalMail({
        to: admin.email,
        subject: `${rotations.length} reprise(s) prévue(s) demain`,
        template: "rotation_reminder_owner",
        data: {
          datePassage: toMailDate(demain),
          passages: rotations.map((r) => ({
            clientNom: r.clientNom,
            ...(r.clientAdresse ? { clientAdresse: r.clientAdresse } : {}),
            formule: r.formule,
            creneau: CRENEAU_PAR_DEFAUT,
            lignes: lignesPourMail(r),
          })),
        },
      });
      if (!envoi.ok) {
        console.error(`[rotation-reminder] Email gestionnaire échoué : ${envoi.error}`);
      }
    }
  }

  console.log(
    `[rotation-reminder] ${rotations.length} passage(s) demain — ` +
      `${clientsNotifies} client(s) in-app, ${emailsEnvoyes} email(s), ` +
      `${gestionnairesNotifies} gestionnaire(s)`,
  );

  return {
    clients: clientsNotifies,
    emails: emailsEnvoyes,
    gestionnaires: gestionnairesNotifies,
    passages: rotations.length,
  };
}

// ============================================================================
// 07:00 — rappel du jour J
// ============================================================================

/** Rappelle le matin même au client que son passage a lieu aujourd'hui. */
async function runMorning(prisma: PrismaClient, now: Date) {
  const aujourdhui = jourCalendaire(now);
  const demain = new Date(aujourdhui.getTime() + 86_400_000);

  const rotations = await rotationsAReprendre(prisma, aujourdhui, demain);

  if (rotations.length === 0) {
    console.log("[rotation-morning] Aucun passage aujourd'hui");
    return { clients: 0, passages: 0 };
  }

  const deja = await dejaNotifiees(prisma, "ROTATION_TODAY", now);
  let clientsNotifies = 0;

  for (const rotation of rotations) {
    if (deja.has(rotation.id)) continue;

    const notifie = await notifierClientInApp(
      prisma,
      rotation,
      "ROTATION_TODAY",
      "Reprise de votre linge aujourd'hui",
      `Nous passons aujourd'hui ${CRENEAU_PAR_DEFAUT} reprendre : ${resumeLignes(rotation)}. ` +
        `Merci de laisser le linge sale accessible.`,
      { creneau: CRENEAU_PAR_DEFAUT },
    );

    if (notifie) clientsNotifies++;
  }

  // Pas d'email le jour J : le rappel de la veille est déjà parti par email et
  // porte la même information. En renvoyer un le matin même relèverait du
  // harcèlement. Le canal in-app suffit à ce stade.
  console.log(
    `[rotation-morning] ${rotations.length} passage(s) aujourd'hui — ${clientsNotifies} client(s) notifiés`,
  );

  return { clients: clientsNotifies, passages: rotations.length };
}

// ============================================================================
// 09:00 — retards
// ============================================================================

/**
 * Bascule en EN_RETARD les rotations échues, lève le drapeau de facturation
 * au-delà de RETARD_ESCALADE_JOURS, relance le client et prévient le gestionnaire.
 *
 * Ne facture RIEN : `facturableRemplacement` est un indicateur, la mise en
 * recouvrement reste une décision humaine — c'est un client qu'on relance, pas
 * un compteur qu'on débite.
 */
async function runOverdue(prisma: PrismaClient, now: Date) {
  const aujourdhui = jourCalendaire(now);

  // L'ÉTAT est basculé par le service — implémentation unique, partagée avec la
  // route de rattrapage. Ce cron ne garde que ce qui lui est propre : relancer
  // le client et récapituler aux gestionnaires. Il en portait auparavant sa
  // propre copie, avec le risque permanent qu'elles divergent.
  const bascule = await new RotationsService(prisma).markOverdue(undefined, now);

  // Relu APRÈS la bascule : les rotations sont désormais EN_RETARD, qui fait
  // partie du filtre, donc le jeu est le même — mais leur état est à jour.
  const enRetard = await prisma.rotation.findMany({
    where: {
      deletedAt: null,
      dateRepriseReelle: null,
      status: { in: ["PLANIFIEE", "LIVREE", "EN_RETARD"] },
      dateReprisePrevue: { lt: aujourdhui },
    },
    include: { lignes: true },
    orderBy: { dateReprisePrevue: "asc" },
  });

  if (enRetard.length === 0) {
    console.log("[rotation-overdue] Aucune rotation en retard");
    return { basculees: 0, escaladees: 0, gestionnaires: 0, emails: 0, enRetard: 0 };
  }

  // Relance du client en retard — une seule fois, d'où `overdueNotifiedAt`.
  let emailsEnvoyes = 0;
  for (const rotation of enRetard) {
    if (!rotation.clientEmail || rotation.overdueNotifiedAt) continue;
    if (!(await emailAutorise(prisma, rotation.userId, "ROTATION_OVERDUE"))) continue;

    const jours = joursDeRetard(
      { status: "EN_RETARD", dateReprisePrevue: rotation.dateReprisePrevue },
      now,
    );

    const envoi = await sendTransactionalMail({
      to: rotation.clientEmail,
      subject: "Votre linge n'a pas encore été repris",
      template: "rotation_overdue",
      data: {
        clientNom: rotation.clientNom,
        ...(rotation.clientAdresse ? { clientAdresse: rotation.clientAdresse } : {}),
        dateReprisePrevue: toMailDate(rotation.dateReprisePrevue),
        joursDeRetard: jours,
        lignes: lignesPourMail(rotation),
        facturableRemplacement: jours > RETARD_ESCALADE_JOURS,
      },
    });

    if (envoi.ok) {
      await prisma.rotation.update({
        where: { id: rotation.id },
        data: { overdueNotifiedAt: new Date() },
      });
      emailsEnvoyes++;
    } else {
      console.error(`[rotation-overdue] Email client échoué (${rotation.id}) : ${envoi.error}`);
    }
  }

  const deja = await dejaNotifiees(prisma, "ROTATION_OVERDUE", now);
  const cleRecap = `retards-${toMailDate(aujourdhui)}`;
  let gestionnairesNotifies = 0;

  if (!deja.has(cleRecap)) {
    const detail = enRetard
      .map((r) => {
        const jours = joursDeRetard(
          { status: "EN_RETARD", dateReprisePrevue: r.dateReprisePrevue },
          now,
        );
        const escalade = jours > RETARD_ESCALADE_JOURS ? " — remplacement facturable" : "";
        return (
          `• ${r.clientNom}${r.clientAdresse ? ` — ${r.clientAdresse}` : ""} : ` +
          `${jours} j de retard${escalade} (${resumeLignes(r)})`
        );
      })
      .join("\n");

    const admins = await gestionnaires(prisma);
    for (const admin of admins) {
      await notify(prisma, {
        userId: admin.id,
        type: "ROTATION_OVERDUE",
        channel: "BOTH",
        title: `${enRetard.length} reprise(s) en retard`,
        body:
          `Linge non repris à ce jour :\n${detail}\n\n` +
          `Au-delà de ${RETARD_ESCALADE_JOURS} jours, le remplacement peut être facturé au ` +
          `barème — aucune facture n'a été émise automatiquement.`,
        data: {
          type: "ROTATION_OVERDUE",
          rotationId: cleRecap,
          date: toMailDate(aujourdhui),
          enRetard: enRetard.length,
          facturables: bascule.escaladees,
        } as Prisma.InputJsonValue,
      });
      gestionnairesNotifies++;
    }
  }

  console.log(
    `[rotation-overdue] ${enRetard.length} en retard — ${bascule.basculees} basculée(s), ` +
      `${bascule.escaladees} escaladée(s), ${emailsEnvoyes} email(s), ` +
      `${gestionnairesNotifies} gestionnaire(s)`,
  );

  return {
    basculees: bascule.basculees,
    escaladees: bascule.escaladees,
    gestionnaires: gestionnairesNotifies,
    emails: emailsEnvoyes,
    enRetard: enRetard.length,
  };
}

// ============================================================================
// 18:00 — passages groupés du lendemain
// ============================================================================

/**
 * Ouvre les propositions « nous passons dans votre commune » pour les tournées
 * du lendemain, et prévient les clients concernés.
 *
 * Posé sur la MÊME file que les rappels de rotation, et à la même heure : le
 * client reçoit ses messages du soir en une fois plutôt qu'égrenés dans la
 * journée. L'idempotence tient à la contrainte unique (tournée, commune) et au
 * plafond d'une sollicitation par semaine et par client.
 */
async function runPassages(prisma: PrismaClient, now: Date) {
  const bilan = await new PassagesService(prisma).ouvrirPourLendemain(now);
  console.log(
    `[passages] ${bilan.tournees} tournée(s) demain, ${bilan.opportunites} commune(s) ouverte(s), ` +
      `${bilan.notifies} client(s) prévenu(s)`,
  );
  return bilan;
}

// ============================================================================
// Worker
// ============================================================================

/**
 * Worker du calendrier de rotations — trois crons quotidiens sur une seule file :
 *   18:00 `reminder` — rappel J-1 au client (in-app + email) + récap gestionnaire ;
 *   07:00 `morning`  — rappel du jour J au client (in-app seul) ;
 *   09:00 `overdue`  — bascule des retards + relance client + alerte gestionnaire.
 *
 * Ce sont les PREMIERS vrais producteurs de la chaîne de notification : jusqu'ici
 * aucune file n'avait de producteur et rien n'était jamais émis.
 *
 * Tous idempotents : rejouer un job le même jour ne renotifie personne et
 * n'envoie pas un second email.
 */
export function createRotationWorker(
  connection: ConnectionOptions,
  prisma: PrismaClient,
): Worker<RotationJobData> {
  const worker = new Worker<RotationJobData>(
    QUEUE_NAMES.ROTATIONS,
    async (job: Job<RotationJobData>) => {
      const now = job.data.now ? new Date(job.data.now) : new Date();

      switch (job.data.kind) {
        case "reminder":
          return runReminder(prisma, now);
        case "morning":
          return runMorning(prisma, now);
        case "overdue":
          return runOverdue(prisma, now);
        case "passages":
          return runPassages(prisma, now);
        default:
          throw new Error(`Type de job rotation inconnu : ${String(job.data.kind)}`);
      }
    },
    { connection },
  );

  worker.on("completed", (job) => {
    console.log(`[rotation] Job ${job?.name ?? "unknown"} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[rotation] Job ${job?.name ?? "unknown"} failed:`, err.message);
  });

  return worker;
}

/**
 * Exporté pour les tests : ce sont exactement les fonctions câblées aux crons,
 * pas des copies — un test qui passerait sur une réimplémentation ne prouverait rien.
 */
export const __rotationCrons = { runReminder, runMorning, runOverdue, runPassages };
