import type { PrismaClient, Prisma, InvoiceStatus } from "@prisma/client";
import { computeDevisTotals, resolveLivraisonLabel } from "@lingengo/shared";
import { NotFoundError, ConflictError, UnprocessableEntityError } from "../utils/errors.js";
import { createAuditLog } from "../utils/audit.js";
import { libelleLivraisonDevis } from "../utils/livraison.js";
import type {
  CreateInvoiceFromQuoteInput,
  UpdateInvoiceStatusInput,
  ListInvoicesQuery,
} from "../schemas/invoices.schema.js";

// ---- Règles métier ----

/**
 * Machine à états des factures — calquée sur QUOTE_TRANSITIONS.
 *
 * Une facture émise (SENT) est une pièce comptable : elle ne peut plus être
 * modifiée ni supprimée, seulement annulée (CANCELLED) ou réglée (PAID).
 * PAID → REFUNDED matérialise un avoir. Les états CANCELLED, REFUNDED sont
 * terminaux : aucune sortie, c'est ce qui garantit la piste d'audit.
 */
export const INVOICE_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  DRAFT: ["SENT", "CANCELLED"],
  SENT: ["PAID", "OVERDUE", "CANCELLED"],
  OVERDUE: ["PAID", "CANCELLED"],
  PAID: ["REFUNDED"],
  CANCELLED: [],
  REFUNDED: [],
};

/** Seul un brouillon peut être supprimé (obligation légale de conservation). */
export const INVOICE_DELETABLE: InvoiceStatus[] = ["DRAFT"];

/** Mention légale micro-entreprise, imprimée quand la TVA ne s'applique pas. */
export const VAT_EXEMPTION_MENTION = "TVA non applicable, art. 293 B du CGI";

/**
 * Modalités de règlement imprimées sur la facture, à partir des coordonnées
 * bancaires de l'opérateur.
 *
 * Renvoie `undefined` si aucun IBAN n'est configuré : le PDF retombe alors sur
 * sa mention par défaut plutôt que d'imprimer un « IBAN : » vide. Le BIC est
 * omis s'il manque — il est facultatif pour un virement SEPA.
 *
 * La valeur produite est FIGÉE dans `metadata.reglement` à l'émission, jamais
 * résolue à l'affichage : changer de banque ne doit pas réécrire les
 * coordonnées d'une facture déjà envoyée au client.
 */
export function buildReglementMention(
  iban?: string | null,
  bic?: string | null,
): string | undefined {
  const cleanIban = (iban ?? "").trim();
  if (!cleanIban) return undefined;
  const cleanBic = (bic ?? "").trim();
  return (
    `Règlement par virement bancaire — IBAN : ${cleanIban}` +
    (cleanBic ? ` · BIC : ${cleanBic}` : "") +
    " — préciser le numéro de facture en référence."
  );
}

/**
 * Numéro de facture séquentiel, sans trou, par millésime : FACT-YYYY-NNNN.
 *
 * Le rang est déduit du PLUS GRAND numéro déjà attribué pour l'année, et non
 * d'un `count()` : une facture annulée ou un brouillon supprimé ne doit pas
 * libérer son numéro, sinon deux factures porteraient le même — précisément ce
 * que l'administration fiscale interdit. À appeler dans une transaction
 * Serializable ; l'unicité de `invoiceNumber` reste le garde-fou final.
 */
export async function generateInvoiceNumber(
  tx: Pick<PrismaClient, "invoice">,
  year: number = new Date().getFullYear(),
): Promise<string> {
  const prefix = `FACT-${year}-`;
  const last = await tx.invoice.findFirst({
    where: { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: "desc" },
    select: { invoiceNumber: true },
  });

  const lastSeq = last ? Number.parseInt(last.invoiceNumber.slice(prefix.length), 10) : 0;
  const next = (Number.isFinite(lastSeq) ? lastSeq : 0) + 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

// ---- Service ----

export class InvoicesService {
  constructor(private readonly prisma: PrismaClient) {}

  // ---- Liste ----

  async list(query: ListInvoicesQuery, operatorId: string) {
    const { page, limit, status, excludeStatus, year, search } = query;
    const skip = (page - 1) * limit;

    // Lecture pure — cf. `QuotesService.list`. La bascule SENT → OVERDUE revient
    // au cron `invoice-overdue`, qui passe juste après minuit : `dueDate` est une
    // DATE (sans heure), le statut ne peut donc changer qu'au passage de minuit,
    // et le faire à cet instant-là ne laisse aucun décalage visible.
    const where: Prisma.InvoiceWhereInput = {
      operatorId,
      deletedAt: null,
      // `status` (filtre positif) l'emporte sur `excludeStatus` : les deux
      // portent sur la même clé Prisma, et demander explicitement un statut est
      // une intention plus forte que d'en masquer d'autres.
      ...(status
        ? { status }
        : excludeStatus.length > 0
          ? { status: { notIn: excludeStatus } }
          : {}),
      ...(year ? { invoiceNumber: { startsWith: `FACT-${year}-` } } : {}),
      ...(search
        ? {
            OR: [
              { clientNom: { contains: search, mode: "insensitive" } },
              { clientEmail: { contains: search, mode: "insensitive" } },
              { invoiceNumber: { contains: search, mode: "insensitive" } },
              { user: { name: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const [invoices, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, name: true, email: true } },
          quote: { select: { id: true, numero: true, status: true } },
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      data: invoices,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // ---- Détail ----

  async getById(id: string, operatorId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, operatorId, deletedAt: null },
      include: {
        user: { select: { id: true, name: true, email: true } },
        quote: { select: { id: true, numero: true, status: true } },
      },
    });

    if (!invoice) {
      throw new NotFoundError("Facture", id);
    }

    return invoice;
  }

  // ---- Création depuis un devis ----

  /**
   * Facture un devis. Tout est figé au moment de l'émission : client, lignes,
   * remise, livraison et totaux sont recopiés dans la facture (colonnes + JSON
   * `metadata`). Modifier ou supprimer le devis ensuite ne réécrit donc pas une
   * facture déjà partie chez le client.
   */
  async createFromQuote(
    quoteId: string,
    operatorId: string,
    input: CreateInvoiceFromQuoteInput,
    adminId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId, operatorId, deletedAt: null },
      include: { lignes: { orderBy: { position: "asc" } } },
    });

    if (!quote) {
      throw new NotFoundError("Devis", quoteId);
    }

    // Un brouillon n'a pas encore été soumis au client : le facturer produirait
    // une pièce comptable pour un montant que personne n'a validé.
    if (quote.status !== "ACCEPTE" && quote.status !== "ENVOYE") {
      throw new UnprocessableEntityError(
        "Seul un devis envoyé ou accepté peut être facturé",
        "QUOTE_NOT_INVOICEABLE",
      );
    }

    // Une facture non annulée existe déjà : on ne facture pas deux fois le même
    // devis par double-clic. Une facture annulée, elle, autorise la réémission.
    const existing = await this.prisma.invoice.findFirst({
      where: {
        quoteId,
        deletedAt: null,
        status: { notIn: ["CANCELLED"] },
      },
      select: { id: true, invoiceNumber: true },
    });

    if (existing) {
      throw new ConflictError(
        `Ce devis est déjà facturé (${existing.invoiceNumber}). Annulez cette facture avant d'en émettre une nouvelle.`,
      );
    }

    const totals = computeDevisTotals({
      numero: quote.numero,
      date: quote.createdAt.toISOString().slice(0, 10),
      validiteJours: quote.validiteJours,
      client: { nom: quote.clientNom },
      lines: quote.lignes.map((l) => ({
        designation: l.designation,
        qty: l.qty,
        unitCents: l.unitCents,
      })),
      remisePct: quote.remisePct,
      livraisonCents: quote.livraisonCents,
      tvaApplicable: quote.tvaApplicable,
    });

    // Micro-entreprise : sans TVA, le taux ET le montant sont à zéro et le TTC
    // égale le HT. La mention légale part dans metadata, elle doit figurer sur
    // le PDF sous peine de facture non conforme.
    const vatRate = quote.tvaApplicable ? 2000 : 0;

    const dueDate = input.dueDate ? new Date(input.dueDate) : new Date();
    if (!input.dueDate) {
      dueDate.setDate(dueDate.getDate() + input.dueDays);
    }

    // Coordonnées bancaires de l'opérateur, figées dans la facture à l'émission.
    const operator = await this.prisma.operator.findUnique({
      where: { id: operatorId },
      select: { iban: true, bic: true },
    });
    const reglement = buildReglementMention(operator?.iban, operator?.bic);

    const metadata: Prisma.InputJsonValue = {
      source: "QUOTE",
      quoteNumero: quote.numero,
      lines: quote.lignes.map((l) => ({
        designation: l.designation,
        qty: l.qty,
        unitCents: l.unitCents,
        totalCents: l.qty * l.unitCents,
        position: l.position,
      })),
      sousTotalCents: totals.sousTotal,
      remisePct: quote.remisePct,
      remiseCents: totals.remise,
      livraisonCents: quote.livraisonCents,
      // Libellé FIGÉ à l'émission. Sans lui, le PDF déduit l'intitulé du seul
      // montant (25 € → « Express 24 h ») : un montant saisi à la main pour une
      // course hors zone se retrouverait imprimé comme un forfait d'urgence.
      // Le libellé est fourni EXPLICITEMENT parce que le montant seul ne dit pas
      // si 0 € vaut « offerte » ou « reste à chiffrer » — le drapeau du devis,
      // lui, le dit.
      livraisonLabel: resolveLivraisonLabel({
        livraisonCents: quote.livraisonCents,
        livraisonLabel: libelleLivraisonDevis(quote),
      }),
      tvaApplicable: quote.tvaApplicable,
      ...(quote.tvaApplicable ? {} : { mentionLegale: VAT_EXEMPTION_MENTION }),
      ...(reglement ? { reglement } : {}),
      ...(quote.notes ? { notes: quote.notes } : {}),
    };

    const MAX_RETRIES = 5;
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
      try {
        const invoice = await this.prisma.$transaction(
          async (tx) => {
            const invoiceNumber = await generateInvoiceNumber(tx);

            return tx.invoice.create({
              data: {
                operatorId,
                userId: quote.userId,
                quoteId: quote.id,
                invoiceNumber,
                status: "DRAFT",
                clientNom: quote.clientNom,
                clientEmail: quote.clientEmail,
                clientAdresse: quote.clientAdresse,
                totalHtCents: totals.totalHT,
                vatRate,
                vatAmountCents: totals.tva,
                totalTtcCents: totals.totalTTC,
                dueDate,
                metadata,
              },
              include: {
                user: { select: { id: true, name: true, email: true } },
                quote: { select: { id: true, numero: true, status: true } },
              },
            });
          },
          { isolationLevel: "Serializable" },
        );

        await createAuditLog({
          prisma: this.prisma,
          userId: adminId,
          action: "CREATE",
          entity: "Invoice",
          entityId: invoice.id,
          changes: {
            invoiceNumber: invoice.invoiceNumber,
            quoteId,
            quoteNumero: quote.numero,
            totalTtcCents: invoice.totalTtcCents,
          },
          ipAddress,
          userAgent,
        });

        return invoice;
      } catch (err: unknown) {
        // P2002 = collision sur invoiceNumber (deux émissions concurrentes).
        const prismaError = err as { code?: string };
        if (prismaError.code === "P2002") {
          attempt++;
          if (attempt >= MAX_RETRIES) {
            throw new ConflictError(
              "Impossible de générer un numéro de facture unique après plusieurs tentatives",
            );
          }
          continue;
        }
        throw err;
      }
    }

    throw new ConflictError("Impossible de générer un numéro de facture unique");
  }

  // ---- Transition de statut ----

  async updateStatus(
    id: string,
    operatorId: string,
    input: UpdateInvoiceStatusInput,
    adminId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, operatorId, deletedAt: null },
    });

    if (!invoice) {
      throw new NotFoundError("Facture", id);
    }

    const from = invoice.status;
    const to = input.status;
    const allowed = INVOICE_TRANSITIONS[from] ?? [];

    if (!allowed.includes(to)) {
      throw new UnprocessableEntityError(
        `Transition de statut non autorisée : ${from} → ${to}`,
        "INVALID_TRANSITION",
      );
    }

    // Effets de bord de statut : la date d'encaissement est posée en même temps
    // que PAID, et retirée si la facture repasse en avoir.
    const sideEffects: Prisma.InvoiceUpdateInput = {};
    if (to === "PAID") sideEffects.paidAt = input.paidAt ? new Date(input.paidAt) : new Date();
    if (to === "REFUNDED") sideEffects.paidAt = null;

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status: to, ...sideEffects },
      include: {
        user: { select: { id: true, name: true, email: true } },
        quote: { select: { id: true, numero: true, status: true } },
      },
    });

    await createAuditLog({
      prisma: this.prisma,
      userId: adminId,
      action: "UPDATE",
      entity: "Invoice",
      entityId: id,
      changes: { previousStatus: from, newStatus: to },
      ipAddress,
      userAgent,
    });

    return updated;
  }

  // ---- Suppression (soft-delete, DRAFT uniquement) ----

  async softDelete(
    id: string,
    operatorId: string,
    adminId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, operatorId, deletedAt: null },
    });

    if (!invoice) {
      throw new NotFoundError("Facture", id);
    }

    if (!INVOICE_DELETABLE.includes(invoice.status)) {
      throw new UnprocessableEntityError(
        "Une facture émise ne peut plus être supprimée — annulez-la (CANCELLED) pour conserver la piste d'audit",
        "INVOICE_NOT_DELETABLE",
      );
    }

    await this.prisma.invoice.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await createAuditLog({
      prisma: this.prisma,
      userId: adminId,
      action: "DELETE",
      entity: "Invoice",
      entityId: id,
      changes: { invoiceNumber: invoice.invoiceNumber },
      ipAddress,
      userAgent,
    });

    return { id, deleted: true };
  }

  // ---- Passage automatique en OVERDUE ----

  /** Filet idempotent : une facture SENT dont l'échéance est passée devient OVERDUE. */
  /**
   * Bascule SENT → OVERDUE des factures dont l'échéance est passée.
   *
   * **Seule** implémentation de cette règle — le cron `invoice-overdue` l'appelle
   * sans opérateur plutôt que d'en garder une copie.
   *
   * @param operatorId Limite à un opérateur. Omis ⇒ TOUS.
   * @param now Injectable pour les tests.
   */
  async markOverdue(operatorId?: string, now: Date = new Date()) {
    // `dueDate` est une DATE sans heure : une facture n'est en retard qu'à
    // partir du lendemain de son échéance, d'où la comparaison à minuit.
    const aujourdhui = new Date(now);
    aujourdhui.setHours(0, 0, 0, 0);

    const { count } = await this.prisma.invoice.updateMany({
      where: {
        ...(operatorId ? { operatorId } : {}),
        status: "SENT",
        deletedAt: null,
        dueDate: { lt: aujourdhui },
      },
      data: { status: "OVERDUE" },
    });

    return count;
  }
}
