import { Worker, type ConnectionOptions, type Job } from "bullmq";
import type { PrismaClient } from "@prisma/client";
import { QUEUE_NAMES } from "./queue.js";
import { buildReglementMention, generateInvoiceNumber } from "../services/invoices.service.js";

export interface InvoiceJobData {
  /** When provided, generate invoice only for this user. Otherwise, generate for all active subscriptions. */
  userId?: string;
  /** Billing period start (ISO string). */
  periodStart: string;
  /** Billing period end (ISO string). */
  periodEnd: string;
}

/**
 * Monthly invoice generation worker.
 *
 * - For each active subscription, calculates the total from subscription products.
 * - Creates an Invoice record with DRAFT status.
 * - Placeholder for Stripe charge and PDF generation.
 */
export function createInvoiceWorker(
  connection: ConnectionOptions,
  prisma: PrismaClient,
): Worker<InvoiceJobData> {
  const worker = new Worker<InvoiceJobData>(
    QUEUE_NAMES.INVOICES,
    async (job: Job<InvoiceJobData>) => {
      const { userId, periodStart, periodEnd } = job.data;

      const subscriptions = await prisma.subscription.findMany({
        where: {
          status: "ACTIVE",
          ...(userId ? { userId } : {}),
        },
        include: {
          // Pas d'email ici : il n'est pas utilisé, et un client créé par
          // l'admin peut ne pas en avoir. La facture reste due dans tous les cas.
          user: { select: { id: true, name: true, operatorId: true } },
          products: {
            include: {
              product: { select: { priceCents: true, name: true } },
            },
          },
        },
      });

      const results: string[] = [];

      // Coordonnées bancaires par opérateur, mémoïsées : le job traite N
      // abonnements qui partagent presque toujours le même opérateur, inutile de
      // relire la même ligne à chaque facture.
      const reglementByOperator = new Map<string, string | undefined>();
      const getReglement = async (operatorId: string): Promise<string | undefined> => {
        const cached = reglementByOperator.get(operatorId);
        if (cached !== undefined || reglementByOperator.has(operatorId)) return cached;
        const operator = await prisma.operator.findUnique({
          where: { id: operatorId },
          select: { iban: true, bic: true },
        });
        const mention = buildReglementMention(operator?.iban, operator?.bic);
        reglementByOperator.set(operatorId, mention);
        return mention;
      };

      for (const sub of subscriptions) {
        // Check if an invoice already exists for this period
        const existing = await prisma.invoice.findFirst({
          where: {
            userId: sub.userId,
            periodStart: new Date(periodStart),
            periodEnd: new Date(periodEnd),
          },
        });

        if (existing) {
          console.log(
            `[invoice] Invoice already exists for user ${sub.userId} — period ${periodStart}..${periodEnd}`,
          );
          continue;
        }

        // Calculate total from subscription products
        let totalHtCents = 0;
        for (const sp of sub.products) {
          totalHtCents += sp.quantity * sp.product.priceCents;
        }

        const vatRate = 2000; // 20.00%
        const vatAmountCents = Math.round(totalHtCents * (vatRate / 10000));
        const totalTtcCents = totalHtCents + vatAmountCents;

        // Due date: 30 days after period end
        const dueDate = new Date(periodEnd);
        dueDate.setDate(dueDate.getDate() + 30);

        // Numérotation : même générateur que les factures émises depuis un devis.
        // Elles partagent la table et donc la suite chronologique légale — deux
        // générateurs indépendants produiraient des rangs en double sur le même
        // exercice. Transaction Serializable : deux exécutions concurrentes du
        // worker ne peuvent pas attribuer le même numéro.
        const reglement = await getReglement(sub.user.operatorId);

        const year = new Date(periodStart).getFullYear();
        const invoice = await prisma.$transaction(
          async (tx) => {
            const invoiceNumber = await generateInvoiceNumber(tx, year);

            return tx.invoice.create({
              data: {
                operatorId: sub.user.operatorId,
                userId: sub.userId,
                invoiceNumber,
                status: "DRAFT",
                totalHtCents,
                vatRate,
                vatAmountCents,
                totalTtcCents,
                periodStart: new Date(periodStart),
                periodEnd: new Date(periodEnd),
                dueDate,
                metadata: {
                  lines: sub.products.map((sp) => ({
                    product: sp.product.name,
                    quantity: sp.quantity,
                    unitCents: sp.product.priceCents,
                    totalCents: sp.quantity * sp.product.priceCents,
                  })),
                  plan: sub.plan,
                  ...(reglement ? { reglement } : {}),
                },
              },
            });
          },
          { isolationLevel: "Serializable" },
        );

        results.push(invoice.invoiceNumber);

        // TODO: Stripe charge — create PaymentIntent or charge saved payment method
        console.log(
          `[invoice] Stripe charge placeholder — invoice=${invoice.invoiceNumber}, amount=${totalTtcCents} cents`,
        );

        // TODO: PDF generation — Factur-X format (PDF/A-3 + XML CII)
        console.log(`[invoice] PDF generation placeholder — invoice=${invoice.invoiceNumber}`);
      }

      console.log(
        `[invoice] Generated ${results.length} invoice(s): ${results.join(", ") || "none"}`,
      );
      return { invoiceNumbers: results };
    },
    { connection },
  );

  worker.on("completed", (job) => {
    console.log(`[invoice] Job ${job?.id ?? "unknown"} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[invoice] Job ${job?.id ?? "unknown"} failed:`, err.message);
  });

  return worker;
}
