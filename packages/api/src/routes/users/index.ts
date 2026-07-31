import type { FastifyInstance } from "fastify";
import { idParamSchema } from "@lingengo/shared";
import { UsersService } from "../../services/users.service.js";
import { DeletionService } from "../../services/deletion.service.js";
import { ValidationError, NotFoundError } from "../../utils/errors.js";
import { requireRole } from "../../middleware/rbac.js";
import {
  createUserSchema,
  updateUserSchema,
  listUsersQuerySchema,
} from "../../schemas/users.schema.js";
import { cascadeQuerySchema } from "../../schemas/deletion.schema.js";

export default async function userRoutes(app: FastifyInstance): Promise<void> {
  const service = new UsersService(app.prisma);
  const deletion = new DeletionService(app.prisma);
  const adminMiddleware = [app.authenticate, requireRole("ROLE_ADMIN", "ROLE_SUPER_ADMIN")];

  async function getOperatorId(userId: string): Promise<string> {
    const user = await app.prisma.user.findUnique({
      where: { id: userId },
      select: { operatorId: true },
    });
    // `NotFoundError` et non `Error` : une Error nue sort en 500 « erreur
    // interne », alors que le compte a simplement disparu depuis l'émission
    // du jeton. Le client ne peut rien faire d'un 500, il sait quoi faire
    // d'un 404.
    if (!user) throw new NotFoundError("Utilisateur", userId);
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
                  // `additionalProperties: true` : fast-json-stringify retire du
                  // corps sérialisé tout ce qui n'est pas déclaré. Un
                  // `type: "object"` nu renvoyait `user: {}` — un utilisateur
                  // créé, mais sans `id` ni `email` pour l'écran qui l'affiche.
                  user: { type: "object", additionalProperties: true },
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

  // ---- GET /users/:id/deletion-preview ----
  app.get<{ Params: { id: string } }>(
    "/:id/deletion-preview",
    {
      preHandler: adminMiddleware,
      schema: {
        tags: ["Utilisateurs"],
        summary: "Aperçu de ce qu'une suppression en cascade emporterait",
        description:
          "Alimente la modale de confirmation. `canHardDelete` est false dès qu'une facture " +
          "émise existe ; `blockingReason` vaut alors CLIENT_HAS_ISSUED_INVOICES et l'interface " +
          "doit proposer l'anonymisation à la place.",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", format: "uuid" } },
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
      const preview = await deletion.previewUser(paramsParsed.data.id, operatorId);
      return reply.send({ success: true, data: preview });
    },
  );

  // ---- POST /users/:id/anonymize ----
  app.post<{ Params: { id: string } }>(
    "/:id/anonymize",
    {
      preHandler: adminMiddleware,
      schema: {
        tags: ["Utilisateurs"],
        summary: "Anonymiser un client (RGPD) en conservant sa comptabilité",
        description:
          "Sortie de secours quand la suppression est bloquée par une facture émise. " +
          "Identité et snapshots (devis, rotations, factures BROUILLON) remplacés par un " +
          "pseudonyme ; les factures ÉMISES gardent leur snapshot nominatif — une facture doit " +
          "nommer son client pour rester conforme. Leur nombre est renvoyé dans invoices.preserved.",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", format: "uuid" } },
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
      const result = await deletion.anonymizeUser(
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

  // ---- DELETE /users/:id[?cascade=true] ----
  app.delete<{ Params: { id: string }; Querystring: { cascade?: string } }>(
    "/:id",
    {
      preHandler: adminMiddleware,
      schema: {
        tags: ["Utilisateurs"],
        summary: "Supprimer un utilisateur (soft-delete, cascade optionnelle)",
        description:
          "Sans `cascade` : soft-delete du seul compte (deletedAt=now, isActive=false, refresh " +
          "tokens révoqués) — comportement historique inchangé. " +
          "Avec `cascade=true` : devis, factures BROUILLON, commandes et rotations sont aussi " +
          "soft-deletés et l'abonnement supprimé. " +
          "REFUSÉ en 422 CLIENT_HAS_ISSUED_INVOICES si le client porte une facture non-BROUILLON " +
          "(conservation 10 ans, art. L123-22 C. com.) — aucun paramètre ne lève ce refus, " +
          "utiliser POST /users/:id/anonymize. " +
          "Interdit sur soi-même (422 CANNOT_DELETE_SELF) et sur un SUPER_ADMIN si acteur != SUPER_ADMIN (403).",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", format: "uuid" } },
        },
        querystring: {
          type: "object",
          properties: { cascade: { type: "string", enum: ["true", "false", "1", "0"] } },
        },
        response: {
          200: {
            description: "Utilisateur supprimé",
            type: "object",
            properties: {
              success: { type: "boolean" },
              // Même motif que POST /users : sans `additionalProperties`, le
              // détail de la cascade (entités effacées, compteurs) est vidé.
              data: { type: "object", additionalProperties: true },
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

      const queryParsed = cascadeQuerySchema.safeParse(request.query ?? {});
      if (!queryParsed.success) {
        throw new ValidationError(
          queryParsed.error.flatten().fieldErrors as Record<string, string[]>,
        );
      }

      const operatorId = await getOperatorId(request.user.sub);

      if (queryParsed.data.cascade) {
        const result = await deletion.cascadeDeleteUser(
          paramsParsed.data.id,
          operatorId,
          request.user.sub,
          request.user.role,
          request.ip,
          request.headers["user-agent"],
        );
        return reply.send({ success: true, data: result });
      }

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
