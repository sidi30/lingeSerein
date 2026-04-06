import type { PrismaClient, Prisma } from "@prisma/client";
import { NotFoundError, AppError, ForbiddenError } from "../utils/errors.js";
import { createAuditLog } from "../utils/audit.js";
import type { CreateRoundInput, ListRoundsQuery, CompleteStopInput } from "../schemas/deliveries.schema.js";

export class DeliveriesService {
  constructor(private readonly prisma: PrismaClient) {}

  async listRounds(query: ListRoundsQuery) {
    const { page, limit, status, driverId, from, to } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.DeliveryRoundWhereInput = {
      ...(status ? { status } : {}),
      ...(driverId ? { driverId } : {}),
      ...(from || to
        ? {
            date: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    };

    const [rounds, total] = await Promise.all([
      this.prisma.deliveryRound.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: "desc" },
        include: {
          driver: { select: { id: true, name: true } },
          zone: { select: { id: true, name: true } },
          _count: { select: { stops: true } },
        },
      }),
      this.prisma.deliveryRound.count({ where }),
    ]);

    return {
      data: rounds,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async createRound(
    data: CreateRoundInput,
    operatorId: string,
    adminId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const round = await this.prisma.deliveryRound.create({
      data: {
        operatorId,
        zoneId: data.zoneId,
        driverId: data.driverId,
        date: new Date(data.date),
        notes: data.notes,
        stops: {
          create: data.stops.map((stop) => ({
            orderId: stop.orderId,
            clientId: stop.clientId,
            driverId: data.driverId,
            stopOrder: stop.stopOrder,
            setsToDeliver: stop.setsToDeliver,
            specialInstructions: stop.specialInstructions,
          })),
        },
      },
      include: {
        stops: { include: { client: { select: { id: true, name: true } } } },
        driver: { select: { id: true, name: true } },
      },
    });

    await createAuditLog({
      prisma: this.prisma,
      userId: adminId,
      action: "CREATE",
      entity: "DeliveryRound",
      entityId: round.id,
      changes: { date: data.date, stopsCount: data.stops.length, driverId: data.driverId },
      ipAddress,
      userAgent,
    });

    return round;
  }

  async getRoundById(id: string, userId?: string, userRole?: string) {
    const round = await this.prisma.deliveryRound.findUnique({
      where: { id },
      include: {
        stops: {
          orderBy: { stopOrder: "asc" },
          include: {
            client: { select: { id: true, name: true, address: true, phone: true } },
            order: { select: { id: true, orderNumber: true } },
          },
        },
        driver: { select: { id: true, name: true } },
        zone: { select: { id: true, name: true } },
      },
    });

    if (!round) {
      throw new NotFoundError("Tournée", id);
    }

    // Driver can only see their own rounds
    if (userRole === "ROLE_LIVREUR" && round.driverId !== userId) {
      throw new ForbiddenError("Vous ne pouvez accéder qu'à vos propres tournées");
    }

    return round;
  }

  async getTodayRound(driverId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const round = await this.prisma.deliveryRound.findFirst({
      where: {
        driverId,
        date: { gte: today, lt: tomorrow },
        status: { in: ["PLANNED", "IN_PROGRESS"] },
      },
      include: {
        stops: {
          orderBy: { stopOrder: "asc" },
          include: {
            client: { select: { id: true, name: true, address: true, phone: true } },
            order: { select: { id: true, orderNumber: true } },
          },
        },
        zone: { select: { id: true, name: true } },
      },
    });

    return round;
  }

  async completeStop(
    stopId: string,
    data: CompleteStopInput,
    driverId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const stop = await this.prisma.deliveryStop.findUnique({
      where: { id: stopId },
      include: { round: true },
    });

    if (!stop) {
      throw new NotFoundError("Arrêt de livraison", stopId);
    }

    if (stop.driverId !== driverId) {
      throw new ForbiddenError("Cet arrêt ne vous est pas attribué");
    }

    if (stop.status === "COMPLETED") {
      throw new AppError(400, "ALREADY_COMPLETED", "Cet arrêt a déjà été complété");
    }

    const updated = await this.prisma.deliveryStop.update({
      where: { id: stopId },
      data: {
        status: "COMPLETED",
        setsDelivered: data.setsDelivered,
        dirtyPickedUp: data.dirtyPickedUp,
        qrCodeScanned: data.qrCodeScanned,
        photoUrl: data.photoUrl,
        signatureUrl: data.signatureUrl,
        completedAt: new Date(),
      },
    });

    // Update round status to IN_PROGRESS if it was PLANNED
    if (stop.round.status === "PLANNED") {
      await this.prisma.deliveryRound.update({
        where: { id: stop.roundId },
        data: { status: "IN_PROGRESS", startedAt: new Date() },
      });
    }

    // Create stock movements for the delivery
    if (data.setsDelivered > 0) {
      // Determine the product range from the order or default
      const order = stop.orderId
        ? await this.prisma.order.findUnique({
            where: { id: stop.orderId },
            include: { items: { include: { product: true }, take: 1 } },
          })
        : null;

      const productRange = order?.items[0]?.product?.range ?? "CONFORT";

      await this.prisma.stockMovement.create({
        data: {
          userId: stop.clientId,
          productRange,
          type: "DELIVERY",
          quantity: data.setsDelivered,
          reason: `Livraison tournée ${stop.roundId}`,
        },
      });
    }

    if (data.dirtyPickedUp > 0) {
      await this.prisma.stockMovement.create({
        data: {
          userId: stop.clientId,
          productRange: "CONFORT", // Will be refined based on actual data
          type: "PICKUP_DIRTY",
          quantity: -data.dirtyPickedUp,
          reason: `Récupération tournée ${stop.roundId}`,
        },
      });
    }

    await createAuditLog({
      prisma: this.prisma,
      userId: driverId,
      action: "UPDATE",
      entity: "DeliveryStop",
      entityId: stopId,
      changes: {
        status: "COMPLETED",
        setsDelivered: data.setsDelivered,
        dirtyPickedUp: data.dirtyPickedUp,
      },
      ipAddress,
      userAgent,
    });

    return updated;
  }

  async completeRound(
    roundId: string,
    driverId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const round = await this.prisma.deliveryRound.findUnique({
      where: { id: roundId },
      include: { stops: true },
    });

    if (!round) {
      throw new NotFoundError("Tournée", roundId);
    }

    if (round.driverId !== driverId) {
      throw new ForbiddenError("Cette tournée ne vous est pas attribuée");
    }

    if (round.status === "COMPLETED") {
      throw new AppError(400, "ALREADY_COMPLETED", "Cette tournée est déjà terminée");
    }

    // Mark any remaining pending stops as SKIPPED
    await this.prisma.deliveryStop.updateMany({
      where: { roundId, status: "PENDING" },
      data: { status: "SKIPPED" },
    });

    const updated = await this.prisma.deliveryRound.update({
      where: { id: roundId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    await createAuditLog({
      prisma: this.prisma,
      userId: driverId,
      action: "UPDATE",
      entity: "DeliveryRound",
      entityId: roundId,
      changes: { status: "COMPLETED" },
      ipAddress,
      userAgent,
    });

    return updated;
  }
}
