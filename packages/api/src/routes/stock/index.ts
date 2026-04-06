import type { FastifyInstance } from "fastify";
import { StockService } from "../../services/stock.service.js";
import { ValidationError } from "../../utils/errors.js";
import { requireRole } from "../../middleware/rbac.js";
import {
  stockAdjustmentSchema,
  listClientStocksQuerySchema,
} from "../../schemas/stock.schema.js";

export default async function stockRoutes(app: FastifyInstance): Promise<void> {
  const service = new StockService(app.prisma);

  // ---- GET /stock/me (client - own stock levels) ----
  app.get(
    "/me",
    { preHandler: [app.authenticate, requireRole("ROLE_CLIENT")] },
    async (request, reply) => {
      const result = await service.getClientStock(request.user.sub);
      return reply.send({ success: true, data: result });
    },
  );

  // ---- GET /stock/clients (admin - all client stocks) ----
  app.get(
    "/clients",
    { preHandler: [app.authenticate, requireRole("ROLE_ADMIN", "ROLE_SUPER_ADMIN")] },
    async (request, reply) => {
      const parsed = listClientStocksQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const result = await service.listClientStocks(parsed.data);
      return reply.send({ success: true, ...result });
    },
  );

  // ---- GET /stock/operator (admin - global operator stock) ----
  app.get(
    "/operator",
    { preHandler: [app.authenticate, requireRole("ROLE_ADMIN", "ROLE_SUPER_ADMIN")] },
    async (request, reply) => {
      const admin = await app.prisma.user.findUnique({
        where: { id: request.user.sub },
        select: { operatorId: true },
      });

      const stocks = await service.getOperatorStock(admin!.operatorId);
      return reply.send({ success: true, data: stocks });
    },
  );

  // ---- POST /stock/adjustment (admin - manual stock adjustment) ----
  app.post(
    "/adjustment",
    { preHandler: [app.authenticate, requireRole("ROLE_ADMIN", "ROLE_SUPER_ADMIN")] },
    async (request, reply) => {
      const parsed = stockAdjustmentSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const movement = await service.createAdjustment(
        parsed.data,
        request.user.sub,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.status(201).send({ success: true, data: movement });
    },
  );
}
