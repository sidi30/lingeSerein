import type { PrismaClient, Prisma } from "@prisma/client";
import { NotFoundError, AppError, ForbiddenError } from "../utils/errors.js";
import { createAuditLog } from "../utils/audit.js";
import type {
  CreateRoundInput,
  ListRoundsQuery,
  CompleteStopInput,
} from "../schemas/deliveries.schema.js";

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
          stops: {
            orderBy: { stopOrder: "asc" },
            select: {
              id: true,
              stopOrder: true,
              status: true,
              setsToDeliver: true,
              client: { select: { id: true, name: true, address: true } },
            },
          },
          _count: { select: { stops: true } },
        },
      }),
      this.prisma.deliveryRound.count({ where }),
    ]);

    return {
      // `driverName` aplati et `stops` inclus : la page Planning de l'admin rendait
      // `{r.driver}` (un objet — « Objects are not valid as a React child ») et lisait
      // `r.stops.length` sur une propriété que cette route ne renvoyait pas. L'écran
      // ne plantait que dès la première tournée créée, l'état vide masquant le défaut.
      // `driver` est conservé pour ne casser aucun appelant existant.
      data: rounds.map((r) => ({
        ...r,
        driverName: r.driver?.name ?? null,
        zoneName: r.zone?.name ?? null,
        stopsCount: r._count.stops,
      })),
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
        // Preuve de remise capturée sur mobile. Ces quatre champs étaient
        // auparavant acceptés par le schéma puis jetés faute d'être écrits :
        // le livreur faisait signer le client et rien n'était conservé.
        signatureData: data.signatureDataUrl,
        signataireNom: data.signataireNom,
        conforme: data.conforme,
        reserves: data.reserves,
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

    // ---- Mouvements de stock ----
    //
    // Ancien comportement, corrigé ici : la gamme était celle du PREMIER article
    // de la commande (`items.take(1)`) pour la livraison, et « CONFORT » CODÉE EN
    // DUR pour toute reprise de linge sale. Une commande mixte imputait donc tout
    // son volume à une seule gamme, et 100 % du linge sale repris était compté
    // sur CONFORT — y compris pour un client qui n'en a jamais eu.
    //
    // Règle retenue : on n'écrit un mouvement que sur une gamme RÉELLEMENT
    // connue, article par article. Quand la commande est absente (l'admin crée
    // ses arrêts à partir du seul `clientId`), aucune gamme n'est inventée : on
    // n'écrit pas de mouvement legacy plutôt que d'en écrire un faux. La
    // comptabilité qui fait foi est de toute façon celle par slug ci-dessous.
    const order = stop.orderId
      ? await this.prisma.order.findUnique({
          where: { id: stop.orderId },
          include: { items: { include: { product: true } } },
        })
      : null;

    const itemsAvecGamme = (order?.items ?? []).filter((i) => i.product?.range);

    if (data.setsDelivered > 0 && itemsAvecGamme.length > 0) {
      const parGamme = new Map<string, number>();
      for (const item of itemsAvecGamme) {
        const range = item.product.range as string;
        parGamme.set(range, (parGamme.get(range) ?? 0) + item.quantity);
      }

      for (const [range, quantity] of parGamme) {
        await this.prisma.stockMovement.create({
          data: {
            userId: stop.clientId,
            productRange: range as Prisma.StockMovementCreateInput["productRange"],
            type: "DELIVERY",
            quantity,
            reason: `Livraison tournée ${stop.roundId}`,
          },
        });
      }
    }

    if (data.dirtyPickedUp > 0 && itemsAvecGamme.length > 0) {
      // Le livreur saisit un total, sans ventilation par article. On l'impute donc
      // à la gamme MAJORITAIRE de la commande — approximation assumée et bornée à
      // un cas où la gamme est au moins connue, là où le code précédent affirmait
      // « CONFORT » sans rien savoir. Quantité négative : le linge quitte le client.
      const parGamme = new Map<string, number>();
      for (const item of itemsAvecGamme) {
        const range = item.product.range as string;
        parGamme.set(range, (parGamme.get(range) ?? 0) + item.quantity);
      }

      let majoritaire = "";
      let meilleur = -1;
      for (const [range, quantite] of parGamme) {
        if (quantite > meilleur) {
          majoritaire = range;
          meilleur = quantite;
        }
      }

      if (majoritaire) {
        await this.prisma.stockMovement.create({
          data: {
            userId: stop.clientId,
            productRange: majoritaire as Prisma.StockMovementCreateInput["productRange"],
            type: "PICKUP_DIRTY",
            quantity: -data.dirtyPickedUp,
            reason: `Récupération tournée ${stop.roundId}`,
          },
        });
      }
    }

    // ---- Stock par slug (comptabilité qui fait foi) ----
    // Une rotation rattachée à cet arrêt porte le détail exact des articles sortis :
    // c'est la seule source fiable pour mouvementer le parc par slug.
    await this.syncStockItemsFromStop(stop.id, stop.round.operatorId, data.dirtyPickedUp);

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

  /**
   * Répercute la reprise de linge sale d'un arrêt sur le stock PAR SLUG.
   *
   * N'agit que si une `Rotation` est rattachée à l'arrêt : elle seule porte le
   * détail des articles réellement sortis. Sans rotation, le total saisi par le
   * livreur n'est ventilable sur aucun produit — et un stock faux serait pire
   * qu'un stock incomplet, puisqu'il ferait croire à un parc disponible qui ne
   * l'est pas.
   *
   * La rotation n'est PAS clôturée ici : la reprise détaillée (quantité par
   * ligne) reste à saisir via `PATCH /rotations/:id/reprise`. On se contente de
   * signaler que le linge est physiquement revenu.
   */
  private async syncStockItemsFromStop(
    stopId: string,
    operatorId: string,
    dirtyPickedUp: number,
  ): Promise<void> {
    if (dirtyPickedUp <= 0) return;

    const rotation = await this.prisma.rotation.findFirst({
      where: {
        deliveryStopId: stopId,
        deletedAt: null,
        status: { notIn: ["REPRISE", "ANNULEE"] },
      },
      include: { lignes: true },
    });

    if (!rotation) return;

    const totalLivre = rotation.lignes.reduce((n, l) => n + l.qtyLivree, 0);
    if (totalLivre === 0) return;

    // Le livreur annonce un total repris sans ventilation. On le répartit au
    // prorata de ce qui était sorti — le seul arbitrage défendable, et de toute
    // façon rectifié à la saisie détaillée de la reprise.
    await this.prisma.$transaction(async (tx) => {
      for (const ligne of rotation.lignes) {
        if (!ligne.productSlug) continue;
        const part = Math.round((ligne.qtyLivree / totalLivre) * dirtyPickedUp);
        if (part <= 0) continue;

        await tx.stockItem.upsert({
          where: { operatorId_productSlug: { operatorId, productSlug: ligne.productSlug } },
          create: { operatorId, productSlug: ligne.productSlug, dirtyPending: part },
          update: { dirtyPending: { increment: part } },
        });
      }
    });
  }

  async completeRound(roundId: string, driverId: string, ipAddress?: string, userAgent?: string) {
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
