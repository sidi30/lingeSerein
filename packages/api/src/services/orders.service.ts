import type { PrismaClient, Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { NotFoundError, AppError, UnprocessableEntityError } from "../utils/errors.js";
import { createAuditLog } from "../utils/audit.js";
import { ORDER_TRANSITIONS } from "@lingengo/shared";
import type { OrderStatus } from "@lingengo/shared";
import { NotificationsService } from "./notifications.service.js";
import type {
  CreateOrderInput,
  ListOrdersQuery,
  CancelOrderInput,
  UpdateOrderStatusInput,
} from "../schemas/orders.schema.js";

export class OrdersService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(query: ListOrdersQuery, userId?: string, isAdmin = false) {
    const { page, limit, status, source, from, to } = query;
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

  async getById(id: string, userId?: string) {
    const where: Prisma.OrderWhereInput = { id, deletedAt: null };
    if (userId) {
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

  async create(data: CreateOrderInput, userId: string, ipAddress?: string, userAgent?: string) {
    // Fetch product prices
    const productIds = data.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, isActive: true, deletedAt: null },
    });

    if (products.length !== productIds.length) {
      throw new AppError(
        400,
        "INVALID_PRODUCTS",
        "Un ou plusieurs produits sont invalides ou inactifs",
      );
    }

    const productMap = new Map(products.map((p) => [p.id, p]));

    const items = data.items.map((item) => {
      const product = productMap.get(item.productId)!;
      return {
        productId: item.productId,
        quantity: item.quantity,
        unitCents: product.priceCents,
        totalCents: product.priceCents * item.quantity,
      };
    });

    const totalCents = items.reduce((sum, item) => sum + item.totalCents, 0);

    // Generate order number
    const seq = randomBytes(3).toString("hex").toUpperCase();
    const year = new Date().getFullYear();
    const orderNumber = `LNG-${year}-${seq}`;

    const order = await this.prisma.order.create({
      data: {
        userId,
        orderNumber,
        totalCents,
        deliveryDate: new Date(data.deliveryDate),
        timeSlot: data.timeSlot,
        specialNotes: data.specialNotes,
        items: {
          create: items,
        },
      },
      include: {
        items: { include: { product: { select: { name: true, range: true, category: true } } } },
      },
    });

    await createAuditLog({
      prisma: this.prisma,
      userId,
      action: "CREATE",
      entity: "Order",
      entityId: order.id,
      changes: { orderNumber, totalCents, itemCount: items.length },
      ipAddress,
      userAgent,
    });

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

    const updated = await this.prisma.order.update({
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

    return updated;
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

    const updated = await this.prisma.order.update({
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

    return updated;
  }
}
