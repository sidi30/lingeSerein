import type { FastifyInstance, FastifyRequest } from "fastify";
import { UnauthorizedError } from "./errors.js";

/**
 * Opérateur du compte qui porte la requête.
 *
 * Chaque route admin relisait l'utilisateur en base puis écrivait
 * `admin!.operatorId`. Le `!` mentait : `findUnique` renvoie bien `null` quand
 * le compte a été supprimé ou anonymisé après l'émission du jeton — cas réel
 * depuis que l'admin sait supprimer des comptes. On obtenait alors un
 * `TypeError` et une 500 opaque, là où la réponse juste est « votre session ne
 * correspond plus à un compte » (401), qui déclenche la reconnexion côté client.
 */
export async function operatorIdOf(app: FastifyInstance, request: FastifyRequest): Promise<string> {
  const account = await app.prisma.user.findUnique({
    where: { id: request.user.sub },
    select: { operatorId: true },
  });

  if (!account) {
    throw new UnauthorizedError("Ce compte n'existe plus. Reconnectez-vous.");
  }

  return account.operatorId;
}
