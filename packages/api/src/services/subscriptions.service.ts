import type { PrismaClient, Prisma } from "@prisma/client";
import { NotFoundError, AppError, ConflictError } from "../utils/errors.js";
import { createAuditLog } from "../utils/audit.js";
import type { CreateSubscriptionInput, ListSubscriptionsQuery } from "../schemas/subscriptions.schema.js";

export class SubscriptionsService {
  constructor(private readonly prisma: PrismaClient) {}

  async getByUserId(userId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      include: {
        products: {
          include: { product: { select: { id: true, name: true, range: true, category: true, priceCents: true } } },
        },
      },
    });

    if (!subscription) {
      throw new NotFoundError("Abonnement");
    }

    return subscription;
  }

  async create(
    data: CreateSubscriptionInput,
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    // Check no existing active subscription
    const existing = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    if (existing && existing.status !== "CANCELLED") {
      throw new ConflictError("Vous avez déjà un abonnement actif");
    }

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const subscription = await this.prisma.subscription.create({
      data: {
        userId,
        plan: data.plan,
        status: "ACTIVE",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        products: {
          create: data.products.map((p) => ({
            productId: p.productId,
            quantity: p.quantity,
          })),
        },
      },
      include: {
        products: {
          include: { product: { select: { id: true, name: true, range: true, priceCents: true } } },
        },
      },
    });

    await createAuditLog({
      prisma: this.prisma,
      userId,
      action: "CREATE",
      entity: "Subscription",
      entityId: subscription.id,
      changes: { plan: data.plan, productsCount: data.products.length },
      ipAddress,
      userAgent,
    });

    return subscription;
  }

  async pause(userId: string, ipAddress?: string, userAgent?: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription) {
      throw new NotFoundError("Abonnement");
    }

    if (subscription.status !== "ACTIVE") {
      throw new AppError(400, "INVALID_STATUS", "Seul un abonnement actif peut être mis en pause");
    }

    if (subscription.pauseMonthsUsed >= 2) {
      throw new AppError(400, "PAUSE_LIMIT", "Vous avez atteint la limite de 2 mois de pause par an");
    }

    const updated = await this.prisma.subscription.update({
      where: { userId },
      data: {
        status: "PAUSED",
        pausedAt: new Date(),
        pauseMonthsUsed: { increment: 1 },
      },
    });

    await createAuditLog({
      prisma: this.prisma,
      userId,
      action: "UPDATE",
      entity: "Subscription",
      entityId: subscription.id,
      changes: { status: "PAUSED", pauseMonthsUsed: subscription.pauseMonthsUsed + 1 },
      ipAddress,
      userAgent,
    });

    return updated;
  }

  async resume(userId: string, ipAddress?: string, userAgent?: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription) {
      throw new NotFoundError("Abonnement");
    }

    if (subscription.status !== "PAUSED") {
      throw new AppError(400, "INVALID_STATUS", "Seul un abonnement en pause peut être repris");
    }

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const updated = await this.prisma.subscription.update({
      where: { userId },
      data: {
        status: "ACTIVE",
        pausedAt: null,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
    });

    await createAuditLog({
      prisma: this.prisma,
      userId,
      action: "UPDATE",
      entity: "Subscription",
      entityId: subscription.id,
      changes: { status: "ACTIVE" },
      ipAddress,
      userAgent,
    });

    return updated;
  }

  async cancel(userId: string, ipAddress?: string, userAgent?: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription) {
      throw new NotFoundError("Abonnement");
    }

    if (subscription.status === "CANCELLED") {
      throw new AppError(400, "ALREADY_CANCELLED", "Cet abonnement est déjà annulé");
    }

    const cancelEffectiveAt = new Date();
    cancelEffectiveAt.setDate(cancelEffectiveAt.getDate() + 30);

    const updated = await this.prisma.subscription.update({
      where: { userId },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelEffectiveAt,
      },
    });

    await createAuditLog({
      prisma: this.prisma,
      userId,
      action: "UPDATE",
      entity: "Subscription",
      entityId: subscription.id,
      changes: { status: "CANCELLED", cancelEffectiveAt: cancelEffectiveAt.toISOString() },
      ipAddress,
      userAgent,
    });

    return updated;
  }

  async list(query: ListSubscriptionsQuery) {
    const { page, limit, status, plan } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.SubscriptionWhereInput = {
      ...(status ? { status } : {}),
      ...(plan ? { plan } : {}),
    };

    const [subscriptions, total] = await Promise.all([
      this.prisma.subscription.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, name: true, email: true, accommodationType: true } },
          products: {
            include: { product: { select: { id: true, name: true, range: true, priceCents: true } } },
          },
        },
      }),
      this.prisma.subscription.count({ where }),
    ]);

    return {
      data: subscriptions,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}
