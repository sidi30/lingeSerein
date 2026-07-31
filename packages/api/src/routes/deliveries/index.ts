import type { FastifyInstance } from "fastify";
import { idParamSchema } from "@lingengo/shared";
import { DeliveriesService } from "../../services/deliveries.service.js";
import { ValidationError } from "../../utils/errors.js";
import { requireRole } from "../../middleware/rbac.js";
import {
  createRoundSchema,
  listRoundsQuerySchema,
  completeStopSchema,
} from "../../schemas/deliveries.schema.js";
import { operatorIdOf } from "../../utils/operator.js";

export default async function deliveryRoutes(app: FastifyInstance): Promise<void> {
  const service = new DeliveriesService(app.prisma);

  // ---- GET /deliveries/rounds (admin) ----
  app.get(
    "/rounds",
    { preHandler: [app.authenticate, requireRole("ROLE_ADMIN", "ROLE_SUPER_ADMIN")] },
    async (request, reply) => {
      const parsed = listRoundsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const result = await service.listRounds(parsed.data);
      return reply.send({ success: true, ...result });
    },
  );

  // ---- POST /deliveries/rounds (admin) ----
  app.post(
    "/rounds",
    { preHandler: [app.authenticate, requireRole("ROLE_ADMIN", "ROLE_SUPER_ADMIN")] },
    async (request, reply) => {
      const parsed = createRoundSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const operatorId = await operatorIdOf(app, request);

      const round = await service.createRound(
        parsed.data,
        operatorId,
        request.user.sub,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.status(201).send({ success: true, data: round });
    },
  );

  // ---- GET /deliveries/rounds/:id (admin or driver) ----
  app.get<{ Params: { id: string } }>(
    "/rounds/:id",
    {
      preHandler: [app.authenticate, requireRole("ROLE_ADMIN", "ROLE_SUPER_ADMIN", "ROLE_LIVREUR")],
    },
    async (request, reply) => {
      const paramsParsed = idParamSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        throw new ValidationError(
          paramsParsed.error.flatten().fieldErrors as Record<string, string[]>,
        );
      }

      const round = await service.getRoundById(
        paramsParsed.data.id,
        request.user.sub,
        request.user.role,
      );

      return reply.send({ success: true, data: round });
    },
  );

  // ---- GET /deliveries/mine (driver) ----
  //
  // `/today` ne montre que la journée en cours : une tournée créée pour demain
  // était invisible au livreur, qui n'avait donc AUCUN moyen de savoir ce qui
  // l'attendait. Cette route ouvre la fenêtre (7 jours en arrière, 30 en avant
  // par défaut) sans rien changer à `/today`, dont l'application dépend.
  app.get(
    "/mine",
    {
      preHandler: [app.authenticate, requireRole("ROLE_LIVREUR")],
      schema: {
        tags: ["Livraisons"],
        summary: "Mes tournées (livreur) — à venir et récentes",
        description:
          "Périmètre FORCÉ côté serveur sur le livreur authentifié : un `driverId` passé en " +
          "query est ignoré. Fenêtre par défaut J-7 → J+30, ajustable via `from` / `to`.",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const parsed = listRoundsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      // `driverId` est RETIRÉ de la requête avant tout usage. Le laisser passer,
      // même à côté d'un périmètre serveur, c'est laisser une porte que le
      // prochain refactor ouvrira sans s'en rendre compte : ici la valeur ne
      // survit tout simplement pas à la ligne suivante, et `listMyRounds` ne
      // l'accepte même pas dans son type.
      const { driverId: _ignore, ...query } = parsed.data;

      const result = await service.listMyRounds(request.user.sub, query);
      return reply.send({ success: true, ...result });
    },
  );

  // ---- GET /deliveries/today (driver) ----
  app.get(
    "/today",
    { preHandler: [app.authenticate, requireRole("ROLE_LIVREUR")] },
    async (request, reply) => {
      const round = await service.getTodayRound(request.user.sub);
      return reply.send({ success: true, data: round });
    },
  );

  // ---- PATCH /deliveries/stops/:id/complete (driver) ----
  app.patch<{ Params: { id: string } }>(
    "/stops/:id/complete",
    { preHandler: [app.authenticate, requireRole("ROLE_LIVREUR")] },
    async (request, reply) => {
      const paramsParsed = idParamSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        throw new ValidationError(
          paramsParsed.error.flatten().fieldErrors as Record<string, string[]>,
        );
      }

      const parsed = completeStopSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const stop = await service.completeStop(
        paramsParsed.data.id,
        parsed.data,
        request.user.sub,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.send({ success: true, data: stop });
    },
  );

  // ---- PATCH /deliveries/rounds/:id/complete (driver) ----
  app.patch<{ Params: { id: string } }>(
    "/rounds/:id/complete",
    { preHandler: [app.authenticate, requireRole("ROLE_LIVREUR")] },
    async (request, reply) => {
      const paramsParsed = idParamSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        throw new ValidationError(
          paramsParsed.error.flatten().fieldErrors as Record<string, string[]>,
        );
      }

      const round = await service.completeRound(
        paramsParsed.data.id,
        request.user.sub,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.send({ success: true, data: round });
    },
  );

  // ---- DELETE /deliveries/rounds/:id (admin) ----
  app.delete<{ Params: { id: string } }>(
    "/rounds/:id",
    {
      preHandler: [app.authenticate, requireRole("ROLE_ADMIN", "ROLE_SUPER_ADMIN")],
      schema: {
        tags: ["Livraisons"],
        summary: "Supprimer une tournée et ses arrêts",
        description:
          "Refuse en 422 ROUND_HAS_COMPLETED_STOPS dès qu'un arrêt est COMPLETED : ses preuves " +
          "de remise (signature, quantités) ne peuvent pas être effacées. Suppression définitive " +
          "sinon — une tournée sans arrêt livré n'est que de la planification.",
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

      const result = await service.deleteRound(
        paramsParsed.data.id,
        request.user.sub,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.send({ success: true, data: result });
    },
  );
}
