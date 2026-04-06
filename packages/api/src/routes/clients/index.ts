import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { idParamSchema } from "@lingengo/shared";
import { ClientsService } from "../../services/clients.service.js";
import { NotificationsService } from "../../services/notifications.service.js";
import { ValidationError } from "../../utils/errors.js";
import { requireRole } from "../../middleware/rbac.js";
import { createAuditLog } from "../../utils/audit.js";

const listClientsQuerySchema = z.object({
  status: z.enum(["active", "inactive"]).optional(),
  range: z.enum(["CONFORT", "HOTEL", "PRESTIGE"]).optional(),
  zoneId: z.string().uuid().optional(),
  lowStock: z.coerce.boolean().optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const updateClientSchema = z.object({
  notes: z.string().max(2000).optional(),
  isActive: z.boolean().optional(),
  stockAlertThreshold: z.number().int().min(0).max(100).optional(),
});

const notifyClientSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  type: z
    .enum([
      "STOCK_LOW",
      "DELIVERY_REMINDER",
      "DELIVERY_CONFIRMED",
      "DELIVERY_CANCELLED",
      "DELIVERY_DELAYED",
      "PAYMENT_FAILED",
      "PAYMENT_SUCCESS",
      "SUBSCRIPTION_RENEWED",
      "SUBSCRIPTION_EXPIRING",
      "ACCOUNT_LOCKED",
      "GENERAL",
    ])
    .default("GENERAL"),
});

export default async function clientRoutes(app: FastifyInstance): Promise<void> {
  const service = new ClientsService(app.prisma);
  const notificationsService = new NotificationsService(app.prisma);

  // ---- GET /clients (admin) ----
  app.get(
    "/",
    { preHandler: [app.authenticate, requireRole("ROLE_ADMIN", "ROLE_SUPER_ADMIN")] },
    async (request, reply) => {
      const parsed = listClientsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const result = await service.list(parsed.data);
      return reply.send({ success: true, ...result });
    },
  );

  // ---- GET /clients/export (admin - CSV) ----
  app.get(
    "/export",
    { preHandler: [app.authenticate, requireRole("ROLE_ADMIN", "ROLE_SUPER_ADMIN")] },
    async (request, reply) => {
      const csv = await service.exportCsv();

      await createAuditLog({
        prisma: app.prisma,
        userId: request.user.sub,
        action: "EXPORT_DATA",
        entity: "User",
        changes: { type: "CSV_EXPORT" },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      });

      return reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", "attachment; filename=clients-export.csv")
        .send(csv);
    },
  );

  // ---- GET /clients/:id (admin) ----
  app.get<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [app.authenticate, requireRole("ROLE_ADMIN", "ROLE_SUPER_ADMIN")] },
    async (request, reply) => {
      const paramsParsed = idParamSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        throw new ValidationError(paramsParsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const client = await service.getById(paramsParsed.data.id);
      return reply.send({ success: true, data: client });
    },
  );

  // ---- PATCH /clients/:id (admin) ----
  app.patch<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [app.authenticate, requireRole("ROLE_ADMIN", "ROLE_SUPER_ADMIN")] },
    async (request, reply) => {
      const paramsParsed = idParamSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        throw new ValidationError(paramsParsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const parsed = updateClientSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const client = await service.update(
        paramsParsed.data.id,
        parsed.data,
        request.user.sub,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.send({ success: true, data: client });
    },
  );

  // ---- POST /clients/:id/notify (admin) ----
  app.post<{ Params: { id: string } }>(
    "/:id/notify",
    { preHandler: [app.authenticate, requireRole("ROLE_ADMIN", "ROLE_SUPER_ADMIN")] },
    async (request, reply) => {
      const paramsParsed = idParamSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        throw new ValidationError(paramsParsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const parsed = notifyClientSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const notification = await notificationsService.create(
        paramsParsed.data.id,
        parsed.data.type,
        parsed.data.title,
        parsed.data.body,
      );

      return reply.status(201).send({ success: true, data: notification });
    },
  );
}
