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
