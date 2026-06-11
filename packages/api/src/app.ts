import Fastify, { type FastifyError } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";

import prismaPlugin from "./plugins/prisma.js";
import redisPlugin from "./plugins/redis.js";
import authPlugin from "./plugins/auth.js";
import jobsPlugin from "./plugins/jobs.js";
import authRoutes from "./routes/auth/index.js";
import productRoutes from "./routes/products/index.js";
import orderRoutes from "./routes/orders/index.js";
import stockRoutes from "./routes/stock/index.js";
import deliveryRoutes from "./routes/deliveries/index.js";
import subscriptionRoutes from "./routes/subscriptions/index.js";
import notificationRoutes from "./routes/notifications/index.js";
import clientRoutes from "./routes/clients/index.js";
import dashboardRoutes from "./routes/dashboard/index.js";
import quoteRoutes from "./routes/quotes/index.js";
import userRoutes from "./routes/users/index.js";
import settingsRoutes from "./routes/settings/index.js";
import { AppError } from "./utils/errors.js";

/**
 * Construit et configure l'instance Fastify avec tous les plugins.
 */
export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env["NODE_ENV"] === "production" ? "info" : "debug",
      redact: [
        "req.headers.authorization",
        "req.body.password",
        "req.body.email",
        "req.body.refreshToken",
      ],
    },
    trustProxy: true,
  });

  // ---- Security plugins ----
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
      },
    },
  });

  await app.register(cors, {
    origin: [
      process.env["ADMIN_WEB_URL"] ?? "http://localhost:3000",
      process.env["MOBILE_WEB_URL"] ?? "http://localhost:8081",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  await app.register(cookie, {
    secret: process.env["JWT_REFRESH_SECRET"],
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: 60_000,
    keyGenerator: (request) => {
      return request.user?.sub ?? request.ip;
    },
  });

  // ---- Documentation API ----
  await app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "Linge Serein API",
        description: "API REST du service de location de linge hôtelier Linge Serein",
        version: "1.0.0",
      },
      servers: [{ url: process.env["API_URL"] ?? "http://localhost:3001" }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: "/api/docs",
    uiConfig: {
      docExpansion: "list",
    },
  });

  // ---- Data plugins ----
  await app.register(prismaPlugin);
  await app.register(redisPlugin);
  await app.register(authPlugin);
  await app.register(jobsPlugin);

  // ---- Global error handler ----
  app.setErrorHandler((error: FastifyError | AppError | Error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(error.toJSON());
    }

    // Erreurs Fastify (validation, rate limit, etc.)
    const fastifyError = error as FastifyError;
    if (fastifyError.statusCode) {
      return reply.status(fastifyError.statusCode).send({
        success: false,
        error: {
          code: fastifyError.code ?? "ERROR",
          message: fastifyError.message,
        },
      });
    }

    // Erreur inconnue — ne pas exposer les détails en production
    app.log.error(error);
    return reply.status(500).send({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message:
          process.env["NODE_ENV"] === "production" ? "Erreur interne du serveur" : error.message,
      },
    });
  });

  // ---- Health check ----
  app.get("/api/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  // ---- Routes ----
  await app.register(authRoutes, { prefix: "/api/v1/auth" });
  await app.register(productRoutes, { prefix: "/api/v1/products" });
  await app.register(orderRoutes, { prefix: "/api/v1/orders" });
  await app.register(stockRoutes, { prefix: "/api/v1/stock" });
  await app.register(deliveryRoutes, { prefix: "/api/v1/deliveries" });
  await app.register(subscriptionRoutes, { prefix: "/api/v1/subscriptions" });
  await app.register(notificationRoutes, { prefix: "/api/v1/notifications" });
  await app.register(clientRoutes, { prefix: "/api/v1/clients" });
  await app.register(dashboardRoutes, { prefix: "/api/v1/dashboard" });
  await app.register(quoteRoutes, { prefix: "/api/v1/quotes" });
  await app.register(userRoutes, { prefix: "/api/v1/users" });
  await app.register(settingsRoutes, { prefix: "/api/v1/settings" });

  return app;
}
