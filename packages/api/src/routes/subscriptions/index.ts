import type { FastifyInstance } from "fastify";
import { SubscriptionsService } from "../../services/subscriptions.service.js";
import { ValidationError } from "../../utils/errors.js";
import { requireRole } from "../../middleware/rbac.js";
import {
  createSubscriptionSchema,
  listSubscriptionsQuerySchema,
} from "../../schemas/subscriptions.schema.js";

export default async function subscriptionRoutes(app: FastifyInstance): Promise<void> {
  const service = new SubscriptionsService(app.prisma);

  // ---- GET /subscriptions/me (client) ----
  app.get(
    "/me",
    { preHandler: [app.authenticate, requireRole("ROLE_CLIENT")] },
    async (request, reply) => {
      const subscription = await service.getByUserId(request.user.sub);
      return reply.send({ success: true, data: subscription });
    },
  );

  // ---- POST /subscriptions (client) ----
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

  // ---- PATCH /subscriptions/me/pause (client) ----
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

  // ---- PATCH /subscriptions/me/resume (client) ----
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

  // ---- PATCH /subscriptions/me/cancel (client) ----
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

  // ---- GET /subscriptions (admin) ----
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
