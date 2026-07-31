/**
 * Passage groupé — API.
 *
 * Trois usages, trois publics :
 *  - le CLIENT lit les passages ouverts dans sa commune et y répond (mobile) ;
 *  - l'ADMIN relit les réponses pour composer la tournée, et saisit celles qui
 *    sont arrivées par TÉLÉPHONE — beaucoup d'hôteliers appellent, refuser leur
 *    réponse parce qu'elle n'est pas passée par l'application reviendrait à
 *    perdre l'essentiel du bénéfice ;
 *  - le CRON ouvre les créneaux (pas de route : voir `passage.worker.ts`).
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { PassagesService } from "../../services/passages.service.js";
import { requireRole } from "../../middleware/rbac.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";

const reponseSchema = z.object({
  kind: z.enum(["LIVRAISON", "REPRISE", "LIVRAISON_ET_REPRISE", "AUCUN"]),
  message: z.string().max(500).optional().nullable(),
});

const reponseAdminSchema = reponseSchema.extend({
  userId: z.string().uuid(),
  source: z.enum(["TELEPHONE", "ADMIN"]).default("TELEPHONE"),
});

const listQuerySchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export default async function passageRoutes(app: FastifyInstance): Promise<void> {
  const service = new PassagesService(app.prisma);
  const adminMiddleware = [app.authenticate, requireRole("ROLE_ADMIN", "ROLE_SUPER_ADMIN")];

  // ---- GET /passages/mine (client) ----
  app.get(
    "/mine",
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ["Passages"],
        summary: "Passages déjà prévus dans ma commune",
        description:
          "Rend les créneaux ouverts et non expirés pour la commune du client authentifié, " +
          "avec le prix remisé de la livraison et le rappel que la reprise est gratuite. " +
          "Liste vide si le client n'a pas de commune confirmée : sans commune, aucun " +
          "passage ne peut lui être promis.",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const data = await service.mine(request.user.sub);
      return reply.send({ success: true, data });
    },
  );

  // ---- POST /passages/:id/reponse (client) ----
  app.post<{ Params: { id: string } }>(
    "/:id/reponse",
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ["Passages"],
        summary: "Répondre à une proposition de passage",
        description:
          "Répondre une seconde fois CORRIGE la réponse au lieu d'en ajouter une : le livreur " +
          "ne doit jamais avoir à arbitrer entre deux intentions du même client. " +
          "422 PASSAGE_EXPIRED si le camion est déjà parti, 422 PASSAGE_WRONG_COMMUNE si la " +
          "proposition concerne une autre commune.",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["kind"],
          properties: {
            kind: {
              type: "string",
              enum: ["LIVRAISON", "REPRISE", "LIVRAISON_ET_REPRISE", "AUCUN"],
            },
            message: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = reponseSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }
      const reponse = await service.repondre(request.params.id, request.user.sub, {
        kind: parsed.data.kind,
        message: parsed.data.message ?? null,
        source: "MOBILE",
      });
      return reply.send({ success: true, data: reponse });
    },
  );

  // ---- GET /passages (admin) ----
  app.get(
    "/",
    {
      preHandler: adminMiddleware,
      schema: {
        tags: ["Passages"],
        summary: "Passages ouverts et réponses des clients",
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: { from: { type: "string" }, to: { type: "string" } },
        },
      },
    },
    async (request, reply) => {
      const parsed = listQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }
      const user = await app.prisma.user.findUnique({
        where: { id: request.user.sub },
        select: { operatorId: true },
      });
      if (!user) throw new NotFoundError("Utilisateur", request.user.sub);

      const data = await service.list(parsed.data, user.operatorId);
      return reply.send({ success: true, data });
    },
  );

  // ---- POST /passages/:id/reponse-client (admin, réponse reçue par téléphone) ----
  app.post<{ Params: { id: string } }>(
    "/:id/reponse-client",
    {
      preHandler: adminMiddleware,
      schema: {
        tags: ["Passages"],
        summary: "Enregistrer la réponse d'un client reçue par téléphone",
        description:
          "Le canal est conservé (TELEPHONE) : sans lui, impossible de savoir si l'application " +
          "sert réellement ou si tout continue de passer par le téléphone.",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["kind", "userId"],
          properties: {
            kind: {
              type: "string",
              enum: ["LIVRAISON", "REPRISE", "LIVRAISON_ET_REPRISE", "AUCUN"],
            },
            userId: { type: "string" },
            message: { type: "string" },
            source: { type: "string", enum: ["TELEPHONE", "ADMIN"] },
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = reponseAdminSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }
      const reponse = await service.repondre(request.params.id, parsed.data.userId, {
        kind: parsed.data.kind,
        message: parsed.data.message ?? null,
        source: parsed.data.source,
      });
      return reply.send({ success: true, data: reponse });
    },
  );
}
