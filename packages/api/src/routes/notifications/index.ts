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

/**
 * Miroir EXHAUSTIF de l'enum Prisma `NotificationType`.
 *
 * Il manquait QUOTE_CREATED / ORDER_CREATED / USER_CREATED : un utilisateur ne
 * pouvait donc pas régler — ni couper — les notifications qui alimentent les
 * badges de l'admin, la requête étant rejetée en 400. Toute valeur ajoutée à
 * l'enum doit être reportée ici, sans quoi elle devient impossible à paramétrer.
 */
const NOTIFICATION_TYPES = [
  "QUOTE_CREATED",
  "ORDER_CREATED",
  "USER_CREATED",
  "STOCK_LOW",
  "ROTATION_REMINDER",
  "ROTATION_TODAY",
  "ROTATION_OVERDUE",
  "ROTATION_PICKED_UP",
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
] as const;

const updateSettingsSchema = z.object({
  settings: z.array(
    z.object({
      type: z.enum(NOTIFICATION_TYPES),
      channel: z.enum(["PUSH", "EMAIL", "BOTH"]),
      enabled: z.boolean(),
    }),
  ),
});

/**
 * Jeton push d'un appareil. `platform` est normalisé en minuscules : le mobile
 * envoie tantôt « iOS » tantôt « ios » selon l'API consultée, et une casse
 * divergente créerait deux lignes pour le même appareil.
 */
const deviceTokenSchema = z.object({
  token: z.string().min(1).max(255),
  platform: z
    .string()
    .max(20)
    .transform((p) => p.toLowerCase())
    .pipe(z.enum(["ios", "android", "web"])),
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

  // ---- POST /notifications/device-token (authenticated) ----
  // Sans cette route, aucun push ne peut partir : le serveur n'a aucune adresse
  // où écrire. L'échec était silencieux côté mobile.
  app.post(
    "/device-token",
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ["Notifications"],
        summary: "Enregistrer le jeton push de l'appareil courant",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["token", "platform"],
          properties: {
            token: { type: "string" },
            platform: { type: "string", enum: ["ios", "android", "web"] },
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = deviceTokenSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      // Upsert sur le JETON et non sur (user, jeton) : réinstaller l'application
      // sur un téléphone revendu réattribue le même jeton Expo à quelqu'un
      // d'autre. Réassigner `userId` transfère la propriété au dernier inscrit —
      // sans quoi l'ancien propriétaire recevrait les notifications du nouveau.
      const record = await app.prisma.deviceToken.upsert({
        where: { token: parsed.data.token },
        create: {
          userId: request.user.sub,
          token: parsed.data.token,
          platform: parsed.data.platform,
        },
        update: {
          userId: request.user.sub,
          platform: parsed.data.platform,
          lastSeenAt: new Date(),
        },
        select: { id: true, platform: true, lastSeenAt: true },
      });

      return reply.send({ success: true, data: record });
    },
  );
}
