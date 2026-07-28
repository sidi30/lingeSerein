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
import invoiceRoutes from "./routes/invoices/index.js";
import rotationRoutes from "./routes/rotations/index.js";
import publicQuoteRoutes from "./routes/quotes/public.js";
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

    // Violations de contraintes remontées par la base. Sans ce mapping, un
    // double-clic sur « Créer un client » (deux insertions concurrentes avec le
    // même email) ou une note hors bornes renvoie un 500 « Erreur interne du
    // serveur » : l'admin ne peut ni comprendre ni corriger.
    const dbCode = (error as { code?: string }).code;
    if (dbCode === "P2002") {
      const target = (error as { meta?: { target?: string[] } }).meta?.target;
      const isEmail = Array.isArray(target) && target.some((t) => t.includes("email"));
      return reply.status(409).send({
        success: false,
        error: {
          code: isEmail ? "EMAIL_ALREADY_EXISTS" : "DUPLICATE_VALUE",
          message: isEmail
            ? "Cet email est déjà utilisé par un autre compte."
            : "Cette valeur existe déjà.",
        },
      });
    }
    // 23514 = CHECK violation (users_rating_range, users_password_requires_email)
    if (dbCode === "P2010" || dbCode === "23514") {
      return reply.status(422).send({
        success: false,
        error: {
          code: "CONSTRAINT_VIOLATION",
          message: "Valeur refusée par la base (note hors 1-5, ou mot de passe sans email).",
        },
      });
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
  await app.register(invoiceRoutes, { prefix: "/api/v1/invoices" });
  await app.register(rotationRoutes, { prefix: "/api/v1/rotations" });
  // Route interne serveur-à-serveur (mailer → API) : POST /api/v1/quotes/public.
  // Protégée par secret partagé (x-internal-secret), non par JWT.
  await app.register(publicQuoteRoutes, { prefix: "/api/v1/quotes" });
  await app.register(userRoutes, { prefix: "/api/v1/users" });
  await app.register(settingsRoutes, { prefix: "/api/v1/settings" });

  return app;
}
