/**
 * Frais de livraison et emails de commande.
 *
 * Deux propriétés sont vérifiées ici, et aucune des deux n'existait :
 *
 *  1. une commande PORTE ses frais de livraison, calculés par la seule source de
 *     vérité (`computeDeliveryFee` de `@lingengo/shared`). Auparavant elle ne
 *     portait que le sous-total des articles : la livraison n'était facturée
 *     nulle part, et « hors zone » se confondait avec « offerte » ;
 *
 *  2. l'email ne peut PAS faire échouer la commande. Un mailer à terre, un client
 *     sans adresse, une panne au milieu de la lecture des gestionnaires : la
 *     commande reste enregistrée et renvoyée. C'est l'inverse qui serait grave —
 *     perdre un engagement pris parce qu'un accessoire n'a pas fonctionné.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { OrdersService, zoneTarifaire, resumeFrais } from "./orders.service.ts";
import type { SendMailInput } from "../utils/mailer.ts";

const CLIENT_ID = "client-1";
const ADMIN_ID = "admin-1";

/** Date de livraison à J+`jours`, au format attendu par le schéma (AAAA-MM-JJ). */
function dansNJours(jours: number): string {
  const d = new Date();
  d.setDate(d.getDate() + jours);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const j = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${j}`;
}

const KIT_BAIN = { id: "prod-kit", name: "Kit Bain", kind: "KIT", priceCents: 750 };
const SERVIETTE = { id: "prod-serviette", name: "Serviette", kind: "ARTICLE", priceCents: 450 };

interface OptionsFake {
  /** Fiche client renvoyée par la lecture unique de `create`. */
  client?: Record<string, unknown> | null;
  admins?: { id: string; email: string | null }[];
  /** Commande renvoyée par `getById`. */
  commande?: Record<string, unknown>;
  /** Commandes renvoyées par `list()`. */
  liste?: Record<string, unknown>[];
}

function fakePrisma(options: OptionsFake = {}) {
  const commandes: Record<string, unknown>[] = [];
  const audits: { changes: Record<string, unknown> }[] = [];

  const client =
    options.client === undefined
      ? {
          name: "Hôtel du Parc",
          companyName: null,
          email: "contact@hotel.test",
          phone: "0490000000",
          address: "1 rue des Lices",
          postalCode: "84100",
          // Uchaux — commune du palier PROCHE (jusqu'à 15 km d'Orange). Elle
          // porte le MÊME code postal qu'Orange : c'est la commune qui décide
          // du palier, jamais le code postal que le client saisit lui-même.
          communeInsee: "84135",
        }
      : options.client;

  const admins = options.admins ?? [{ id: ADMIN_ID, email: "gestion@lingeserein.test" }];

  return {
    commandes,
    audits,
    client: {
      product: {
        // Filtré comme le ferait Prisma : le service compare le nombre de
        // produits trouvés au nombre d'identifiants DISTINCTS demandés.
        findMany: (args: { where: { id: { in: string[] } } }) =>
          Promise.resolve([KIT_BAIN, SERVIETTE].filter((p) => args.where.id.in.includes(p.id))),
      },
      user: {
        findUnique: () => Promise.resolve(client),
        findMany: () => Promise.resolve(admins),
      },
      order: {
        create: (args: { data: Record<string, unknown> }) => {
          commandes.push(args.data);
          return Promise.resolve({ id: "order-1", ...args.data });
        },
        findFirst: () =>
          Promise.resolve({
            id: "order-1",
            deliveryFeeCents: 1200,
            deliveryFeeSurDevis: false,
            quote: null,
            quoteFromOrder: null,
            ...options.commande,
          }),
        findMany: () => Promise.resolve(options.liste ?? []),
        count: () => Promise.resolve((options.liste ?? []).length),
      },
      auditLog: {
        create: (args: { data: { changes: Record<string, unknown> } }) => {
          audits.push(args.data);
          return Promise.resolve({ id: "audit-1" });
        },
        findMany: () => Promise.resolve([]),
      },
      notification: { createMany: () => Promise.resolve({ count: admins.length }) },
      // Aucune préférence enregistrée ⇒ l'email est autorisé (cf. emailAutorise).
      // `findMany` : lecture en LOT des préférences des gestionnaires, une seule
      // requête pour tous au lieu d'un `findUnique` par admin.
      notificationSetting: {
        findUnique: () => Promise.resolve(null),
        findMany: () => Promise.resolve([]),
      },
    },
  };
}

/** Collecte les envois au lieu de joindre le mailer. */
function collecteur() {
  const envois: SendMailInput[] = [];
  return {
    envois,
    sendMail: (input: SendMailInput) => {
      envois.push(input);
      return Promise.resolve({ ok: true });
    },
  };
}

function commande(items: { productId: string; quantity: number }[], jours = 3) {
  return { items, deliveryDate: dansNJours(jours) };
}

describe("zoneTarifaire", () => {
  // Codes INSEE réels de la table `packages/shared/src/vaucluse.ts` :
  // Orange (84087, palier ORANGE) et Uchaux (84135, palier PROCHE) partagent le
  // MÊME code postal, 84100. C'est tout l'intérêt de la commune.
  const ORANGE_INSEE = "84087";
  const UCHAUX_INSEE = "84135";

  it("retient le palier de la COMMUNE quand le code INSEE est connu", () => {
    assert.equal(zoneTarifaire({ communeInsee: ORANGE_INSEE }), "ORANGE");
    assert.equal(zoneTarifaire({ communeInsee: UCHAUX_INSEE }), "PROCHE");
  });

  it("ne se laisse pas déplacer par un code postal auto-déclaré", () => {
    // `postalCode` est écrit par le client depuis `PATCH /auth/me` ; le code
    // INSEE, lui, est choisi dans une liste fermée. Un client d'Uchaux qui
    // déclare 84100 ne s'achète pas le tarif d'Orange.
    assert.equal(
      zoneTarifaire({ communeInsee: UCHAUX_INSEE, postalCode: "84100" }),
      "PROCHE",
      "la commune doit primer sur le code postal",
    );
  });

  it("replie sur le code postal pour les fiches antérieures à la liste fermée", () => {
    // 84100 désigne Orange ET Uchaux : le repli retient le palier le MOINS CHER,
    // pour ne pas facturer un client sur une ambiguïté qui n'est pas la sienne.
    assert.equal(zoneTarifaire({ postalCode: "84100" }), "ORANGE");
    assert.equal(zoneTarifaire({ postalCode: "84200" }), "INTERMEDIAIRE");
  });

  it("classe HORS_ZONE hors du Vaucluse et sur une fiche muette", () => {
    // Aucun tarif n'est publié hors du département : le deviner reviendrait à
    // inventer un prix.
    assert.equal(zoneTarifaire({ communeInsee: "13055" }), "HORS_ZONE", "Marseille");
    assert.equal(zoneTarifaire({ postalCode: "13000" }), "HORS_ZONE");
    assert.equal(zoneTarifaire({ postalCode: null }), "HORS_ZONE");
    assert.equal(zoneTarifaire({}), "HORS_ZONE");
  });
});

describe("resumeFrais", () => {
  it("ne dit jamais « offerte » quand les frais sont à chiffrer", () => {
    const surDevis = resumeFrais({ deliveryFeeCents: 0, deliveryFeeSurDevis: true });
    assert.equal(surDevis.surDevis, true);
    assert.match(surDevis.label, /sur devis/i);

    const offerte = resumeFrais({ deliveryFeeCents: 0, deliveryFeeSurDevis: false });
    assert.match(offerte.label, /offerte/i);
  });
});

describe("OrdersService.create — frais de livraison", () => {
  it("facture 12 € en zone proche sous le seuil de gratuité", async () => {
    const fake = fakePrisma();
    const mail = collecteur();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new OrdersService(fake.client as any, { sendMail: mail.sendMail });

    const order = await service.create(
      commande([{ productId: KIT_BAIN.id, quantity: 2 }]),
      CLIENT_ID,
      CLIENT_ID,
    );

    assert.equal(order.deliveryFeeCents, 1200);
    assert.equal(order.deliveryFeeSurDevis, false);
    // Le sous-total des ARTICLES reste intact : des écrans le lisent comme tel.
    assert.equal(order.totalCents, 1500);
    assert.equal(fake.commandes[0]?.["deliveryFeeCents"], 1200);
  });

  it("offre la livraison dès 120 € de commande", async () => {
    const fake = fakePrisma();
    const mail = collecteur();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new OrdersService(fake.client as any, { sendMail: mail.sendMail });

    const order = await service.create(
      commande([{ productId: KIT_BAIN.id, quantity: 20 }]), // 150 €
      CLIENT_ID,
      CLIENT_ID,
    );

    assert.equal(order.deliveryFeeCents, 0);
    assert.equal(order.deliveryFeeSurDevis, false);
  });

  it("ne facture jamais la livraison à Orange, même sous le seuil de gratuité", async () => {
    const fake = fakePrisma({
      client: {
        name: "Gîte du Rhône",
        companyName: null,
        email: null,
        phone: null,
        address: null,
        postalCode: "84100",
        communeInsee: "84087", // Orange — commune du siège, livraison incluse
      },
    });
    const mail = collecteur();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new OrdersService(fake.client as any, { sendMail: mail.sendMail });

    const order = await service.create(
      commande([{ productId: KIT_BAIN.id, quantity: 4 }]), // 30 €, sous le seuil
      CLIENT_ID,
      CLIENT_ID,
    );

    assert.equal(order.deliveryFeeCents, 0);
  });

  it("applique le forfait Express 24 h, même au-dessus du seuil de gratuité", async () => {
    const fake = fakePrisma();
    const mail = collecteur();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new OrdersService(fake.client as any, { sendMail: mail.sendMail });

    const order = await service.create(
      commande([{ productId: KIT_BAIN.id, quantity: 20 }], 1), // 150 € livrés demain
      CLIENT_ID,
      CLIENT_ID,
    );

    // Forfait fixe, non dégressif : les seuils de gratuité ne s'y appliquent pas.
    assert.equal(order.deliveryFeeCents, 2500);
  });

  it("n'invente aucun montant hors zone — 0 € et le drapeau qui l'explique", async () => {
    const fake = fakePrisma({
      client: {
        name: "Résidence lointaine",
        companyName: null,
        email: null,
        phone: null,
        address: null,
        postalCode: "13100",
        zoneId: null,
      },
    });
    const mail = collecteur();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new OrdersService(fake.client as any, { sendMail: mail.sendMail });

    const order = await service.create(
      commande([{ productId: KIT_BAIN.id, quantity: 2 }]),
      CLIENT_ID,
      CLIENT_ID,
    );

    assert.equal(order.deliveryFeeCents, 0);
    assert.equal(order.deliveryFeeSurDevis, true);
    assert.equal(order.deliveryFee.surDevis, true);
    // Le journal doit garder la raison : sinon 0 € passe pour un geste commercial.
    assert.equal(fake.audits[0]?.changes["deliveryFeeSurDevis"], true);
  });
});

describe("OrdersService.getById — devis émis", () => {
  it("expose le devis généré depuis la commande, distinct du devis d'origine", async () => {
    const fake = fakePrisma({
      commande: {
        quoteFromOrder: {
          id: "quote-1",
          numero: "LSQ-2026-0004",
          status: "BROUILLON",
          deletedAt: null,
        },
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const order = await new OrdersService(fake.client as any).getById("order-1");

    assert.deepEqual(order.generatedQuote, {
      id: "quote-1",
      numero: "LSQ-2026-0004",
      status: "BROUILLON",
    });
    // `convertedFromQuote` dit l'inverse (commande ISSUE d'un devis) : les deux
    // ne doivent jamais être confondus à l'affichage.
    assert.equal(order.convertedFromQuote, null);
  });

  it("relit un devis supprimé comme absent — la réémission redevient possible", async () => {
    const fake = fakePrisma({
      commande: {
        quoteFromOrder: {
          id: "quote-1",
          numero: "LSQ-2026-0004",
          status: "BROUILLON",
          deletedAt: new Date(),
        },
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const order = await new OrdersService(fake.client as any).getById("order-1");

    assert.equal(order.generatedQuote, null);
  });
});

describe("OrdersService.list — devis déjà émis", () => {
  const REQUETE = { page: 1, limit: 20 };

  it("expose `generatedQuote` comme la fiche, et non la relation brute", async () => {
    // Depuis la liste, l'admin se voyait proposer « générer un devis » pour une
    // commande qui en avait déjà un : `quoteFromOrder` n'était inclus que par
    // `getById`.
    const fake = fakePrisma({
      liste: [
        {
          id: "order-1",
          quoteFromOrder: {
            id: "quote-1",
            numero: "LSQ-2026-0004",
            status: "BROUILLON",
            deletedAt: null,
          },
        },
      ],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await new OrdersService(fake.client as any).list(REQUETE);

    const commande = result.data[0] as Record<string, unknown>;
    assert.deepEqual(commande["generatedQuote"], {
      id: "quote-1",
      numero: "LSQ-2026-0004",
      status: "BROUILLON",
    });
    // `deletedAt` ne doit pas fuir dans la réponse : même forme que `getById`.
    assert.ok(!("quoteFromOrder" in commande));
  });

  it("relit un brouillon jeté comme absent — la réémission redevient possible", async () => {
    const fake = fakePrisma({
      liste: [
        {
          id: "order-1",
          quoteFromOrder: {
            id: "quote-1",
            numero: "LSQ-2026-0004",
            status: "BROUILLON",
            deletedAt: new Date(),
          },
        },
      ],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await new OrdersService(fake.client as any).list(REQUETE);

    assert.equal((result.data[0] as Record<string, unknown>)["generatedQuote"], null);
  });
});

describe("OrdersService.create — emails", () => {
  it("confirme au client et prévient les gestionnaires, montants compris", async () => {
    const fake = fakePrisma();
    const mail = collecteur();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new OrdersService(fake.client as any, { sendMail: mail.sendMail });

    await service.create(commande([{ productId: KIT_BAIN.id, quantity: 2 }]), CLIENT_ID, CLIENT_ID);
    await service.attendreEmails();

    const client = mail.envois.find((e) => e.template === "order_confirmation_client");
    const gestionnaire = mail.envois.find((e) => e.template === "order_notification_owner");

    assert.ok(client, "le client doit recevoir sa confirmation");
    assert.equal(client.to, "contact@hotel.test");
    assert.equal(client.data["sousTotalCents"], 1500);
    assert.equal(client.data["livraisonCents"], 1200);
    // Le total à payer inclut la livraison — c'est tout l'enjeu de l'email.
    assert.equal(client.data["totalCents"], 2700);
    assert.deepEqual(client.data["lignes"], [{ designation: "Kit Bain", qty: 2 }]);

    assert.ok(gestionnaire, "les gestionnaires doivent être prévenus");
    assert.equal(gestionnaire.to, "gestion@lingeserein.test");
  });

  it("n'échoue pas quand le mailer est à terre — la commande est rendue", async () => {
    const fake = fakePrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new OrdersService(fake.client as any, {
      sendMail: () => Promise.reject(new Error("mailer injoignable")),
    });

    const order = await service.create(
      commande([{ productId: KIT_BAIN.id, quantity: 2 }]),
      CLIENT_ID,
      CLIENT_ID,
    );

    assert.equal(order.id, "order-1");
    assert.equal(order.deliveryFeeCents, 1200);
  });

  it("passe son tour sans erreur quand le client n'a pas d'email", async () => {
    const fake = fakePrisma({
      client: {
        name: "Client sans adresse",
        companyName: null,
        email: null,
        phone: null,
        address: null,
        postalCode: "84200",
        zoneId: "zone-1",
      },
    });
    const mail = collecteur();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new OrdersService(fake.client as any, { sendMail: mail.sendMail });

    const order = await service.create(
      commande([{ productId: KIT_BAIN.id, quantity: 2 }]),
      CLIENT_ID,
      CLIENT_ID,
    );

    await service.attendreEmails();

    assert.equal(order.id, "order-1");
    assert.equal(
      mail.envois.filter((e) => e.template === "order_confirmation_client").length,
      0,
      "aucun envoi client sans adresse",
    );
    // Les gestionnaires, eux, doivent quand même voir passer la commande.
    assert.equal(mail.envois.filter((e) => e.template === "order_notification_owner").length, 1);
  });

  it("normalise ce que le mailer refuse : adresse multiligne, sujet trop long", async () => {
    // `User.address` est un TEXT libre et une adresse postale tient rarement sur
    // une ligne ; le mailer, lui, rejette tout caractère de contrôle et borne le
    // sujet à 200. Sans normalisation, l'email gestionnaire partait en 400 —
    // silencieusement, puisque l'échec d'email ne remonte jamais.
    const fake = fakePrisma({
      client: {
        name: "Résidence " + "très longue ".repeat(30),
        companyName: null,
        email: "contact@hotel.test",
        phone: "0490000000",
        address: "12 avenue de la République\nBâtiment C\n84200 Carpentras",
        postalCode: "84200",
        zoneId: "zone-1",
      },
    });
    const mail = collecteur();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new OrdersService(fake.client as any, { sendMail: mail.sendMail });

    await service.create(commande([{ productId: KIT_BAIN.id, quantity: 2 }]), CLIENT_ID, CLIENT_ID);
    await service.attendreEmails();

    const gestionnaire = mail.envois.find((e) => e.template === "order_notification_owner");
    assert.ok(gestionnaire);
    assert.ok(gestionnaire.subject.length <= 200, "sujet au-delà de la limite du mailer");
    assert.equal(
      gestionnaire.data["clientAdresse"],
      "12 avenue de la République Bâtiment C 84200 Carpentras",
      "l'adresse doit être repliée sur une seule ligne",
    );
    assert.ok(String(gestionnaire.data["clientNom"]).length <= 200);
    // Aucun caractère de contrôle ne doit subsister dans les champs texte.
    for (const champ of ["clientNom", "clientAdresse"]) {
      const valeur = String(gestionnaire.data[champ]);
      assert.ok(
        !valeur.includes("\n") && !valeur.includes("\r"),
        `${champ} contient encore un saut de ligne`,
      );
    }
  });

  it("retire les caractères de contrôle qu'un client peut poser sur sa propre fiche", async () => {
    // `PATCH /auth/me` laisse le client écrire `name`, `address` et `phone`. Le
    // mailer, lui, REFUSE tout caractère de contrôle (sa protection contre
    // l'injection d'en-têtes) et répond 400 pour l'envoi entier.
    //
    // `\s` ne couvre que les blancs : un `\u0001` collé dans le nom traversait
    // la normalisation intacte, et l'email — client ET gestionnaires — partait
    // en 400 sans que personne le voie. Autrement dit, un client pouvait
    // ÉTEINDRE l'alerte « nouvelle commande » de l'exploitation depuis son
    // profil. On les retire donc ici, à l'émission, sans rien relâcher côté
    // mailer.
    const fake = fakePrisma({
      client: {
        name: "H\u0001ôtel\u007f du Pont",
        companyName: null,
        email: "contact@hotel.test",
        phone: "049\u00020000000",
        address: "12 rue des\u001b Teinturiers",
        postalCode: "84200",
        zoneId: "zone-1",
      },
    });
    const mail = collecteur();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new OrdersService(fake.client as any, { sendMail: mail.sendMail });

    await service.create(commande([{ productId: KIT_BAIN.id, quantity: 2 }]), CLIENT_ID, CLIENT_ID);
    await service.attendreEmails();

    // Le prédicat EXACT du mailer (`noControlChars` dans apps/mailer/src/app.ts).
    const sansControle = (v: string) => !/[\u0000-\u001f\u007f]/.test(v);

    const gestionnaire = mail.envois.find((e) => e.template === "order_notification_owner");
    assert.ok(gestionnaire);
    assert.ok(sansControle(gestionnaire.subject), "le sujet serait refusé par le mailer");
    for (const champ of ["clientNom", "clientTel", "clientAdresse"]) {
      assert.ok(
        sansControle(String(gestionnaire.data[champ])),
        `${champ} porte encore un caractère de contrôle — le mailer refuserait tout l'envoi`,
      );
    }

    const client = mail.envois.find((e) => e.template === "order_confirmation_client");
    assert.ok(client);
    assert.ok(sansControle(String(client.data["clientNom"])));
  });

  it("retombe sur le nom du contact quand l'établissement est une chaîne VIDE", async () => {
    // `companyName` est stockable vide : le schéma serveur est
    // `z.string().max(200).optional()`, sans `.min(1)`. `??` ne se déclenchant
    // pas sur `""`, un nom vide traversait jusqu'au mailer, qui exige
    // `clientNom: z.string().min(1)` et refusait TOUS les emails de la commande
    // en 400 — sans que personne ne le voie, l'échec d'email ne remontant jamais.
    const fake = fakePrisma({
      client: {
        name: "Marie Bonnet",
        companyName: "",
        email: "contact@hotel.test",
        phone: null,
        address: null,
        postalCode: "84200",
        zoneId: "zone-1",
      },
    });
    const mail = collecteur();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new OrdersService(fake.client as any, { sendMail: mail.sendMail });

    await service.create(commande([{ productId: KIT_BAIN.id, quantity: 2 }]), CLIENT_ID, CLIENT_ID);
    await service.attendreEmails();

    assert.equal(mail.envois.length, 2, "les deux emails doivent partir");
    for (const envoi of mail.envois) {
      assert.equal(envoi.data["clientNom"], "Marie Bonnet");
    }
  });

  it("ne notifie pas les gestionnaires d'une saisie MANUAL — ils viennent de la taper", async () => {
    const fake = fakePrisma();
    const mail = collecteur();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new OrdersService(fake.client as any, { sendMail: mail.sendMail });

    await service.create(commande([{ productId: KIT_BAIN.id, quantity: 2 }]), CLIENT_ID, ADMIN_ID, {
      source: "MANUAL",
    });
    await service.attendreEmails();

    assert.equal(mail.envois.filter((e) => e.template === "order_notification_owner").length, 0);
    // Le client, lui, n'a rien saisi : sa confirmation part quand même.
    assert.equal(mail.envois.filter((e) => e.template === "order_confirmation_client").length, 1);
  });
});

describe("OrdersService.create — le mailer n'est plus sur le chemin de la réponse", () => {
  /** Échéance de secours : sans elle, une régression se manifesterait par un blocage. */
  function echeance(ms: number, valeur: string): Promise<string> {
    return new Promise((resolve) => {
      // `unref` : ce minuteur ne doit pas maintenir le processus de test en vie.
      setTimeout(() => resolve(valeur), ms).unref();
    });
  }

  const TROIS_ADMINS = [
    { id: "admin-1", email: "a1@lingeserein.test" },
    { id: "admin-2", email: "a2@lingeserein.test" },
    { id: "admin-3", email: "a3@lingeserein.test" },
  ];

  /** Client sans email : seuls les envois GESTIONNAIRES sont observés ici. */
  const CLIENT_SANS_EMAIL = {
    name: "Hôtel du Parc",
    companyName: null,
    email: null,
    phone: null,
    address: null,
    postalCode: "84200",
    zoneId: "zone-1",
  };

  it("rend la commande pendant que les emails sont encore en vol", async () => {
    // Le scénario réel : trois gestionnaires, un mailer qui ne répond pas. Chaque
    // envoi peut courir jusqu'à son timeout de 10 s ; enchaînés et attendus, ils
    // dépassaient les 20 s au bout desquelles le mobile abandonne. Le client
    // voyait « Erreur » et repassait une commande DÉJÀ enregistrée — rien ne
    // dédoublonne un `orderNumber` tiré au hasard.
    const fake = fakePrisma({ client: CLIENT_SANS_EMAIL, admins: TROIS_ADMINS });

    let enVol = 0;
    let debloquer!: () => void;
    // Ne se dénoue que lorsque les TROIS envois sont partis : une boucle
    // séquentielle n'en lancerait jamais qu'un seul et resterait bloquée.
    const troisEnVol = new Promise<void>((resolve) => {
      debloquer = resolve;
    });

    const service = new OrdersService(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fake.client as any,
      {
        sendMail: async () => {
          enVol += 1;
          if (enVol === TROIS_ADMINS.length) debloquer();
          await troisEnVol;
          return { ok: true };
        },
      },
    );

    const issue = await Promise.race([
      service
        .create(commande([{ productId: KIT_BAIN.id, quantity: 2 }]), CLIENT_ID, CLIENT_ID)
        .then(() => "COMMANDE"),
      echeance(2000, "MAILER_ATTENDU"),
    ]);

    assert.equal(issue, "COMMANDE", "POST /orders a attendu le mailer avant de répondre");

    // Et les envois, eux, partent bien — en PARALLÈLE : `attendreEmails` ne peut
    // se dénouer que si les trois sont en vol simultanément.
    const fin = await Promise.race([
      service.attendreEmails().then(() => "ENVOYES"),
      echeance(2000, "SEQUENTIEL"),
    ]);

    assert.equal(fin, "ENVOYES", "les gestionnaires sont notifiés un par un, pas en parallèle");
    assert.equal(enVol, TROIS_ADMINS.length);
  });

  it("ne lit les préférences qu'UNE fois pour tous les gestionnaires", async () => {
    // Un `emailAutorise` par admin, c'était une requête Prisma par admin sur le
    // chemin de création de commande.
    const fake = fakePrisma({ client: CLIENT_SANS_EMAIL, admins: TROIS_ADMINS });
    const mail = collecteur();
    let lectures = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (fake.client as any).notificationSetting.findMany = () => {
      lectures += 1;
      return Promise.resolve([]);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new OrdersService(fake.client as any, { sendMail: mail.sendMail });
    await service.create(commande([{ productId: KIT_BAIN.id, quantity: 2 }]), CLIENT_ID, CLIENT_ID);
    await service.attendreEmails();

    assert.equal(
      lectures,
      1,
      "une seule lecture des préférences, quel que soit le nombre d'admins",
    );
    assert.equal(mail.envois.length, TROIS_ADMINS.length);
  });

  it("prévient quand même les gestionnaires si l'email du client échoue", async () => {
    // Les deux envois n'ont aucune raison de tomber ensemble : un `try` unique
    // faisait qu'une adresse client refusée privait l'exploitation de son alerte.
    const fake = fakePrisma();
    const envois: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new OrdersService(fake.client as any, {
      sendMail: (input) => {
        if (input.template === "order_confirmation_client") {
          return Promise.reject(new Error("mailer injoignable"));
        }
        envois.push(input.template);
        return Promise.resolve({ ok: true });
      },
    });

    await service.create(commande([{ productId: KIT_BAIN.id, quantity: 2 }]), CLIENT_ID, CLIENT_ID);
    await service.attendreEmails();

    assert.deepEqual(envois, ["order_notification_owner"]);
  });
});
