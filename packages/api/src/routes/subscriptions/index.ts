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
import { idParamSchema } from "@lingengo/shared";
import { SubscriptionsService } from "../../services/subscriptions.service.js";
import { DeletionService } from "../../services/deletion.service.js";
import { ValidationError, NotFoundError } from "../../utils/errors.js";
import { requireRole } from "../../middleware/rbac.js";
import {
  createSubscriptionSchema,
  listSubscriptionsQuerySchema,
  updateSubscriptionConfigSchema,
} from "../../schemas/subscriptions.schema.js";
import { cascadeQuerySchema } from "../../schemas/deletion.schema.js";
import { operatorIdOf } from "../../utils/operator.js";

export default async function subscriptionRoutes(app: FastifyInstance): Promise<void> {
  const service = new SubscriptionsService(app.prisma);
  const deletion = new DeletionService(app.prisma);

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
      const operatorId = await operatorIdOf(app, request);

      const config = await service.getConfig(operatorId);
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

      const operatorId = await operatorIdOf(app, request);

      const config = await service.updateConfig(
        operatorId,
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

        // `force` n'a de sens que sur cancel : il lève le blocage d'engagement.
        // Réservé à l'admin (cette route l'est déjà) et tracé dans l'audit.
        const forceCancel =
          action === "cancel" && (request.body as { force?: boolean } | undefined)?.force === true;

        const subscription = await (action === "cancel"
          ? service.cancel(
              clientId,
              request.ip,
              request.headers["user-agent"],
              request.user.sub,
              forceCancel,
            )
          : service[action](clientId, request.ip, request.headers["user-agent"], request.user.sub));

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

  // ---- Suppression de gestion d'un abonnement (admin) --------------------------
  // Distinct de `cancel` : `cancel` est une RÉSILIATION (contractuelle, bloquée
  // pendant l'engagement). Ceci retire un abonnement créé par erreur ou en
  // double. L'engagement est donc signalé, jamais bloquant.

  /** Résout l'operatorId de l'admin appelant. */
  async function getOperatorId(adminId: string): Promise<string> {
    const admin = await app.prisma.user.findUnique({
      where: { id: adminId },
      select: { operatorId: true },
    });
    if (!admin) throw new NotFoundError("Utilisateur", adminId);
    return admin.operatorId;
  }

  // ---- GET /subscriptions/:id/deletion-preview (admin) ------------------------
  app.get<{ Params: { id: string } }>(
    "/:id/deletion-preview",
    {
      preHandler: adminOnly,
      schema: {
        tags: ["Abonnements"],
        summary: "Aperçu de la suppression d'un abonnement",
        description:
          "Rotations rattachées (client + formule ABONNEMENT), factures récurrentes générées " +
          "(reconnues à leur période), et engagement en cours. `canDelete` est toujours true : " +
          "l'engagement est signalé mais ne bloque pas une suppression de gestion.",
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
      const preview = await deletion.previewSubscription(paramsParsed.data.id, operatorId);
      return reply.send({ success: true, data: preview });
    },
  );

  // ---- DELETE /subscriptions/:id[?cascade=true] (admin) -----------------------
  app.delete<{ Params: { id: string }; Querystring: { cascade?: string } }>(
    "/:id",
    {
      preHandler: adminOnly,
      schema: {
        tags: ["Abonnements"],
        summary: "Supprimer un abonnement (cascade optionnelle sur les rotations)",
        description:
          "Suppression définitive de l'abonnement (les produits liés suivent en cascade SQL). " +
          "Avec `cascade=true`, les rotations d'abonnement du client sont aussi soft-deletées. " +
          "Les factures récurrentes déjà générées ne sont JAMAIS touchées — pièces comptables ; " +
          "leur nombre est renvoyé dans `invoicesPreserved`.",
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: { cascade: { type: "string", enum: ["true", "false", "1", "0"] } },
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
      const result = await deletion.deleteSubscription(
        paramsParsed.data.id,
        operatorId,
        queryParsed.data.cascade,
        request.user.sub,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.send({ success: true, data: result });
    },
  );
}
