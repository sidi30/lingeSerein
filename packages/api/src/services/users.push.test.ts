/**
 * Retirer un compte du service doit couper TOUS ses canaux, push compris.
 *
 * Le piège que ces tests verrouillent : révoquer les refresh tokens ferme
 * l'accès à l'API, et on en déduit spontanément que le compte « ne reçoit plus
 * rien ». C'est faux. Le push ne passe pas par l'API — il part de nos serveurs
 * vers Expo à partir de `device_tokens`, sans jamais consulter la session. Un
 * livreur désactivé gardait donc ses notifications d'affectation de tournée
 * (nom du client, adresse, horaires) sur un téléphone que l'entreprise ne
 * contrôle plus, et rien dans l'interface ne laissait deviner qu'il les
 * recevait encore.
 *
 * Les deux chemins de retrait sont testés séparément : c'est parce qu'ils
 * dupliquaient la révocation que l'un des deux a pu oublier le push.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { UsersService } from "./users.service.ts";

const OPERATOR_ID = "00000000-0000-4000-8000-000000000000";
const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const LIVREUR_ID = "22222222-2222-4222-8222-222222222222";

/** Prisma factice : on n'observe que ce qui est coupé, pas la mise à jour du DTO. */
function fakePrisma() {
  const jetonsPushSupprimes: string[] = [];
  let refreshRevoques = 0;

  const utilisateur = {
    id: LIVREUR_ID,
    email: "livreur@lingeserein.test",
    name: "Livreur",
    phone: null,
    role: "ROLE_LIVREUR",
    zoneId: null,
    zone: null,
    operatorId: OPERATOR_ID,
    isActive: true,
    isEmailVerified: true,
    deletedAt: null,
    createdAt: new Date(2026, 0, 1),
    updatedAt: new Date(2026, 0, 1),
  };

  return {
    get jetonsPushSupprimes() {
      return jetonsPushSupprimes;
    },
    get refreshRevoques() {
      return refreshRevoques;
    },
    client: {
      user: {
        findFirst: () => Promise.resolve(utilisateur),
        update: ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...utilisateur, ...data }),
      },
      refreshToken: {
        updateMany: () => {
          refreshRevoques++;
          return Promise.resolve({ count: 1 });
        },
      },
      deviceToken: {
        deleteMany: ({ where }: { where: { userId: string } }) => {
          jetonsPushSupprimes.push(where.userId);
          return Promise.resolve({ count: 2 });
        },
      },
      auditLog: { create: () => Promise.resolve({ id: "audit-1" }) },
    },
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const service = (faux: ReturnType<typeof fakePrisma>) => new UsersService(faux.client as any);

describe("désactivation d'un compte", () => {
  it("supprime les jetons push en plus de révoquer les sessions", async () => {
    const faux = fakePrisma();

    await service(faux).deactivate(LIVREUR_ID, OPERATOR_ID, ADMIN_ID, "ROLE_ADMIN");

    assert.equal(faux.refreshRevoques, 1, "les sessions doivent rester révoquées");
    assert.deepEqual(
      faux.jetonsPushSupprimes,
      [LIVREUR_ID],
      "sans cette suppression, l'ex-livreur reçoit encore les tournées sur son téléphone",
    );
  });
});

describe("suppression (soft-delete) d'un compte", () => {
  it("supprime aussi les jetons push", async () => {
    const faux = fakePrisma();

    await service(faux).softDelete(LIVREUR_ID, OPERATOR_ID, ADMIN_ID, "ROLE_ADMIN");

    assert.equal(faux.refreshRevoques, 1);
    assert.deepEqual(faux.jetonsPushSupprimes, [LIVREUR_ID]);
  });
});
