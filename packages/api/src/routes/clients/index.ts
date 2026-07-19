import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { idParamSchema } from "@lingengo/shared";
import { ClientsService } from "../../services/clients.service.js";
import { NotificationsService } from "../../services/notifications.service.js";
import { OrdersService } from "../../services/orders.service.js";
import { ValidationError, NotFoundError } from "../../utils/errors.js";
import { requireRole } from "../../middleware/rbac.js";
import { createAuditLog } from "../../utils/audit.js";
import { createOrderSchema } from "../../schemas/orders.schema.js";

const CLIENT_SOURCES = ["APP", "ADMIN", "BOUCHE_A_OREILLE", "MARCHE", "DEVIS", "SITE_WEB"] as const;

const ACCOMMODATION_TYPES = ["AIRBNB", "GITE", "AUBERGE", "HOTEL", "AUTRE"] as const;

const listClientsQuerySchema = z.object({
  status: z.enum(["active", "inactive"]).optional(),
  range: z.enum(["CONFORT", "HOTEL", "PRESTIGE"]).optional(),
  zoneId: z.string().uuid().optional(),
  source: z.enum(CLIENT_SOURCES).optional(),
  lowStock: z.coerce.boolean().optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const createClientSchema = z.object({
  name: z.string().min(1, "Le nom est obligatoire").max(200),
  companyName: z.string().max(200).optional(),
  email: z.string().email("Email invalide").max(320).optional(),
  phone: z.string().max(20).optional(),
  address: z.string().max(2000).optional(),
  city: z.string().max(120).optional(),
  postalCode: z.string().max(10).optional(),
  accommodationType: z.enum(ACCOMMODATION_TYPES).optional(),
  zoneId: z.string().uuid().optional(),
  preferredTimeSlot: z.string().max(20).optional(),
  rating: z.number().int().min(1).max(5).optional(),
  requirements: z.string().max(2000).optional(),
  notes: z.string().max(2000).optional(),
  source: z.enum(CLIENT_SOURCES).optional(),
  grantAppAccess: z.boolean().optional(),
  force: z.boolean().optional(),
});

// Liste blanche PATCH — doit rester alignée sur UpdateClientInput dans
// clients.service.ts, sinon le champ est silencieusement ignoré.
const updateClientSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  companyName: z.string().max(200).nullable().optional(),
  email: z.string().email("Email invalide").max(320).nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  address: z.string().max(2000).nullable().optional(),
  city: z.string().max(120).nullable().optional(),
  postalCode: z.string().max(10).nullable().optional(),
  accommodationType: z.enum(ACCOMMODATION_TYPES).nullable().optional(),
  zoneId: z.string().uuid().nullable().optional(),
  preferredTimeSlot: z.string().max(20).nullable().optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  requirements: z.string().max(2000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
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
  const ordersService = new OrdersService(app.prisma);

  // L'operatorId ne vient jamais du corps de la requête : toujours du compte
  // authentifié. C'est lui qui cloisonne les données entre opérateurs.
  async function getOperatorId(userId: string): Promise<string> {
    const user = await app.prisma.user.findUnique({
      where: { id: userId },
      select: { operatorId: true },
    });
    if (!user) throw new NotFoundError("Utilisateur", userId);
    return user.operatorId;
  }

  // ---- POST /clients (admin) ----
  app.post(
    "/",
    { preHandler: [app.authenticate, requireRole("ROLE_ADMIN", "ROLE_SUPER_ADMIN")] },
    async (request, reply) => {
      const parsed = createClientSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const operatorId = await getOperatorId(request.user.sub);
      const result = await service.create(
        parsed.data,
        operatorId,
        request.user.sub,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.status(201).send({ success: true, data: result });
    },
  );

  // ---- GET /clients (admin) ----
  app.get(
    "/",
    { preHandler: [app.authenticate, requireRole("ROLE_ADMIN", "ROLE_SUPER_ADMIN")] },
    async (request, reply) => {
      const parsed = listClientsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const operatorId = await getOperatorId(request.user.sub);
      const result = await service.list(parsed.data, operatorId);
      return reply.send({ success: true, ...result });
    },
  );

  // ---- GET /clients/export (admin - CSV) ----
  app.get(
    "/export",
    { preHandler: [app.authenticate, requireRole("ROLE_ADMIN", "ROLE_SUPER_ADMIN")] },
    async (request, reply) => {
      const operatorId = await getOperatorId(request.user.sub);
      const csv = await service.exportCsv(operatorId);

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
        throw new ValidationError(
          paramsParsed.error.flatten().fieldErrors as Record<string, string[]>,
        );
      }

      const operatorId = await getOperatorId(request.user.sub);
      const client = await service.getById(paramsParsed.data.id, operatorId);
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
        throw new ValidationError(
          paramsParsed.error.flatten().fieldErrors as Record<string, string[]>,
        );
      }

      const parsed = updateClientSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const operatorId = await getOperatorId(request.user.sub);
      const client = await service.update(
        paramsParsed.data.id,
        parsed.data,
        operatorId,
        request.user.sub,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.send({ success: true, data: client });
    },
  );

  // ---- POST /clients/:id/orders (admin — commande saisie POUR un client) ----
  app.post<{ Params: { id: string } }>(
    "/:id/orders",
    { preHandler: [app.authenticate, requireRole("ROLE_ADMIN", "ROLE_SUPER_ADMIN")] },
    async (request, reply) => {
      const paramsParsed = idParamSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        throw new ValidationError(
          paramsParsed.error.flatten().fieldErrors as Record<string, string[]>,
        );
      }

      const parsed = createOrderSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      // Le client doit appartenir à l'opérateur de l'admin ET être un client :
      // sans ça un admin pourrait créer des commandes chez un autre opérateur.
      const operatorId = await getOperatorId(request.user.sub);
      const client = await app.prisma.user.findFirst({
        where: {
          id: paramsParsed.data.id,
          operatorId,
          role: "ROLE_CLIENT",
          deletedAt: null,
        },
        select: { id: true },
      });

      if (!client) {
        throw new NotFoundError("Client", paramsParsed.data.id);
      }

      const order = await ordersService.create(
        parsed.data,
        client.id,
        request.user.sub,
        { source: "MANUAL" },
        request.ip,
        request.headers["user-agent"],
      );

      return reply.status(201).send({ success: true, data: order });
    },
  );

  // ---- POST /clients/:id/notify (admin) ----
  app.post<{ Params: { id: string } }>(
    "/:id/notify",
    { preHandler: [app.authenticate, requireRole("ROLE_ADMIN", "ROLE_SUPER_ADMIN")] },
    async (request, reply) => {
      const paramsParsed = idParamSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        throw new ValidationError(
          paramsParsed.error.flatten().fieldErrors as Record<string, string[]>,
        );
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
