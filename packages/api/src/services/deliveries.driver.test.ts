/**
 * Ce que le livreur voit, et ce qu'il ne doit pas voir.
 *
 * Trois défauts constatés en exploitation, et le même symptôme pour le
 * propriétaire : « j'ai créé une tournée, le livreur n'a rien reçu, rien vu ».
 *   1. sa seule route (`/today`) filtre sur la journée en cours — une tournée
 *      créée pour demain lui était littéralement invisible ;
 *   2. `createRound` n'émettait aucune notification : l'affectation était muette ;
 *   3. les arrêts ne portaient ni `companyName` ni la commune, donc de quoi
 *      sonner à la mauvaise porte.
 *
 * S'y ajoute la propriété qui ne doit JAMAIS céder : un livreur ne lit que ses
 * propres tournées, et le périmètre vient du jeton, jamais de la requête.
 *
 * Faux Prisma en mémoire : ni base, ni Redis, ni réseau.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { DeliveriesService } from "./deliveries.service.ts";
import { ForbiddenError } from "../utils/errors.ts";
import type { SendMailInput } from "../utils/mailer.ts";

const LIVREUR = "driver-1";
const AUTRE_LIVREUR = "driver-2";
const ROUND_ID = "round-1";

interface Appel {
  modele: string;
  operation: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any;
}

/**
 * Faux Prisma : enregistre les LECTURES avec leurs arguments (c'est le `where`
 * qui porte la garantie de sécurité), et LÈVE sur toute écriture non attendue.
 */
function fakePrisma(
  options: {
    roundDriverId?: string;
    driverNom?: string;
    /** `null` par défaut : sans adresse, aucun email n'est tenté. */
    driverEmail?: string | null;
    zoneName?: string | null;
    date?: Date;
    /** Préférence de notification du livreur, `null` = aucune (tout autorisé). */
    setting?: { enabled: boolean; channel: string } | null;
  } = {},
) {
  const appels: Appel[] = [];
  const notifications: Record<string, unknown>[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lire = (modele: string, operation: string, resultat: any) => (args: unknown) => {
    appels.push({ modele, operation, args });
    return Promise.resolve(resultat);
  };

  const interdire = (chemin: string) => () => {
    throw new Error(`Écriture interdite pendant une lecture : ${chemin}`);
  };

  const round = {
    id: ROUND_ID,
    driverId: options.roundDriverId ?? LIVREUR,
    date: options.date ?? new Date("2026-08-03T00:00:00Z"),
    status: "PLANNED",
    // `??` et non `||` : un nom VIDE est justement le cas à éprouver.
    driver: {
      id: options.roundDriverId ?? LIVREUR,
      name: options.driverNom ?? "Karim Benali",
      // Sans adresse, aucun email n'est tenté — le défaut des autres scénarios.
      email: options.driverEmail ?? null,
    },
    zone: { id: "zone-1", name: options.zoneName ?? "Avignon centre" },
    stops: [{ id: "stop-1", stopOrder: 1, clientId: "client-1" }],
    _count: { stops: 1 },
  };

  const client = {
    appels,
    notifications,
    deliveryRound: {
      findMany: lire("deliveryRound", "findMany", [round]),
      findFirst: lire("deliveryRound", "findFirst", round),
      findUnique: lire("deliveryRound", "findUnique", round),
      count: lire("deliveryRound", "count", 1),
      update: interdire("deliveryRound.update"),
      create: (args: unknown) => {
        appels.push({ modele: "deliveryRound", operation: "create", args });
        return Promise.resolve(round);
      },
    },
    deliveryStop: { findUnique: lire("deliveryStop", "findUnique", null) },
    auditLog: { create: () => Promise.resolve({ id: "audit-1" }) },
    notificationSetting: { findUnique: () => Promise.resolve(null) },
    notification: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        notifications.push(data);
        return Promise.resolve({ ...data, id: `notif-${notifications.length}` });
      },
      count: () => Promise.resolve(notifications.length),
    },
    deviceToken: { findMany: () => Promise.resolve([]) },
    $transaction: (arg: unknown): Promise<unknown> => {
      if (typeof arg === "function") {
        throw new Error("Transaction ouverte pendant une lecture");
      }
      return Promise.all(arg as Promise<unknown>[]);
    },
  };

  return client;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const service = (fake: ReturnType<typeof fakePrisma>) => new DeliveriesService(fake as any);

const PAGINATION = { page: 1, limit: 20 };

/** Dernier appel enregistré pour un modèle + opération. */
function dernierAppel(fake: ReturnType<typeof fakePrisma>, modele: string, operation: string) {
  const trouve = fake.appels.filter((a) => a.modele === modele && a.operation === operation).pop();
  assert.ok(trouve, `aucun appel ${modele}.${operation}`);
  return trouve;
}

// ---------------------------------------------------------------------------

describe("listMyRounds — le périmètre vient du jeton", () => {
  it("filtre sur le livreur passé en paramètre", async () => {
    const fake = fakePrisma();

    await service(fake).listMyRounds(LIVREUR, { ...PAGINATION } as any);

    assert.equal(dernierAppel(fake, "deliveryRound", "findMany").args.where.driverId, LIVREUR);
  });

  it("IGNORE un driverId glissé dans la requête", async () => {
    const fake = fakePrisma();

    // Simule exactement la régression redoutée : un appelant (ou un `...query`
    // distrait dans la route) qui tenterait de faire voyager le périmètre dans
    // l'objet de requête. Le `where` doit rester celui du livreur authentifié —
    // sinon un livreur lit les tournées de ses collègues avec un simple
    // `?driverId=`.
    await service(fake).listMyRounds(LIVREUR, {
      ...PAGINATION,
      driverId: AUTRE_LIVREUR,
    } as any);

    const where = dernierAppel(fake, "deliveryRound", "findMany").args.where;
    assert.equal(where.driverId, LIVREUR, "le driverId de la requête ne doit jamais l'emporter");
  });

  it("compte le total sur le MÊME périmètre que la liste", async () => {
    const fake = fakePrisma();

    await service(fake).listMyRounds(LIVREUR, { ...PAGINATION } as any);

    // Un `count` sans `driverId` renverrait le total de TOUTES les tournées :
    // la pagination annoncerait des pages que le livreur n'a pas le droit de lire.
    assert.equal(dernierAppel(fake, "deliveryRound", "count").args.where.driverId, LIVREUR);
  });

  it("montre les tournées à venir, pas seulement celle du jour", async () => {
    const fake = fakePrisma();
    const avant = Date.now();

    await service(fake).listMyRounds(LIVREUR, { ...PAGINATION } as any);

    const where = dernierAppel(fake, "deliveryRound", "findMany").args.where;
    const gte = where.date.gte as Date;
    const lte = where.date.lte as Date;

    // Le cœur du correctif : la borne haute est dans le FUTUR. Avec le filtre de
    // `/today` (jusqu'à demain 00:00), une tournée créée pour la semaine
    // prochaine n'apparaissait nulle part.
    assert.ok(lte.getTime() > avant, "la fenêtre doit s'étendre au-delà d'aujourd'hui");
    assert.ok(gte.getTime() < avant, "la fenêtre doit aussi couvrir les tournées récentes");

    const joursEnAvant = (lte.getTime() - avant) / 86_400_000;
    assert.ok(joursEnAvant > 25 && joursEnAvant < 32, `horizon inattendu : ${joursEnAvant} j`);
  });

  it("trie du plus proche au plus lointain", async () => {
    const fake = fakePrisma();

    await service(fake).listMyRounds(LIVREUR, { ...PAGINATION } as any);

    // Le livreur veut savoir ce qui l'attend ; l'ordre décroissant de la liste
    // admin lui mettrait la tournée la plus lointaine en tête.
    assert.deepEqual(dernierAppel(fake, "deliveryRound", "findMany").args.orderBy, {
      date: "asc",
    });
  });

  it("respecte une fenêtre explicite", async () => {
    const fake = fakePrisma();

    await service(fake).listMyRounds(LIVREUR, {
      ...PAGINATION,
      from: "2026-08-01",
      to: "2026-08-31",
    } as any);

    const where = dernierAppel(fake, "deliveryRound", "findMany").args.where;
    assert.equal((where.date.gte as Date).toISOString().slice(0, 10), "2026-08-01");
    assert.equal((where.date.lte as Date).toISOString().slice(0, 10), "2026-08-31");
  });

  it("n'écrit RIEN — c'est une lecture", async () => {
    const fake = fakePrisma();

    // Le faux client lève sur toute écriture : l'appel échouerait si la route
    // rattrapait un état au passage.
    await service(fake).listMyRounds(LIVREUR, { ...PAGINATION } as any);
  });

  it("donne au livreur de quoi se rendre chez le client", async () => {
    const fake = fakePrisma();

    await service(fake).listMyRounds(LIVREUR, { ...PAGINATION } as any);

    const select = dernierAppel(fake, "deliveryRound", "findMany").args.include.stops.include.client
      .select;
    // `companyName` : le livreur sonne à une enseigne (« Hôtel du Pont »), pas au
    // nom du contact. `city`/`postalCode` : `User.address` ne porte souvent que
    // la rue, la commune vit dans sa propre colonne — sans elles, l'adresse est
    // inexploitable par un GPS.
    for (const champ of ["companyName", "address", "city", "postalCode", "phone"]) {
      assert.equal(select[champ], true, `${champ} doit être renvoyé au livreur`);
    }
  });
});

// ---------------------------------------------------------------------------

describe("getRoundById — cloisonnement entre livreurs", () => {
  it("refuse la tournée d'un autre livreur", async () => {
    const fake = fakePrisma({ roundDriverId: AUTRE_LIVREUR });

    await assert.rejects(
      () => service(fake).getRoundById(ROUND_ID, LIVREUR, "ROLE_LIVREUR"),
      (err: unknown) => err instanceof ForbiddenError,
      "un livreur ne doit jamais lire la tournée d'un collègue",
    );
  });

  it("laisse le livreur lire la sienne", async () => {
    const fake = fakePrisma({ roundDriverId: LIVREUR });

    const round = await service(fake).getRoundById(ROUND_ID, LIVREUR, "ROLE_LIVREUR");

    assert.equal(round.id, ROUND_ID);
  });

  it("laisse l'admin lire n'importe laquelle", async () => {
    const fake = fakePrisma({ roundDriverId: AUTRE_LIVREUR });

    const round = await service(fake).getRoundById(ROUND_ID, "admin-1", "ROLE_ADMIN");

    assert.equal(round.id, ROUND_ID);
  });

  it("expose companyName et la commune sur les arrêts", async () => {
    const fake = fakePrisma();

    await service(fake).getRoundById(ROUND_ID, LIVREUR, "ROLE_LIVREUR");

    const select = dernierAppel(fake, "deliveryRound", "findUnique").args.include.stops.include
      .client.select;
    for (const champ of ["companyName", "city", "postalCode"]) {
      assert.equal(select[champ], true, `${champ} manquant sur getRoundById`);
    }
  });
});

describe("getTodayRound — même niveau de détail que les autres routes", () => {
  it("expose companyName et la commune sur les arrêts", async () => {
    const fake = fakePrisma();

    await service(fake).getTodayRound(LIVREUR);

    const select = dernierAppel(fake, "deliveryRound", "findFirst").args.include.stops.include
      .client.select;
    // Le select était copié dans quatre méthodes : un champ ajouté à l'une
    // manquait aux trois autres, et l'écran perdait l'information selon la route
    // par laquelle le livreur y arrivait.
    for (const champ of ["companyName", "city", "postalCode"]) {
      assert.equal(select[champ], true, `${champ} manquant sur getTodayRound`);
    }
  });
});

// ---------------------------------------------------------------------------

const NOUVELLE_TOURNEE = {
  driverId: LIVREUR,
  date: "2026-08-03",
  stops: [{ clientId: "client-1", stopOrder: 1, setsToDeliver: 4 }],
};

describe("createRound — le livreur est prévenu de son affectation", () => {
  it("notifie le livreur affecté", async () => {
    const fake = fakePrisma();

    await service(fake).createRound(NOUVELLE_TOURNEE as any, "op-1", "admin-1");

    assert.equal(fake.notifications.length, 1, "l'affectation ne doit plus être muette");
    const notif = fake.notifications[0];
    assert.ok(notif);
    assert.equal(notif["userId"], LIVREUR, "le destinataire est le LIVREUR, pas l'admin");
    assert.equal(notif["type"], "DELIVERY_REMINDER");
    assert.equal(notif["channel"], "BOTH");
  });

  it("porte de quoi ouvrir l'écran de tournée au tap", async () => {
    const fake = fakePrisma();

    await service(fake).createRound(NOUVELLE_TOURNEE as any, "op-1", "admin-1");

    const data = (fake.notifications[0]?.["data"] ?? {}) as Record<string, unknown>;
    assert.equal(data["type"], "DELIVERY_REMINDER");
    assert.equal(data["roundId"], ROUND_ID);
    assert.equal(data["path"], "/tournee");
  });

  it("ne laisse jamais partir un nom de livreur vide — le mailer refuserait tout l'envoi", async () => {
    // `User.name` peut valoir "" (compte créé à la volée) et `pourMail` peut
    // vider un nom fait de seuls caractères que le mailer refuse. Or celui-ci
    // exige `livreurNom: z.string().min(1)` et répond 400 pour l'envoi ENTIER :
    // le livreur n'aurait jamais su qu'une tournée lui était affectée, et
    // l'échec n'aurait laissé qu'une ligne de log.
    const fake = fakePrisma({ driverNom: "", driverEmail: "karim@lingeserein.test" });
    const envois: SendMailInput[] = [];

    await new DeliveriesService(fake as any, {
      sendMail: (input) => {
        envois.push(input);
        return Promise.resolve({ ok: true });
      },
    }).createRound(NOUVELLE_TOURNEE as any, "op-1", "admin-1");

    assert.equal(envois.length, 1, "le livreur doit recevoir son email");
    assert.equal(envois[0]?.template, "round_assigned_driver");
    assert.equal(envois[0]?.data["livreurNom"], "Livreur");
  });

  it("crée la tournée même si la notification échoue", async () => {
    const fake = fakePrisma();
    fake.notification.create = () => Promise.reject(new Error("Postgres injoignable"));

    // Une notification est un effet de bord : la tournée est déjà enregistrée et
    // planifiée, l'admin ne doit pas voir sa création échouer pour autant.
    const round = await service(fake).createRound(NOUVELLE_TOURNEE as any, "op-1", "admin-1");

    assert.equal(round.id, ROUND_ID);
  });
});
