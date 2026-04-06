import type { PrismaClient } from "@prisma/client";

export class DashboardService {
  constructor(private readonly prisma: PrismaClient) {}

  async getKpis(_operatorId: string) {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const twoWeeksAgo = new Date(now);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    // Revenue this week
    const revenueThisWeek = await this.prisma.order.aggregate({
      where: {
        status: { in: ["CONFIRMED", "DELIVERED", "IN_DELIVERY"] },
        createdAt: { gte: weekAgo },
        deletedAt: null,
      },
      _sum: { totalCents: true },
    });

    // Revenue previous week for comparison
    const revenuePrevWeek = await this.prisma.order.aggregate({
      where: {
        status: { in: ["CONFIRMED", "DELIVERED", "IN_DELIVERY"] },
        createdAt: { gte: twoWeeksAgo, lt: weekAgo },
        deletedAt: null,
      },
      _sum: { totalCents: true },
    });

    // Deliveries this week
    const deliveriesThisWeek = await this.prisma.deliveryStop.count({
      where: {
        status: "COMPLETED",
        completedAt: { gte: weekAgo },
      },
    });

    // New clients this week
    const newClientsThisWeek = await this.prisma.user.count({
      where: {
        role: "ROLE_CLIENT",
        createdAt: { gte: weekAgo },
        deletedAt: null,
      },
    });

    // Active subscriptions
    const activeSubscriptions = await this.prisma.subscription.count({
      where: { status: "ACTIVE" },
    });

    // Stock alerts: clients with low stock
    const lowStockClients = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT cs.user_id)::bigint as count
      FROM client_stocks cs
      JOIN users u ON u.id = cs.user_id
      WHERE cs.total_in_circulation > 0
        AND (cs.clean_sets::float / cs.total_in_circulation::float) * 100 < u.stock_alert_threshold
        AND u.deleted_at IS NULL
    `;

    const lowStockCount = Number(lowStockClients[0]?.count ?? 0);

    return {
      revenueCents: revenueThisWeek._sum.totalCents ?? 0,
      revenuePrevWeekCents: revenuePrevWeek._sum.totalCents ?? 0,
      deliveriesCompleted: deliveriesThisWeek,
      newClients: newClientsThisWeek,
      activeSubscriptions,
      lowStockAlerts: lowStockCount,
    };
  }

  async getRevenueChart() {
    const months: Array<{ month: string; revenueCents: number }> = [];
    const now = new Date();

    for (let i = 11; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);

      const result = await this.prisma.order.aggregate({
        where: {
          status: { in: ["CONFIRMED", "DELIVERED", "IN_DELIVERY"] },
          createdAt: { gte: start, lt: end },
          deletedAt: null,
        },
        _sum: { totalCents: true },
      });

      months.push({
        month: start.toISOString().slice(0, 7), // "YYYY-MM"
        revenueCents: result._sum.totalCents ?? 0,
      });
    }

    return months;
  }

  async getAlerts(_operatorId: string) {
    const alerts: Array<{ type: string; severity: string; message: string; entityId?: string; createdAt: Date }> = [];

    // Low stock alerts
    const lowStockClients = await this.prisma.$queryRaw<
      Array<{ user_id: string; name: string; clean_sets: number; total_in_circulation: number; product_range: string }>
    >`
      SELECT cs.user_id, u.name, cs.clean_sets, cs.total_in_circulation, cs.product_range
      FROM client_stocks cs
      JOIN users u ON u.id = cs.user_id
      WHERE cs.total_in_circulation > 0
        AND (cs.clean_sets::float / cs.total_in_circulation::float) * 100 < u.stock_alert_threshold
        AND u.deleted_at IS NULL
      LIMIT 20
    `;

    for (const client of lowStockClients) {
      alerts.push({
        type: "STOCK_LOW",
        severity: "warning",
        message: `Stock bas pour ${client.name} (${client.product_range}): ${client.clean_sets}/${client.total_in_circulation} sets propres`,
        entityId: client.user_id,
        createdAt: new Date(),
      });
    }

    // Unconfirmed deliveries (past delivery date but still PENDING)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const unconfirmedDeliveries = await this.prisma.deliveryStop.findMany({
      where: {
        status: "PENDING",
        round: { date: { lt: today } },
      },
      include: {
        client: { select: { name: true } },
        round: { select: { date: true } },
      },
      take: 20,
    });

    for (const stop of unconfirmedDeliveries) {
      alerts.push({
        type: "DELIVERY_UNCONFIRMED",
        severity: "error",
        message: `Livraison non confirmée pour ${stop.client.name} (tournée du ${stop.round.date.toISOString().slice(0, 10)})`,
        entityId: stop.id,
        createdAt: new Date(),
      });
    }

    // Failed payments (past due subscriptions)
    const pastDueSubscriptions = await this.prisma.subscription.findMany({
      where: { status: "PAST_DUE" },
      include: { user: { select: { id: true, name: true } } },
      take: 20,
    });

    for (const sub of pastDueSubscriptions) {
      alerts.push({
        type: "PAYMENT_FAILED",
        severity: "error",
        message: `Paiement échoué pour ${sub.user.name} (abonnement ${sub.plan})`,
        entityId: sub.user.id,
        createdAt: new Date(),
      });
    }

    return alerts.sort((a, b) => {
      const severityOrder = { error: 0, warning: 1, info: 2 };
      return (severityOrder[a.severity as keyof typeof severityOrder] ?? 2) -
        (severityOrder[b.severity as keyof typeof severityOrder] ?? 2);
    });
  }
}
