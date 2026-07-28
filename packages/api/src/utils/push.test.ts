/**
 * Client Expo Push — découpage en lots et traitement des verdicts.
 *
 * Ce qui est réellement testé ici, c'est la propriété qui coûte cher si elle est
 * fausse : un jeton n'est supprimé QUE lorsqu'Expo le déclare définitivement
 * mort. Supprimer sur une erreur passagère (quota, message trop gros, panne
 * réseau) couperait le push d'un appareil vivant, en silence et sans retour
 * possible — l'utilisateur devrait réinstaller l'application pour s'en rendre
 * compte.
 *
 * `fetch` est remplacé par un double : aucun appel ne sort de la machine.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { sendExpoPush, type PushMessage } from "./push.ts";

// ---------------------------------------------------------------------------
// Double de `fetch` — enregistre les lots réellement envoyés à Expo.
// ---------------------------------------------------------------------------

interface AppelExpo {
  messages: PushMessage[];
  headers: Record<string, string>;
}

/** Réponse HTTP simulée pour un lot donné. */
interface ReponseSimulee {
  status?: number;
  body?: unknown;
  /** Simule une panne réseau / un abandon plutôt qu'une réponse. */
  throws?: Error;
}

const vraiFetch = globalThis.fetch;
let appels: AppelExpo[] = [];

function simuler(reponse: (lot: PushMessage[], index: number) => ReponseSimulee): void {
  globalThis.fetch = (async (_url: unknown, init?: { body?: string; headers?: unknown }) => {
    const messages = JSON.parse(String(init?.body ?? "[]")) as PushMessage[];
    appels.push({ messages, headers: (init?.headers ?? {}) as Record<string, string> });

    const simulee = reponse(messages, appels.length - 1);
    if (simulee.throws) throw simulee.throws;

    const status = simulee.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => simulee.body ?? {},
      text: async () => JSON.stringify(simulee.body ?? {}),
    };
  }) as unknown as typeof fetch;
}

/** Réponse « tout est passé » : un ticket ok par message du lot. */
function toutOk(lot: PushMessage[]): ReponseSimulee {
  return { body: { data: lot.map((_, i) => ({ status: "ok", id: `ticket-${i}` })) } };
}

function jeton(n: number): string {
  return `ExponentPushToken[appareil-${n}]`;
}

function message(to: string, over: Partial<PushMessage> = {}): PushMessage {
  return { to, title: "Reprise demain", body: "Préparez votre linge", ...over };
}

beforeEach(() => {
  appels = [];
  delete process.env["EXPO_ACCESS_TOKEN"];
});

afterEach(() => {
  globalThis.fetch = vraiFetch;
});

// ---------------------------------------------------------------------------

describe("découpage en lots", () => {
  it("n'appelle pas Expo quand il n'y a rien à envoyer", async () => {
    simuler(toutOk);
    const result = await sendExpoPush([]);
    assert.equal(appels.length, 0);
    assert.equal(result.envoyes, 0);
  });

  it("envoie 100 jetons en un seul appel", async () => {
    simuler(toutOk);
    const result = await sendExpoPush(Array.from({ length: 100 }, (_, i) => message(jeton(i))));

    assert.equal(appels.length, 1, "100 messages tiennent dans un lot");
    assert.equal(appels[0]?.messages.length, 100);
    assert.equal(result.envoyes, 100);
  });

  it("découpe 250 jetons en lots de 100, 100 et 50", async () => {
    simuler(toutOk);
    const result = await sendExpoPush(Array.from({ length: 250 }, (_, i) => message(jeton(i))));

    assert.equal(appels.length, 3, "un appel par lot, jamais un appel par jeton");
    assert.deepEqual(
      appels.map((a) => a.messages.length),
      [100, 100, 50],
    );
    assert.equal(result.envoyes, 250);
  });

  it("n'oublie aucun jeton et respecte l'ordre d'origine", async () => {
    simuler(toutOk);
    await sendExpoPush(Array.from({ length: 101 }, (_, i) => message(jeton(i))));

    const envoyes = appels.flatMap((a) => a.messages.map((m) => m.to));
    assert.equal(envoyes.length, 101);
    assert.equal(envoyes[0], jeton(0));
    assert.equal(envoyes[100], jeton(100));
  });
});

describe("jetons morts — suppression", () => {
  it("remonte le jeton visé par DeviceNotRegistered", async () => {
    simuler((lot) => ({
      body: {
        data: lot.map((m) =>
          m.to === jeton(1)
            ? {
                status: "error",
                message: "not registered",
                details: { error: "DeviceNotRegistered" },
              }
            : { status: "ok", id: "t" },
        ),
      },
    }));

    const result = await sendExpoPush([0, 1, 2].map((i) => message(jeton(i))));

    assert.deepEqual(result.jetonsMorts, [jeton(1)]);
    assert.equal(result.envoyes, 2);
  });

  it("associe le bon jeton même dans le second lot (alignement positionnel)", async () => {
    // Expo ne réémet pas l'adresse : le seul lien ticket → jeton est la position
    // dans le lot. Une erreur d'indexation supprimerait un jeton innocent.
    simuler((lot) => ({
      body: {
        data: lot.map((m) =>
          m.to === jeton(142)
            ? { status: "error", details: { error: "DeviceNotRegistered" } }
            : { status: "ok", id: "t" },
        ),
      },
    }));

    const result = await sendExpoPush(Array.from({ length: 200 }, (_, i) => message(jeton(i))));

    assert.deepEqual(result.jetonsMorts, [jeton(142)]);
    assert.equal(result.envoyes, 199);
  });

  it("traite un jeton au format invalide comme mort, sans l'envoyer à Expo", async () => {
    simuler(toutOk);
    const result = await sendExpoPush([message("pas-un-jeton-expo"), message(jeton(1))]);

    assert.deepEqual(result.jetonsMorts, ["pas-un-jeton-expo"]);
    assert.equal(appels[0]?.messages.length, 1, "le jeton invalide ne part pas");
    assert.equal(appels[0]?.messages[0]?.to, jeton(1));
  });

  it("accepte les deux formes de jeton Expo", async () => {
    simuler(toutOk);
    const result = await sendExpoPush([
      message("ExponentPushToken[aaa]"),
      message("ExpoPushToken[bbb]"),
    ]);

    assert.deepEqual(result.jetonsMorts, []);
    assert.equal(result.envoyes, 2);
  });
});

describe("erreurs qui ne condamnent PAS le jeton", () => {
  const nonFatales = ["MessageTooBig", "MessageRateExceeded", "InvalidCredentials"];

  for (const code of nonFatales) {
    it(`ne supprime rien sur ${code}`, async () => {
      simuler((lot) => ({
        body: {
          data: lot.map(() => ({ status: "error", message: code, details: { error: code } })),
        },
      }));

      const result = await sendExpoPush([message(jeton(1))]);

      assert.deepEqual(result.jetonsMorts, [], `${code} est passager, le jeton reste valide`);
      assert.equal(result.erreurs.length, 1);
      assert.match(result.erreurs[0] ?? "", new RegExp(code));
    });
  }

  it("ne supprime rien sur un HTTP 429 (quota Expo dépassé)", async () => {
    simuler(() => ({ status: 429, body: { error: "rate limited" } }));

    const result = await sendExpoPush([message(jeton(1)), message(jeton(2))]);

    assert.deepEqual(result.jetonsMorts, []);
    assert.equal(result.envoyes, 0);
    assert.match(result.erreurs[0] ?? "", /429/);
  });

  it("ne supprime rien quand Expo refuse le lot entier", async () => {
    simuler(() => ({
      body: { errors: [{ code: "PUSH_TOO_MANY_EXPERIENCE_IDS", message: "trop d'apps" }] },
    }));

    const result = await sendExpoPush([message(jeton(1))]);

    assert.deepEqual(result.jetonsMorts, []);
    assert.equal(result.erreurs.length, 1);
  });

  it("ne supprime rien sur une réponse illisible", async () => {
    simuler(() => ({ body: { data: "pas un tableau" } }));

    const result = await sendExpoPush([message(jeton(1))]);

    assert.deepEqual(result.jetonsMorts, []);
    assert.equal(result.erreurs.length, 1);
  });
});

describe("robustesse — ne lève jamais", () => {
  it("absorbe une panne réseau", async () => {
    simuler(() => ({ throws: new Error("ECONNREFUSED") }));

    const result = await sendExpoPush([message(jeton(1))]);

    assert.equal(result.envoyes, 0);
    assert.match(result.erreurs[0] ?? "", /ECONNREFUSED/);
  });

  it("poursuit les lots suivants malgré l'échec du premier", async () => {
    // Un lot perdu ne doit pas condamner les 150 destinataires suivants.
    simuler((lot, index) => (index === 0 ? { throws: new Error("panne réseau") } : toutOk(lot)));

    const result = await sendExpoPush(Array.from({ length: 250 }, (_, i) => message(jeton(i))));

    assert.equal(appels.length, 3);
    assert.equal(result.envoyes, 150, "les lots 2 et 3 passent quand même");
    assert.equal(result.erreurs.length, 1);
  });
});

describe("EXPO_ACCESS_TOKEN", () => {
  it("envoie l'en-tête Authorization quand la variable est posée", async () => {
    process.env["EXPO_ACCESS_TOKEN"] = "secret-expo";
    simuler(toutOk);
    await sendExpoPush([message(jeton(1))]);

    assert.equal(appels[0]?.headers["authorization"], "Bearer secret-expo");
  });

  it("envoie quand même sans la variable (elle est optionnelle)", async () => {
    simuler(toutOk);
    const result = await sendExpoPush([message(jeton(1))]);

    assert.equal(appels[0]?.headers["authorization"], undefined);
    assert.equal(result.envoyes, 1);
  });
});
