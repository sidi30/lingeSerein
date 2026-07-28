import type { Queue } from "bullmq";

/**
 * File de distribution des pushs, exposée aux couches qui n'ont pas accès à
 * l'instance Fastify.
 *
 * `notify()` est appelé depuis les services, qui ne reçoivent que `prisma` — ils
 * ne peuvent donc pas atteindre `app.queues`. Sans ce point d'entrée, l'envoi
 * push restait dans le fil de la requête HTTP, avec le timeout Expo de 10 s au
 * bout : un `POST /orders` pouvait rester pendu dix secondes parce qu'un
 * serveur tiers ne répondait pas, alors que la commande était écrite depuis
 * longtemps.
 *
 * Volontairement un registre mutable et non une injection : le déplacer dans les
 * signatures obligerait à traverser une dizaine de services pour un détail
 * d'infrastructure. Non renseignée — tests, scripts, seed — `notify()` retombe
 * sur l'envoi direct, et se comporte exactement comme avant.
 */
let pushQueue: Queue | null = null;

/** Nom du job de distribution push sur la file `notifications`. */
export const JOB_PUSH = "deliver-push";

export function setPushQueue(queue: Queue | null): void {
  pushQueue = queue;
}

export function getPushQueue(): Queue | null {
  return pushQueue;
}
