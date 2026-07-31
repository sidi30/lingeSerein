/**
 * Cycle de vie d'un jeton push : enregistrement, transfert de propriété,
 * désinscription à la déconnexion.
 *
 * Ces tests passent par `inject()` et non par un appel direct au handler : le
 * corps de la requête doit traverser le schéma JSON de la route, qui est
 * l'endroit où un jeton peut être silencieusement écarté.
 *
 * Ce qui se joue ici n'est pas une fonctionnalité mais une fuite : tant que la
 * désinscription n'existait pas, se déconnecter laissait le jeton attaché au
 * compte. Le téléphone d'un livreur parti de l'entreprise continuait de recevoir
 * ses affectations de tournée — nom du client, adresse, horaires. Le push ne
 * passe pas par l'API : révoquer le refresh token ne l'arrête pas.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";

import notificationRoutes from "./index.ts";
import { AppError } from "../../utils/errors.ts";

const LIVREUR_ID = "11111111-1111-4111-8111-111111111111";
const AUTRE_ID = "22222222-2222-4222-8222-222222222222";
const JETON = "ExponentPushToken[abcdefghijklmnopqrst]";

interface LigneJeton {
  id: string;
  userId: string;
  token: string;
  platform: string;
  lastSeenAt: Date;
}

/**
 * Prisma factice porteur d'un VRAI état : la table est relue entre les appels.
 * Un double vide ne dirait rien du transfert de propriété, qui est précisément
 * le comportement à démontrer.
 */
function fakePrisma(initial: LigneJeton[] = []) {
  const table = [...initial];

  return {
    get lignes() {
      return table;
    },
    client: {
      deviceToken: {
        upsert: ({
          where,
          create,
          update,
        }: {
          where: { token: string };
          create: { userId: string; token: string; platform: string };
          update: { userId: string; platform: string; lastSeenAt: Date };
        }) => {
          const existante = table.find((l) => l.token === where.token);
          if (existante) {
            existante.userId = update.userId;
            existante.platform = update.platform;
            existante.lastSeenAt = update.lastSeenAt;
            return Promise.resolve(existante);
          }
          const ligne: LigneJeton = { id: "device-1", lastSeenAt: new Date(), ...create };
          table.push(ligne);
          return Promise.resolve(ligne);
        },
        deleteMany: ({ where }: { where: { token: string; userId: string } }) => {
          let count = 0;
          for (let i = table.length - 1; i >= 0; i--) {
            const ligne = table[i];
            if (ligne && ligne.token === where.token && ligne.userId === where.userId) {
              table.splice(i, 1);
              count++;
            }
          }
          return Promise.resolve({ count });
        },
      },
    },
  };
}

/** Instance nue : les routes de notifications, leur schéma, rien d'autre. */
async function buildTestApp(faux: ReturnType<typeof fakePrisma>, userId = LIVREUR_ID) {
  const app = Fastify();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.decorate("prisma", faux.client as any);
  app.decorate("authenticate", async (request: { user?: unknown }) => {
    request.user = { sub: userId, role: "ROLE_LIVREUR" };
  });
  // Même branche `AppError` que `buildApp()`, sans quoi une ValidationError
  // ressortirait en 500 et le test ne distinguerait plus un refus d'un bug.
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(error.toJSON());
    }
    throw error;
  });
  await app.register(notificationRoutes, { prefix: "/api/v1/notifications" });
  await app.ready();
  return app;
}

describe("POST /notifications/device-token", () => {
  it("enregistre le jeton de l'appareil", async () => {
    const faux = fakePrisma();
    const app = await buildTestApp(faux);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/notifications/device-token",
      payload: { token: JETON, platform: "ios" },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(faux.lignes.length, 1);
    assert.equal(faux.lignes[0]?.userId, LIVREUR_ID);

    await app.close();
  });

  it("normalise la casse de la plateforme", async () => {
    // Le mobile envoie `Platform.OS`, tantôt « iOS » tantôt « ios » selon la
    // source : sans normalisation, deux lignes pour un seul appareil.
    const faux = fakePrisma();
    const app = await buildTestApp(faux);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/notifications/device-token",
      payload: { token: JETON, platform: "iOS" },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(faux.lignes[0]?.platform, "ios");

    await app.close();
  });

  it("TRANSFÈRE le jeton au nouveau compte plutôt que d'ajouter une ligne", async () => {
    // Téléphone revendu ou réinstallation sous un autre compte : Expo réattribue
    // le même jeton. Un upsert sur (userId, token) créerait une seconde ligne et
    // l'ancien propriétaire continuerait de recevoir les notifications du nouveau.
    const faux = fakePrisma([
      {
        id: "device-1",
        userId: AUTRE_ID,
        token: JETON,
        platform: "ios",
        lastSeenAt: new Date(2026, 0, 1),
      },
    ]);
    const app = await buildTestApp(faux);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/notifications/device-token",
      payload: { token: JETON, platform: "ios" },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(faux.lignes.length, 1, "une seule ligne pour un seul appareil");
    assert.equal(faux.lignes[0]?.userId, LIVREUR_ID, "la propriété doit passer au dernier inscrit");

    await app.close();
  });

  it("refuse une plateforme inconnue", async () => {
    const app = await buildTestApp(fakePrisma());

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/notifications/device-token",
      payload: { token: JETON, platform: "windows-phone" },
    });

    assert.equal(response.statusCode, 400);

    await app.close();
  });
});

describe("DELETE /notifications/device-token", () => {
  it("supprime le jeton de l'appareil à la déconnexion", async () => {
    const faux = fakePrisma([
      {
        id: "device-1",
        userId: LIVREUR_ID,
        token: JETON,
        platform: "ios",
        lastSeenAt: new Date(),
      },
    ]);
    const app = await buildTestApp(faux);

    const response = await app.inject({
      method: "DELETE",
      url: "/api/v1/notifications/device-token",
      payload: { token: JETON },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json() as { success: boolean; data: { supprime: number } };
    assert.equal(body.success, true);
    assert.equal(body.data.supprime, 1);
    assert.equal(faux.lignes.length, 0, "l'appareil ne doit plus rien recevoir");

    await app.close();
  });

  it("NE TOUCHE PAS au jeton d'un autre utilisateur", async () => {
    // `token` est unique globalement : un `deleteMany` sur le seul jeton
    // laisserait n'importe quel compte authentifié éteindre le push d'un
    // appareil tiers, en rejouant un jeton observé. Coupure silencieuse, donc
    // indétectable pour la victime.
    const faux = fakePrisma([
      { id: "device-1", userId: AUTRE_ID, token: JETON, platform: "ios", lastSeenAt: new Date() },
    ]);
    const app = await buildTestApp(faux);

    const response = await app.inject({
      method: "DELETE",
      url: "/api/v1/notifications/device-token",
      payload: { token: JETON },
    });

    assert.equal(response.statusCode, 200);
    assert.equal((response.json() as { data: { supprime: number } }).data.supprime, 0);
    assert.equal(faux.lignes.length, 1, "le jeton du tiers doit survivre");
    assert.equal(faux.lignes[0]?.userId, AUTRE_ID);

    await app.close();
  });

  it("reste idempotent sur un jeton déjà absent", async () => {
    // Double appel, purge des 90 jours passée par là, réinstallation : une
    // déconnexion ne doit pas échouer parce que le nettoyage a déjà eu lieu.
    const app = await buildTestApp(fakePrisma());

    const response = await app.inject({
      method: "DELETE",
      url: "/api/v1/notifications/device-token",
      payload: { token: JETON },
    });

    assert.equal(response.statusCode, 200);
    assert.equal((response.json() as { data: { supprime: number } }).data.supprime, 0);

    await app.close();
  });

  it("refuse un corps sans jeton", async () => {
    const app = await buildTestApp(fakePrisma());

    const response = await app.inject({
      method: "DELETE",
      url: "/api/v1/notifications/device-token",
      payload: {},
    });

    assert.equal(response.statusCode, 400);

    await app.close();
  });
});
