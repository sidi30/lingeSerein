import type { PrismaClient, Prisma } from "@prisma/client";
import { NotFoundError } from "../utils/errors.js";
import { createAuditLog } from "../utils/audit.js";

interface ListClientsQuery {
  page: number;
  limit: number;
  status?: string;
  range?: string;
  zoneId?: string;
  lowStock?: boolean;
  search?: string;
}

export class ClientsService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(query: ListClientsQuery) {
    const { page, limit, status, zoneId, search } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      role: "ROLE_CLIENT",
      deletedAt: null,
      ...(status === "active" ? { isActive: true } : {}),
      ...(status === "inactive" ? { isActive: false } : {}),
      ...(zoneId ? { zoneId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [clients, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          accommodationType: true,
          isActive: true,
          zoneId: true,
          stockAlertThreshold: true,
          notes: true,
          createdAt: true,
          subscription: { select: { plan: true, status: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    // Fetch stocks for these clients
    const clientIds = clients.map((c) => c.id);
    const stocks = await this.prisma.clientStock.findMany({
      where: { userId: { in: clientIds } },
    });

    const stocksByUser = new Map<string, typeof stocks>();
    for (const s of stocks) {
      const arr = stocksByUser.get(s.userId) ?? [];
      arr.push(s);
      stocksByUser.set(s.userId, arr);
    }

    const data = clients.map((c) => ({
      ...c,
      stocks: stocksByUser.get(c.id) ?? [],
    }));

    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getById(id: string) {
    const client = await this.prisma.user.findFirst({
      where: { id, role: "ROLE_CLIENT", deletedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        accommodationType: true,
        isActive: true,
        isEmailVerified: true,
        zoneId: true,
        stockAlertThreshold: true,
        preferredTimeSlot: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        subscription: {
          include: {
            products: {
              include: { product: { select: { id: true, name: true, range: true, priceCents: true } } },
            },
          },
        },
        orders: {
          take: 10,
          orderBy: { createdAt: "desc" },
          select: { id: true, orderNumber: true, status: true, totalCents: true, deliveryDate: true, createdAt: true },
        },
      },
    });

    if (!client) {
      throw new NotFoundError("Client", id);
    }

    // Fetch stock
    const stocks = await this.prisma.clientStock.findMany({
      where: { userId: id },
    });

    return { ...client, stocks };
  }

  async update(
    id: string,
    data: { notes?: string; isActive?: boolean; stockAlertThreshold?: number },
    adminId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const client = await this.prisma.user.findFirst({
      where: { id, role: "ROLE_CLIENT", deletedAt: null },
    });

    if (!client) {
      throw new NotFoundError("Client", id);
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.stockAlertThreshold !== undefined ? { stockAlertThreshold: data.stockAlertThreshold } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        notes: true,
        stockAlertThreshold: true,
      },
    });

    await createAuditLog({
      prisma: this.prisma,
      userId: adminId,
      action: "UPDATE",
      entity: "User",
      entityId: id,
      changes: data as Record<string, unknown>,
      ipAddress,
      userAgent,
    });

    return updated;
  }

  async exportCsv() {
    const clients = await this.prisma.user.findMany({
      where: { role: "ROLE_CLIENT", deletedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        accommodationType: true,
        isActive: true,
        zoneId: true,
        createdAt: true,
        subscription: { select: { plan: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Build CSV
    const header = "id,name,email,accommodationType,isActive,zoneId,subscriptionPlan,subscriptionStatus,createdAt";
    const rows = clients.map((c) =>
      [
        c.id,
        `"${c.name}"`,
        c.email,
        c.accommodationType ?? "",
        c.isActive,
        c.zoneId ?? "",
        c.subscription?.plan ?? "",
        c.subscription?.status ?? "",
        c.createdAt.toISOString(),
      ].join(","),
    );

    return [header, ...rows].join("\n");
  }
}
