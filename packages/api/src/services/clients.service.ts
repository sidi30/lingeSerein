import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";
import type { PrismaClient, Prisma, AccommodationType, ClientSource } from "@prisma/client";
import { NotFoundError, ConflictError, DuplicateClientError } from "../utils/errors.js";
import { createAuditLog } from "../utils/audit.js";

const BCRYPT_ROUNDS = 12;

// Même générateur que users.service.ts : 12 caractères alphanumériques.
// IMPORTANT : le mot de passe provisoire n'est jamais loggué ni audité.
function generateTemporaryPassword(): string {
  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(12);
  return Array.from(bytes)
    .map((b) => ALPHABET[b % ALPHABET.length])
    .join("");
}

interface ListClientsQuery {
  page: number;
  limit: number;
  status?: string;
  range?: string;
  zoneId?: string;
  lowStock?: boolean;
  search?: string;
  source?: ClientSource;
}

export interface CreateClientInput {
  name: string;
  companyName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  accommodationType?: AccommodationType;
  zoneId?: string;
  preferredTimeSlot?: string;
  rating?: number;
  requirements?: string;
  notes?: string;
  source?: ClientSource;
  /** Ouvre l'accès à l'app mobile : génère un mot de passe provisoire. Exige un email. */
  grantAppAccess?: boolean;
  /** Passe outre le contrôle de doublon téléphone. */
  force?: boolean;
}

export interface UpdateClientInput {
  name?: string;
  companyName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  accommodationType?: AccommodationType | null;
  zoneId?: string | null;
  preferredTimeSlot?: string | null;
  rating?: number | null;
  requirements?: string | null;
  notes?: string | null;
  isActive?: boolean;
  stockAlertThreshold?: number;
}

/** Agrégats commandes par client, calculés en une seule requête. */
interface OrderAggregate {
  ordersCount: number;
  revenueCents: number;
  lastOrderAt: Date | null;
}

const EMPTY_AGGREGATE: OrderAggregate = {
  ordersCount: 0,
  revenueCents: 0,
  lastOrderAt: null,
};

export class ClientsService {
  constructor(private readonly prisma: PrismaClient) {}

  // ---- Helpers privés -------------------------------------------------------

  /**
   * Agrégats commandes pour un lot de clients — UNE seule requête groupBy.
   * Exclut les commandes annulées et soft-deleted du chiffre d'affaires.
   */
  private async orderAggregates(userIds: string[]): Promise<Map<string, OrderAggregate>> {
    const map = new Map<string, OrderAggregate>();
    if (userIds.length === 0) return map;

    const grouped = await this.prisma.order.groupBy({
      by: ["userId"],
      where: {
        userId: { in: userIds },
        deletedAt: null,
        status: { not: "CANCELLED" },
      },
      _sum: { totalCents: true },
      _count: { _all: true },
      _max: { createdAt: true },
    });

    for (const row of grouped) {
      map.set(row.userId, {
        ordersCount: row._count._all,
        revenueCents: row._sum.totalCents ?? 0,
        lastOrderAt: row._max.createdAt ?? null,
      });
    }

    return map;
  }

  /**
   * Résout la zone de livraison à partir du code postal (zones de l'opérateur).
   * Renvoie null si aucune zone ne couvre ce code postal.
   */
  private async resolveZoneFromPostalCode(
    postalCode: string,
    operatorId: string,
  ): Promise<string | null> {
    const zone = await this.prisma.deliveryZone.findFirst({
      where: { operatorId, isActive: true, postalCodes: { has: postalCode } },
      select: { id: true },
    });
    return zone?.id ?? null;
  }

  // ---- Création -------------------------------------------------------------

  /**
   * Crée un client (ROLE_CLIENT) rattaché à l'opérateur de l'admin appelant.
   *
   * - Sans email : email/passwordHash à null (client « hors ligne », rencontré
   *   sur un marché ou au téléphone). Le CHECK `users_password_requires_email`
   *   impose cette cohérence en base.
   * - grantAppAccess : exige un email, génère un mot de passe provisoire et
   *   force isEmailVerified (sinon auth.service bloque le login).
   * - Dédoublonnage sur le téléphone, contournable via `force`.
   */
  async create(
    data: CreateClientInput,
    operatorId: string,
    adminId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    // ---- Dédoublonnage téléphone (même opérateur, clients non supprimés) ----
    if (data.phone && !data.force) {
      const duplicate = await this.prisma.user.findFirst({
        where: {
          operatorId,
          role: "ROLE_CLIENT",
          deletedAt: null,
          phone: data.phone,
        },
        select: { id: true, name: true },
      });

      if (duplicate) {
        throw new DuplicateClientError(duplicate.id, duplicate.name);
      }
    }

    // ---- Unicité email (globale : contrainte unique en base) ----
    if (data.email) {
      const existing = await this.prisma.user.findUnique({
        where: { email: data.email },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictError("Cet email est déjà enregistré dans le système");
      }
    }

    // ---- Accès app : impossible sans email ----
    if (data.grantAppAccess && !data.email) {
      throw new ConflictError(
        "Un email est obligatoire pour ouvrir l'accès à l'application au client",
      );
    }

    // ---- Zone : explicite si fournie, sinon déduite du code postal ----
    let zoneId: string | null = null;
    if (data.zoneId) {
      const zone = await this.prisma.deliveryZone.findFirst({
        where: { id: data.zoneId, operatorId },
        select: { id: true },
      });
      if (!zone) {
        throw new NotFoundError("Zone", data.zoneId);
      }
      zoneId = zone.id;
    } else if (data.postalCode) {
      zoneId = await this.resolveZoneFromPostalCode(data.postalCode, operatorId);
    }

    // ---- Mot de passe provisoire (uniquement si accès app demandé) ----
    let temporaryPassword: string | undefined;
    let passwordHash: string | null = null;
    if (data.grantAppAccess) {
      temporaryPassword = generateTemporaryPassword();
      passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);
    }

    const client = await this.prisma.user.create({
      data: {
        operatorId,
        role: "ROLE_CLIENT",
        name: data.name,
        companyName: data.companyName ?? null,
        email: data.email ?? null,
        passwordHash,
        phone: data.phone ?? null,
        address: data.address ?? null,
        city: data.city ?? null,
        postalCode: data.postalCode ?? null,
        accommodationType: data.accommodationType ?? null,
        zoneId,
        preferredTimeSlot: data.preferredTimeSlot ?? null,
        rating: data.rating ?? null,
        requirements: data.requirements ?? null,
        notes: data.notes ?? null,
        source: data.source ?? "ADMIN",
        // Créé par un admin : pas de parcours de vérification email. Sans ce
        // flag, auth.service refuserait le login du client.
        isEmailVerified: Boolean(data.grantAppAccess),
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        companyName: true,
        email: true,
        phone: true,
        address: true,
        city: true,
        postalCode: true,
        accommodationType: true,
        rating: true,
        requirements: true,
        notes: true,
        source: true,
        zoneId: true,
        preferredTimeSlot: true,
        stockAlertThreshold: true,
        isActive: true,
        isEmailVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Audit — aucune donnée personnelle, jamais le mot de passe provisoire.
    await createAuditLog({
      prisma: this.prisma,
      userId: adminId,
      action: "CREATE",
      entity: "User",
      entityId: client.id,
      changes: {
        role: "ROLE_CLIENT",
        source: client.source,
        grantAppAccess: Boolean(data.grantAppAccess),
        createdByAdmin: true,
        ...(data.force ? { forcedDuplicate: true } : {}),
      },
      ipAddress,
      userAgent,
    });

    return {
      client: { ...client, hasAppAccess: Boolean(client.email && passwordHash) },
      ...(temporaryPassword ? { temporaryPassword } : {}),
    };
  }

  // ---- Liste ----------------------------------------------------------------

  async list(query: ListClientsQuery, operatorId: string) {
    const { page, limit, status, zoneId, search, source } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      operatorId,
      role: "ROLE_CLIENT",
      deletedAt: null,
      ...(status === "active" ? { isActive: true } : {}),
      ...(status === "inactive" ? { isActive: false } : {}),
      ...(zoneId ? { zoneId } : {}),
      ...(source ? { source } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { companyName: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { phone: { contains: search, mode: "insensitive" } },
              { city: { contains: search, mode: "insensitive" } },
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
          companyName: true,
          email: true,
          phone: true,
          city: true,
          postalCode: true,
          accommodationType: true,
          rating: true,
          source: true,
          isActive: true,
          zoneId: true,
          stockAlertThreshold: true,
          notes: true,
          createdAt: true,
          // Dérive hasAppAccess sans jamais renvoyer le hash au client.
          passwordHash: true,
          subscription: { select: { plan: true, status: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    const clientIds = clients.map((c) => c.id);

    // Stocks + agrégats commandes : 2 requêtes au total, jamais N.
    const [stocks, aggregates] = await Promise.all([
      this.prisma.clientStock.findMany({ where: { userId: { in: clientIds } } }),
      this.orderAggregates(clientIds),
    ]);

    const stocksByUser = new Map<string, typeof stocks>();
    for (const s of stocks) {
      const arr = stocksByUser.get(s.userId) ?? [];
      arr.push(s);
      stocksByUser.set(s.userId, arr);
    }

    const data = clients.map((c) => {
      const { passwordHash, ...rest } = c;
      const agg = aggregates.get(c.id) ?? EMPTY_AGGREGATE;
      return {
        ...rest,
        stocks: stocksByUser.get(c.id) ?? [],
        ordersCount: agg.ordersCount,
        revenueCents: agg.revenueCents,
        lastOrderAt: agg.lastOrderAt,
        hasAppAccess: Boolean(c.email && passwordHash),
      };
    });

    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // ---- Détail ---------------------------------------------------------------

  async getById(id: string, operatorId: string) {
    const client = await this.prisma.user.findFirst({
      where: { id, operatorId, role: "ROLE_CLIENT", deletedAt: null },
      select: {
        id: true,
        name: true,
        companyName: true,
        email: true,
        phone: true,
        address: true,
        city: true,
        postalCode: true,
        accommodationType: true,
        rating: true,
        requirements: true,
        source: true,
        isActive: true,
        isEmailVerified: true,
        zoneId: true,
        stockAlertThreshold: true,
        preferredTimeSlot: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        passwordHash: true,
        subscription: {
          include: {
            products: {
              include: {
                product: { select: { id: true, name: true, range: true, priceCents: true } },
              },
            },
          },
        },
        orders: {
          // Même filtre que les agrégats (ordersCount / revenueCents), sinon la
          // timeline affiche des commandes que le compteur juste au-dessus ne
          // compte pas, et le CA ne correspond jamais à ce qu'on voit.
          // Les annulées restent visibles (l'historique a une valeur) mais sont
          // exclues du CA côté agrégats — d'où le statut affiché sur chaque ligne.
          where: { deletedAt: null },
          take: 50,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            orderNumber: true,
            status: true,
            totalCents: true,
            deliveryDate: true,
            createdAt: true,
          },
        },
      },
    });

    if (!client) {
      throw new NotFoundError("Client", id);
    }

    const [stocks, aggregates] = await Promise.all([
      this.prisma.clientStock.findMany({ where: { userId: id } }),
      this.orderAggregates([id]),
    ]);

    const { passwordHash, ...rest } = client;
    const agg = aggregates.get(id) ?? EMPTY_AGGREGATE;

    return {
      ...rest,
      stocks,
      ordersCount: agg.ordersCount,
      revenueCents: agg.revenueCents,
      lastOrderAt: agg.lastOrderAt,
      hasAppAccess: Boolean(client.email && passwordHash),
    };
  }

  // ---- Modification ---------------------------------------------------------

  async update(
    id: string,
    data: UpdateClientInput,
    operatorId: string,
    adminId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const client = await this.prisma.user.findFirst({
      where: { id, operatorId, role: "ROLE_CLIENT", deletedAt: null },
      select: { id: true, email: true, passwordHash: true },
    });

    if (!client) {
      throw new NotFoundError("Client", id);
    }

    // Changement d'email : unicité globale + révocation des sessions.
    const emailChanged = data.email !== undefined && data.email !== client.email;
    if (emailChanged && data.email) {
      const existing = await this.prisma.user.findUnique({
        where: { email: data.email },
        select: { id: true },
      });
      if (existing && existing.id !== id) {
        throw new ConflictError("Cet email est déjà enregistré dans le système");
      }
    }

    // Retirer l'email d'un client connectable le rendrait inconnectable et
    // violerait le CHECK `users_password_requires_email`.
    if (data.email === null && client.passwordHash) {
      throw new ConflictError(
        "Impossible de retirer l'email d'un client disposant d'un accès à l'application",
      );
    }

    // Zone explicite : doit appartenir à l'opérateur.
    if (data.zoneId) {
      const zone = await this.prisma.deliveryZone.findFirst({
        where: { id: data.zoneId, operatorId },
        select: { id: true },
      });
      if (!zone) {
        throw new NotFoundError("Zone", data.zoneId);
      }
    }

    await this.prisma.user.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.companyName !== undefined ? { companyName: data.companyName } : {}),
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.address !== undefined ? { address: data.address } : {}),
        ...(data.city !== undefined ? { city: data.city } : {}),
        ...(data.postalCode !== undefined ? { postalCode: data.postalCode } : {}),
        ...(data.accommodationType !== undefined
          ? { accommodationType: data.accommodationType }
          : {}),
        ...(data.zoneId !== undefined ? { zoneId: data.zoneId } : {}),
        ...(data.preferredTimeSlot !== undefined
          ? { preferredTimeSlot: data.preferredTimeSlot }
          : {}),
        ...(data.rating !== undefined ? { rating: data.rating } : {}),
        ...(data.requirements !== undefined ? { requirements: data.requirements } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.stockAlertThreshold !== undefined
          ? { stockAlertThreshold: data.stockAlertThreshold }
          : {}),
      },
      select: {
        id: true,
        name: true,
        companyName: true,
        email: true,
        phone: true,
        address: true,
        city: true,
        postalCode: true,
        accommodationType: true,
        rating: true,
        requirements: true,
        source: true,
        zoneId: true,
        preferredTimeSlot: true,
        isActive: true,
        notes: true,
        stockAlertThreshold: true,
        updatedAt: true,
      },
    });

    // Un email changé peut servir de vecteur de reprise de compte : on coupe
    // toutes les sessions actives, comme users.service.ts sur reset password.
    if (emailChanged) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await createAuditLog({
      prisma: this.prisma,
      userId: adminId,
      action: "UPDATE",
      entity: "User",
      entityId: id,
      changes: {
        fields: Object.keys(data),
        ...(emailChanged ? { emailChanged: true, tokensRevoked: true } : {}),
      },
      ipAddress,
      userAgent,
    });

    // La MÊME forme que `GET /clients/:id`. La réponse plate renvoyée
    // auparavant perdait `subscription`, `orders`, `stocks` et les agrégats
    // (`ordersCount`, `revenueCents`, `lastOrderAt`) : un écran qui s'appuyait
    // dessus voyait ses blocs se vider après une simple sauvegarde.
    return this.getById(id, operatorId);
  }

  // ---- Export CSV -----------------------------------------------------------

  async exportCsv(operatorId: string) {
    const clients = await this.prisma.user.findMany({
      where: { operatorId, role: "ROLE_CLIENT", deletedAt: null },
      select: {
        id: true,
        name: true,
        companyName: true,
        email: true,
        phone: true,
        city: true,
        postalCode: true,
        accommodationType: true,
        rating: true,
        source: true,
        isActive: true,
        zoneId: true,
        createdAt: true,
        subscription: { select: { plan: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const escape = (value: string | null | undefined): string =>
      value == null ? "" : `"${value.replace(/"/g, '""')}"`;

    const header =
      "id,name,companyName,email,phone,city,postalCode,accommodationType,rating,source,isActive,zoneId,subscriptionPlan,subscriptionStatus,createdAt";
    const rows = clients.map((c) =>
      [
        c.id,
        escape(c.name),
        escape(c.companyName),
        escape(c.email),
        escape(c.phone),
        escape(c.city),
        escape(c.postalCode),
        c.accommodationType ?? "",
        c.rating ?? "",
        c.source,
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
