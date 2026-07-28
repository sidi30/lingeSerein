/**
 * Distribution push d'une notification (`notify` → `deliverPush`).
 *
 * Trois propriétés valent d'être tenues sous test, parce que leur violation est
 * invisible en production :
 *   1. `notification.data` arrive INTACT dans le message push — c'est lui qui
 *      ouvre le bon écran au tap. Vidé, la notification n'ouvre rien et personne
 *      ne s'en plaint : l'utilisateur croit juste que l'application est lente ;
 *   2. un jeton mort est supprimé, un jeton en erreur passagère est conservé ;
 *   3. l'échec du push ne remonte JAMAIS — un cron de rotation qui a fait son
 *      travail ne doit pas être marqué en échec parce qu'Expo tousse.
 *
 * Faux Prisma en mémoire et `fetch` doublé : ni base, ni Redis, ni réseau.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { notify } from "./notify.ts";
import type { PushMessage } from "./push.ts";
import { JOB_PUSH, setPushQueue } from "../jobs/push-queue.ts";

// ---------------------------------------------------------------------------
// Double de `fetch`
// ---------------------------------------------------------------------------

const vraiFetch = globalThis.fetch;
let lotsEnvoyes: PushMessage[][] = [];

/** Par défaut Expo accepte tout ; `verdict` permet de refuser un jeton précis. */
function simulerExpo(
  verdict: (m: PushMessage) => Record<string, unknown> = () => ({
    status: "ok",
    id: "t",
  }),
): void {
  globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
    const lot = JSON.parse(String(init?.body ?? "[]")) as PushMessage[];
    lotsEnvoyes.push(lot);
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: lot.map(verdict) }),
      text: async () => "",
    };
  }) as unknown as typeof fetch;
}

function simulerPanneExpo(): void {
  globalThis.fetch = (async () => {
    throw new Error("Expo injoignable");
  }) as unknown as typeof fetch;
}

// ---------------------------------------------------------------------------
// Faux Prisma — uniquement les formes de requête utilisées par `notify`.
// ---------------------------------------------------------------------------

interface FakeToken {
  token: string;
  userId: string;
}

function createFakePrisma(
  tokens: FakeToken[],
  setting: { enabled: boolean; channel: string } | null = null,
) {
  const notifications: Record<string, unknown>[] = [];
  const restants = [...tokens];

  return {
    notifications,
    get tokensRestants() {
      return restants.map((t) => t.token);
    },
    notificationSetting: {
      findUnique: async () => setting,
    },
    notification: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const created = { ...data, id: `notif-${notifications.length + 1}` };
        notifications.push(created);
        return created;
      },
      count: async () => notifications.filter((n) => !n["readAt"]).length,
    },
    deviceToken: {
      findMany: async ({ where }: { where: { userId: string } }) =>
        restants.filter((t) => t.userId === where.userId).map((t) => ({ token: t.token })),
      deleteMany: async ({ where }: { where: { token: { in: string[] } } }) => {
        let count = 0;
        for (let i = restants.length - 1; i >= 0; i--) {
          if (where.token.in.includes(restants[i]?.token ?? "")) {
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

const JETON_A = "ExponentPushToken[appareil-a]";
const JETON_B = "ExponentPushToken[appareil-b]";

const RAPPEL = {
  userId: "user-1",
  type: "ROTATION_REMINDER" as const,
  channel: "BOTH" as const,
  title: "Reprise de votre linge demain",
  body: "Merci de préparer le linge sale.",
  data: { type: "ROTATION_REMINDER", rotationId: "rot-42", dateReprisePrevue: "2026-07-15" },
};

beforeEach(() => {
  lotsEnvoyes = [];
  delete process.env["EXPO_ACCESS_TOKEN"];
});

afterEach(() => {
  globalThis.fetch = vraiFetch;
});

// ---------------------------------------------------------------------------

describe("charge utile du deep-link", () => {
  it("transmet notification.data tel quel dans le message push", async () => {
    simulerExpo();
    const fake = createFakePrisma([{ token: JETON_A, userId: "user-1" }]);

    await notify(asPrisma(fake), RAPPEL);

    const envoye = lotsEnvoyes[0]?.[0];
    assert.ok(envoye, "un message doit partir");
    assert.deepEqual(
      envoye.data,
      RAPPEL.data,
      "sans data intact, le tap sur la notification n'ouvre aucun écran",
    );
    assert.equal(envoye.title, RAPPEL.title);
    assert.equal(envoye.body, RAPPEL.body);
  });

  it("envoie sur tous les appareils de l'utilisateur", async () => {
    simulerExpo();
    const fake = createFakePrisma([
      { token: JETON_A, userId: "user-1" },
      { token: JETON_B, userId: "user-1" },
      { token: "ExponentPushToken[autre-user]", userId: "user-2" },
    ]);

    await notify(asPrisma(fake), RAPPEL);

    assert.deepEqual(
      lotsEnvoyes[0]?.map((m) => m.to),
      [JETON_A, JETON_B],
    );
  });

  it("cible le canal Android déclaré par le mobile", async () => {
    simulerExpo();
    const fake = createFakePrisma([{ token: JETON_A, userId: "user-1" }]);

    await notify(asPrisma(fake), RAPPEL);

    assert.equal(lotsEnvoyes[0]?.[0]?.channelId, "default");
  });

  it("n'appelle pas Expo quand l'utilisateur n'a aucun appareil", async () => {
    simulerExpo();
    const fake = createFakePrisma([]);

    const result = await notify(asPrisma(fake), RAPPEL);

    assert.equal(lotsEnvoyes.length, 0);
    assert.ok(result.notificationId, "la notification in-app est créée malgré tout");
  });
});

describe("préférences utilisateur", () => {
  it("n'envoie aucun push quand le canal retenu est EMAIL", async () => {
    simulerExpo();
    const fake = createFakePrisma([{ token: JETON_A, userId: "user-1" }], {
      enabled: true,
      channel: "EMAIL",
    });

    const result = await notify(asPrisma(fake), RAPPEL);

    assert.equal(lotsEnvoyes.length, 0, "la préférence prime sur le canal demandé");
    assert.ok(result.notificationId);
  });

  it("ne crée ni notification ni push quand le type est désactivé", async () => {
    simulerExpo();
    const fake = createFakePrisma([{ token: JETON_A, userId: "user-1" }], {
      enabled: false,
      channel: "BOTH",
    });

    const result = await notify(asPrisma(fake), RAPPEL);

    assert.equal(result.skipped, true);
    assert.equal(result.notificationId, null);
    assert.equal(lotsEnvoyes.length, 0);
    assert.equal(fake.notifications.length, 0);
  });
});

describe("cycle de vie des jetons", () => {
  it("supprime le jeton signalé DeviceNotRegistered et garde l'autre", async () => {
    simulerExpo((m) =>
      m.to === JETON_A
        ? { status: "error", message: "not registered", details: { error: "DeviceNotRegistered" } }
        : { status: "ok", id: "t" },
    );
    const fake = createFakePrisma([
      { token: JETON_A, userId: "user-1" },
      { token: JETON_B, userId: "user-1" },
    ]);

    await notify(asPrisma(fake), RAPPEL);

    assert.deepEqual(
      fake.tokensRestants,
      [JETON_B],
      "un jeton mort non supprimé fait grossir la table indéfiniment",
    );
  });

  it("ne supprime aucun jeton sur une erreur passagère", async () => {
    simulerExpo(() => ({
      status: "error",
      message: "trop gros",
      details: { error: "MessageTooBig" },
    }));
    const fake = createFakePrisma([
      { token: JETON_A, userId: "user-1" },
      { token: JETON_B, userId: "user-1" },
    ]);

    await notify(asPrisma(fake), RAPPEL);

    assert.deepEqual(
      fake.tokensRestants,
      [JETON_A, JETON_B],
      "supprimer ici couperait le push d'appareils vivants",
    );
  });

  it("ne supprime aucun jeton quand Expo est injoignable", async () => {
    simulerPanneExpo();
    const fake = createFakePrisma([{ token: JETON_A, userId: "user-1" }]);

    await notify(asPrisma(fake), RAPPEL);

    assert.deepEqual(fake.tokensRestants, [JETON_A]);
  });
});

describe("l'échec du push ne remonte jamais", () => {
  it("crée la notification in-app malgré une panne Expo", async () => {
    simulerPanneExpo();
    const fake = createFakePrisma([{ token: JETON_A, userId: "user-1" }]);

    const result = await notify(asPrisma(fake), RAPPEL);

    assert.ok(result.notificationId, "la notification en base ne dépend pas du push");
    assert.equal(result.skipped, false);
    assert.equal(fake.notifications.length, 1);
  });

  it("ne lève pas quand la lecture des jetons échoue en base", async () => {
    simulerExpo();
    const fake = createFakePrisma([{ token: JETON_A, userId: "user-1" }]);
    fake.deviceToken.findMany = async () => {
      throw new Error("connexion Postgres perdue");
    };

    // Un cron de rotation appelle `notify` en boucle : une exception ici ferait
    // échouer le job entier et priverait de rappel tous les clients suivants.
    const result = await notify(asPrisma(fake), RAPPEL);

    assert.ok(result.notificationId);
  });

  it("ne lève pas quand la suppression des jetons morts échoue", async () => {
    simulerExpo(() => ({ status: "error", details: { error: "DeviceNotRegistered" } }));
    const fake = createFakePrisma([{ token: JETON_A, userId: "user-1" }]);
    fake.deviceToken.deleteMany = async () => {
      throw new Error("deadlock");
    };

    const result = await notify(asPrisma(fake), RAPPEL);

    assert.ok(result.notificationId);
  });
});

describe("le push ne bloque plus la requête", () => {
  it("délègue à la file quand elle est enregistrée, sans joindre Expo", async () => {
    // Le cœur du correctif : joindre Expo peut prendre jusqu'à 10 s (son
    // timeout). Fait dans le fil de la requête, un `POST /orders` restait pendu
    // d'autant, alors que la commande était écrite depuis longtemps.
    const jobs: { nom: string; data: unknown }[] = [];
    setPushQueue({
      add: (nom: string, data: unknown) => {
        jobs.push({ nom, data });
        return Promise.resolve({ id: "job-1" });
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    simulerPanneExpo(); // si le push partait ici, l'appel lèverait

    const fake = createFakePrisma([{ token: JETON_A, userId: "user-1" }]);
    const resultat = await notify(asPrisma(fake), RAPPEL);

    setPushQueue(null);

    // La notification est écrite tout de suite : le badge bouge sans attendre.
    assert.ok(resultat.notificationId);
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0]?.nom, JOB_PUSH);
    assert.deepEqual(jobs[0]?.data, { notificationId: resultat.notificationId });
    // Aucun appel réseau : c'est le worker qui s'en chargera.
    assert.equal(lotsEnvoyes.length, 0);
  });

  it("retombe sur l'envoi direct quand aucune file n'est enregistrée", async () => {
    // Tests, scripts, seed : pas de Redis, donc comportement d'avant.
    setPushQueue(null);
    simulerExpo();

    const fake = createFakePrisma([{ token: JETON_A, userId: "user-1" }]);
    await notify(asPrisma(fake), RAPPEL);

    assert.equal(lotsEnvoyes.length, 1);
  });
});
