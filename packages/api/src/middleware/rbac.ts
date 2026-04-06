import type { FastifyRequest, FastifyReply } from "fastify";
import { ROLES } from "@lingengo/shared";
import { ForbiddenError, UnauthorizedError } from "../utils/errors.js";

type Role = (typeof ROLES)[keyof typeof ROLES];

/**
 * Middleware RBAC — vérifie que l'utilisateur authentifié possède l'un des rôles autorisés.
 * Usage : `{ preHandler: [app.authenticate, requireRole("ROLE_ADMIN", "ROLE_SUPER_ADMIN")] }`
 */
export function requireRole(...allowedRoles: Role[]) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const user = request.user;

    if (!user) {
      throw new UnauthorizedError();
    }

    if (!allowedRoles.includes(user.role as Role)) {
      throw new ForbiddenError("Vous n'avez pas les droits nécessaires pour cette action");
    }
  };
}

/**
 * Vérifie que l'utilisateur accède à sa propre ressource OU est admin.
 * `paramKey` est le nom du paramètre route contenant l'ID de la ressource propriétaire.
 */
export function requireOwnerOrAdmin(paramKey = "id") {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const user = request.user;

    if (!user) {
      throw new UnauthorizedError();
    }

    const isAdmin = user.role === ROLES.ADMIN || user.role === ROLES.SUPER_ADMIN;
    if (isAdmin) return;

    const params = request.params as Record<string, string>;
    const resourceOwnerId = params[paramKey];

    if (user.sub !== resourceOwnerId) {
      throw new ForbiddenError("Vous ne pouvez accéder qu'à vos propres ressources");
    }
  };
}
