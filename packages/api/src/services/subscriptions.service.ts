/**
 * SubscriptionsService V2
 * ADR-V2-002 : getConfig() / updateConfig() — SubscriptionConfig par opérateur.
 * ADR-V2-003 : plan nullable pour Pack Sérénité.
 * ADR-V2-006 : snapshot engagement dans create(), blocage résiliation dans cancel().
 * ADR-V2-008 : endpoints config (auto-provision si absente).
 */

import type { PrismaClient, Prisma } from "@prisma/client";
import {
  NotFoundError,
  AppError,
  ConflictError,
  UnprocessableEntityError,
} from "../utils/errors.js";
import { createAuditLog } from "../utils/audit.js";
import { SUBSCRIPTION_DEFAULTS, addMonths } from "@lingengo/shared";
import type {
  CreateSubscriptionInput,
  UpdateSubscriptionConfigInput,
  ListSubscriptionsQuery,
} from "../schemas/subscriptions.schema.js";

// ---- Helpers ----------------------------------------------------------------

/** Formate une date ISO pour les messages d'erreur humains */
function formatDate(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ---- Inclusion Prisma commune -----------------------------------------------

const SUBSCRIPTION_INCLUDE = {
  products: {
    include: {
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          kind: true,
          range: true,
          category: true,
          priceCents: true,
        },
      },
    },
  },
} as const satisfies Prisma.SubscriptionInclude;

export class SubscriptionsService {
  constructor(private readonly prisma: PrismaClient) {}

  // ---- Config Pack Sérénité -------------------------------------------------

  /**
   * Récupère la SubscriptionConfig de l'opérateur.
   * Auto-provisionne avec les defaults si aucune ligne n'existe (ADR-V2-008).
   */
  async getConfig(operatorId: string) {
    const existing = await this.prisma.subscriptionConfig.findUnique({
      where: { operatorId },
    });

    if (existing) return existing;

    // Auto-provision — idempotent (unique constraint sur operatorId)
    return this.prisma.subscriptionConfig.create({
      data: {
        operatorId,
        planName: SUBSCRIPTION_DEFAULTS.PLAN_NAME,
        priceCents: SUBSCRIPTION_DEFAULTS.PRICE_CENTS,
        kitBainQty: SUBSCRIPTION_DEFAULTS.KIT_BAIN_QTY,
        kitLitQty: SUBSCRIPTION_DEFAULTS.KIT_LIT_QTY,
        minEngagementMonths: SUBSCRIPTION_DEFAULTS.MIN_ENGAGEMENT_MONTHS,
        noticePeriodDays: SUBSCRIPTION_DEFAULTS.NOTICE_PERIOD_DAYS,
        isActive: true,
      },
    });
  }

  /**
   * Met à jour la config. N'affecte PAS les abonnements existants (snapshots immuables — AC-F6-06).
   */
  async updateConfig(
    operatorId: string,
    data: UpdateSubscriptionConfigInput,
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    // S'assurer que la config existe (auto-provision si besoin)
    await this.getConfig(operatorId);

    const updated = await this.prisma.subscriptionConfig.update({
      where: { operatorId },
      data: {
        ...(data.planName !== undefined ? { planName: data.planName } : {}),
        ...(data.priceCents !== undefined ? { priceCents: data.priceCents } : {}),
        ...(data.kitBainQty !== undefined ? { kitBainQty: data.kitBainQty } : {}),
        ...(data.kitLitQty !== undefined ? { kitLitQty: data.kitLitQty } : {}),
        ...(data.minEngagementMonths !== undefined
          ? { minEngagementMonths: data.minEngagementMonths }
          : {}),
        ...(data.noticePeriodDays !== undefined ? { noticePeriodDays: data.noticePeriodDays } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });

    await createAuditLog({
      prisma: this.prisma,
      userId,
      action: "UPDATE",
      entity: "SubscriptionConfig",
      entityId: updated.id,
      changes: data as Record<string, unknown>,
      ipAddress,
      userAgent,
    });

    return updated;
  }

  // ---- Lecture de l'abonnement courant --------------------------------------

  async getByUserId(userId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      include: SUBSCRIPTION_INCLUDE,
    });

    if (!subscription) {
      throw new NotFoundError("Abonnement");
    }

    return subscription;
  }

  // ---- Souscription -----------------------------------------------------------

  async create(
    data: CreateSubscriptionInput,
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    // Vérification : pas d'abonnement ACTIVE existant (AC-F6, 409)
    const existing = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    if (existing && existing.status !== "CANCELLED") {
      throw new ConflictError("Vous avez déjà un abonnement actif");
    }

    // Récupérer l'opérateur du user pour lire la config
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { operatorId: true },
    });

    if (!user) throw new NotFoundError("Utilisateur", userId);

    const config = await this.getConfig(user.operatorId);

    const now = new Date();
    const periodEnd = addMonths(now, 1);
    // committedUntil = currentPeriodStart + minEngagementMonths (calendaire — ADR-V2-006)
    const committedUntil = addMonths(now, config.minEngagementMonths);

    // Si products est absent, dériver kit-bain + kit-lit depuis la config
    let subscriptionProducts = data.products;
    if (!subscriptionProducts || subscriptionProducts.length === 0) {
      // Rechercher les produits canoniques de l'opérateur
      const kitBain = await this.prisma.product.findFirst({
        where: { slug: "kit-bain", isActive: true, deletedAt: null },
      });
      const kitLit = await this.prisma.product.findFirst({
        where: { slug: "kit-lit", isActive: true, deletedAt: null },
      });

      subscriptionProducts = [
        ...(kitBain ? [{ productId: kitBain.id, quantity: config.kitBainQty }] : []),
        ...(kitLit ? [{ productId: kitLit.id, quantity: config.kitLitQty }] : []),
      ];
    }

    // Re-souscription : un abonnement CANCELLED existe déjà pour ce user (userId @unique).
    // On le réinitialise complètement plutôt que de créer (sinon P2002 sur userId).
    const subscription = existing
      ? await this.prisma.subscription.update({
          where: { userId },
          data: {
            plan: null, // ADR-V2-003 : null pour Pack Sérénité
            status: "ACTIVE",
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            // Snapshots immuables recalculés depuis la config (ADR-V2-006)
            priceCents: config.priceCents,
            minEngagementMonths: config.minEngagementMonths,
            committedUntil,
            kitBainQty: config.kitBainQty,
            kitLitQty: config.kitLitQty,
            // Remise à zéro de l'état de cycle de vie résilié/pausé
            pausedAt: null,
            cancelledAt: null,
            cancelEffectiveAt: null,
            // Remplace entièrement la composition produits
            products: {
              deleteMany: {},
              create: subscriptionProducts.map((p) => ({
                productId: p.productId,
                quantity: p.quantity,
              })),
            },
          },
          include: SUBSCRIPTION_INCLUDE,
        })
      : await this.prisma.subscription.create({
          data: {
            userId,
            plan: null, // ADR-V2-003 : null pour Pack Sérénité
            status: "ACTIVE",
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            // Snapshots immuables (ADR-V2-006)
            priceCents: config.priceCents,
            minEngagementMonths: config.minEngagementMonths,
            committedUntil,
            kitBainQty: config.kitBainQty,
            kitLitQty: config.kitLitQty,
            products: {
              create: subscriptionProducts.map((p) => ({
                productId: p.productId,
                quantity: p.quantity,
              })),
            },
          },
          include: SUBSCRIPTION_INCLUDE,
        });

    await createAuditLog({
      prisma: this.prisma,
      userId,
      action: "CREATE",
      entity: "Subscription",
      entityId: subscription.id,
      changes: {
        priceCents: config.priceCents,
        minEngagementMonths: config.minEngagementMonths,
        committedUntil: committedUntil.toISOString(),
        kitBainQty: config.kitBainQty,
        kitLitQty: config.kitLitQty,
      },
      ipAddress,
      userAgent,
    });

    return subscription;
  }

  // ---- Pause ------------------------------------------------------------------

  async pause(userId: string, ipAddress?: string, userAgent?: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription) throw new NotFoundError("Abonnement");

    if (subscription.status !== "ACTIVE") {
      throw new AppError(400, "INVALID_STATUS", "Seul un abonnement actif peut être mis en pause");
    }

    if (subscription.pauseMonthsUsed >= 2) {
      throw new AppError(400, "PAUSE_LIMIT", "Vous avez atteint la limite de 2 mois de pause");
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

  // ---- Reprise ----------------------------------------------------------------

  async resume(userId: string, ipAddress?: string, userAgent?: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription) throw new NotFoundError("Abonnement");

    if (subscription.status !== "PAUSED") {
      throw new AppError(400, "INVALID_STATUS", "Seul un abonnement en pause peut être repris");
    }

    const now = new Date();
    const periodEnd = addMonths(now, 1);

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

  // ---- Résiliation -----------------------------------------------------------

  /**
   * BLOQUÉE si now() < committedUntil (ADR-V2-006, AC-F6-03).
   * Sinon : cancelledAt=now, cancelEffectiveAt=now+noticePeriodDays.
   */
  async cancel(userId: string, ipAddress?: string, userAgent?: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      include: {
        user: { select: { operatorId: true } },
      },
    });

    if (!subscription) throw new NotFoundError("Abonnement");

    if (subscription.status === "CANCELLED") {
      throw new AppError(400, "ALREADY_CANCELLED", "Cet abonnement est déjà annulé");
    }

    // Blocage engagement (ADR-V2-006)
    const now = new Date();
    if (subscription.committedUntil && now < subscription.committedUntil) {
      const dateStr = formatDate(subscription.committedUntil);
      throw new UnprocessableEntityError(
        `Résiliation non autorisée : votre engagement court jusqu'au ${dateStr}. Vous pourrez résilier à partir du ${dateStr}.`,
        "ENGAGEMENT_ACTIVE",
      );
    }

    // Récupérer le préavis depuis la config (best-effort — fallback sur 30j)
    let noticeDays: number = SUBSCRIPTION_DEFAULTS.NOTICE_PERIOD_DAYS;
    try {
      const config = await this.prisma.subscriptionConfig.findUnique({
        where: { operatorId: subscription.user.operatorId },
      });
      if (config) noticeDays = config.noticePeriodDays;
    } catch {
      // Ignore — fallback sur la constante partagée
    }

    const cancelEffectiveAt = new Date(now);
    cancelEffectiveAt.setDate(cancelEffectiveAt.getDate() + noticeDays);

    const updated = await this.prisma.subscription.update({
      where: { userId },
      data: {
        status: "CANCELLED",
        cancelledAt: now,
        cancelEffectiveAt,
      },
      include: SUBSCRIPTION_INCLUDE,
    });

    await createAuditLog({
      prisma: this.prisma,
      userId,
      action: "UPDATE",
      entity: "Subscription",
      entityId: subscription.id,
      changes: {
        status: "CANCELLED",
        cancelledAt: now.toISOString(),
        cancelEffectiveAt: cancelEffectiveAt.toISOString(),
      },
      ipAddress,
      userAgent,
    });

    return updated;
  }

  // ---- Liste (admin) ----------------------------------------------------------

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
          ...SUBSCRIPTION_INCLUDE,
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
