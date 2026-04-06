import fp from "fastify-plugin";
import fjwt from "@fastify/jwt";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { UnauthorizedError } from "../utils/errors.js";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: {
      sub: string;
      role: string;
    };
    user: {
      sub: string;
      role: string;
    };
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

/**
 * Plugin Fastify — JWT access token verification.
 * Décore l'instance avec `app.authenticate` utilisable comme preHandler.
 */
export default fp(async (app: FastifyInstance) => {
  const secret = process.env["JWT_ACCESS_SECRET"];
  if (!secret || secret.length < 32) {
    throw new Error("JWT_ACCESS_SECRET manquant ou trop court (min 32 caractères)");
  }

  await app.register(fjwt, {
    secret,
    sign: {
      expiresIn: "15m",
    },
  });

  app.decorate("authenticate", async (request: FastifyRequest, _reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      throw new UnauthorizedError("Token invalide ou expiré");
    }
  });
});
