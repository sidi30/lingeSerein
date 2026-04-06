import type { PrismaClient, Prisma } from "@prisma/client";
import { createAuditLog } from "../utils/audit.js";
import type { StockAdjustmentInput, ListClientStocksQuery } from "../schemas/stock.schema.js";

export class StockService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Client's own stock levels */
  async getClientStock(userId: string) {
    const stocks = await this.prisma.clientStock.findMany({
      where: { userId },
    });

    const recentMovements = await this.prisma.stockMovement.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return { stocks, recentMovements };
  }

  /** Admin: all client stocks with filters */
  async listClientStocks(query: ListClientStocksQuery) {
    const { page, limit, zoneId, productRange, lowStock } = query;
    const skip = (page - 1) * limit;

    // Build a raw query approach via joins or use nested filters
    const userWhere: Prisma.UserWhereInput = {
      role: "ROLE_CLIENT",
      deletedAt: null,
      isActive: true,
      ...(zoneId ? { zoneId } : {}),
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where: userWhere,
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          accommodationType: true,
          zoneId: true,
          stockAlertThreshold: true,
        },
      }),
      this.prisma.user.count({ where: userWhere }),
    ]);

    // Fetch stocks for these users
    const userIds = users.map((u) => u.id);
    const stockWhere: Prisma.ClientStockWhereInput = {
      userId: { in: userIds },
      ...(productRange ? { productRange } : {}),
    };

    const stocks = await this.prisma.clientStock.findMany({
      where: stockWhere,
    });

    // Group stocks by user
    const stocksByUser = new Map<string, typeof stocks>();
    for (const s of stocks) {
      const arr = stocksByUser.get(s.userId) ?? [];
      arr.push(s);
      stocksByUser.set(s.userId, arr);
    }

    let results = users.map((u) => ({
      ...u,
      stocks: stocksByUser.get(u.id) ?? [],
    }));

    // Filter low stock if requested
    if (lowStock) {
      results = results.filter((u) =>
        u.stocks.some(
          (s) =>
            s.totalInCirculation > 0 &&
            (s.cleanSets / s.totalInCirculation) * 100 < u.stockAlertThreshold,
        ),
      );
    }

    return {
      data: results,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /** Admin: global operator stock */
  async getOperatorStock(operatorId: string) {
    const stocks = await this.prisma.operatorStock.findMany({
      where: { operatorId },
    });

    return stocks;
  }

  /** Admin: manual stock adjustment */
  async createAdjustment(
    data: StockAdjustmentInput,
    adminId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const movement = await this.prisma.stockMovement.create({
      data: {
        userId: data.userId,
        productRange: data.productRange,
        type: data.type,
        quantity: data.quantity,
        reason: data.reason,
      },
    });

    // Update denormalized client stock
    const existingStock = await this.prisma.clientStock.findUnique({
      where: {
        userId_productRange: {
          userId: data.userId,
          productRange: data.productRange,
        },
      },
    });

    if (existingStock) {
      const cleanDelta = data.type === "DELIVERY" || data.type === "WASH_COMPLETE" || data.type === "ADJUSTMENT"
        ? data.quantity
        : 0;
      const dirtyDelta = data.type === "PICKUP_DIRTY" ? Math.abs(data.quantity) : 0;

      await this.prisma.clientStock.update({
        where: {
          userId_productRange: {
            userId: data.userId,
            productRange: data.productRange,
          },
        },
        data: {
          cleanSets: { increment: cleanDelta },
          dirtySets: data.type === "PICKUP_DIRTY" ? { decrement: dirtyDelta } : undefined,
          totalInCirculation: data.type === "RETIREMENT"
            ? { decrement: Math.abs(data.quantity) }
            : data.type === "DELIVERY"
              ? { increment: data.quantity }
              : undefined,
        },
      });
    } else {
      // Create new client stock record
      await this.prisma.clientStock.create({
        data: {
          userId: data.userId,
          productRange: data.productRange,
          cleanSets: data.quantity > 0 ? data.quantity : 0,
          dirtySets: 0,
          totalInCirculation: data.quantity > 0 ? data.quantity : 0,
        },
      });
    }

    await createAuditLog({
      prisma: this.prisma,
      userId: adminId,
      action: "UPDATE",
      entity: "StockMovement",
      entityId: movement.id,
      changes: {
        targetUserId: data.userId,
        productRange: data.productRange,
        type: data.type,
        quantity: data.quantity,
        reason: data.reason,
      },
      ipAddress,
      userAgent,
    });

    return movement;
  }
}
