import type { PrismaClient, Prisma } from "@prisma/client";
import { computeDevisTotals, QUOTE_TRANSITIONS, QUOTE_EDITABLE } from "@lingengo/shared";
import type { QuoteStatus } from "@lingengo/shared";
import { NotFoundError, ConflictError, UnprocessableEntityError } from "../utils/errors.js";
import { createAuditLog } from "../utils/audit.js";
import type {
  CreateQuoteInput,
  UpdateQuoteInput,
  UpdateQuoteStatusInput,
  ListQuotesQuery,
  ConvertQuoteInput,
} from "../schemas/quotes.schema.js";

// ---- Helpers ----

// ---- Service ----

export class QuotesService {
  constructor(private readonly prisma: PrismaClient) {}

  // ---- Liste ----

  async list(query: ListQuotesQuery, operatorId: string) {
    const { page, limit, status, search, from, to } = query;
    const skip = (page - 1) * limit;

    // Expirer les devis avant la réponse (ADR-008 — filet idempotent)
    await this.expireOverdue(operatorId);

    const where: Prisma.QuoteWhereInput = {
      operatorId,
      deletedAt: null,
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { clientNom: { contains: search, mode: "insensitive" } },
              { clientEmail: { contains: search, mode: "insensitive" } },
              { numero: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    };

    const [quotes, total] = await Promise.all([
      this.prisma.quote.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          lignes: { orderBy: { position: "asc" } },
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.quote.count({ where }),
    ]);

    // Calculer les totaux pour chaque devis
    const data = quotes.map((q) => {
      const devisData = {
        numero: q.numero,
        date: q.createdAt.toISOString().slice(0, 10),
        validiteJours: q.validiteJours,
        client: { nom: q.clientNom },
        lines: q.lignes.map((l) => ({
          designation: l.designation,
          qty: l.qty,
          unitCents: l.unitCents,
        })),
        remisePct: q.remisePct,
        livraisonCents: q.livraisonCents,
        tvaApplicable: q.tvaApplicable,
      };
      const totals = computeDevisTotals(devisData);
      return { ...q, totals };
    });

    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // ---- Détail ----

  async getById(id: string, operatorId: string) {
    const quote = await this.prisma.quote.findFirst({
      where: { id, operatorId, deletedAt: null },
      include: {
        lignes: { orderBy: { position: "asc" } },
        user: { select: { id: true, name: true, email: true } },
      },
    });

    if (!quote) {
      throw new NotFoundError("Devis", id);
    }

    const devisData = {
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
    };
    const totals = computeDevisTotals(devisData);
    return { ...quote, totals };
  }

  // ---- Création (transaction Serializable + retry P2002) ----

  async create(
    data: CreateQuoteInput,
    operatorId: string,
    createdBy: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const MAX_RETRIES = 5;
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
      try {
        const quote = await this.prisma.$transaction(
          async (tx) => {
            const numero = await this.generateNumero(tx as unknown as PrismaClient);

            const created = await tx.quote.create({
              data: {
                numero,
                operatorId,
                createdBy,
                clientNom: data.clientNom,
                clientEmail: data.clientEmail ?? null,
                clientTel: data.clientTel ?? null,
                clientAdresse: data.clientAdresse ?? null,
                userId: data.userId ?? null,
                remisePct: data.remisePct,
                livraisonCents: data.livraisonCents,
                tvaApplicable: data.tvaApplicable,
                notes: data.notes ?? null,
                validiteJours: data.validiteJours,
                lignes: {
                  create: data.lignes.map((l) => ({
                    designation: l.designation,
                    qty: l.qty,
                    unitCents: l.unitCents,
                    position: l.position,
                  })),
                },
              },
              include: {
                lignes: { orderBy: { position: "asc" } },
                user: { select: { id: true, name: true, email: true } },
              },
            });

            return created;
          },
          { isolationLevel: "Serializable" },
        );

        const devisData = {
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
        };
        const totals = computeDevisTotals(devisData);
        const result = { ...quote, totals };

        await createAuditLog({
          prisma: this.prisma,
          userId: createdBy,
          action: "CREATE",
          entity: "Quote",
          entityId: quote.id,
          changes: {
            numero: quote.numero,
            status: quote.status,
            lineCount: quote.lignes.length,
            totalTTC: totals.totalTTC,
          },
          ipAddress,
          userAgent,
        });

        return result;
      } catch (err: unknown) {
        // P2002 = unique constraint violation (numero collision)
        const prismaError = err as { code?: string };
        if (prismaError.code === "P2002") {
          attempt++;
          if (attempt >= MAX_RETRIES) {
            throw new ConflictError(
              "Impossible de générer un numéro de devis unique après plusieurs tentatives",
            );
          }
          continue;
        }
        throw err;
      }
    }

    // Should never reach here
    throw new ConflictError("Impossible de générer un numéro de devis unique");
  }

  // ---- Modification ----

  async update(
    id: string,
    operatorId: string,
    data: UpdateQuoteInput,
    adminId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const quote = await this.prisma.quote.findFirst({
      where: { id, operatorId, deletedAt: null },
    });

    if (!quote) {
      throw new NotFoundError("Devis", id);
    }

    if (!(QUOTE_EDITABLE as string[]).includes(quote.status)) {
      throw new UnprocessableEntityError(
        "Ce devis ne peut plus être modifié",
        "QUOTE_NOT_EDITABLE",
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Remplacer toutes les lignes si fournies
      if (data.lignes !== undefined) {
        await tx.quoteLine.deleteMany({ where: { quoteId: id } });
        await tx.quoteLine.createMany({
          data: data.lignes.map((l) => ({
            quoteId: id,
            designation: l.designation,
            qty: l.qty,
            unitCents: l.unitCents,
            position: l.position,
          })),
        });
      }

      // Mise à jour des champs du devis
      const { lignes: _lignes, ...fields } = data;
      return tx.quote.update({
        where: { id },
        data: {
          ...(fields.clientNom !== undefined ? { clientNom: fields.clientNom } : {}),
          ...(fields.clientEmail !== undefined ? { clientEmail: fields.clientEmail } : {}),
          ...(fields.clientTel !== undefined ? { clientTel: fields.clientTel } : {}),
          ...(fields.clientAdresse !== undefined ? { clientAdresse: fields.clientAdresse } : {}),
          ...(fields.userId !== undefined ? { userId: fields.userId } : {}),
          ...(fields.remisePct !== undefined ? { remisePct: fields.remisePct } : {}),
          ...(fields.livraisonCents !== undefined ? { livraisonCents: fields.livraisonCents } : {}),
          ...(fields.tvaApplicable !== undefined ? { tvaApplicable: fields.tvaApplicable } : {}),
          ...(fields.notes !== undefined ? { notes: fields.notes } : {}),
          ...(fields.validiteJours !== undefined ? { validiteJours: fields.validiteJours } : {}),
        },
        include: {
          lignes: { orderBy: { position: "asc" } },
          user: { select: { id: true, name: true, email: true } },
        },
      });
    });

    const devisData = {
      numero: updated.numero,
      date: updated.createdAt.toISOString().slice(0, 10),
      validiteJours: updated.validiteJours,
      client: { nom: updated.clientNom },
      lines: updated.lignes.map((l) => ({
        designation: l.designation,
        qty: l.qty,
        unitCents: l.unitCents,
      })),
      remisePct: updated.remisePct,
      livraisonCents: updated.livraisonCents,
      tvaApplicable: updated.tvaApplicable,
    };
    const totals = computeDevisTotals(devisData);
    const result = { ...updated, totals };

    await createAuditLog({
      prisma: this.prisma,
      userId: adminId,
      action: "UPDATE",
      entity: "Quote",
      entityId: id,
      changes: { lineCount: updated.lignes.length },
      ipAddress,
      userAgent,
    });

    return result;
  }

  // ---- Transition de statut ----

  async updateStatus(
    id: string,
    operatorId: string,
    input: UpdateQuoteStatusInput,
    adminId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const quote = await this.prisma.quote.findFirst({
      where: { id, operatorId, deletedAt: null },
      include: {
        lignes: { orderBy: { position: "asc" } },
        user: { select: { id: true, name: true, email: true } },
      },
    });

    if (!quote) {
      throw new NotFoundError("Devis", id);
    }

    const from = quote.status as QuoteStatus;
    const to = input.status as QuoteStatus;
    const allowed = QUOTE_TRANSITIONS[from] ?? [];

    if (!allowed.includes(to)) {
      throw new UnprocessableEntityError(
        `Transition de statut non autorisée : ${from} → ${to}`,
        "INVALID_TRANSITION",
      );
    }

    // Effets de bord de statut
    const sideEffects: Prisma.QuoteUpdateInput = {};
    if (to === "ENVOYE") sideEffects.dateEnvoi = new Date();
    if (to === "ACCEPTE" || to === "REFUSE") sideEffects.dateReponse = new Date();

    const updated = await this.prisma.quote.update({
      where: { id },
      data: { status: to, ...sideEffects },
      include: {
        lignes: { orderBy: { position: "asc" } },
        user: { select: { id: true, name: true, email: true } },
      },
    });

    const devisData = {
      numero: updated.numero,
      date: updated.createdAt.toISOString().slice(0, 10),
      validiteJours: updated.validiteJours,
      client: { nom: updated.clientNom },
      lines: updated.lignes.map((l) => ({
        designation: l.designation,
        qty: l.qty,
        unitCents: l.unitCents,
      })),
      remisePct: updated.remisePct,
      livraisonCents: updated.livraisonCents,
      tvaApplicable: updated.tvaApplicable,
    };
    const totals = computeDevisTotals(devisData);
    const result = { ...updated, totals };

    await createAuditLog({
      prisma: this.prisma,
      userId: adminId,
      action: "UPDATE",
      entity: "Quote",
      entityId: id,
      changes: { previousStatus: from, newStatus: to },
      ipAddress,
      userAgent,
    });

    return result;
  }

  // ---- Duplication ----

  async duplicate(
    id: string,
    operatorId: string,
    adminId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const source = await this.prisma.quote.findFirst({
      where: { id, operatorId, deletedAt: null },
      include: { lignes: { orderBy: { position: "asc" } } },
    });

    if (!source) {
      throw new NotFoundError("Devis", id);
    }

    const MAX_RETRIES = 5;
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
      try {
        const duplicate = await this.prisma.$transaction(
          async (tx) => {
            const numero = await this.generateNumero(tx as unknown as PrismaClient);

            return tx.quote.create({
              data: {
                numero,
                operatorId,
                createdBy: adminId,
                status: "BROUILLON",
                clientNom: source.clientNom,
                clientEmail: source.clientEmail,
                clientTel: source.clientTel,
                clientAdresse: source.clientAdresse,
                userId: source.userId,
                remisePct: source.remisePct,
                livraisonCents: source.livraisonCents,
                tvaApplicable: source.tvaApplicable,
                notes: source.notes,
                validiteJours: source.validiteJours,
                lignes: {
                  create: source.lignes.map((l) => ({
                    designation: l.designation,
                    qty: l.qty,
                    unitCents: l.unitCents,
                    position: l.position,
                  })),
                },
              },
              include: {
                lignes: { orderBy: { position: "asc" } },
                user: { select: { id: true, name: true, email: true } },
              },
            });
          },
          { isolationLevel: "Serializable" },
        );

        const devisData = {
          numero: duplicate.numero,
          date: duplicate.createdAt.toISOString().slice(0, 10),
          validiteJours: duplicate.validiteJours,
          client: { nom: duplicate.clientNom },
          lines: duplicate.lignes.map((l) => ({
            designation: l.designation,
            qty: l.qty,
            unitCents: l.unitCents,
          })),
          remisePct: duplicate.remisePct,
          livraisonCents: duplicate.livraisonCents,
          tvaApplicable: duplicate.tvaApplicable,
        };
        const totals = computeDevisTotals(devisData);
        const result = { ...duplicate, totals };

        await createAuditLog({
          prisma: this.prisma,
          userId: adminId,
          action: "CREATE",
          entity: "Quote",
          entityId: duplicate.id,
          changes: { numero: duplicate.numero, duplicatedFrom: id },
          ipAddress,
          userAgent,
        });

        return result;
      } catch (err: unknown) {
        const prismaError = err as { code?: string };
        if (prismaError.code === "P2002") {
          attempt++;
          if (attempt >= MAX_RETRIES) {
            throw new ConflictError("Impossible de générer un numéro de devis unique");
          }
          continue;
        }
        throw err;
      }
    }

    throw new ConflictError("Impossible de générer un numéro de devis unique");
  }

  // ---- Conversion en commande ----

  async convert(
    id: string,
    operatorId: string,
    input: ConvertQuoteInput,
    adminId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const quote = await this.prisma.quote.findFirst({
      where: { id, operatorId, deletedAt: null },
      include: { lignes: true },
    });

    if (!quote) {
      throw new NotFoundError("Devis", id);
    }

    if (quote.status !== "ACCEPTE") {
      throw new UnprocessableEntityError(
        "Seul un devis accepté peut être converti",
        "QUOTE_NOT_ACCEPTED",
      );
    }

    if (!quote.userId) {
      throw new UnprocessableEntityError(
        "Ce devis doit être lié à un compte client avant conversion",
        "CLIENT_REQUIRED",
      );
    }

    // Valider le mapping lignes → produits
    const quoteLineIds = new Set(quote.lignes.map((l) => l.id));
    for (const mapping of input.lineMappings) {
      if (!quoteLineIds.has(mapping.quoteLineId)) {
        throw new UnprocessableEntityError(
          `La ligne de devis ${mapping.quoteLineId} n'existe pas dans ce devis`,
          "INVALID_PRODUCTS",
        );
      }
    }

    // Vérifier que tous les produits existent
    const productIds = input.lineMappings.map((m) => m.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, isActive: true, deletedAt: null },
    });

    if (products.length !== productIds.length) {
      throw new UnprocessableEntityError(
        "Un ou plusieurs produits du mapping sont invalides",
        "INVALID_PRODUCTS",
      );
    }

    const productMap = new Map(products.map((p) => [p.id, p]));

    // Construire les items de la commande depuis le mapping
    const lineMap = new Map(quote.lignes.map((l) => [l.id, l]));
    const orderItems = input.lineMappings.map((m) => {
      const line = lineMap.get(m.quoteLineId)!;
      const product = productMap.get(m.productId)!;
      return {
        productId: m.productId,
        quantity: line.qty,
        unitCents: product.priceCents,
        totalCents: product.priceCents * line.qty,
      };
    });

    const totalCents = orderItems.reduce((s, i) => s + i.totalCents, 0);

    // Générer un numéro de commande
    const { randomBytes } = await import("node:crypto");
    const seq = randomBytes(3).toString("hex").toUpperCase();
    const year = new Date().getFullYear();
    const orderNumber = `LNG-${year}-${seq}`;

    const { order } = await this.prisma.$transaction(async (tx) => {
      const createdOrder = await tx.order.create({
        data: {
          userId: quote.userId!,
          orderNumber,
          totalCents,
          source: "QUOTE_CONVERSION",
          deliveryDate: new Date(input.deliveryDate),
          timeSlot: input.timeSlot ?? null,
          items: {
            create: orderItems,
          },
        },
      });

      await tx.quote.update({
        where: { id },
        data: { convertedToOrderId: createdOrder.id },
      });

      return { order: createdOrder };
    });

    await createAuditLog({
      prisma: this.prisma,
      userId: adminId,
      action: "CREATE",
      entity: "Order",
      entityId: order.id,
      changes: { orderNumber, convertedFromQuoteId: id },
      ipAddress,
      userAgent,
    });

    await createAuditLog({
      prisma: this.prisma,
      userId: adminId,
      action: "UPDATE",
      entity: "Quote",
      entityId: id,
      changes: { convertedToOrderId: order.id },
      ipAddress,
      userAgent,
    });

    return { orderId: order.id, orderNumber: order.orderNumber };
  }

  // ---- Suppression (soft-delete, BROUILLON uniquement) ----

  async softDelete(
    id: string,
    operatorId: string,
    adminId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const quote = await this.prisma.quote.findFirst({
      where: { id, operatorId, deletedAt: null },
    });

    if (!quote) {
      throw new NotFoundError("Devis", id);
    }

    if (quote.status !== "BROUILLON") {
      throw new UnprocessableEntityError(
        "Seul un devis en brouillon peut être supprimé",
        "QUOTE_NOT_DELETABLE",
      );
    }

    await this.prisma.quote.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await createAuditLog({
      prisma: this.prisma,
      userId: adminId,
      action: "DELETE",
      entity: "Quote",
      entityId: id,
      changes: {},
      ipAddress,
      userAgent,
    });

    return { id, deleted: true };
  }

  // ---- Expirer les devis ENVOYE dont la validité est dépassée ----

  async expireOverdue(operatorId: string) {
    // Sélectionner les devis ENVOYE expirés pour les mettre à jour
    const expiredQuotes = await this.prisma.quote.findMany({
      where: {
        operatorId,
        status: "ENVOYE",
        deletedAt: null,
        dateEnvoi: { not: null },
      },
      select: { id: true, dateEnvoi: true, validiteJours: true },
    });

    const now = new Date();
    const toExpire = expiredQuotes.filter((q) => {
      if (!q.dateEnvoi) return false;
      const expiresAt = new Date(q.dateEnvoi);
      expiresAt.setDate(expiresAt.getDate() + q.validiteJours);
      return expiresAt < now;
    });

    if (toExpire.length === 0) return;

    await this.prisma.quote.updateMany({
      where: { id: { in: toExpire.map((q) => q.id) } },
      data: { status: "EXPIRE" },
    });
  }

  // ---- Générateur de numéro séquentiel (dans une transaction) ----

  private async generateNumero(tx: PrismaClient): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `LSQ-${year}-`;
    const count = await tx.quote.count({
      where: { numero: { startsWith: prefix } },
    });
    const seq = String(count + 1).padStart(4, "0");
    return `${prefix}${seq}`;
  }
}
