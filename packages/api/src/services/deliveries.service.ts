import type { PrismaClient, Prisma } from "@prisma/client";
import {
  NotFoundError,
  AppError,
  ForbiddenError,
  UnprocessableEntityError,
} from "../utils/errors.js";
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
        // COMPLETED incluse : sans elle, la tournée s'évanouissait à l'instant
        // même où le livreur la clôturait, et son écran retombait sur « Aucune
        // tournée aujourd'hui » — impossible de relire ce qu'il venait de faire.
        status: { in: ["PLANNED", "IN_PROGRESS", "COMPLETED"] },
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

    // ---- Ventilation par gamme, calculée AVANT d'ouvrir la transaction ----
    //
    // Ancien comportement, corrigé précédemment : la gamme était celle du PREMIER
    // article de la commande (`items.take(1)`) pour la livraison, et « CONFORT »
    // CODÉE EN DUR pour toute reprise de linge sale. Une commande mixte imputait
    // donc tout son volume à une seule gamme, et 100 % du linge sale repris était
    // compté sur CONFORT — y compris pour un client qui n'en a jamais eu.
    //
    // Règle retenue : on n'écrit un mouvement que sur une gamme RÉELLEMENT
    // connue, article par article. Quand la commande est absente (l'admin crée
    // ses arrêts à partir du seul `clientId`), aucune gamme n'est inventée : on
    // n'écrit pas de mouvement legacy plutôt que d'en écrire un faux. La
    // comptabilité qui fait foi est de toute façon celle par slug.
    const order = stop.orderId
      ? await this.prisma.order.findUnique({
          where: { id: stop.orderId },
          include: { items: { include: { product: true } } },
        })
      : null;

    const itemsAvecGamme = (order?.items ?? []).filter((i) => i.product?.range);

    const parGamme = new Map<string, number>();
    for (const item of itemsAvecGamme) {
      const range = item.product.range as string;
      parGamme.set(range, (parGamme.get(range) ?? 0) + item.quantity);
    }

    // Le livreur saisit un total de linge sale, sans ventilation par article. On
    // l'impute à la gamme MAJORITAIRE de la commande — approximation assumée et
    // bornée à un cas où la gamme est au moins connue.
    let gammeMajoritaire = "";
    let meilleur = -1;
    for (const [range, quantite] of parGamme) {
      if (quantite > meilleur) {
        gammeMajoritaire = range;
        meilleur = quantite;
      }
    }

    // ---- Une seule transaction pour TOUTES les écritures ----
    //
    // Ces écritures ne sont pas indépendantes : un arrêt COMPLETED sans ses
    // mouvements de stock est un mensonge comptable — le linge est chez le
    // client, le parc dit qu'il est en stock, et personne ne s'en aperçoit
    // puisque l'arrêt s'affiche comme livré. Enchaînées hors transaction, une
    // coupure réseau ou un redémarrage entre deux lignes produisait exactement
    // cet état. Elles tombent ou passent ensemble.
    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedStop = await tx.deliveryStop.update({
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
        // Même forme que les arrêts renvoyés par `getRoundById` / `getTodayRound` :
        // la ligne nue renvoyée auparavant n'avait ni `client` ni `order`, et
        // l'écran d'arrêt perdait l'adresse et le numéro de commande sitôt la
        // livraison validée.
        include: {
          client: { select: { id: true, name: true, address: true, phone: true } },
          order: { select: { id: true, orderNumber: true } },
        },
      });

      // La tournée démarre au premier arrêt validé.
      if (stop.round.status === "PLANNED") {
        await tx.deliveryRound.update({
          where: { id: stop.roundId },
          data: { status: "IN_PROGRESS", startedAt: new Date() },
        });
      }

      if (data.setsDelivered > 0) {
        for (const [range, quantity] of parGamme) {
          await tx.stockMovement.create({
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

      // Quantité négative : le linge quitte le client.
      if (data.dirtyPickedUp > 0 && gammeMajoritaire) {
        await tx.stockMovement.create({
          data: {
            userId: stop.clientId,
            productRange: gammeMajoritaire as Prisma.StockMovementCreateInput["productRange"],
            type: "PICKUP_DIRTY",
            quantity: -data.dirtyPickedUp,
            reason: `Récupération tournée ${stop.roundId}`,
          },
        });
      }

      // ---- Stock par slug (comptabilité qui fait foi) ----
      await this.syncStockItemsFromStop(tx, stop.id, stop.round.operatorId, data.dirtyPickedUp);

      // Dans la transaction : une trace d'audit survivant à une écriture annulée
      // décrirait une livraison qui n'a pas eu lieu.
      await createAuditLog({
        prisma: tx,
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

      return updatedStop;
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
   *
   * Prend le client de transaction de l'appelant : cette écriture fait partie de
   * la validation de l'arrêt, elle n'a pas de sens toute seule.
   */
  private async syncStockItemsFromStop(
    tx: Prisma.TransactionClient,
    stopId: string,
    operatorId: string,
    dirtyPickedUp: number,
  ): Promise<void> {
    if (dirtyPickedUp <= 0) return;

    const rotation = await tx.rotation.findFirst({
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
    //
    // Écrit sur le `tx` de l'appelant, sans ouvrir sa propre transaction : ces
    // upserts doivent tomber avec la validation de l'arrêt, pas survivre seuls.
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

    // Même exigence que `completeStop` : sauter les arrêts restants et clôturer
    // la tournée forment un seul geste. Séparés, un échec entre les deux laissait
    // des arrêts SKIPPED dans une tournée toujours EN COURS — le livreur ne
    // pouvait ni les reprendre ni la terminer.
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.deliveryStop.updateMany({
        where: { roundId, status: "PENDING" },
        data: { status: "SKIPPED" },
      });

      const updatedRound = await tx.deliveryRound.update({
        where: { id: roundId },
        data: { status: "COMPLETED", completedAt: new Date() },
        // Alignée sur `getRoundById` : sans `stops`, l'écran de tournée se vidait
        // au moment même où le livreur la terminait.
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

      await createAuditLog({
        prisma: tx,
        userId: driverId,
        action: "UPDATE",
        entity: "DeliveryRound",
        entityId: roundId,
        changes: { status: "COMPLETED" },
        ipAddress,
        userAgent,
      });

      return updatedRound;
    });

    return updated;
  }

  // ---- Suppression d'une tournée (DELETE /deliveries/rounds/:id) --------------

  /**
   * Supprime une tournée et ses arrêts — uniquement si RIEN n'a été livré.
   *
   * Un arrêt COMPLETED porte des preuves de remise : quantités livrées, linge
   * sale repris, signature du client. Ces éléments font foi en cas de litige et
   * ont déjà bougé le stock. Supprimer la tournée les effacerait sans rien
   * corriger des mouvements déjà passés — d'où le refus, quel que soit le statut
   * de la tournée elle-même.
   *
   * Suppression DURE : `DeliveryRound` n'a pas de `deletedAt`, et une tournée
   * sans aucun arrêt livré n'est que de la planification. Les rotations qui
   * pointaient vers ces arrêts survivent (`Rotation.deliveryStopId` est
   * `onDelete: SetNull`) : le linge dehors reste suivi.
   */
  async deleteRound(roundId: string, adminId: string, ipAddress?: string, userAgent?: string) {
    const round = await this.prisma.deliveryRound.findUnique({
      where: { id: roundId },
      select: {
        id: true,
        status: true,
        date: true,
        stops: { select: { id: true, status: true } },
      },
    });

    if (!round) {
      throw new NotFoundError("Tournée", roundId);
    }

    const completed = round.stops.filter((s) => s.status === "COMPLETED").length;

    if (completed > 0) {
      throw new UnprocessableEntityError(
        `Cette tournée compte ${completed} arrêt(s) déjà livré(s) : leurs preuves de remise ` +
          `(signature, quantités) ne peuvent pas être effacées`,
        "ROUND_HAS_COMPLETED_STOPS",
      );
    }

    // Les arrêts d'abord : la relation est obligatoire côté arrêt, la tournée ne
    // peut pas partir tant qu'ils pointent dessus.
    await this.prisma.$transaction([
      this.prisma.deliveryStop.deleteMany({ where: { roundId } }),
      this.prisma.deliveryRound.delete({ where: { id: roundId } }),
    ]);

    await createAuditLog({
      prisma: this.prisma,
      userId: adminId,
      action: "DELETE",
      entity: "DeliveryRound",
      entityId: roundId,
      changes: { previousStatus: round.status, stopsDeleted: round.stops.length },
      ipAddress,
      userAgent,
    });

    return { id: roundId, deleted: true, stopsDeleted: round.stops.length };
  }
}
