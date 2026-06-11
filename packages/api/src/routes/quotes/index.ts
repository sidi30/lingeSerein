import type { FastifyInstance } from "fastify";
import { idParamSchema } from "@lingengo/shared";
import { QuotesService } from "../../services/quotes.service.js";
import { ValidationError } from "../../utils/errors.js";
import { requireRole } from "../../middleware/rbac.js";
import {
  createQuoteSchema,
  updateQuoteSchema,
  updateQuoteStatusSchema,
  listQuotesQuerySchema,
  convertQuoteSchema,
} from "../../schemas/quotes.schema.js";

export default async function quoteRoutes(app: FastifyInstance): Promise<void> {
  const service = new QuotesService(app.prisma);
  const adminMiddleware = [app.authenticate, requireRole("ROLE_ADMIN", "ROLE_SUPER_ADMIN")];

  // Helper pour extraire l'operatorId depuis le JWT/user
  async function getOperatorId(userId: string): Promise<string> {
    const user = await app.prisma.user.findUnique({
      where: { id: userId },
      select: { operatorId: true },
    });
    if (!user) throw new Error("Utilisateur introuvable");
    return user.operatorId;
  }

  // ---- POST /quotes (créer) ----
  app.post(
    "/",
    {
      preHandler: adminMiddleware,
      schema: {
        tags: ["Devis"],
        summary: "Créer un devis",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["clientNom", "lignes"],
          properties: {
            clientNom: { type: "string" },
            clientEmail: { type: "string", nullable: true },
            clientTel: { type: "string", nullable: true },
            clientAdresse: { type: "string", nullable: true },
            userId: { type: "string", format: "uuid", nullable: true },
            lignes: {
              type: "array",
              items: {
                type: "object",
                required: ["designation", "qty", "unitCents", "position"],
                properties: {
                  designation: { type: "string" },
                  qty: { type: "integer", minimum: 1 },
                  unitCents: { type: "integer", minimum: 0 },
                  position: { type: "integer", minimum: 0 },
                },
              },
              minItems: 1,
            },
            remisePct: { type: "integer", minimum: 0, maximum: 10000 },
            livraisonCents: { type: "integer", minimum: 0 },
            tvaApplicable: { type: "boolean" },
            notes: { type: "string", nullable: true },
            validiteJours: { type: "integer", minimum: 1, maximum: 365 },
          },
        },
        response: {
          201: {
            description: "Devis créé",
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: { type: "object" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = createQuoteSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const operatorId = await getOperatorId(request.user.sub);
      const quote = await service.create(
        parsed.data,
        operatorId,
        request.user.sub,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.status(201).send({ success: true, data: quote });
    },
  );

  // ---- GET /quotes (liste) ----
  app.get(
    "/",
    {
      preHandler: adminMiddleware,
      schema: {
        tags: ["Devis"],
        summary: "Liste des devis",
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            status: { type: "string" },
            search: { type: "string" },
            from: { type: "string" },
            to: { type: "string" },
            page: { type: "integer", minimum: 1 },
            limit: { type: "integer", minimum: 1, maximum: 100 },
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = listQuotesQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const operatorId = await getOperatorId(request.user.sub);
      const result = await service.list(parsed.data, operatorId);
      return reply.send({ success: true, ...result });
    },
  );

  // ---- GET /quotes/:id (détail) ----
  app.get<{ Params: { id: string } }>(
    "/:id",
    {
      preHandler: adminMiddleware,
      schema: {
        tags: ["Devis"],
        summary: "Détail d'un devis",
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
      const quote = await service.getById(paramsParsed.data.id, operatorId);
      return reply.send({ success: true, data: quote });
    },
  );

  // ---- PATCH /quotes/:id (modifier) ----
  app.patch<{ Params: { id: string } }>(
    "/:id",
    {
      preHandler: adminMiddleware,
      schema: {
        tags: ["Devis"],
        summary: "Modifier un devis",
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

      const parsed = updateQuoteSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const operatorId = await getOperatorId(request.user.sub);
      const quote = await service.update(
        paramsParsed.data.id,
        operatorId,
        parsed.data,
        request.user.sub,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.send({ success: true, data: quote });
    },
  );

  // ---- PATCH /quotes/:id/status (transition de statut) ----
  app.patch<{ Params: { id: string } }>(
    "/:id/status",
    {
      preHandler: adminMiddleware,
      schema: {
        tags: ["Devis"],
        summary: "Changer le statut d'un devis",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["status"],
          properties: {
            status: {
              type: "string",
              enum: ["BROUILLON", "ENVOYE", "ACCEPTE", "REFUSE", "EXPIRE"],
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

      const parsed = updateQuoteStatusSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const operatorId = await getOperatorId(request.user.sub);
      const quote = await service.updateStatus(
        paramsParsed.data.id,
        operatorId,
        parsed.data,
        request.user.sub,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.send({ success: true, data: quote });
    },
  );

  // ---- POST /quotes/:id/duplicate ----
  app.post<{ Params: { id: string } }>(
    "/:id/duplicate",
    {
      preHandler: adminMiddleware,
      schema: {
        tags: ["Devis"],
        summary: "Dupliquer un devis",
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
      const quote = await service.duplicate(
        paramsParsed.data.id,
        operatorId,
        request.user.sub,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.status(201).send({ success: true, data: quote });
    },
  );

  // ---- POST /quotes/:id/convert ----
  app.post<{ Params: { id: string } }>(
    "/:id/convert",
    {
      preHandler: adminMiddleware,
      schema: {
        tags: ["Devis"],
        summary: "Convertir un devis accepté en commande",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["deliveryDate", "lineMappings"],
          properties: {
            deliveryDate: { type: "string" },
            timeSlot: { type: "string" },
            lineMappings: {
              type: "array",
              items: {
                type: "object",
                required: ["quoteLineId", "productId"],
                properties: {
                  quoteLineId: { type: "string", format: "uuid" },
                  productId: { type: "string", format: "uuid" },
                },
              },
              minItems: 1,
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

      const parsed = convertQuoteSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const operatorId = await getOperatorId(request.user.sub);
      const result = await service.convert(
        paramsParsed.data.id,
        operatorId,
        parsed.data,
        request.user.sub,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.send({ success: true, data: result });
    },
  );

  // ---- DELETE /quotes/:id (soft-delete) ----
  app.delete<{ Params: { id: string } }>(
    "/:id",
    {
      preHandler: adminMiddleware,
      schema: {
        tags: ["Devis"],
        summary: "Supprimer un devis (soft-delete, BROUILLON uniquement)",
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
      const result = await service.softDelete(
        paramsParsed.data.id,
        operatorId,
        request.user.sub,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.send({ success: true, data: result });
    },
  );
}
