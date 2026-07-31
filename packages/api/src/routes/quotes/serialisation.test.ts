/**
 * Sérialisation des réponses de devis.
 *
 * Ces tests passent par `inject()` et LISENT LE CORPS SÉRIALISÉ, pas la valeur
 * de retour du service. C'est le seul niveau où le défaut est visible :
 * fast-json-stringify compile le schéma `response` de la route et SUPPRIME du
 * corps toute propriété non déclarée. Un `data: { type: "object" }` sans
 * `properties` renvoyait donc `{"success":true,"data":{}}` — un devis créé en
 * base, mais un écran d'admin sans `id` ni `numero`, qui naviguait vers
 * `/devis/undefined`. Le service, lui, rendait l'objet complet : un test sur son
 * retour aurait été vert tout du long.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";

import quoteRoutes from "./index.ts";

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const ORDER_ID = "22222222-2222-4222-8222-222222222222";

function fakePrisma(options: { devisDejaEmis?: Record<string, unknown> | null } = {}) {
  const tx = {
    quote: {
      count: () => Promise.resolve(3),
      create: (args: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: "quote-1",
          createdAt: new Date("2026-07-30T10:00:00Z"),
          status: "BROUILLON",
          remisePct: 0,
          livraisonCents: 0,
          livraisonSurDevis: false,
          tvaApplicable: false,
          validiteJours: 30,
          ...args.data,
          lignes: [{ id: "line-1", designation: "Kit Bain", qty: 2, unitCents: 750, position: 0 }],
          user: null,
        }),
      update: () => Promise.resolve({}),
    },
    auditLog: { create: () => Promise.resolve({ id: "audit-1" }) },
  };

  return {
    user: {
      // `getOperatorId` en tête de chaque route, puis `notifyAdmins`.
      findUnique: () => Promise.resolve({ operatorId: "operator-1" }),
      findMany: () => Promise.resolve([]),
    },
    quote: { ...tx.quote, findFirst: () => Promise.resolve(null) },
    auditLog: tx.auditLog,
    notification: { createMany: () => Promise.resolve({ count: 0 }) },
    order: {
      findFirst: () =>
        Promise.resolve({
          id: ORDER_ID,
          orderNumber: "LNG-2026-ABCDEF",
          status: "PENDING",
          userId: "client-1",
          deliveryFeeCents: 0,
          deliveryFeeSurDevis: true,
          specialNotes: null,
          items: [{ quantity: 2, unitCents: 750, product: { name: "Kit Bain" } }],
          user: {
            id: "client-1",
            name: "Hôtel du Parc",
            companyName: null,
            email: "contact@hotel.test",
            phone: null,
            address: null,
          },
          quoteFromOrder: options.devisDejaEmis ?? null,
        }),
    },
    $transaction: (fn: (client: unknown) => Promise<unknown>) => fn(tx),
  };
}

/** Instance Fastify nue : les routes de devis, leur schéma, rien d'autre. */
async function buildTestApp(prisma: ReturnType<typeof fakePrisma>) {
  const app = Fastify();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.decorate("prisma", prisma as any);
  app.decorate("authenticate", async (request: { user?: unknown }) => {
    request.user = { sub: ADMIN_ID, role: "ROLE_ADMIN" };
  });
  await app.register(quoteRoutes, { prefix: "/api/v1/quotes" });
  await app.ready();
  return app;
}

const CORPS_CREATION = {
  clientNom: "Hôtel du Parc",
  lignes: [{ designation: "Kit Bain", qty: 2, unitCents: 750, position: 0 }],
};

describe("POST /quotes — corps sérialisé", () => {
  it("renvoie le devis créé, identifiant et numéro compris", async () => {
    const app = await buildTestApp(fakePrisma());

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/quotes",
      payload: CORPS_CREATION,
    });

    assert.equal(response.statusCode, 201);
    const body = response.json() as { success: boolean; data: Record<string, unknown> };
    assert.equal(body.success, true);
    assert.equal(body.data["id"], "quote-1");
    assert.equal(body.data["numero"], "LSQ-2026-0004");
    // `devis-form.tsx` fait `onSuccess(result.id)` : un `data` vidé le menait
    // vers `/devis/undefined`.
    assert.ok(Array.isArray(body.data["lignes"]), "les lignes ne doivent pas être tronquées");
    assert.ok(body.data["totals"], "les totaux calculés doivent survivre à la sérialisation");

    await app.close();
  });
});

describe("POST /quotes/from-order/:orderId — corps sérialisé", () => {
  it("renvoie 201 et le devis complet à la première émission", async () => {
    const app = await buildTestApp(fakePrisma());

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/quotes/from-order/${ORDER_ID}`,
    });

    assert.equal(response.statusCode, 201);
    const body = response.json() as { data: Record<string, unknown> };
    assert.equal(body.data["id"], "quote-1");
    assert.equal(body.data["numero"], "LSQ-2026-0004");

    await app.close();
  });

  it("renvoie 200 et le devis déjà émis, tout aussi complet", async () => {
    const app = await buildTestApp(
      fakePrisma({
        devisDejaEmis: {
          id: "quote-existant",
          numero: "LSQ-2026-0002",
          createdAt: new Date("2026-07-29T10:00:00Z"),
          validiteJours: 30,
          clientNom: "Hôtel du Parc",
          remisePct: 0,
          livraisonCents: 0,
          livraisonSurDevis: true,
          tvaApplicable: false,
          deletedAt: null,
          lignes: [],
        },
      }),
    );

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/quotes/from-order/${ORDER_ID}`,
    });

    assert.equal(response.statusCode, 200);
    const body = response.json() as { data: Record<string, unknown> };
    assert.equal(body.data["id"], "quote-existant");
    assert.equal(body.data["numero"], "LSQ-2026-0002");

    await app.close();
  });
});
