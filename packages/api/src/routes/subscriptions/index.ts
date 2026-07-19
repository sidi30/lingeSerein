/**
 * Routes Subscriptions V2
 * ADR-V2-008 : GET /config (client), GET /config/admin + PATCH /config/admin (admin).
 * ADR-V2-006 : blocage résiliation ENGAGEMENT_ACTIVE.
 * Path réel (sous /api/v1/subscriptions — ADR-007) :
 *   GET  /config          → SubscriptionConfigPublicDTO (ROLE_CLIENT)
 *   GET  /config/admin    → SubscriptionConfigDTO       (ROLE_ADMIN|SUPER_ADMIN)
 *   PATCH /config/admin   → SubscriptionConfigDTO       (ROLE_ADMIN|SUPER_ADMIN)
 */

import type { FastifyInstance } from "fastify";
import { SubscriptionsService } from "../../services/subscriptions.service.js";
import { ValidationError, NotFoundError } from "../../utils/errors.js";
import { requireRole } from "../../middleware/rbac.js";
import {
  createSubscriptionSchema,
  listSubscriptionsQuerySchema,
  updateSubscriptionConfigSchema,
} from "../../schemas/subscriptions.schema.js";

export default async function subscriptionRoutes(app: FastifyInstance): Promise<void> {
  const service = new SubscriptionsService(app.prisma);

  // ---- GET /subscriptions/config (client — config publique) ------------------
  // Renvoie la config Pack Sérénité de l'opérateur du user. Auto-provision si absente.
  app.get(
    "/config",
    { preHandler: [app.authenticate, requireRole("ROLE_CLIENT")] },
    async (request, reply) => {
      const user = await app.prisma.user.findUnique({
        where: { id: request.user.sub },
        select: { operatorId: true },
      });

      if (!user) {
        return reply.status(404).send({
          success: false,
          error: { code: "NOT_FOUND", message: "Utilisateur introuvable" },
        });
      }

      const config = await service.getConfig(user.operatorId);

      // DTO public : pas d'id, d'operatorId, ni de createdAt
      return reply.send({
        success: true,
        data: {
          planName: config.planName,
          priceCents: config.priceCents,
          kitBainQty: config.kitBainQty,
          kitLitQty: config.kitLitQty,
          minEngagementMonths: config.minEngagementMonths,
          noticePeriodDays: config.noticePeriodDays,
        },
      });
    },
  );

  // ---- GET /subscriptions/config/admin (admin — config complète) --------------
  app.get(
    "/config/admin",
    { preHandler: [app.authenticate, requireRole("ROLE_ADMIN", "ROLE_SUPER_ADMIN")] },
    async (request, reply) => {
      const admin = await app.prisma.user.findUnique({
        where: { id: request.user.sub },
        select: { operatorId: true },
      });

      const config = await service.getConfig(admin!.operatorId);
      return reply.send({ success: true, data: config });
    },
  );

  // ---- PATCH /subscriptions/config/admin (admin — mise à jour config) ---------
  app.patch(
    "/config/admin",
    { preHandler: [app.authenticate, requireRole("ROLE_ADMIN", "ROLE_SUPER_ADMIN")] },
    async (request, reply) => {
      const parsed = updateSubscriptionConfigSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const admin = await app.prisma.user.findUnique({
        where: { id: request.user.sub },
        select: { operatorId: true },
      });

      const config = await service.updateConfig(
        admin!.operatorId,
        parsed.data,
        request.user.sub,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.send({ success: true, data: config });
    },
  );

  // ---- GET /subscriptions/me (client) ----------------------------------------
  app.get(
    "/me",
    { preHandler: [app.authenticate, requireRole("ROLE_CLIENT")] },
    async (request, reply) => {
      const subscription = await service.getByUserId(request.user.sub);
      return reply.send({ success: true, data: subscription });
    },
  );

  // ---- POST /subscriptions (client) ------------------------------------------
  app.post(
    "/",
    { preHandler: [app.authenticate, requireRole("ROLE_CLIENT")] },
    async (request, reply) => {
      const parsed = createSubscriptionSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const subscription = await service.create(
        parsed.data,
        request.user.sub,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.status(201).send({ success: true, data: subscription });
    },
  );

  // ---- PATCH /subscriptions/me/pause (client) ---------------------------------
  app.patch(
    "/me/pause",
    { preHandler: [app.authenticate, requireRole("ROLE_CLIENT")] },
    async (request, reply) => {
      const subscription = await service.pause(
        request.user.sub,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.send({ success: true, data: subscription });
    },
  );

  // ---- PATCH /subscriptions/me/resume (client) --------------------------------
  app.patch(
    "/me/resume",
    { preHandler: [app.authenticate, requireRole("ROLE_CLIENT")] },
    async (request, reply) => {
      const subscription = await service.resume(
        request.user.sub,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.send({ success: true, data: subscription });
    },
  );

  // ---- PATCH /subscriptions/me/cancel (client) --------------------------------
  // BLOQUÉ si now() < committedUntil → 422 ENGAGEMENT_ACTIVE (ADR-V2-006)
  app.patch(
    "/me/cancel",
    { preHandler: [app.authenticate, requireRole("ROLE_CLIENT")] },
    async (request, reply) => {
      const subscription = await service.cancel(
        request.user.sub,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.send({ success: true, data: subscription });
    },
  );

  // ---- Abonnements pilotés par l'admin POUR un client donné -------------------
  // Mêmes opérations que le parcours client mobile (/me/*), mais l'admin désigne
  // le client dans l'URL. Le parcours client reste inchangé.

  /** Vérifie que le client cible existe et appartient bien à l'opérateur de l'admin. */
  async function resolveClient(adminId: string, clientId: string): Promise<string | null> {
    const admin = await app.prisma.user.findUnique({
      where: { id: adminId },
      select: { operatorId: true },
    });
    if (!admin) return null;

    const client = await app.prisma.user.findFirst({
      where: {
        id: clientId,
        operatorId: admin.operatorId,
        role: "ROLE_CLIENT",
        deletedAt: null,
      },
      select: { id: true },
    });

    return client?.id ?? null;
  }

  const adminOnly = [app.authenticate, requireRole("ROLE_ADMIN", "ROLE_SUPER_ADMIN")];

  // ---- POST /subscriptions/clients/:userId (admin) ----------------------------
  app.post<{ Params: { userId: string } }>(
    "/clients/:userId",
    { preHandler: adminOnly },
    async (request, reply) => {
      const parsed = createSubscriptionSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const clientId = await resolveClient(request.user.sub, request.params.userId);
      if (!clientId) throw new NotFoundError("Client", request.params.userId);

      const subscription = await service.create(
        parsed.data,
        clientId,
        request.ip,
        request.headers["user-agent"],
        request.user.sub,
      );

      return reply.status(201).send({ success: true, data: subscription });
    },
  );

  // ---- PATCH /subscriptions/clients/:userId/pause|resume|cancel (admin) -------
  for (const action of ["pause", "resume", "cancel"] as const) {
    app.patch<{ Params: { userId: string } }>(
      `/clients/:userId/${action}`,
      { preHandler: adminOnly },
      async (request, reply) => {
        const clientId = await resolveClient(request.user.sub, request.params.userId);
        if (!clientId) throw new NotFoundError("Client", request.params.userId);

        const subscription = await service[action](
          clientId,
          request.ip,
          request.headers["user-agent"],
          request.user.sub,
        );

        return reply.send({ success: true, data: subscription });
      },
    );
  }

  // ---- GET /subscriptions/clients/:userId (admin) -----------------------------
  app.get<{ Params: { userId: string } }>(
    "/clients/:userId",
    { preHandler: adminOnly },
    async (request, reply) => {
      const clientId = await resolveClient(request.user.sub, request.params.userId);
      if (!clientId) throw new NotFoundError("Client", request.params.userId);

      const subscription = await service.getByUserId(clientId);
      return reply.send({ success: true, data: subscription });
    },
  );

  // ---- GET /subscriptions (admin — liste) -------------------------------------
  app.get(
    "/",
    { preHandler: [app.authenticate, requireRole("ROLE_ADMIN", "ROLE_SUPER_ADMIN")] },
    async (request, reply) => {
      const parsed = listSubscriptionsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const result = await service.list(parsed.data);
      return reply.send({ success: true, ...result });
    },
  );
}
