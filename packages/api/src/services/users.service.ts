import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";
import type { PrismaClient, Prisma } from "@prisma/client";
import { ROLES } from "@lingengo/shared";
import { NotFoundError, ConflictError, ForbiddenError } from "../utils/errors.js";
import { createAuditLog } from "../utils/audit.js";
import type { CreateUserInput, UpdateUserInput, ListUsersQuery } from "../schemas/users.schema.js";

const BCRYPT_ROUNDS = 12;

// Génère un mot de passe provisoire 12 caractères alphanumériques
function generateTemporaryPassword(): string {
  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(12);
  return Array.from(bytes)
    .map((b) => ALPHABET[b % ALPHABET.length])
    .join("");
}

// Normalise le rôle court (CLIENT → ROLE_CLIENT) vers la valeur DB
function normalizeRole(role: string): "ROLE_CLIENT" | "ROLE_LIVREUR" | "ROLE_ADMIN" {
  const map: Record<string, "ROLE_CLIENT" | "ROLE_LIVREUR" | "ROLE_ADMIN"> = {
    CLIENT: "ROLE_CLIENT",
    LIVREUR: "ROLE_LIVREUR",
    ADMIN: "ROLE_ADMIN",
    ROLE_CLIENT: "ROLE_CLIENT",
    ROLE_LIVREUR: "ROLE_LIVREUR",
    ROLE_ADMIN: "ROLE_ADMIN",
  };
  const normalized = map[role];
  if (!normalized) {
    throw new Error(`Rôle invalide : ${role}`);
  }
  return normalized;
}

// DTO sans champs sensibles
function toUserDto(user: {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: string;
  zoneId: string | null;
  zone?: { id: string; name: string } | null;
  isActive: boolean;
  isEmailVerified: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    role: user.role,
    zoneId: user.zoneId,
    zone: user.zone ?? null,
    isActive: user.isActive,
    isEmailVerified: user.isEmailVerified,
    deletedAt: user.deletedAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export class UsersService {
  constructor(private readonly prisma: PrismaClient) {}

  // ---- Liste ----

  async list(query: ListUsersQuery, operatorId: string) {
    const { page, limit, role, status, search } = query;
    const skip = (page - 1) * limit;

    // Normaliser le filtre rôle si fourni
    let dbRole: string | undefined;
    if (role) {
      const roleMap: Record<string, string> = {
        CLIENT: "ROLE_CLIENT",
        ROLE_CLIENT: "ROLE_CLIENT",
        LIVREUR: "ROLE_LIVREUR",
        ROLE_LIVREUR: "ROLE_LIVREUR",
        ADMIN: "ROLE_ADMIN",
        ROLE_ADMIN: "ROLE_ADMIN",
        SUPER_ADMIN: "ROLE_SUPER_ADMIN",
        ROLE_SUPER_ADMIN: "ROLE_SUPER_ADMIN",
      };
      dbRole = roleMap[role];
    }

    const where: Prisma.UserWhereInput = {
      operatorId,
      ...(dbRole
        ? { role: dbRole as "ROLE_CLIENT" | "ROLE_LIVREUR" | "ROLE_ADMIN" | "ROLE_SUPER_ADMIN" }
        : {}),
      ...(status === "active" ? { deletedAt: null } : {}),
      ...(status === "inactive" ? { deletedAt: { not: null } } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          role: true,
          zoneId: true,
          zone: { select: { id: true, name: true } },
          isActive: true,
          isEmailVerified: true,
          deletedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users.map(toUserDto),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // ---- Détail ----

  async getById(id: string, operatorId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, operatorId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        zoneId: true,
        zone: { select: { id: true, name: true } },
        isActive: true,
        isEmailVerified: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundError("Utilisateur", id);
    }

    return toUserDto(user);
  }

  // ---- Création ----

  async create(
    data: CreateUserInput,
    operatorId: string,
    actorId: string,
    _actorRole: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    // Interdire la création d'un SUPER_ADMIN (contrôle défensif)
    const requestedRole = data.role.toUpperCase().replace("ROLE_", "");
    if (requestedRole === "SUPER_ADMIN") {
      throw new ForbiddenError("Vous n'avez pas l'autorisation de créer un Super Admin");
    }

    // Vérifier l'unicité de l'email
    const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw new ConflictError("Cet email est déjà enregistré dans le système");
    }

    // Vérifier la zone si fournie
    if (data.zoneId) {
      const zone = await this.prisma.deliveryZone.findFirst({
        where: { id: data.zoneId, operatorId },
      });
      if (!zone) {
        throw new NotFoundError("Zone", data.zoneId);
      }
    }

    const dbRole = normalizeRole(data.role);
    const temporaryPassword = generateTemporaryPassword();
    // IMPORTANT: le mot de passe provisoire n'est jamais loggué
    const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        phone: data.phone ?? null,
        passwordHash,
        role: dbRole,
        operatorId,
        zoneId: data.zoneId ?? null,
        isEmailVerified: true, // créé par admin, pas de vérification email
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        zoneId: true,
        zone: { select: { id: true, name: true } },
        isActive: true,
        isEmailVerified: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Audit — jamais l'email/phone, jamais le mot de passe
    await createAuditLog({
      prisma: this.prisma,
      userId: actorId,
      action: "CREATE",
      entity: "User",
      entityId: user.id,
      changes: { role: dbRole, createdByAdmin: true },
      ipAddress,
      userAgent,
    });

    return { user: toUserDto(user), temporaryPassword };
  }

  // ---- Modification ----

  async update(
    id: string,
    operatorId: string,
    data: UpdateUserInput,
    actorId: string,
    actorRole: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const target = await this.prisma.user.findFirst({
      where: { id, operatorId },
    });

    if (!target) {
      throw new NotFoundError("Utilisateur", id);
    }

    // Interdire de modifier un SUPER_ADMIN si l'acteur n'est pas SUPER_ADMIN
    if (target.role === ROLES.SUPER_ADMIN && actorRole !== ROLES.SUPER_ADMIN) {
      throw new ForbiddenError("Vous ne pouvez pas modifier un Super Admin");
    }

    // Interdire la promotion vers SUPER_ADMIN (contrôle défensif)
    if (data.role) {
      const requestedRole = data.role.toUpperCase().replace("ROLE_", "");
      if (requestedRole === "SUPER_ADMIN") {
        throw new ForbiddenError(
          "Vous ne pouvez pas promouvoir un utilisateur au rang de Super Admin",
        );
      }
    }

    // Vérifier l'unicité de l'email si modifié
    if (data.email && data.email !== target.email) {
      const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
      if (existing) {
        throw new ConflictError("Cet email est déjà enregistré dans le système");
      }
    }

    // Vérifier la zone si fournie
    if (data.zoneId !== undefined && data.zoneId !== null) {
      const zone = await this.prisma.deliveryZone.findFirst({
        where: { id: data.zoneId, operatorId },
      });
      if (!zone) {
        throw new NotFoundError("Zone", data.zoneId);
      }
    }

    const dbRole = data.role ? normalizeRole(data.role) : undefined;

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.zoneId !== undefined ? { zoneId: data.zoneId } : {}),
        ...(dbRole !== undefined ? { role: dbRole } : {}),
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        zoneId: true,
        zone: { select: { id: true, name: true } },
        isActive: true,
        isEmailVerified: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await createAuditLog({
      prisma: this.prisma,
      userId: actorId,
      action: "UPDATE",
      entity: "User",
      entityId: id,
      changes: {
        ...(dbRole !== undefined ? { role: dbRole } : {}),
        ...(data.zoneId !== undefined ? { zoneId: data.zoneId } : {}),
      },
      ipAddress,
      userAgent,
    });

    return toUserDto(updated);
  }

  // ---- Désactivation ----

  async deactivate(
    id: string,
    operatorId: string,
    actorId: string,
    actorRole: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    // Interdire l'auto-désactivation
    if (id === actorId) {
      throw new ForbiddenError("Vous ne pouvez pas désactiver votre propre compte");
    }

    const target = await this.prisma.user.findFirst({
      where: { id, operatorId },
    });

    if (!target) {
      throw new NotFoundError("Utilisateur", id);
    }

    if (target.role === ROLES.SUPER_ADMIN && actorRole !== ROLES.SUPER_ADMIN) {
      throw new ForbiddenError("Vous ne pouvez pas désactiver un Super Admin");
    }

    // Révoquer tous les refresh tokens de la cible
    await this.prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    const updated = await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        zoneId: true,
        zone: { select: { id: true, name: true } },
        isActive: true,
        isEmailVerified: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await createAuditLog({
      prisma: this.prisma,
      userId: actorId,
      action: "UPDATE",
      entity: "User",
      entityId: id,
      changes: { deactivated: true },
      ipAddress,
      userAgent,
    });

    return toUserDto(updated);
  }

  // ---- Réactivation ----

  async reactivate(
    id: string,
    operatorId: string,
    actorId: string,
    actorRole: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const target = await this.prisma.user.findFirst({
      where: { id, operatorId },
    });

    if (!target) {
      throw new NotFoundError("Utilisateur", id);
    }

    if (target.role === ROLES.SUPER_ADMIN && actorRole !== ROLES.SUPER_ADMIN) {
      throw new ForbiddenError("Vous ne pouvez pas réactiver un Super Admin");
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { deletedAt: null },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        zoneId: true,
        zone: { select: { id: true, name: true } },
        isActive: true,
        isEmailVerified: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await createAuditLog({
      prisma: this.prisma,
      userId: actorId,
      action: "UPDATE",
      entity: "User",
      entityId: id,
      changes: { reactivated: true },
      ipAddress,
      userAgent,
    });

    return toUserDto(updated);
  }

  // ---- Reset mot de passe ----

  async resetPassword(
    id: string,
    operatorId: string,
    actorId: string,
    actorRole: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const target = await this.prisma.user.findFirst({
      where: { id, operatorId },
    });

    if (!target) {
      throw new NotFoundError("Utilisateur", id);
    }

    if (target.role === ROLES.SUPER_ADMIN && actorRole !== ROLES.SUPER_ADMIN) {
      throw new ForbiddenError("Vous ne pouvez pas réinitialiser le mot de passe d'un Super Admin");
    }

    const temporaryPassword = generateTemporaryPassword();
    // IMPORTANT: jamais loggué
    const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);

    // Révoquer tous les refresh tokens
    await this.prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.prisma.user.update({
      where: { id },
      data: { passwordHash },
    });

    await createAuditLog({
      prisma: this.prisma,
      userId: actorId,
      action: "PASSWORD_CHANGED",
      entity: "User",
      entityId: id,
      changes: { resetByAdmin: true },
      ipAddress,
      userAgent,
    });

    return { temporaryPassword };
  }
}
