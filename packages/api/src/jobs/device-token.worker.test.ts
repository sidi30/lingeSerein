/**
 * Purge des jetons push dormants.
 *
 * Le risque n'est pas de supprimer trop peu — c'est de supprimer trop : un jeton
 * effacé à tort éteint le push d'un appareil vivant jusqu'au prochain lancement
 * de l'application. La borne des 90 jours doit donc être stricte et sans effet de
 * bord sur les appareils actifs.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { __deviceTokenCron, RETENTION_JETONS_JOURS } from "./device-token.worker.ts";

interface FakeToken {
  token: string;
  lastSeenAt: Date;
}

function createFakePrisma(tokens: FakeToken[]) {
  const restants = [...tokens];

  return {
    get tokensRestants() {
      return restants.map((t) => t.token);
    },
    deviceToken: {
      deleteMany: async ({ where }: { where: { lastSeenAt: { lt: Date } } }) => {
        let count = 0;
        for (let i = restants.length - 1; i >= 0; i--) {
          const t = restants[i];
          if (t && t.lastSeenAt < where.lastSeenAt.lt) {
            restants.splice(i, 1);
            count++;
          }
        }
        return { count };
      },
    },
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const asPrisma = (fake: ReturnType<typeof createFakePrisma>) => fake as any;

const MAINTENANT = new Date(2026, 6, 28, 4, 0, 0, 0);

/** Date située `jours` avant la date de référence. */
function ilYA(jours: number): Date {
  const d = new Date(MAINTENANT);
  d.setDate(d.getDate() - jours);
  return d;
}

describe("purge quotidienne des jetons push", () => {
  it("supprime un jeton silencieux depuis plus de 90 jours", async () => {
    const fake = createFakePrisma([{ token: "mort", lastSeenAt: ilYA(120) }]);

    const result = await __deviceTokenCron.runCleanup(asPrisma(fake), MAINTENANT);

    assert.equal(result.supprimes, 1);
    assert.deepEqual(fake.tokensRestants, []);
  });

  it("conserve un appareil actif", async () => {
    const fake = createFakePrisma([
      { token: "hier", lastSeenAt: ilYA(1) },
      { token: "le-mois-dernier", lastSeenAt: ilYA(30) },
    ]);

    const result = await __deviceTokenCron.runCleanup(asPrisma(fake), MAINTENANT);

    assert.equal(result.supprimes, 0);
    assert.deepEqual(fake.tokensRestants, ["hier", "le-mois-dernier"]);
  });

  it("ne supprime pas un jeton pile sur la borne de rétention", async () => {
    // Un client saisonnier qui rouvre l'application au bout de 90 jours tout
    // juste doit garder son push.
    const fake = createFakePrisma([
      { token: "limite", lastSeenAt: ilYA(RETENTION_JETONS_JOURS) },
      { token: "au-dela", lastSeenAt: ilYA(RETENTION_JETONS_JOURS + 1) },
    ]);

    const result = await __deviceTokenCron.runCleanup(asPrisma(fake), MAINTENANT);

    assert.equal(result.supprimes, 1);
    assert.deepEqual(fake.tokensRestants, ["limite"]);
  });

  it("est idempotent : un second passage ne supprime plus rien", async () => {
    const fake = createFakePrisma([
      { token: "mort", lastSeenAt: ilYA(200) },
      { token: "vivant", lastSeenAt: ilYA(2) },
    ]);

    await __deviceTokenCron.runCleanup(asPrisma(fake), MAINTENANT);
    const second = await __deviceTokenCron.runCleanup(asPrisma(fake), MAINTENANT);

    assert.equal(second.supprimes, 0);
    assert.deepEqual(fake.tokensRestants, ["vivant"]);
  });

  it("ne fait rien sur une table vide", async () => {
    const fake = createFakePrisma([]);
    const result = await __deviceTokenCron.runCleanup(asPrisma(fake), MAINTENANT);
    assert.equal(result.supprimes, 0);
  });
});
