import type { FastifyInstance } from "fastify";
import { DashboardService } from "../../services/dashboard.service.js";
import { requireRole } from "../../middleware/rbac.js";

export default async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  const service = new DashboardService(app.prisma);

  // ---- GET /dashboard/kpis (admin) ----
  app.get(
    "/kpis",
    { preHandler: [app.authenticate, requireRole("ROLE_ADMIN", "ROLE_SUPER_ADMIN")] },
    async (request, reply) => {
      const admin = await app.prisma.user.findUnique({
        where: { id: request.user.sub },
        select: { operatorId: true },
      });

      const kpis = await service.getKpis(admin!.operatorId);
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
      const admin = await app.prisma.user.findUnique({
        where: { id: request.user.sub },
        select: { operatorId: true },
      });

      const alerts = await service.getAlerts(admin!.operatorId);
      return reply.send({ success: true, data: alerts });
    },
  );
}
