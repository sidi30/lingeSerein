import type { PrismaClient, Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { NotFoundError, AppError, UnprocessableEntityError } from "../utils/errors.js";
import { createAuditLog } from "../utils/audit.js";
import { NotificationsService } from "./notifications.service.js";
import { ORDER_TRANSITIONS } from "@lingengo/shared";
import type { OrderStatus } from "@lingengo/shared";
import type {
  CreateOrderInput,
  ListOrdersQuery,
  CancelOrderInput,
  UpdateOrderStatusInput,
} from "../schemas/orders.schema.js";

/**
 * Seuls états supprimables : la commande n'est pas encore entrée dans la chaîne
 * logistique (PENDING), ou en est déjà sortie sans effet (CANCELLED).
 */
const ORDER_DELETABLE: OrderStatus[] = ["PENDING", "CANCELLED"];

export class OrdersService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(query: ListOrdersQuery, userId?: string, isAdmin = false) {
    const { page, limit, status, source, from, to, search } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {
      deletedAt: null,
      ...(userId ? { userId } : {}),
      ...(status ? { status } : {}),
      ...(source ? { source } : {}),
      ...(from || to
        ? {
            deliveryDate: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
      // On cherche un numéro de commande OU un client (nom, établissement) :
      // c'est ce que l'admin tape, jamais un identifiant technique.
      ...(search
        ? {
            OR: [
              { orderNumber: { contains: search, mode: "insensitive" as const } },
              { user: { name: { contains: search, mode: "insensitive" as const } } },
              { user: { companyName: { contains: search, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    };

    const [orders, total, newCount] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          items: { include: { product: { select: { name: true, range: true, category: true } } } },
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.order.count({ where }),
      // newCount: total commandes PENDING (badge sidebar, admin seulement)
      isAdmin
        ? this.prisma.order.count({ where: { status: "PENDING", deletedAt: null } })
        : Promise.resolve(0),
    ]);

    return {
      data: orders,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      ...(isAdmin ? { meta: { newCount } } : {}),
    };
  }

  /**
   * @param userId  restreint au propriétaire de la commande (rôle CLIENT).
   * @param driverId restreint aux commandes d'une tournée que ce livreur conduit.
   *
   * Le livreur n'est ni admin ni propriétaire : il tombait donc dans la branche
   * `userId = son propre id` et **toute** commande lui renvoyait 404, y compris
   * celles de sa tournée du jour.
   */
  async getById(id: string, userId?: string, driverId?: string) {
    const where: Prisma.OrderWhereInput = { id, deletedAt: null };
    if (driverId) {
      where.deliveryStop = { round: { driverId } };
    } else if (userId) {
      where.userId = userId;
    }

    const order = await this.prisma.order.findFirst({
      where,
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, range: true, category: true } },
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            zone: { select: { id: true, name: true } },
          },
        },
        deliveryStop: true,
        quote: { select: { id: true, numero: true } },
      },
    });

    if (!order) {
      throw new NotFoundError("Commande", id);
    }

    // Récupérer l'historique de statuts depuis AuditLog
    const auditLogs = await this.prisma.auditLog.findMany({
      where: { entity: "Order", entityId: id, action: "UPDATE" },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, name: true } } },
    });

    const statusHistory = auditLogs
      .filter((log) => {
        const changes = log.changes as Record<string, unknown>;
        return changes.previousStatus !== undefined || changes.newStatus !== undefined;
      })
      .map((log) => {
        const changes = log.changes as Record<string, unknown>;
        return {
          at: log.createdAt,
          by: {
            id: log.user?.id ?? null,
            name: log.user?.name ?? null,
          },
          from: (changes.previousStatus as string) ?? null,
          to: (changes.newStatus as string) ?? null,
          raison: (changes.raison as string) ?? null,
        };
      });

    return {
      ...order,
      statusHistory,
      convertedFromQuote: order.quote ?? null,
    };
  }

  /**
   * Crée une commande.
   *
   * @param ownerId  Le client PROPRIÉTAIRE de la commande (order.userId).
   * @param actorId  L'utilisateur qui effectue l'action (audit). Différent de
   *                 ownerId quand un admin passe une commande pour un client.
   * @param opts.source  Origine de la commande. MANUAL = saisie admin : dans ce
   *                 cas on ne notifie pas les admins (ils se notifieraient eux-mêmes).
   */
  async create(
    data: CreateOrderInput,
    ownerId: string,
    actorId: string,
    opts?: { source?: "MOBILE" | "QUOTE_CONVERSION" | "MANUAL" },
    ipAddress?: string,
    userAgent?: string,
  ) {
    const source = opts?.source ?? "MOBILE";

    // Fetch product prices
    const productIds = data.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, isActive: true, deletedAt: null },
    });

    // Comparaison sur les identifiants DISTINCTS : commander deux fois le même
    // produit (deux lignes du même kit) donnait un `productIds` plus long que
    // le nombre de lignes en base, et la commande était refusée en « produits
    // invalides » alors que tout était valide.
    if (products.length !== new Set(productIds).size) {
      throw new AppError(
        400,
        "INVALID_PRODUCTS",
        "Un ou plusieurs produits sont invalides ou inactifs",
      );
    }

    const productMap = new Map(products.map((p) => [p.id, p]));

    const items = data.items.map((item) => {
      const product = productMap.get(item.productId);
      if (!product) {
        throw new AppError(400, "INVALID_PRODUCTS", `Produit ${item.productId} introuvable`);
      }
      return {
        productId: item.productId,
        quantity: item.quantity,
        unitCents: product.priceCents,
        totalCents: product.priceCents * item.quantity,
      };
    });

    const totalCents = items.reduce((sum, item) => sum + item.totalCents, 0);

    // orderNumber est aléatoire sur 3 octets : la collision est rare mais réelle
    // (contrainte unique → P2002). On retente avec un nouveau tirage.
    const year = new Date().getFullYear();
    const MAX_ATTEMPTS = 3;

    const insert = (num: string) =>
      this.prisma.order.create({
        data: {
          userId: ownerId,
          orderNumber: num,
          totalCents,
          source,
          deliveryDate: new Date(data.deliveryDate),
          timeSlot: data.timeSlot,
          specialNotes: data.specialNotes,
          items: {
            create: items,
          },
        },
        include: {
          items: {
            include: { product: { select: { name: true, range: true, category: true } } },
          },
        },
      });

    let order: Awaited<ReturnType<typeof insert>>;
    let orderNumber = "";
    let attempt = 0;

    for (;;) {
      attempt += 1;
      orderNumber = `LNG-${year}-${randomBytes(3).toString("hex").toUpperCase()}`;

      try {
        order = await insert(orderNumber);
        break;
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === "P2002" && attempt < MAX_ATTEMPTS) {
          continue;
        }
        throw err;
      }
    }

    await createAuditLog({
      prisma: this.prisma,
      userId: actorId,
      action: "CREATE",
      entity: "Order",
      entityId: order.id,
      changes: {
        orderNumber,
        totalCents,
        itemCount: items.length,
        source,
        ...(actorId !== ownerId ? { onBehalfOf: ownerId } : {}),
      },
      ipAddress,
      userAgent,
    });

    // Badge « Commandes ». Best effort, ne peut pas faire échouer la commande.
    // Inutile sur MANUAL : c'est l'admin lui-même qui vient de saisir la commande.
    if (source !== "MANUAL") {
      await new NotificationsService(this.prisma).notifyAdmins(
        "ORDER_CREATED",
        `Nouvelle commande ${orderNumber}`,
        `${items.length} article(s) — ${(totalCents / 100).toFixed(2)} €`,
        { orderId: order.id, orderNumber, href: `/commandes/${order.id}` },
      );
    }

    return order;
  }

  async cancel(
    id: string,
    userId: string,
    input: CancelOrderInput,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const order = await this.prisma.order.findFirst({
      where: { id, userId, deletedAt: null },
    });

    if (!order) {
      throw new NotFoundError("Commande", id);
    }

    if (order.status === "CANCELLED" || order.status === "DELIVERED") {
      throw new AppError(400, "INVALID_STATUS", "Cette commande ne peut pas être annulée");
    }

    // Check >24h before delivery
    const hoursBeforeDelivery = (order.deliveryDate.getTime() - Date.now()) / (1000 * 60 * 60);

    if (hoursBeforeDelivery < 24) {
      throw new AppError(
        400,
        "CANCEL_TOO_LATE",
        "Annulation impossible : la livraison est prévue dans moins de 24h",
      );
    }

    await this.prisma.order.update({
      where: { id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledReason: input.reason,
      },
    });

    await createAuditLog({
      prisma: this.prisma,
      userId,
      action: "UPDATE",
      entity: "Order",
      entityId: id,
      changes: { status: "CANCELLED", reason: input.reason },
      ipAddress,
      userAgent,
    });

    // La MÊME forme que `GET /orders/:id`. La ligne Prisma nue renvoyée
    // auparavant n'avait pas `items` : un écran qui écrasait son cache avec
    // cette réponse plantait au rendu suivant sur `order.items.map()`.
    return this.getById(id);
  }

  async updateStatus(
    id: string,
    input: UpdateOrderStatusInput,
    adminId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const order = await this.prisma.order.findFirst({
      where: { id, deletedAt: null },
      include: { user: { select: { id: true, name: true } } },
    });

    if (!order) {
      throw new NotFoundError("Commande", id);
    }

    const from = order.status as OrderStatus;
    const to = input.status as OrderStatus;
    const allowedTransitions = ORDER_TRANSITIONS[from] ?? [];

    if (!allowedTransitions.includes(to)) {
      throw new UnprocessableEntityError(
        `Transition de statut non autorisée : ${from} → ${to}`,
        "INVALID_TRANSITION",
      );
    }

    await this.prisma.order.update({
      where: { id },
      data: {
        status: to,
        ...(to === "CANCELLED"
          ? {
              cancelledAt: new Date(),
              cancelledReason: input.raison ?? null,
            }
          : {}),
      },
    });

    await createAuditLog({
      prisma: this.prisma,
      userId: adminId,
      action: "UPDATE",
      entity: "Order",
      entityId: id,
      changes: {
        previousStatus: from,
        newStatus: to,
        ...(input.raison ? { raison: input.raison } : {}),
      },
      ipAddress,
      userAgent,
    });

    // Notification client best-effort (F2)
    if (order.userId && (to === "CONFIRMED" || to === "CANCELLED")) {
      try {
        const notifService = new NotificationsService(this.prisma);
        const title =
          to === "CONFIRMED"
            ? `Votre commande #${order.orderNumber} a été confirmée`
            : `Votre commande #${order.orderNumber} a été refusée`;
        const body =
          to === "CANCELLED" && input.raison
            ? `Votre commande #${order.orderNumber} a été refusée : ${input.raison}`
            : title;

        await notifService.create(order.userId, "GENERAL", title, body);
      } catch {
        // Notification non bloquante — ignorer silencieusement
      }
    }

    // Même forme que `GET /orders/:id` — cf. `cancel()`.
    return this.getById(id);
  }

  // ---- Suppression douce (DELETE /orders/:id) ---------------------------------

  /**
   * Soft-delete d'une commande — PENDING ou CANCELLED uniquement.
   *
   * Au-delà, la commande est engagée dans la chaîne logistique et comptable :
   * une commande CONFIRMED a pu générer un arrêt de tournée, une DELIVERED est
   * adossée à une facture. La faire disparaître d'un clic désaccorderait la
   * facturation du réel. Ces états-là s'annulent (PATCH /:id/status → CANCELLED),
   * ce qui conserve la trace, puis se suppriment.
   */
  async softDelete(id: string, adminId: string, ipAddress?: string, userAgent?: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, status: true, orderNumber: true },
    });

    if (!order) {
      throw new NotFoundError("Commande", id);
    }

    if (!ORDER_DELETABLE.includes(order.status)) {
      throw new UnprocessableEntityError(
        `Une commande ${order.status} ne peut pas être supprimée — annulez-la d'abord (statut CANCELLED)`,
        "ORDER_NOT_DELETABLE",
      );
    }

    await this.prisma.order.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await createAuditLog({
      prisma: this.prisma,
      userId: adminId,
      action: "DELETE",
      entity: "Order",
      entityId: id,
      changes: { orderNumber: order.orderNumber, previousStatus: order.status },
      ipAddress,
      userAgent,
    });

    return { id, deleted: true };
  }
}
