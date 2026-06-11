import type { FastifyInstance } from "fastify";
import { idParamSchema } from "@lingengo/shared";
import { UsersService } from "../../services/users.service.js";
import { ValidationError } from "../../utils/errors.js";
import { requireRole } from "../../middleware/rbac.js";
import {
  createUserSchema,
  updateUserSchema,
  listUsersQuerySchema,
} from "../../schemas/users.schema.js";

export default async function userRoutes(app: FastifyInstance): Promise<void> {
  const service = new UsersService(app.prisma);
  const adminMiddleware = [app.authenticate, requireRole("ROLE_ADMIN", "ROLE_SUPER_ADMIN")];

  async function getOperatorId(userId: string): Promise<string> {
    const user = await app.prisma.user.findUnique({
      where: { id: userId },
      select: { operatorId: true },
    });
    if (!user) throw new Error("Utilisateur introuvable");
    return user.operatorId;
  }

  // ---- POST /users ----
  app.post(
    "/",
    {
      preHandler: adminMiddleware,
      schema: {
        tags: ["Utilisateurs"],
        summary: "Créer un utilisateur",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["name", "email", "role"],
          properties: {
            name: { type: "string" },
            email: { type: "string", format: "email" },
            role: { type: "string" },
            phone: { type: "string", nullable: true },
            zoneId: { type: "string", format: "uuid", nullable: true },
          },
        },
        response: {
          201: {
            description: "Utilisateur créé avec mot de passe provisoire",
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  user: { type: "object" },
                  temporaryPassword: {
                    type: "string",
                    description: "Mot de passe provisoire (affiché une seule fois)",
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = createUserSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const operatorId = await getOperatorId(request.user.sub);
      const result = await service.create(
        parsed.data,
        operatorId,
        request.user.sub,
        request.user.role,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.status(201).send({ success: true, data: result });
    },
  );

  // ---- GET /users ----
  app.get(
    "/",
    {
      preHandler: adminMiddleware,
      schema: {
        tags: ["Utilisateurs"],
        summary: "Liste des utilisateurs",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const parsed = listUsersQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const operatorId = await getOperatorId(request.user.sub);
      const result = await service.list(parsed.data, operatorId);
      return reply.send({ success: true, ...result });
    },
  );

  // ---- GET /users/:id ----
  app.get<{ Params: { id: string } }>(
    "/:id",
    {
      preHandler: adminMiddleware,
      schema: {
        tags: ["Utilisateurs"],
        summary: "Détail utilisateur",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const paramsParsed = idParamSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        throw new ValidationError(
          paramsParsed.error.flatten().fieldErrors as Record<string, string[]>,
        );
      }

      const operatorId = await getOperatorId(request.user.sub);
      const user = await service.getById(paramsParsed.data.id, operatorId);
      return reply.send({ success: true, data: user });
    },
  );

  // ---- PATCH /users/:id ----
  app.patch<{ Params: { id: string } }>(
    "/:id",
    {
      preHandler: adminMiddleware,
      schema: {
        tags: ["Utilisateurs"],
        summary: "Modifier un utilisateur",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const paramsParsed = idParamSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        throw new ValidationError(
          paramsParsed.error.flatten().fieldErrors as Record<string, string[]>,
        );
      }

      const parsed = updateUserSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const operatorId = await getOperatorId(request.user.sub);
      const user = await service.update(
        paramsParsed.data.id,
        operatorId,
        parsed.data,
        request.user.sub,
        request.user.role,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.send({ success: true, data: user });
    },
  );

  // ---- PATCH /users/:id/deactivate ----
  app.patch<{ Params: { id: string } }>(
    "/:id/deactivate",
    {
      preHandler: adminMiddleware,
      schema: {
        tags: ["Utilisateurs"],
        summary: "Désactiver un utilisateur",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const paramsParsed = idParamSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        throw new ValidationError(
          paramsParsed.error.flatten().fieldErrors as Record<string, string[]>,
        );
      }

      const operatorId = await getOperatorId(request.user.sub);
      const user = await service.deactivate(
        paramsParsed.data.id,
        operatorId,
        request.user.sub,
        request.user.role,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.send({ success: true, data: user });
    },
  );

  // ---- PATCH /users/:id/reactivate ----
  app.patch<{ Params: { id: string } }>(
    "/:id/reactivate",
    {
      preHandler: adminMiddleware,
      schema: {
        tags: ["Utilisateurs"],
        summary: "Réactiver un utilisateur",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const paramsParsed = idParamSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        throw new ValidationError(
          paramsParsed.error.flatten().fieldErrors as Record<string, string[]>,
        );
      }

      const operatorId = await getOperatorId(request.user.sub);
      const user = await service.reactivate(
        paramsParsed.data.id,
        operatorId,
        request.user.sub,
        request.user.role,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.send({ success: true, data: user });
    },
  );

  // ---- DELETE /users/:id ----
  app.delete<{ Params: { id: string } }>(
    "/:id",
    {
      preHandler: adminMiddleware,
      schema: {
        tags: ["Utilisateurs"],
        summary: "Supprimer un utilisateur (soft-delete)",
        description:
          "Suppression douce : deletedAt=now, isActive=false, révocation de tous les refresh tokens. " +
          "Interdit sur soi-même (422 CANNOT_DELETE_SELF) et sur un SUPER_ADMIN si acteur != SUPER_ADMIN (403).",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", format: "uuid" } },
        },
        response: {
          200: {
            description: "Utilisateur supprimé",
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: { id: { type: "string", format: "uuid" } },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const paramsParsed = idParamSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        throw new ValidationError(
          paramsParsed.error.flatten().fieldErrors as Record<string, string[]>,
        );
      }

      const operatorId = await getOperatorId(request.user.sub);
      const result = await service.softDelete(
        paramsParsed.data.id,
        operatorId,
        request.user.sub,
        request.user.role,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.send({ success: true, data: result });
    },
  );

  // ---- POST /users/:id/reset-password ----
  app.post<{ Params: { id: string } }>(
    "/:id/reset-password",
    {
      preHandler: adminMiddleware,
      schema: {
        tags: ["Utilisateurs"],
        summary: "Réinitialiser le mot de passe (mot de passe provisoire)",
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            description: "Nouveau mot de passe provisoire (affiché une seule fois)",
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  temporaryPassword: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const paramsParsed = idParamSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        throw new ValidationError(
          paramsParsed.error.flatten().fieldErrors as Record<string, string[]>,
        );
      }

      const operatorId = await getOperatorId(request.user.sub);
      const result = await service.resetPassword(
        paramsParsed.data.id,
        operatorId,
        request.user.sub,
        request.user.role,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.send({ success: true, data: result });
    },
  );
}
