import type { FastifyInstance } from "fastify";
import { idParamSchema } from "@lingengo/shared";
import { InvoicesService } from "../../services/invoices.service.js";
import { ValidationError } from "../../utils/errors.js";
import { requireRole } from "../../middleware/rbac.js";
import {
  createInvoiceFromQuoteSchema,
  updateInvoiceStatusSchema,
  listInvoicesQuerySchema,
  INVOICE_STATUSES,
} from "../../schemas/invoices.schema.js";

export default async function invoiceRoutes(app: FastifyInstance): Promise<void> {
  const service = new InvoicesService(app.prisma);
  const adminMiddleware = [app.authenticate, requireRole("ROLE_ADMIN", "ROLE_SUPER_ADMIN")];

  async function getOperatorId(userId: string): Promise<string> {
    const user = await app.prisma.user.findUnique({
      where: { id: userId },
      select: { operatorId: true },
    });
    if (!user) throw new Error("Utilisateur introuvable");
    return user.operatorId;
  }

  // ---- POST /invoices/from-quote/:quoteId ----
  app.post<{ Params: { id: string } }>(
    "/from-quote/:id",
    {
      preHandler: adminMiddleware,
      schema: {
        tags: ["Factures"],
        summary: "Émettre une facture à partir d'un devis",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          properties: {
            dueDays: { type: "integer", minimum: 0, maximum: 365 },
            dueDate: { type: "string" },
          },
        },
        response: {
          201: {
            description: "Facture créée",
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: { type: "object" },
            },
          },
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

      const parsed = createInvoiceFromQuoteSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const operatorId = await getOperatorId(request.user.sub);
      const invoice = await service.createFromQuote(
        paramsParsed.data.id,
        operatorId,
        parsed.data,
        request.user.sub,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.status(201).send({ success: true, data: invoice });
    },
  );

  // ---- GET /invoices (liste) ----
  app.get(
    "/",
    {
      preHandler: adminMiddleware,
      schema: {
        tags: ["Factures"],
        summary: "Liste des factures",
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            status: { type: "string", enum: [...INVOICE_STATUSES] },
            year: { type: "integer" },
            search: { type: "string" },
            page: { type: "integer", minimum: 1 },
            limit: { type: "integer", minimum: 1, maximum: 100 },
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = listInvoicesQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const operatorId = await getOperatorId(request.user.sub);
      const result = await service.list(parsed.data, operatorId);
      return reply.send({ success: true, ...result });
    },
  );

  // ---- GET /invoices/:id (détail) ----
  app.get<{ Params: { id: string } }>(
    "/:id",
    {
      preHandler: adminMiddleware,
      schema: {
        tags: ["Factures"],
        summary: "Détail d'une facture",
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
      const invoice = await service.getById(paramsParsed.data.id, operatorId);
      return reply.send({ success: true, data: invoice });
    },
  );

  // ---- PATCH /invoices/:id/status ----
  app.patch<{ Params: { id: string } }>(
    "/:id/status",
    {
      preHandler: adminMiddleware,
      schema: {
        tags: ["Factures"],
        summary: "Changer le statut d'une facture",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["status"],
          properties: {
            status: { type: "string", enum: [...INVOICE_STATUSES] },
            paidAt: { type: "string" },
          },
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

      const parsed = updateInvoiceStatusSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const operatorId = await getOperatorId(request.user.sub);
      const invoice = await service.updateStatus(
        paramsParsed.data.id,
        operatorId,
        parsed.data,
        request.user.sub,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.send({ success: true, data: invoice });
    },
  );

  // ---- DELETE /invoices/:id (soft-delete, DRAFT uniquement) ----
  app.delete<{ Params: { id: string } }>(
    "/:id",
    {
      preHandler: adminMiddleware,
      schema: {
        tags: ["Factures"],
        summary: "Supprimer une facture (soft-delete, brouillon uniquement)",
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
      const result = await service.softDelete(
        paramsParsed.data.id,
        operatorId,
        request.user.sub,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.send({ success: true, data: result });
    },
  );
}
