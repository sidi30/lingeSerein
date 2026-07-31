/**
 * Frontière TARIFAIRE de `PATCH /api/v1/auth/me`.
 *
 * `zoneTarifaire` (orders.service) préfère `communeInsee` et ne retombe sur
 * `postalCode` que si la commune est absente. Or `postalCode` est écrit par le
 * client lui-même depuis cette route : sur une fiche SANS commune, écrire
 * « 84100 » suffisait à s'attribuer le palier ORANGE — 0 € de livraison au lieu
 * de 25 € pour un client d'Apt ou de Pertuis.
 *
 * Le schéma interdisait déjà d'EFFACER une commune pour cette raison exacte ;
 * restait le cas où elle n'a jamais été posée (inscription depuis un binaire
 * mobile antérieur, ou client créé par l'admin sans commune).
 *
 * Ces tests échouent si la garde de la route est retirée.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";

import authRoutes from "./index.ts";
import { AppError } from "../../utils/errors.ts";

const CLIENT_ID = "33333333-3333-4333-8333-333333333333";
/** Commune du Vaucluse, palier ÉLOIGNÉ — la vraie adresse du client. */
const APT_INSEE = "84003";

/**
 * Prisma minimal. `communeSurLaFiche` décide de ce que porte le compte en base,
 * c'est le seul paramètre qui compte ici.
 */
function fakePrisma(communeSurLaFiche: string | null) {
  const ecritures: Array<Record<string, unknown>> = [];
  return {
    ecritures,
    client: {
      user: {
        findUnique: () =>
          Promise.resolve({
            id: CLIENT_ID,
            email: "client@hotel.test",
            name: "Hôtel du Luberon",
            role: "ROLE_CLIENT",
            communeInsee: communeSurLaFiche,
            postalCode: null,
            city: null,
          }),
        updateMany: (args: { data: Record<string, unknown> }) => {
          ecritures.push(args.data);
          return Promise.resolve({ count: 1 });
        },
      },
      auditLog: { create: () => Promise.resolve({ id: "audit-1" }) },
      operator: { findFirst: () => Promise.resolve({ id: "operator-1" }) },
      refreshToken: { updateMany: () => Promise.resolve({ count: 0 }) },
      emailVerification: { create: () => Promise.resolve({}) },
    },
  };
}

async function buildTestApp(communeSurLaFiche: string | null) {
  const faux = fakePrisma(communeSurLaFiche);
  const app = Fastify();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.decorate("prisma", faux.client as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.decorate("redis", { get: () => Promise.resolve(null) } as any);
  app.decorate("authenticate", async (request: { user?: unknown }) => {
    request.user = { sub: CLIENT_ID, role: "ROLE_CLIENT" };
  });
  // Même branche `AppError` que `buildApp()` : sans elle, le gestionnaire par
  // défaut de Fastify rend un corps sans `details`, et le test ne pourrait pas
  // vérifier que le client reçoit bien la consigne « choisissez votre commune ».
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(error.toJSON());
    }
    throw error;
  });
  await app.register(authRoutes, { prefix: "/api/v1/auth" });
  await app.ready();
  return { app, ecritures: faux.ecritures };
}

describe("PATCH /auth/me — le code postal ne fixe pas le tarif", () => {
  it("REFUSE un code postal seul quand la fiche n'a pas de commune", async () => {
    const { app, ecritures } = await buildTestApp(null);

    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/auth/me",
      payload: { postalCode: "84100" }, // Orange — palier gratuit
    });

    assert.equal(response.statusCode, 400, "un code postal seul doit être refusé");
    assert.equal(ecritures.length, 0, "aucune écriture ne doit atteindre la base");
    assert.match(JSON.stringify(response.json()), /commune/i);
    await app.close();
  });

  it("ACCEPTE le code postal accompagné de sa commune", async () => {
    const { app, ecritures } = await buildTestApp(null);

    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/auth/me",
      payload: { communeInsee: APT_INSEE, postalCode: "84400" },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(ecritures.length, 1);
    assert.equal(
      (ecritures[0] as { communeInsee?: string }).communeInsee,
      APT_INSEE,
      "la commune doit être écrite : c'est elle qui porte le palier",
    );
    await app.close();
  });

  it("ACCEPTE un code postal seul quand la fiche PORTE déjà une commune", async () => {
    // Ici le tarif suit `communeInsee`, pas le code postal : rien à protéger.
    const { app, ecritures } = await buildTestApp(APT_INSEE);

    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/auth/me",
      payload: { postalCode: "84400" },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(ecritures.length, 1);
    await app.close();
  });

  it("laisse passer les champs sans effet tarifaire", async () => {
    const { app } = await buildTestApp(null);

    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/auth/me",
      payload: { phone: "0490000000" },
    });

    assert.equal(response.statusCode, 200);
    await app.close();
  });
});
