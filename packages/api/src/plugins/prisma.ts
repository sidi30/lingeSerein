import fp from "fastify-plugin";
import { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

/**
 * Plugin Fastify — singleton Prisma Client.
 * Soft delete middleware intégré : les requêtes findMany/findFirst
 * excluent automatiquement les enregistrements supprimés.
 */
export default fp(async (app: FastifyInstance) => {
  const prisma = new PrismaClient({
    log:
      process.env["NODE_ENV"] === "development"
        ? [{ emit: "event", level: "query" }]
        : [{ emit: "event", level: "error" }],
  });

  await prisma.$connect();
  app.log.info("Prisma connected to PostgreSQL");

  app.decorate("prisma", prisma);

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
    app.log.info("Prisma disconnected");
  });
});
