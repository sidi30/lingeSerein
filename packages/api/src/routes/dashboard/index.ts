import type { FastifyInstance } from "fastify";
import { DashboardService } from "../../services/dashboard.service.js";
import { requireRole } from "../../middleware/rbac.js";
import { operatorIdOf } from "../../utils/operator.js";

export default async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  const service = new DashboardService(app.prisma);

  // ---- GET /dashboard/kpis (admin) ----
  app.get(
    "/kpis",
    { preHandler: [app.authenticate, requireRole("ROLE_ADMIN", "ROLE_SUPER_ADMIN")] },
    async (request, reply) => {
      const operatorId = await operatorIdOf(app, request);

      const kpis = await service.getKpis(operatorId);
      return reply.send({ success: true, data: kpis });
    },
  );

  // ---- GET /dashboard/revenue-chart (admin) ----
  app.get(
    "/revenue-chart",
    { preHandler: [app.authenticate, requireRole("ROLE_ADMIN", "ROLE_SUPER_ADMIN")] },
    async (_request, reply) => {
      const chart = await service.getRevenueChart();
      return reply.send({ success: true, data: chart });
    },
  );

  // ---- GET /dashboard/alerts (admin) ----
  app.get(
    "/alerts",
    { preHandler: [app.authenticate, requireRole("ROLE_ADMIN", "ROLE_SUPER_ADMIN")] },
    async (request, reply) => {
      const operatorId = await operatorIdOf(app, request);

      const alerts = await service.getAlerts(operatorId);
      return reply.send({ success: true, data: alerts });
    },
  );
}
