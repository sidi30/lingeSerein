/**
 * Facturation récurrente des abonnements.
 *
 * Trois propriétés sont testées ici parce que leur violation coûte de l'argent
 * réel, au client ou à l'opérateur, sans qu'aucune erreur ne s'affiche :
 *
 *   1. **le montant** — `priceCents` (prix figé à la souscription) fait foi,
 *      JAMAIS la somme des kits inclus. Le code précédent additionnait les
 *      produits : un Pack Sérénité à 89 €/mois aurait été facturé au prix
 *      catalogue de 8 kits bain + 4 kits lit, soit plusieurs fois trop ;
 *   2. **l'idempotence** — un cron rejoué (redémarrage, `attempts: 3` de
 *      BullMQ, relance manuelle) ne doit pas produire une deuxième facture pour
 *      la même période, et ne doit pas non plus laisser l'abonnement éligible
 *      indéfiniment ;
 *   3. **la TVA** — 0 % tant que l'opérateur n'a pas déclaré son
 *      assujettissement. Collecter une TVA sans y être autorisé est une faute
 *      qu'aucun test d'intégration ne rattrape après coup.
 *
 * Faux Prisma en mémoire : ni base, ni Redis, ni réseau.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Doit précéder l'import du worker : garantit qu'aucun email ne part.
delete process.env["INTERNAL_INTAKE_SECRET"];

import { runInvoiceCycle, montantHtCents, RATTRAPAGE_MAX_JOURS } from "./invoice.worker.ts";

// ---------------------------------------------------------------------------
// Faux Prisma — ne couvre que les formes de requête utilisées par le cycle.
// ---------------------------------------------------------------------------

interface FakeSubscription {
  id: string;
  userId: string;
  plan: string | null;
  status: string;
  priceCents: number | null;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  user: { id: string; name: string; operatorId: string };
  products: { quantity: number; product: { priceCents: number; name: string } }[];
}

interface FakeInvoice {
  id: string;
  userId: string | null;
  invoiceNumber: string;
  totalHtCents: number;
  vatRate: number;
  vatAmountCents: number;
  totalTtcCents: number;
  periodStart: Date | null;
  periodEnd: Date | null;
  metadata: Record<string, unknown>;
}

const OPERATOR = "op-1";
const KIT_BAIN = { priceCents: 2900, name: "Kit bain" };
const KIT_LIT = { priceCents: 3900, name: "Kit lit" };

function packSerenite(over: Partial<FakeSubscription> = {}): FakeSubscription {
  return {
    id: "sub-1",
    userId: "user-1",
    plan: null,
    status: "ACTIVE",
    priceCents: 8900,
    currentPeriodStart: new Date("2026-06-01T00:00:00Z"),
    currentPeriodEnd: new Date("2026-07-01T00:00:00Z"),
    user: { id: "user-1", name: "Hôtel du Port", operatorId: OPERATOR },
    products: [
      { quantity: 8, product: KIT_BAIN },
      { quantity: 4, product: KIT_LIT },
    ],
    ...over,
  };
}

class FakePrisma {
  subscriptions: FakeSubscription[] = [];
  invoices: FakeInvoice[] = [];
  notifications: { userId: string; title: string }[] = [];
  tvaApplicable = false;
  admins = [{ id: "admin-1" }];
  private seq = 0;

  subscription = {
    findMany: ({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(
        this.subscriptions.filter((s) => {
          if (where["status"] && s.status !== where["status"]) return false;
          if (where["userId"] && s.userId !== where["userId"]) return false;
          const echu = where["currentPeriodEnd"] as { lte: Date } | undefined;
          if (echu && s.currentPeriodEnd > echu.lte) return false;
          return true;
        }),
      ),
    update: ({ where, data }: { where: { id: string }; data: Record<string, Date> }) => {
      const sub = this.subscriptions.find((s) => s.id === where.id);
      if (sub) {
        if (data["currentPeriodStart"]) sub.currentPeriodStart = data["currentPeriodStart"];
        if (data["currentPeriodEnd"]) sub.currentPeriodEnd = data["currentPeriodEnd"];
      }
      return Promise.resolve(sub);
    },
  };

  invoice = {
    findFirst: ({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(
        this.invoices.find(
          (i) =>
            i.userId === where["userId"] &&
            i.periodStart?.getTime() === (where["periodStart"] as Date | undefined)?.getTime() &&
            i.periodEnd?.getTime() === (where["periodEnd"] as Date | undefined)?.getTime(),
        ) ?? null,
      ),
    create: ({ data }: { data: Record<string, unknown> }) => {
      const created = { id: `inv-${++this.seq}`, ...data } as unknown as FakeInvoice;
      this.invoices.push(created);
      return Promise.resolve(created);
    },
  };

  operator = { findUnique: () => Promise.resolve({ iban: "FR7612345", bic: "AGRIFRPP" }) };

  subscriptionConfig = {
    findUnique: () => Promise.resolve({ tvaApplicable: this.tvaApplicable }),
  };

  user = { findMany: () => Promise.resolve(this.admins) };

  notification = {
    create: ({ data }: { data: { userId: string; title: string } }) => {
      this.notifications.push({ userId: data.userId, title: data.title });
      return Promise.resolve({ id: `notif-${this.notifications.length}`, ...data });
    },
  };

  notificationSetting = { findUnique: () => Promise.resolve(null) };

  $transaction = <T>(fn: (tx: FakePrisma) => Promise<T>): Promise<T> => fn(this);
}

function fake(): FakePrisma {
  return new FakePrisma();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asPrisma = (p: FakePrisma) => p as any;

/**
 * Premier élément d'une liste, en échouant explicitement si elle est vide.
 *
 * Préféré à `liste[0]!` : quand un test casse, « attendu au moins un élément »
 * pointe la cause, là où l'assertion non-nulle produit un TypeError sur la
 * ligne suivante.
 */
function premier<T>(items: T[], quoi: string): T {
  const [first] = items;
  assert.ok(first, `attendu au moins ${quoi}`);
  return first;
}

const APRES = new Date("2026-07-02T05:00:00Z");

describe("montant facturé", () => {
  it("facture le prix figé de l'abonnement, pas la somme des kits inclus", () => {
    const sub = packSerenite();
    // 8 × 29 € + 4 × 39 € = 388 € — plus de quatre fois l'abonnement.
    const sommeDesKits = 8 * KIT_BAIN.priceCents + 4 * KIT_LIT.priceCents;
    assert.equal(sommeDesKits, 38800);
    assert.equal(montantHtCents(sub as never), 8900);
  });

  it("retombe sur la somme des produits pour un abonnement legacy sans prix figé", () => {
    const sub = packSerenite({ priceCents: null });
    assert.equal(montantHtCents(sub as never), 38800);
  });
});

describe("cycle de facturation", () => {
  let prisma: FakePrisma;

  beforeEach(() => {
    prisma = fake();
    prisma.subscriptions = [packSerenite()];
  });

  it("facture un abonnement dont la période est échue", async () => {
    const numbers = await runInvoiceCycle(asPrisma(prisma), {}, APRES);

    assert.equal(numbers.length, 1);
    const invoice = premier(prisma.invoices, "une facture");
    assert.equal(invoice.totalHtCents, 8900);
    assert.equal(invoice.periodStart?.toISOString(), "2026-06-01T00:00:00.000Z");
    assert.equal(invoice.periodEnd?.toISOString(), "2026-07-01T00:00:00.000Z");
  });

  it("ne facture PAS un abonnement dont la période court encore", async () => {
    const avant = new Date("2026-06-15T05:00:00Z");
    const numbers = await runInvoiceCycle(asPrisma(prisma), {}, avant);

    assert.deepEqual(numbers, []);
    assert.equal(prisma.invoices.length, 0);
  });

  it("ignore un abonnement en pause ou résilié", async () => {
    prisma.subscriptions = [
      packSerenite({ status: "PAUSED" }),
      packSerenite({ id: "sub-2", userId: "user-2", status: "CANCELLED" }),
    ];
    const numbers = await runInvoiceCycle(asPrisma(prisma), {}, APRES);

    assert.deepEqual(numbers, []);
  });

  it("avance la période d'un mois après facturation", async () => {
    await runInvoiceCycle(asPrisma(prisma), {}, APRES);

    const sub = premier(prisma.subscriptions, "un abonnement");
    assert.equal(sub.currentPeriodStart.toISOString(), "2026-07-01T00:00:00.000Z");
    assert.equal(sub.currentPeriodEnd.toISOString(), "2026-08-01T00:00:00.000Z");
  });

  it("rejoué, ne produit pas une seconde facture", async () => {
    await runInvoiceCycle(asPrisma(prisma), {}, APRES);
    // Le cron repasse le lendemain : la période a avancé, plus rien n'est échu.
    await runInvoiceCycle(asPrisma(prisma), {}, new Date("2026-07-03T05:00:00Z"));

    assert.equal(prisma.invoices.length, 1);
  });

  it("débloque un abonnement dont la facture existe déjà, au lieu de boucler chaque jour", async () => {
    // Facture posée à la main pour la période courante (rattrapage manuel) :
    // sans avance du cycle, le cron la re-signalerait tous les jours.
    prisma.invoices.push({
      id: "inv-manuelle",
      userId: "user-1",
      invoiceNumber: "FACT-2026-0001",
      totalHtCents: 8900,
      vatRate: 0,
      vatAmountCents: 0,
      totalTtcCents: 8900,
      periodStart: new Date("2026-06-01T00:00:00Z"),
      periodEnd: new Date("2026-07-01T00:00:00Z"),
      metadata: {},
    });

    const numbers = await runInvoiceCycle(asPrisma(prisma), {}, APRES);

    assert.deepEqual(numbers, []);
    assert.equal(prisma.invoices.length, 1);
    assert.equal(
      premier(prisma.subscriptions, "un abonnement").currentPeriodEnd.toISOString(),
      "2026-08-01T00:00:00.000Z",
    );
  });

  it("facture plusieurs abonnements échus en un seul passage", async () => {
    prisma.subscriptions.push(packSerenite({ id: "sub-2", userId: "user-2", priceCents: 12000 }));
    const numbers = await runInvoiceCycle(asPrisma(prisma), {}, APRES);

    assert.equal(numbers.length, 2);
    assert.deepEqual(
      prisma.invoices.map((i) => i.totalHtCents).sort((a, b) => a - b),
      [8900, 12000],
    );
  });

  it("restreint à un seul abonné quand userId est fourni", async () => {
    prisma.subscriptions.push(packSerenite({ id: "sub-2", userId: "user-2" }));
    const numbers = await runInvoiceCycle(asPrisma(prisma), { userId: "user-2" }, APRES);

    assert.equal(numbers.length, 1);
    assert.equal(premier(prisma.invoices, "une facture").userId, "user-2");
  });
});

describe("TVA", () => {
  it("n'applique aucune TVA par défaut, et porte la mention d'exonération", async () => {
    const prisma = fake();
    prisma.subscriptions = [packSerenite()];

    await runInvoiceCycle(asPrisma(prisma), {}, APRES);

    const invoice = premier(prisma.invoices, "une facture");
    assert.equal(invoice.vatRate, 0);
    assert.equal(invoice.vatAmountCents, 0);
    assert.equal(invoice.totalTtcCents, 8900);
    assert.match(String(invoice.metadata["mentionLegale"]), /293 B/);
  });

  it("applique 20 % quand l'opérateur est assujetti", async () => {
    const prisma = fake();
    prisma.tvaApplicable = true;
    prisma.subscriptions = [packSerenite()];

    await runInvoiceCycle(asPrisma(prisma), {}, APRES);

    const invoice = premier(prisma.invoices, "une facture");
    assert.equal(invoice.vatRate, 2000);
    assert.equal(invoice.vatAmountCents, 1780);
    assert.equal(invoice.totalTtcCents, 10680);
    assert.equal(invoice.metadata["mentionLegale"], undefined);
  });
});

describe("retard trop ancien", () => {
  it("ne facture PAS rétroactivement, avance le cycle et alerte le gestionnaire", async () => {
    const prisma = fake();
    prisma.subscriptions = [packSerenite()];
    // Conteneur arrêté trois mois : sans garde-fou, le cron sortirait une
    // facture par jour jusqu'à rattraper le retard.
    const troisMoisApres = new Date("2026-10-02T05:00:00Z");

    const numbers = await runInvoiceCycle(asPrisma(prisma), {}, troisMoisApres);

    assert.deepEqual(numbers, []);
    assert.equal(prisma.invoices.length, 0);

    // Le cycle est ramené dans la fenêtre de rattrapage, donc l'abonnement
    // repart normalement au prochain passage au lieu de rejouer chaque jour.
    const sub = premier(prisma.subscriptions, "un abonnement");
    const limite = new Date(troisMoisApres.getTime() - RATTRAPAGE_MAX_JOURS * 86_400_000);
    assert.ok(sub.currentPeriodEnd >= limite, "le cycle doit repasser dans la fenêtre");

    const alerte = premier(prisma.notifications, "une alerte");
    assert.match(alerte.title, /retard/i);
    assert.equal(alerte.userId, "admin-1");
  });

  it("facture normalement un retard d'un cycle (dans la fenêtre)", async () => {
    const prisma = fake();
    prisma.subscriptions = [packSerenite()];
    // 8 jours de retard : cas d'un simple redémarrage, la facture est due.
    const numbers = await runInvoiceCycle(asPrisma(prisma), {}, new Date("2026-07-09T05:00:00Z"));

    assert.equal(numbers.length, 1);
  });
});

describe("période imposée (rattrapage manuel)", () => {
  it("facture la période demandée SANS avancer le cycle", async () => {
    const prisma = fake();
    // Période encore en cours : le rattrapage doit passer outre le filtre d'échéance.
    prisma.subscriptions = [packSerenite()];

    const numbers = await runInvoiceCycle(
      asPrisma(prisma),
      { periodStart: "2026-05-01T00:00:00Z", periodEnd: "2026-06-01T00:00:00Z" },
      new Date("2026-06-15T05:00:00Z"),
    );

    assert.equal(numbers.length, 1);
    assert.equal(
      premier(prisma.invoices, "une facture").periodStart?.toISOString(),
      "2026-05-01T00:00:00.000Z",
    );
    // Le cycle courant n'a pas bougé : ce rattrapage ne doit pas décaler la
    // facturation normale du mois suivant.
    assert.equal(
      premier(prisma.subscriptions, "un abonnement").currentPeriodEnd.toISOString(),
      "2026-07-01T00:00:00.000Z",
    );
  });
});

describe("signalement aux gestionnaires", () => {
  it("prévient les administrateurs, pas le client", async () => {
    const prisma = fake();
    prisma.subscriptions = [packSerenite()];

    await runInvoiceCycle(asPrisma(prisma), {}, APRES);

    assert.equal(prisma.notifications.length, 1);
    assert.equal(premier(prisma.notifications, "une notification").userId, "admin-1");
    assert.match(premier(prisma.notifications, "une notification").title, /à émettre/);
  });
});
