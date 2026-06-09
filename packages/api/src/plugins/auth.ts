import fp from "fastify-plugin";
import fjwt from "@fastify/jwt";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { UnauthorizedError } from "../utils/errors.js";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: {
      sub: string;
      role: string;
      iat?: number;
    };
    user: {
      sub: string;
      role: string;
      iat?: number;
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
 *
 * Politique Redis fail-open : si Redis est indisponible, l'authentification
 * continue (le token JWT lui-même reste validé). Choix délibéré : préférer
 * la disponibilité du service à un blocage total. En cas de compromission
 * critique, agir en révoquant le JWT_ACCESS_SECRET (rotation forcée).
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

    // Vérifier la blacklist Redis : si revokeAllUserTokens a été appelé,
    // un timestamp est stocké sous `user:<sub>:tokens_revoked_at`.
    // Tout token émis AVANT ce timestamp (iat < revokedAt) est rejeté.
    const { sub, iat } = request.user;

    if (sub && iat !== undefined) {
      try {
        const revokedAtStr = await app.redis.get(`user:${sub}:tokens_revoked_at`);
        if (revokedAtStr !== null) {
          const revokedAtMs = parseInt(revokedAtStr, 10);
          // iat est en secondes, revokedAtMs est en millisecondes
          if (iat * 1000 < revokedAtMs) {
            throw new UnauthorizedError("Token révoqué");
          }
        }
      } catch (err) {
        // Ne rejeter que si c'est notre propre UnauthorizedError (révocation confirmée)
        if (err instanceof UnauthorizedError) {
          throw err;
        }
        // Redis indisponible → fail-open : on logue et on continue
        app.log.warn(
          { err },
          "Redis indisponible lors de la vérification de révocation de token — fail-open",
        );
      }
    }
  });
});
