import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";
import type { PrismaClient, Prisma } from "@prisma/client";
import { ROLES } from "@lingengo/shared";
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
  UnprocessableEntityError,
} from "../utils/errors.js";
import { createAuditLog } from "../utils/audit.js";
import { NotificationsService } from "./notifications.service.js";
import type { CreateUserInput, UpdateUserInput, ListUsersQuery } from "../schemas/users.schema.js";

// NOTE: softDelete est distinct de deactivate.
// - deactivate : deletedAt=now (isActive reste true en DB, c'est le champ deletedAt qui conduit le filtre)
// - softDelete  : deletedAt=now + isActive=false + révocation tokens (suppression "définitive" côté admin)

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
  // null depuis le CRM client : un client créé par l'admin peut n'avoir aucun
  // email (rencontré sur un marché, au téléphone). Le DTO doit le refléter.
  email: string | null;
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

    // Badge « Utilisateurs ». Comme l'audit : aucune donnée personnelle dans le
    // corps de la notification (pas d'email, pas de téléphone), juste le rôle.
    await new NotificationsService(this.prisma).notifyAdmins(
      "USER_CREATED",
      "Nouveau compte créé",
      `Rôle ${dbRole}`,
      { userId: user.id, href: `/utilisateurs/${user.id}` },
    );

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

    // Un client créé sans email n'a pas de compte connectable. Poser un
    // passwordHash violerait le CHECK `users_password_requires_email` (500 sur
    // un simple bouton admin) et ne servirait à rien : sans email, pas de login.
    if (!target.email) {
      throw new UnprocessableEntityError(
        "Ce client n'a pas d'email : renseignez-en un avant de lui donner un accès à l'application",
        "USER_HAS_NO_EMAIL",
      );
    }

    const temporaryPassword = generateTemporaryPassword();
    // IMPORTANT: jamais loggué
    const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);

    // Révoquer tous les refresh tokens
    await this.prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // isEmailVerified DOIT être posé ici, sinon le parcours « ouvrir l'accès app
    // à un client existant » est une impasse : un client créé sans accès a
    // isEmailVerified=false, et le login le rejette avec « Veuillez vérifier
    // votre email ». L'admin lui communiquerait un mot de passe provisoire qui
    // ne fonctionnerait jamais, avec un message accusant le client.
    // C'est l'admin qui atteste de l'identité en ouvrant l'accès de vive voix.
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash, isEmailVerified: true },
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

  // ---- Suppression douce (soft-delete) ----

  /**
   * Suppression douce d'un utilisateur (client, livreur ou admin).
   * - Interdit de se supprimer soi-même → 422 CANNOT_DELETE_SELF
   * - Un ADMIN ne peut pas supprimer un SUPER_ADMIN → 403
   * - Cible déjà supprimée ou introuvable → 404
   * - Effets : deletedAt=now, isActive=false, révocation de tous les refresh tokens.
   */
  async softDelete(
    id: string,
    operatorId: string,
    actorId: string,
    actorRole: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ id: string }> {
    // Interdire l'auto-suppression
    if (id === actorId) {
      throw new UnprocessableEntityError(
        "Vous ne pouvez pas supprimer votre propre compte",
        "CANNOT_DELETE_SELF",
      );
    }

    // Chercher la cible uniquement parmi les utilisateurs actifs (non supprimés)
    const target = await this.prisma.user.findFirst({
      where: { id, operatorId, deletedAt: null },
    });

    if (!target) {
      throw new NotFoundError("Utilisateur", id);
    }

    // Un ADMIN ne peut pas supprimer un SUPER_ADMIN
    if (target.role === ROLES.SUPER_ADMIN && actorRole !== ROLES.SUPER_ADMIN) {
      throw new ForbiddenError("Vous ne pouvez pas supprimer un Super Admin");
    }

    // Révoquer tous les refresh tokens de la cible
    await this.prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // Soft-delete : deletedAt=now + isActive=false
    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    await createAuditLog({
      prisma: this.prisma,
      userId: actorId,
      action: "DELETE",
      entity: "User",
      entityId: id,
      changes: { softDeleted: true },
      ipAddress,
      userAgent,
    });

    return { id };
  }
}
