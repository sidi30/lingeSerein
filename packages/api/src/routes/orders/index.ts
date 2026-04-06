import type { FastifyInstance } from "fastify";
import { idParamSchema, ROLES } from "@lingengo/shared";
import { OrdersService } from "../../services/orders.service.js";
import { ValidationError } from "../../utils/errors.js";
import { requireRole } from "../../middleware/rbac.js";
import {
  createOrderSchema,
  listOrdersQuerySchema,
  updateOrderStatusSchema,
  cancelOrderSchema,
} from "../../schemas/orders.schema.js";

export default async function orderRoutes(app: FastifyInstance): Promise<void> {
  const service = new OrdersService(app.prisma);

  // ---- GET /orders (client: own, admin: all) ----
  app.get(
    "/",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const parsed = listOrdersQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const isAdmin = request.user.role === ROLES.ADMIN || request.user.role === ROLES.SUPER_ADMIN;
      const userId = isAdmin ? undefined : request.user.sub;

      const result = await service.list(parsed.data, userId);
      return reply.send({ success: true, ...result });
    },
  );

  // ---- GET /orders/:id (owner or admin) ----
  app.get<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const paramsParsed = idParamSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        throw new ValidationError(paramsParsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const isAdmin = request.user.role === ROLES.ADMIN || request.user.role === ROLES.SUPER_ADMIN;
      const userId = isAdmin ? undefined : request.user.sub;

      const order = await service.getById(paramsParsed.data.id, userId);
      return reply.send({ success: true, data: order });
    },
  );

  // ---- POST /orders (client) ----
  app.post(
    "/",
    { preHandler: [app.authenticate, requireRole("ROLE_CLIENT")] },
    async (request, reply) => {
      const parsed = createOrderSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const order = await service.create(
        parsed.data,
        request.user.sub,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.status(201).send({ success: true, data: order });
    },
  );

  // ---- PATCH /orders/:id/cancel (client) ----
  app.patch<{ Params: { id: string } }>(
    "/:id/cancel",
    { preHandler: [app.authenticate, requireRole("ROLE_CLIENT")] },
    async (request, reply) => {
      const paramsParsed = idParamSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        throw new ValidationError(paramsParsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const bodyParsed = cancelOrderSchema.safeParse(request.body ?? {});
      if (!bodyParsed.success) {
        throw new ValidationError(bodyParsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const order = await service.cancel(
        paramsParsed.data.id,
        request.user.sub,
        bodyParsed.data,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.send({ success: true, data: order });
    },
  );

  // ---- PATCH /orders/:id/status (admin) ----
  app.patch<{ Params: { id: string } }>(
    "/:id/status",
    { preHandler: [app.authenticate, requireRole("ROLE_ADMIN", "ROLE_SUPER_ADMIN")] },
    async (request, reply) => {
      const paramsParsed = idParamSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        throw new ValidationError(paramsParsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const parsed = updateOrderStatusSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const order = await service.updateStatus(
        paramsParsed.data.id,
        parsed.data.status,
        request.user.sub,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.send({ success: true, data: order });
    },
  );
}
