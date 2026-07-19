import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { idParamSchema, paginationSchema } from "@lingengo/shared";
import {
  NotificationsService,
  NOTIFICATION_SECTIONS,
} from "../../services/notifications.service.js";
import { ValidationError } from "../../utils/errors.js";

const sectionParamSchema = z.object({
  section: z.enum(NOTIFICATION_SECTIONS),
});

const updateSettingsSchema = z.object({
  settings: z.array(
    z.object({
      type: z.enum([
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
      ]),
      channel: z.enum(["PUSH", "EMAIL", "BOTH"]),
      enabled: z.boolean(),
    }),
  ),
});

export default async function notificationRoutes(app: FastifyInstance): Promise<void> {
  const service = new NotificationsService(app.prisma);

  // ---- GET /notifications (authenticated, paginated) ----
  app.get("/", { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = paginationSchema.safeParse(request.query);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
    }

    const result = await service.list(request.user.sub, parsed.data.page, parsed.data.limit);
    return reply.send({ success: true, ...result });
  });

  // ---- PATCH /notifications/:id/read (authenticated) ----
  app.patch<{ Params: { id: string } }>(
    "/:id/read",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const paramsParsed = idParamSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        throw new ValidationError(
          paramsParsed.error.flatten().fieldErrors as Record<string, string[]>,
        );
      }

      const notification = await service.markAsRead(paramsParsed.data.id, request.user.sub);
      return reply.send({ success: true, data: notification });
    },
  );

  // ---- PATCH /notifications/read-all (authenticated) ----
  app.patch("/read-all", { preHandler: [app.authenticate] }, async (request, reply) => {
    const result = await service.markAllAsRead(request.user.sub);
    return reply.send({ success: true, data: result });
  });

  // ---- GET /notifications/unread-counts (authenticated) ----
  // Alimente les badges du menu latéral de l'admin. Volontairement très léger :
  // il est appelé en polling toutes les ~20s par chaque onglet ouvert.
  app.get("/unread-counts", { preHandler: [app.authenticate] }, async (request, reply) => {
    const counts = await service.unreadCountsBySection(request.user.sub);
    return reply.send({ success: true, data: counts });
  });

  // ---- PATCH /notifications/sections/:section/read (authenticated) ----
  // Comportement « dossier de boîte mail » : ouvrir la section vide son badge.
  app.patch<{ Params: { section: string } }>(
    "/sections/:section/read",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const parsed = sectionParamSchema.safeParse(request.params);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const result = await service.markSectionAsRead(request.user.sub, parsed.data.section);
      return reply.send({ success: true, data: result });
    },
  );

  // ---- GET /notifications/settings (authenticated) ----
  app.get("/settings", { preHandler: [app.authenticate] }, async (request, reply) => {
    const settings = await service.getSettings(request.user.sub);
    return reply.send({ success: true, data: settings });
  });

  // ---- PUT /notifications/settings (authenticated) ----
  app.put("/settings", { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = updateSettingsSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
    }

    const settings = await service.updateSettings(request.user.sub, parsed.data.settings);
    return reply.send({ success: true, data: settings });
  });
}
