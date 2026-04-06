import type { PrismaClient, Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { NotFoundError, AppError } from "../utils/errors.js";
import { createAuditLog } from "../utils/audit.js";
import type { CreateOrderInput, ListOrdersQuery, CancelOrderInput } from "../schemas/orders.schema.js";

export class OrdersService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(query: ListOrdersQuery, userId?: string) {
    const { page, limit, status, from, to } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {
      deletedAt: null,
      ...(userId ? { userId } : {}),
      ...(status ? { status } : {}),
      ...(from || to
        ? {
            deliveryDate: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    };

    const [orders, total] = await Promise.all([
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
    ]);

    return {
      data: orders,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
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
        items: { include: { product: true } },
        user: { select: { id: true, name: true, email: true } },
        deliveryStop: true,
      },
    });

    if (!order) {
      throw new NotFoundError("Commande", id);
    }

    return order;
  }

  async create(
    data: CreateOrderInput,
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    // Fetch product prices
    const productIds = data.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, isActive: true, deletedAt: null },
    });

    if (products.length !== productIds.length) {
      throw new AppError(400, "INVALID_PRODUCTS", "Un ou plusieurs produits sont invalides ou inactifs");
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
    const hoursBeforeDelivery =
      (order.deliveryDate.getTime() - Date.now()) / (1000 * 60 * 60);

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
    status: string,
    adminId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const order = await this.prisma.order.findFirst({
      where: { id, deletedAt: null },
    });

    if (!order) {
      throw new NotFoundError("Commande", id);
    }

    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        status: status as "PENDING" | "CONFIRMED" | "IN_DELIVERY" | "DELIVERED" | "CANCELLED",
        ...(status === "CANCELLED" ? { cancelledAt: new Date() } : {}),
      },
    });

    await createAuditLog({
      prisma: this.prisma,
      userId: adminId,
      action: "UPDATE",
      entity: "Order",
      entityId: id,
      changes: { previousStatus: order.status, newStatus: status },
      ipAddress,
      userAgent,
    });

    return updated;
  }
}
