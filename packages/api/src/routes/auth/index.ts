import type { FastifyInstance } from "fastify";
import { loginSchema, registerSchema, refreshTokenSchema } from "@lingengo/shared";
import { AuthService } from "../../services/auth.service.js";
import { AppError, ValidationError } from "../../utils/errors.js";

/**
 * Routes d'authentification — /api/v1/auth/*
 */
export default async function authRoutes(app: FastifyInstance): Promise<void> {
  const authService = new AuthService(app.prisma, app.redis, app);

  // ---- POST /register ----
  app.post("/register", async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
    }

    // En v1, on utilise un opérateur par défaut (le premier).
    // En multi-opérateur, l'opérateur sera déterminé par la zone ou le domaine.
    const defaultOperator = await app.prisma.operator.findFirst({
      where: { isActive: true },
    });

    if (!defaultOperator) {
      throw new AppError(500, "NO_OPERATOR", "Aucun opérateur configuré");
    }

    const result = await authService.register({
      ...parsed.data,
      operatorId: defaultOperator.id,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"],
    });

    // TODO: envoyer l'email de vérification via BullMQ + Resend

    return reply.status(201).send({
      success: true,
      data: {
        userId: result.userId,
        message: "Compte créé. Vérifiez votre email pour activer votre compte.",
      },
    });
  });

  // ---- POST /login ----
  app.post("/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
    }

    const result = await authService.login({
      ...parsed.data,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"],
    });

    // Refresh token en HttpOnly cookie (web) + dans le body (mobile)
    reply.setCookie("refreshToken", result.refreshToken, {
      httpOnly: true,
      secure: process.env["NODE_ENV"] === "production",
      sameSite: "strict",
      path: "/api/v1/auth",
      maxAge: 7 * 24 * 60 * 60, // 7 jours
    });

    return reply.send({
      success: true,
      data: {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        userId: result.userId,
        role: result.role,
      },
    });
  });

  // ---- POST /refresh ----
  app.post("/refresh", async (request, reply) => {
    // Accepter le refresh token depuis le cookie OU le body
    const cookieToken = (request.cookies as Record<string, string | undefined>)["refreshToken"];
    const bodyParsed = refreshTokenSchema.safeParse(request.body);
    const token = cookieToken ?? (bodyParsed.success ? bodyParsed.data.refreshToken : undefined);

    if (!token) {
      throw new ValidationError({ refreshToken: ["Refresh token requis"] });
    }

    const tokens = await authService.refresh(token);

    reply.setCookie("refreshToken", tokens.refreshToken, {
      httpOnly: true,
      secure: process.env["NODE_ENV"] === "production",
      sameSite: "strict",
      path: "/api/v1/auth",
      maxAge: 7 * 24 * 60 * 60,
    });

    return reply.send({
      success: true,
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    });
  });

  // ---- POST /logout ----
  app.post(
    "/logout",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const cookieToken = (request.cookies as Record<string, string | undefined>)["refreshToken"];
      const bodyParsed = refreshTokenSchema.safeParse(request.body);
      const token = cookieToken ?? (bodyParsed.success ? bodyParsed.data.refreshToken : undefined);

      if (token) {
        await authService.logout(
          token,
          request.user.sub,
          request.ip,
          request.headers["user-agent"],
        );
      }

      reply.clearCookie("refreshToken", { path: "/api/v1/auth" });

      return reply.send({
        success: true,
        data: { message: "Déconnexion réussie" },
      });
    },
  );

  // ---- GET /verify-email/:token ----
  app.get<{ Params: { token: string } }>(
    "/verify-email/:token",
    async (request, reply) => {
      await authService.verifyEmail(
        request.params.token,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.send({
        success: true,
        data: { message: "Email vérifié avec succès. Vous pouvez maintenant vous connecter." },
      });
    },
  );

  // ---- GET /me ----
  app.get(
    "/me",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = await app.prisma.user.findUnique({
        where: { id: request.user.sub, deletedAt: null },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          accommodationType: true,
          isEmailVerified: true,
          stockAlertThreshold: true,
          preferredTimeSlot: true,
          createdAt: true,
        },
      });

      if (!user) {
        return reply.status(404).send({
          success: false,
          error: { code: "NOT_FOUND", message: "Utilisateur introuvable" },
        });
      }

      return reply.send({ success: true, data: user });
    },
  );
}
