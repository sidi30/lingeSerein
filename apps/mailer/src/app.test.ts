/**
 * Garde de POST /api/internal/notify.
 *
 * C'est la seule protection de la route : pas de JWT, pas de CORS, juste un
 * secret partagé. Une régression ici l'ouvrirait à tout Internet — d'où le test
 * du cas « secret absent de l'environnement », qui doit répondre 503 et JAMAIS
 * laisser passer.
 *
 * Aucun test ne touche au SMTP : le transport est bouchonné via `buildApp`,
 * donc aucun email réel ne part d'ici.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { buildApp, type MailMessage } from "./app.js";

const SECRET = "secret-interne-de-test";
const FROM = "expediteur@test.fr";

const VALID_BODY = {
  to: "client@test.fr",
  subject: "Votre passage est prévu demain",
  template: "rotation_reminder_client",
  data: {
    clientNom: "Gîte des Oliviers",
    datePassage: "2026-08-03",
    creneau: "08:00-12:00",
    lignes: [{ designation: "Kit Bain", qty: 4 }],
  },
};

interface Harness {
  app: FastifyInstance;
  sent: MailMessage[];
}

/**
 * Monte l'app avec un transport bouchonné, exécute le scénario, puis ferme —
 * et restaure l'environnement, que le test passe ou échoue.
 */
async function withApp(
  envSecret: string | undefined,
  run: (h: Harness) => Promise<void>,
): Promise<void> {
  const previous = process.env.INTERNAL_INTAKE_SECRET;
  if (envSecret === undefined) {
    delete process.env.INTERNAL_INTAKE_SECRET;
  } else {
    process.env.INTERNAL_INTAKE_SECRET = envSecret;
  }

  const sent: MailMessage[] = [];
  const app = await buildApp({
    sendMail: async (message) => {
      sent.push(message);
      return { messageId: "message-de-test" };
    },
    mailFrom: FROM,
  });
  await app.ready();

  try {
    await run({ app, sent });
  } finally {
    await app.close();
    if (previous === undefined) {
      delete process.env.INTERNAL_INTAKE_SECRET;
    } else {
      process.env.INTERNAL_INTAKE_SECRET = previous;
    }
  }
}

function notify(app: FastifyInstance, body: unknown, secret?: string) {
  return app.inject({
    method: "POST",
    url: "/api/internal/notify",
    headers: secret === undefined ? {} : { "x-internal-secret": secret },
    payload: body as Record<string, unknown>,
  });
}

test("503 quand le secret est absent de l'environnement (fail-closed)", async () => {
  await withApp(undefined, async ({ app, sent }) => {
    // Même avec un en-tête « correct » : sans secret configuré, rien ne passe.
    const res = await notify(app, VALID_BODY, "n'importe quoi");
    assert.equal(res.statusCode, 503);
    assert.equal(sent.length, 0, "aucun email ne doit partir");
  });
});

test("401 quand l'en-tête x-internal-secret est absent", async () => {
  await withApp(SECRET, async ({ app, sent }) => {
    const res = await notify(app, VALID_BODY);
    assert.equal(res.statusCode, 401);
    assert.equal(sent.length, 0);
  });
});

test("401 quand le secret est faux", async () => {
  await withApp(SECRET, async ({ app, sent }) => {
    const res = await notify(app, VALID_BODY, "mauvais-secret");
    assert.equal(res.statusCode, 401);
    assert.equal(sent.length, 0);
  });
});

test("401 quand le secret n'est qu'un préfixe du secret attendu", async () => {
  // La comparaison porte sur des empreintes de longueur fixe : une égalité
  // partielle ne doit jamais suffire.
  await withApp(SECRET, async ({ app, sent }) => {
    const res = await notify(app, VALID_BODY, SECRET.slice(0, -1));
    assert.equal(res.statusCode, 401);
    assert.equal(sent.length, 0);
  });
});

test("400 quand le corps porte un champ inconnu (.strict)", async () => {
  await withApp(SECRET, async ({ app, sent }) => {
    const res = await notify(app, { ...VALID_BODY, html: "<b>injection</b>" }, SECRET);
    assert.equal(res.statusCode, 400);
    assert.equal(sent.length, 0, "un champ inconnu ne doit pas atteindre le transport");
  });
});

test("400 quand data porte un champ inconnu", async () => {
  await withApp(SECRET, async ({ app }) => {
    const body = { ...VALID_BODY, data: { ...VALID_BODY.data, adresseIp: "1.2.3.4" } };
    assert.equal((await notify(app, body, SECRET)).statusCode, 400);
  });
});

test("400 quand le template est hors de l'union", async () => {
  await withApp(SECRET, async ({ app }) => {
    const body = { ...VALID_BODY, template: "rotation_inconnu" };
    assert.equal((await notify(app, body, SECRET)).statusCode, 400);
  });
});

test("400 sur un ISO complet au lieu de AAAA-MM-JJ", async () => {
  // Un instant ISO réintroduirait un fuseau dans un champ qui désigne un JOUR :
  // le template rendrait potentiellement la veille.
  await withApp(SECRET, async ({ app }) => {
    const body = {
      ...VALID_BODY,
      data: { ...VALID_BODY.data, datePassage: "2026-08-03T00:00:00.000Z" },
    };
    assert.equal((await notify(app, body, SECRET)).statusCode, 400);
  });
});

test("400 quand le sujet contient un CR/LF (injection d'en-tête)", async () => {
  await withApp(SECRET, async ({ app, sent }) => {
    const body = { ...VALID_BODY, subject: "Rappel\r\nBcc: victime@test.fr" };
    assert.equal((await notify(app, body, SECRET)).statusCode, 400);
    assert.equal(sent.length, 0);
  });
});

test("200 sur payload valide — l'email part avec le bon expéditeur", async () => {
  await withApp(SECRET, async ({ app, sent }) => {
    const res = await notify(app, VALID_BODY, SECRET);

    assert.equal(res.statusCode, 200);
    assert.equal(res.json().messageId, "message-de-test");

    assert.equal(sent.length, 1);
    const message = sent[0]!;
    assert.equal(message.to, "client@test.fr");
    assert.equal(message.subject, "Votre passage est prévu demain");
    assert.ok(message.from.includes(FROM), "expéditeur injecté attendu");
    // Le HTML est bien rendu par le template correspondant.
    assert.ok(message.html.includes("lundi 3 août 2026"), "date rendue attendue");
    assert.ok(message.html.includes("Kit Bain"), "articles rendus attendus");
  });
});

test("502 quand le transport échoue — l'appelant ne doit pas croire l'email parti", async () => {
  // L'API ne marque `reminderSentAt` que sur un 200 : un échec masqué en 200
  // ferait sauter le rappel du client sans que personne ne le voie.
  const previous = process.env.INTERNAL_INTAKE_SECRET;
  process.env.INTERNAL_INTAKE_SECRET = SECRET;

  const app = await buildApp({
    sendMail: async () => {
      throw new Error("SMTP indisponible");
    },
    mailFrom: FROM,
  });
  await app.ready();

  try {
    const res = await notify(app, VALID_BODY, SECRET);
    assert.equal(res.statusCode, 502);
  } finally {
    await app.close();
    if (previous === undefined) {
      delete process.env.INTERNAL_INTAKE_SECRET;
    } else {
      process.env.INTERNAL_INTAKE_SECRET = previous;
    }
  }
});

test("les trois templates de rotation sont acceptés", async () => {
  await withApp(SECRET, async ({ app, sent }) => {
    const bodies = [
      VALID_BODY,
      {
        to: "gestion@test.fr",
        subject: "Passages de demain",
        template: "rotation_reminder_owner",
        data: {
          datePassage: "2026-08-03",
          passages: [
            {
              clientNom: "Gîte",
              formule: "ABONNEMENT",
              lignes: [{ designation: "Kit Lit", qty: 2 }],
            },
          ],
        },
      },
      {
        to: "gestion@test.fr",
        subject: "Linge non restitué",
        template: "rotation_overdue",
        data: {
          clientNom: "Gîte",
          dateReprisePrevue: "2026-08-03",
          joursDeRetard: 5,
          lignes: [{ designation: "Kit Bain", qty: 4 }],
          facturableRemplacement: true,
        },
      },
    ];

    for (const body of bodies) {
      const res = await notify(app, body, SECRET);
      assert.equal(res.statusCode, 200, `template ${body.template} refusé`);
    }
    assert.equal(sent.length, 3);
  });
});

test("les templates de tournée et de commande sont acceptés", async () => {
  await withApp(SECRET, async ({ app, sent }) => {
    const bodies = [
      {
        to: "livreur@test.fr",
        subject: "Une tournée vous est affectée",
        template: "round_assigned_driver",
        data: {
          livreurNom: "Karim",
          datePassage: "2026-08-03",
          stopsCount: 7,
          zone: "Vaucluse Nord",
        },
      },
      {
        to: "client@test.fr",
        subject: "Votre commande LNG-2026-ABCDEF est enregistrée",
        template: "order_confirmation_client",
        data: {
          clientNom: "Hôtel du Parc",
          orderNumber: "LNG-2026-ABCDEF",
          dateLivraison: "2026-08-03",
          creneau: "08:00-12:00",
          lignes: [{ designation: "Kit Bain", qty: 2 }],
          sousTotalCents: 1500,
          livraisonCents: 1200,
          totalCents: 2700,
          livraisonSurDevis: false,
        },
      },
      {
        to: "gestion@test.fr",
        subject: "Nouvelle commande LNG-2026-ABCDEF",
        template: "order_notification_owner",
        data: {
          clientNom: "Hôtel du Parc",
          clientEmail: "contact@hotel.test",
          clientTel: "0490000000",
          clientAdresse: "1 rue des Lices",
          orderNumber: "LNG-2026-ABCDEF",
          dateLivraison: "2026-08-03",
          lignes: [{ designation: "Kit Bain", qty: 2 }],
          sousTotalCents: 1500,
          livraisonCents: 0,
          totalCents: 1500,
          livraisonSurDevis: true,
          source: "MOBILE",
        },
      },
    ];

    for (const body of bodies) {
      const res = await notify(app, body, SECRET);
      assert.equal(res.statusCode, 200, `template ${body.template} refusé`);
    }
    assert.equal(sent.length, 3);
  });
});

test("le gabarit d'affectation refuse un champ de données inconnu", async () => {
  // Le contrat est figé des deux côtés : un champ ajouté côté API sans son
  // pendant ici doit échouer bruyamment plutôt que d'être ignoré en silence.
  await withApp(SECRET, async ({ app, sent }) => {
    const res = await notify(
      app,
      {
        to: "livreur@test.fr",
        subject: "Une tournée vous est affectée",
        template: "round_assigned_driver",
        data: {
          livreurNom: "Karim",
          datePassage: "2026-08-03",
          stopsCount: 7,
          adresses: ["1 rue des Lices"],
        },
      },
      SECRET,
    );
    assert.equal(res.statusCode, 400);
    assert.equal(sent.length, 0);
  });
});

test("le gabarit d'affectation refuse une date non calendaire", async () => {
  await withApp(SECRET, async ({ app }) => {
    const res = await notify(
      app,
      {
        to: "livreur@test.fr",
        subject: "Une tournée vous est affectée",
        template: "round_assigned_driver",
        // ISO complet : réintroduirait un fuseau, donc un jour potentiellement faux.
        data: { livreurNom: "Karim", datePassage: "2026-08-03T00:00:00Z", stopsCount: 7 },
      },
      SECRET,
    );
    assert.equal(res.statusCode, 400);
  });
});

test("/health reste public et ne divulgue rien", async () => {
  await withApp(SECRET, async ({ app }) => {
    const res = await app.inject({ method: "GET", url: "/health" });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { status: "ok" });
  });
});
