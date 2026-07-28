import { Worker, type ConnectionOptions, type Job } from "bullmq";
import type { PrismaClient, Prisma } from "@prisma/client";
import { addMonths } from "@lingengo/shared";
import { QUEUE_NAMES } from "./queue.js";
import {
  buildReglementMention,
  generateInvoiceNumber,
  VAT_EXEMPTION_MENTION,
} from "../services/invoices.service.js";
import { notify } from "../utils/notify.js";

/** Administrateurs actifs — destinataires des signaux d'exploitation. */
async function gestionnaires(prisma: PrismaClient): Promise<{ id: string }[]> {
  return prisma.user.findMany({
    where: {
      role: { in: ["ROLE_ADMIN", "ROLE_SUPER_ADMIN"] },
      isActive: true,
      deletedAt: null,
    },
    select: { id: true },
  });
}

export interface InvoiceJobData {
  /** Ne facturer que cet abonnement. Sinon, tous ceux dont la période est échue. */
  userId?: string;
  /**
   * Période à facturer, imposée de l'extérieur (relance manuelle, rattrapage).
   *
   * Absente — le cas du cron — chaque abonnement est facturé sur SA propre
   * période (`currentPeriodStart` → `currentPeriodEnd`), qui est ensuite avancée
   * d'un mois. Une période unique imposée à tout le monde ne marcherait pas :
   * les abonnements ne démarrent pas le même jour.
   */
  periodStart?: string;
  periodEnd?: string;
}

/**
 * Au-delà de ce retard, une période échue n'est plus facturée automatiquement.
 *
 * Le cron avance d'une période par passage : un conteneur arrêté six semaines
 * ferait donc sortir six factures rétroactives, une par jour, sans que personne
 * ne l'ait demandé. Passé ce délai, la décision de facturer un mois ancien
 * revient au gestionnaire — la relance manuelle existe pour ça
 * (`periodStart`/`periodEnd`). 40 jours : un mois de retard plus une marge, donc
 * un cycle normal n'est jamais concerné.
 */
export const RATTRAPAGE_MAX_JOURS = 40;

/** Abonnement tel que le worker a besoin de le lire. */
type BillableSubscription = Prisma.SubscriptionGetPayload<{
  include: {
    user: { select: { id: true; name: true; operatorId: true } };
    products: { include: { product: { select: { priceCents: true; name: true } } } };
  };
}>;

/**
 * Montant HT dû pour une période d'abonnement.
 *
 * `priceCents` est le prix mensuel **figé à la souscription** (ADR-V2-006) :
 * c'est lui qui fait foi. La somme des produits inclus ne le remplace pas — un
 * Pack Sérénité à 89 €/mois embarque 8 kits bain et 4 kits lit dont les prix
 * catalogue additionnés dépassent largement l'abonnement. Facturer cette somme
 * aurait sur-facturé chaque client d'un facteur trois.
 *
 * Le repli sur les produits ne concerne que les abonnements « legacy » d'avant
 * la V2, qui n'ont pas de snapshot de prix.
 */
export function montantHtCents(sub: BillableSubscription): number {
  if (sub.priceCents != null) return sub.priceCents;
  return sub.products.reduce((total, sp) => total + sp.quantity * sp.product.priceCents, 0);
}

/** Lignes de détail portées par la facture, pour le PDF et l'écran. */
function lignesDe(sub: BillableSubscription): Prisma.InputJsonValue {
  // Sur un abonnement à prix figé, la ligne facturée est l'abonnement lui-même :
  // les kits sont ce qu'il contient, pas ce qu'on facture.
  if (sub.priceCents != null) {
    return [
      {
        product: "Abonnement mensuel",
        quantity: 1,
        unitCents: sub.priceCents,
        totalCents: sub.priceCents,
        inclus: sub.products.map((sp) => `${sp.quantity} × ${sp.product.name}`),
      },
    ];
  }
  return sub.products.map((sp) => ({
    product: sp.product.name,
    quantity: sp.quantity,
    unitCents: sp.product.priceCents,
    totalCents: sp.quantity * sp.product.priceCents,
  }));
}

const SUBSCRIPTION_INCLUDE = {
  // Pas d'email ici : il n'est pas utilisé, et un client créé par
  // l'admin peut ne pas en avoir. La facture reste due dans tous les cas.
  user: { select: { id: true, name: true, operatorId: true } },
  products: {
    include: {
      product: { select: { priceCents: true, name: true } },
    },
  },
} as const;

/**
 * Génère les factures d'abonnement dues.
 *
 * Exporté pour les tests : la logique métier est ici, le `Worker` BullMQ n'en
 * est que l'emballage.
 */
export async function runInvoiceCycle(
  prisma: PrismaClient,
  data: InvoiceJobData,
  now: Date = new Date(),
): Promise<string[]> {
  const { userId, periodStart, periodEnd } = data;
  /** Périodes imposées ⇒ pas d'avance du cycle : c'est un rattrapage ponctuel. */
  const periodeImposee = Boolean(periodStart && periodEnd);

  const subscriptions = await prisma.subscription.findMany({
    where: {
      status: "ACTIVE",
      ...(userId ? { userId } : {}),
      // Sans période imposée, on ne facture que ce qui est ÉCHU. Sans ce filtre,
      // le cron quotidien émettrait une facture par jour et par abonnement.
      ...(periodeImposee ? {} : { currentPeriodEnd: { lte: now } }),
    },
    include: SUBSCRIPTION_INCLUDE,
  });

  const results: string[] = [];

  // Coordonnées bancaires et TVA par opérateur, mémoïsées : le job traite N
  // abonnements qui partagent presque toujours le même opérateur, inutile de
  // relire les mêmes lignes à chaque facture.
  const reglementByOperator = new Map<string, string | undefined>();
  const getReglement = async (operatorId: string): Promise<string | undefined> => {
    if (reglementByOperator.has(operatorId)) return reglementByOperator.get(operatorId);
    const operator = await prisma.operator.findUnique({
      where: { id: operatorId },
      select: { iban: true, bic: true },
    });
    const mention = buildReglementMention(operator?.iban, operator?.bic);
    reglementByOperator.set(operatorId, mention);
    return mention;
  };

  const tvaByOperator = new Map<string, boolean>();
  const getTvaApplicable = async (operatorId: string): Promise<boolean> => {
    const cached = tvaByOperator.get(operatorId);
    if (cached !== undefined) return cached;
    const config = await prisma.subscriptionConfig.findUnique({
      where: { operatorId },
      select: { tvaApplicable: true },
    });
    // Absence de config ⇒ pas de TVA, comme le défaut des devis. Facturer 20 %
    // à un opérateur en franchise en base lui ferait collecter une taxe qu'il
    // n'a pas le droit de percevoir.
    const applicable = config?.tvaApplicable ?? false;
    tvaByOperator.set(operatorId, applicable);
    return applicable;
  };

  const limiteRattrapage = new Date(now.getTime() - RATTRAPAGE_MAX_JOURS * 24 * 60 * 60 * 1000);

  for (const sub of subscriptions) {
    const debut = periodStart ? new Date(periodStart) : sub.currentPeriodStart;
    const fin = periodEnd ? new Date(periodEnd) : sub.currentPeriodEnd;

    // Retard trop ancien : on remet le cycle à jour sans facturer, et on le dit.
    // Émettre en silence des factures pour des mois écoulés serait le pire des
    // comportements — l'opérateur découvrirait la facturation par la réclamation
    // du client.
    if (!periodeImposee && fin < limiteRattrapage) {
      let nouveauDebut = fin;
      let nouvelleFin = addMonths(fin, 1);
      while (nouvelleFin < limiteRattrapage) {
        nouveauDebut = nouvelleFin;
        nouvelleFin = addMonths(nouvelleFin, 1);
      }

      await prisma.subscription.update({
        where: { id: sub.id },
        data: { currentPeriodStart: nouveauDebut, currentPeriodEnd: nouvelleFin },
      });

      for (const admin of await gestionnaires(prisma)) {
        await notify(prisma, {
          userId: admin.id,
          type: "GENERAL",
          channel: "EMAIL",
          title: `Facturation en retard — ${sub.user.name}`,
          body:
            `La période du ${debut.toLocaleDateString("fr-FR")} au ${fin.toLocaleDateString("fr-FR")} ` +
            `n'a pas été facturée à temps et ne l'a PAS été automatiquement. ` +
            `Le cycle reprend au ${nouveauDebut.toLocaleDateString("fr-FR")}. ` +
            `Émettez la facture manquante à la main si elle est due.`,
          data: { subscriptionId: sub.id, path: `/clients/${sub.userId}` },
        });
      }

      console.warn(
        `[invoice] Période trop ancienne pour ${sub.userId} (${fin.toISOString()}) — cycle avancé sans facturation`,
      );
      continue;
    }

    // Garde-fou d'idempotence, en plus du filtre `currentPeriodEnd` : un job
    // rejoué (redémarrage, `attempts: 3` de BullMQ, relance manuelle) ne doit
    // pas produire une seconde facture pour la même période.
    const existing = await prisma.invoice.findFirst({
      where: { userId: sub.userId, periodStart: debut, periodEnd: fin },
      select: { id: true },
    });

    if (existing) {
      console.warn(
        `[invoice] Facture déjà émise pour ${sub.userId} — période ${debut.toISOString()}..${fin.toISOString()}`,
      );
      // Le cycle est quand même avancé : sinon l'abonnement resterait éligible
      // à chaque passage du cron et rejouerait ce message tous les jours.
      if (!periodeImposee) {
        await prisma.subscription.update({
          where: { id: sub.id },
          data: { currentPeriodStart: fin, currentPeriodEnd: addMonths(fin, 1) },
        });
      }
      continue;
    }

    const totalHtCents = montantHtCents(sub);
    const tvaApplicable = await getTvaApplicable(sub.user.operatorId);
    const vatRate = tvaApplicable ? 2000 : 0;
    const vatAmountCents = Math.round(totalHtCents * (vatRate / 10000));
    const totalTtcCents = totalHtCents + vatAmountCents;

    // Échéance : 30 jours après la fin de période.
    const dueDate = new Date(fin);
    dueDate.setDate(dueDate.getDate() + 30);

    const reglement = await getReglement(sub.user.operatorId);

    // Numérotation : même générateur que les factures émises depuis un devis.
    // Elles partagent la table et donc la suite chronologique légale — deux
    // générateurs indépendants produiraient des rangs en double sur le même
    // exercice. Transaction Serializable : deux exécutions concurrentes du
    // worker ne peuvent pas attribuer le même numéro.
    //
    // L'avance du cycle est DANS la transaction : si elle échouait après coup,
    // l'abonnement resterait éligible et serait refacturé au prochain passage.
    const invoice = await prisma.$transaction(
      async (tx) => {
        const invoiceNumber = await generateInvoiceNumber(tx, debut.getFullYear());

        const created = await tx.invoice.create({
          data: {
            operatorId: sub.user.operatorId,
            userId: sub.userId,
            invoiceNumber,
            status: "DRAFT",
            totalHtCents,
            vatRate,
            vatAmountCents,
            totalTtcCents,
            periodStart: debut,
            periodEnd: fin,
            dueDate,
            metadata: {
              source: "SUBSCRIPTION",
              lines: lignesDe(sub),
              plan: sub.plan,
              ...(reglement ? { reglement } : {}),
              ...(tvaApplicable ? {} : { mentionLegale: VAT_EXEMPTION_MENTION }),
            },
          },
        });

        if (!periodeImposee) {
          await tx.subscription.update({
            where: { id: sub.id },
            data: { currentPeriodStart: fin, currentPeriodEnd: addMonths(fin, 1) },
          });
        }

        return created;
      },
      { isolationLevel: "Serializable" },
    );

    results.push(invoice.invoiceNumber);

    // Destinataires : les GESTIONNAIRES, pas le client. La facture naît en
    // brouillon, dans un onglet qui n'est pas celui affiché par défaut ; sans
    // ce signal elle pouvait y dormir des semaines. Le client, lui, n'a rien à
    // faire d'un brouillon — il sera prévenu à l'émission.
    for (const admin of await gestionnaires(prisma)) {
      await notify(prisma, {
        userId: admin.id,
        type: "GENERAL",
        // EMAIL et non BOTH : la facture attend dans l'admin, elle ne justifie
        // pas de faire vibrer le téléphone du gestionnaire à 05 h. La ligne de
        // notification — donc le badge de la section Factures — est créée dans
        // tous les cas, quel que soit le canal.
        channel: "EMAIL",
        title: `Facture ${invoice.invoiceNumber} à émettre`,
        body: `Abonnement de ${sub.user.name} — période du ${debut.toLocaleDateString("fr-FR")} au ${fin.toLocaleDateString("fr-FR")}.`,
        data: { invoiceId: invoice.id, path: `/factures/${invoice.id}` },
      });
    }

    // TODO: Stripe charge — create PaymentIntent or charge saved payment method
    // TODO: PDF generation — Factur-X format (PDF/A-3 + XML CII)
  }

  console.warn(`[invoice] ${results.length} facture(s) générée(s) : ${results.join(", ") || "—"}`);
  return results;
}

/**
 * Worker de facturation des abonnements.
 *
 * Alimenté par le cron quotidien déclaré dans `plugins/jobs.ts` — sans lui, ce
 * worker n'a longtemps eu aucun producteur et aucune facture d'abonnement n'a
 * jamais été générée.
 */
export function createInvoiceWorker(
  connection: ConnectionOptions,
  prisma: PrismaClient,
): Worker<InvoiceJobData> {
  const worker = new Worker<InvoiceJobData>(
    QUEUE_NAMES.INVOICES,
    async (job: Job<InvoiceJobData>) => {
      const invoiceNumbers = await runInvoiceCycle(prisma, job.data);
      return { invoiceNumbers };
    },
    { connection },
  );

  worker.on("failed", (job, err) => {
    console.error(`[invoice] Job ${job?.id ?? "unknown"} failed:`, err.message);
  });

  return worker;
}
