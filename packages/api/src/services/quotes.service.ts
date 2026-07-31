import type { PrismaClient, Prisma } from "@prisma/client";
import { computeDevisTotals, QUOTE_TRANSITIONS, QUOTE_EDITABLE } from "@lingengo/shared";
import type { QuoteStatus } from "@lingengo/shared";
import { NotFoundError, ConflictError, UnprocessableEntityError } from "../utils/errors.js";
import { createAuditLog } from "../utils/audit.js";
import { NotificationsService } from "./notifications.service.js";
import { libelleLivraisonDevis } from "../utils/livraison.js";
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

    // Aucune écriture ici : lister est une LECTURE. Ce `expireOverdue` en tête de
    // liste faisait basculer des devis ENVOYE → EXPIRE au simple rechargement de
    // l'écran ; l'utilisateur voyait un statut changer sous ses yeux sans avoir
    // rien fait, et une fiche ouverte juste après contredisait la liste qu'il
    // venait de quitter. La bascule appartient au cron `quote-expiry`, qui passe
    // toutes les heures et couvre tous les opérateurs.
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
    const data = quotes.map((q) => this.avecTotaux(q));

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

    return this.avecTotaux(quote);
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

        const result = this.avecTotaux(quote);
        const totals = result.totals;

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

        // Badge « Devis » de l'admin. Best effort : notifyAdmins avale ses
        // erreurs, un souci de notification ne doit pas perdre le devis.
        await new NotificationsService(this.prisma).notifyAdmins(
          "QUOTE_CREATED",
          `Nouveau devis ${quote.numero}`,
          `${quote.clientNom ?? "Client"} — ${(totals.totalTTC / 100).toFixed(2)} €`,
          { quoteId: quote.id, numero: quote.numero, href: `/devis/${quote.id}` },
        );

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

    const result = this.avecTotaux(updated);

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

    const result = this.avecTotaux(updated);

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
                // Recopié avec le montant : un duplicata qui perdrait le drapeau
                // rendrait « offerte » une livraison restée à chiffrer.
                livraisonSurDevis: source.livraisonSurDevis,
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

        const result = this.avecTotaux(duplicate);

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
    // Capturé ici : le rétrécissement de type se perd dans la transaction plus
    // bas, et c'est ce qui avait justifié un `!` à la création de la commande.
    const clientUserId = quote.userId;

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

    // Identifiants DISTINCTS : deux lignes de devis mappées sur le même produit
    // faisaient échouer la conversion en « produits invalides ».
    if (products.length !== new Set(productIds).size) {
      throw new UnprocessableEntityError(
        "Un ou plusieurs produits du mapping sont invalides",
        "INVALID_PRODUCTS",
      );
    }

    const productMap = new Map(products.map((p) => [p.id, p]));

    // Construire les items de la commande depuis le mapping
    const lineMap = new Map(quote.lignes.map((l) => [l.id, l]));
    const orderItems = input.lineMappings.map((m) => {
      const line = lineMap.get(m.quoteLineId);
      const product = productMap.get(m.productId);
      if (!line || !product) {
        throw new UnprocessableEntityError(
          "Un ou plusieurs produits du mapping sont invalides",
          "INVALID_PRODUCTS",
        );
      }
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
          userId: clientUserId,
          orderNumber,
          totalCents,
          // Frais REPRIS du devis, jamais recalculés : le devis fait foi, c'est
          // lui que le client a accepté. Les recalculer ici les rendrait
          // différents de la pièce signée dès que le délai a bougé entre-temps.
          deliveryFeeCents: quote.livraisonCents,
          // Le drapeau se repose avec le montant : un devis à 0 € JAMAIS chiffré
          // produisait une commande qui se relisait partout « livraison offerte »,
          // et la boucle commande → devis → commande perdait en route la seule
          // information qui distingue « gratuit » de « reste à chiffrer ».
          deliveryFeeSurDevis: quote.livraisonSurDevis,
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

  // ---- Création depuis une commande (idempotent) ----

  /**
   * Émet le devis correspondant à une commande — typiquement à sa confirmation.
   *
   * **Idempotent.** Un devis existe déjà pour cette commande ⇒ il est RENVOYÉ tel
   * quel, sans écriture ni nouveau numéro : le lien `Quote.fromOrderId` est UNIQUE
   * en base, si bien que deux requêtes concurrentes (double-clic) ne peuvent pas
   * produire deux devis — la seconde se heurte à la contrainte et retombe sur le
   * devis déjà créé.
   *
   * Les frais de livraison vont dans `livraisonCents`, PAS dans une ligne de devis :
   * c'est le champ dédié que le PDF imprime en ligne distincte et que
   * `InvoicesService.createFromQuote` recopie dans `metadata.livraisonCents` +
   * `livraisonLabel`. En faire une `QuoteLine` les soumettrait à la remise
   * commerciale et les compterait deux fois dans `computeDevisTotals`.
   */
  async createFromOrder(
    orderId: string,
    operatorId: string,
    adminId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const order = await this.prisma.order.findFirst({
      // `user.operatorId` : un admin ne peut pas faire un devis sur la commande
      // d'un autre opérateur — la commande n'a pas d'opérateur à elle, c'est son
      // client qui en porte un.
      where: { id: orderId, deletedAt: null, user: { operatorId } },
      include: {
        items: { include: { product: { select: { name: true } } } },
        user: {
          select: {
            id: true,
            name: true,
            companyName: true,
            email: true,
            phone: true,
            address: true,
          },
        },
        quoteFromOrder: {
          include: {
            lignes: { orderBy: { position: "asc" } },
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundError("Commande", orderId);
    }

    // Seule interdiction : une commande ANNULÉE. Un devis est une proposition
    // commerciale ; l'émettre pour une commande que le client a renoncé à passer
    // n'a pas de sens et ferait partir un document contredisant l'annulation.
    // Tous les autres statuts sont acceptés, PENDING compris : le gestionnaire
    // chiffre souvent AVANT de confirmer, c'est même l'usage le plus courant.
    if (order.status === "CANCELLED") {
      throw new UnprocessableEntityError(
        "Une commande annulée ne peut pas donner lieu à un devis",
        "ORDER_CANCELLED",
      );
    }

    const dejaEmis = order.quoteFromOrder;
    if (dejaEmis && !dejaEmis.deletedAt) {
      // Rien à écrire : ni devis, ni audit. Journaliser une création qui n'a pas
      // eu lieu polluerait la piste d'audit à chaque rechargement de l'écran.
      return { quote: this.avecTotaux(dejaEmis), created: false };
    }

    // Le devis précédent a été supprimé (brouillon jeté) : il ne doit pas
    // interdire d'en réémettre un. On libère le lien unique, comme une facture
    // annulée rouvre le droit de refacturer un devis.
    const lienALiberer = dejaEmis?.id;

    // Les lignes de commande n'ont pas d'ordre propre en base : le tri par
    // désignation rend le devis reproductible d'une émission à l'autre.
    const lignes = order.items
      .map((item) => ({
        designation: item.product.name,
        qty: item.quantity,
        unitCents: item.unitCents,
      }))
      .sort((a, b) => a.designation.localeCompare(b.designation, "fr"))
      .map((ligne, position) => ({ ...ligne, position }));

    // « Sur devis » signifie 0 € en base ET frais à chiffrer : sans cette note,
    // le gestionnaire enverrait un devis annonçant une livraison offerte.
    const notes = [
      order.deliveryFeeSurDevis
        ? "Frais de livraison à chiffrer (hors zone ou livraison Flash) — le montant de 0 € " +
          "porté par la commande ne vaut pas gratuité."
        : null,
      order.specialNotes,
    ]
      .filter((n): n is string => Boolean(n))
      .join("\n");

    const MAX_RETRIES = 5;
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
      try {
        const quote = await this.prisma.$transaction(
          async (tx) => {
            if (lienALiberer) {
              await tx.quote.update({ where: { id: lienALiberer }, data: { fromOrderId: null } });
            }

            // Même générateur que les devis saisis à la main : une seule suite
            // LSQ-AAAA-NNNN, deux compteurs indépendants finiraient par attribuer
            // le même numéro à deux devis du même exercice.
            const numero = await this.generateNumero(tx as unknown as PrismaClient);

            const created = await tx.quote.create({
              data: {
                numero,
                operatorId,
                createdBy: adminId,
                status: "BROUILLON",
                fromOrderId: order.id,
                userId: order.userId,
                // Snapshot client, figé comme sur tout devis : renommer le client
                // plus tard ne doit pas réécrire un devis déjà envoyé.
                clientNom: order.user.companyName ?? order.user.name,
                clientEmail: order.user.email,
                clientTel: order.user.phone,
                clientAdresse: order.user.address,
                remisePct: 0,
                livraisonCents: order.deliveryFeeCents,
                // Le drapeau suit le montant, sans quoi 0 € s'imprime
                // « Livraison offerte » DANS LE TABLEAU DES TOTAUX du devis que
                // le client signe. La note libre plus haut ne suffit pas : elle
                // vit hors des totaux, et c'est la ligne de prix qui engage.
                livraisonSurDevis: order.deliveryFeeSurDevis,
                // Défaut des devis saisis à la main : l'opérateur relève de la
                // franchise en base. Le gestionnaire bascule au besoin, le devis
                // naît en BROUILLON précisément pour être relu.
                tvaApplicable: false,
                ...(notes ? { notes } : {}),
                lignes: { create: lignes },
              },
              include: {
                lignes: { orderBy: { position: "asc" } },
                user: { select: { id: true, name: true, email: true } },
              },
            });

            // Audit DANS la transaction : un devis annulé par un échec ultérieur
            // ne doit pas laisser derrière lui la trace d'une émission.
            await createAuditLog({
              prisma: tx,
              userId: adminId,
              action: "CREATE",
              entity: "Quote",
              entityId: created.id,
              changes: {
                numero: created.numero,
                fromOrderId: order.id,
                orderNumber: order.orderNumber,
                lineCount: lignes.length,
                livraisonCents: order.deliveryFeeCents,
                ...(order.deliveryFeeSurDevis ? { livraisonSurDevis: true } : {}),
              },
              ipAddress,
              userAgent,
            });

            return created;
          },
          { isolationLevel: "Serializable" },
        );

        return { quote: this.avecTotaux(quote), created: true };
      } catch (err: unknown) {
        const prismaError = err as { code?: string };
        if (prismaError.code !== "P2002") throw err;

        // P2002 vient soit du numéro (deux émissions simultanées), soit du lien
        // unique vers la commande — c'est-à-dire qu'une requête concurrente vient
        // d'émettre LE devis de cette commande. Dans ce second cas, réessayer
        // échouerait indéfiniment : on renvoie le devis de l'autre requête, ce
        // qui est exactement le contrat d'idempotence.
        const concurrent = await this.prisma.quote.findFirst({
          where: { fromOrderId: order.id, deletedAt: null },
          include: {
            lignes: { orderBy: { position: "asc" } },
            user: { select: { id: true, name: true, email: true } },
          },
        });
        if (concurrent) {
          return { quote: this.avecTotaux(concurrent), created: false };
        }

        attempt++;
        if (attempt >= MAX_RETRIES) {
          throw new ConflictError(
            "Impossible de générer un numéro de devis unique après plusieurs tentatives",
          );
        }
      }
    }

    throw new ConflictError("Impossible de générer un numéro de devis unique");
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

  /**
   * Bascule ENVOYE → EXPIRE des devis dont la validité est dépassée.
   *
   * **Seule** implémentation de cette règle. Le cron `quote-expiry` en portait
   * une copie, divergente sur un point qui compte : elle écrivait le journal
   * d'audit, celle-ci non. Deux copies d'une règle métier finissent toujours par
   * ne plus dire la même chose, et c'est la trace comptable qui en faisait déjà
   * les frais.
   *
   * @param operatorId Limite à un opérateur. Omis ⇒ TOUS — c'est le cas du cron.
   * @param now Injectable pour les tests.
   */
  async expireOverdue(operatorId?: string, now: Date = new Date()) {
    const candidats = await this.prisma.quote.findMany({
      where: {
        ...(operatorId ? { operatorId } : {}),
        status: "ENVOYE",
        deletedAt: null,
        dateEnvoi: { not: null },
      },
      select: { id: true, dateEnvoi: true, validiteJours: true },
    });

    // La validité se compte en JOURS à partir de l'envoi, heure comprise : un
    // devis envoyé à 14 h 30 avec 30 jours expire à 14 h 30 le trentième jour.
    const aExpirer = candidats.filter((q) => {
      if (!q.dateEnvoi) return false;
      const expiresAt = new Date(q.dateEnvoi);
      expiresAt.setDate(expiresAt.getDate() + q.validiteJours);
      return expiresAt < now;
    });

    if (aExpirer.length === 0) return { expired: [] as string[] };

    const ids = aExpirer.map((q) => q.id);

    // Une seule transaction : la bascule et sa trace tombent ou passent ensemble.
    await this.prisma.$transaction(async (tx) => {
      await tx.quote.updateMany({
        where: { id: { in: ids } },
        data: { status: "EXPIRE" },
      });

      for (const id of ids) {
        await createAuditLog({
          prisma: tx,
          // Pas d'utilisateur : c'est le temps qui a agi, pas quelqu'un.
          action: "UPDATE",
          entity: "Quote",
          entityId: id,
          changes: {
            previousStatus: "ENVOYE",
            newStatus: "EXPIRE",
            reason: "Expiration automatique de validité",
          },
        });
      }
    });

    return { expired: ids };
  }

  // ---- Totaux ----

  /**
   * Devis + totaux + libellé de livraison, la seule forme que les écrans savent lire.
   *
   * Les totaux ne sont JAMAIS recalculés à la main : `computeDevisTotals` de
   * `@lingengo/shared` est la même fonction que celle qui imprime le PDF et
   * calcule la facture — deux implémentations finiraient par diverger d'un
   * centime, et c'est le client qui découvrirait l'écart.
   *
   * `livraisonLabel` accompagne le montant pour la même raison : 0 € seul ne dit
   * pas si la livraison est offerte ou reste à chiffrer, et l'imprimeur du PDF
   * n'a que ce montant pour trancher. Le libellé part donc d'ICI, calculé sur le
   * drapeau, et non déduit à l'arrivée.
   */
  private avecTotaux<
    T extends {
      numero: string;
      createdAt: Date;
      validiteJours: number;
      clientNom: string;
      lignes: { designation: string; qty: number; unitCents: number }[];
      remisePct: number;
      livraisonCents: number;
      livraisonSurDevis: boolean;
      tvaApplicable: boolean;
    },
  >(quote: T) {
    return {
      ...quote,
      livraisonLabel: libelleLivraisonDevis(quote),
      totals: computeDevisTotals({
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
      }),
    };
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
