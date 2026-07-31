/**
 * Suppressions en cascade et anonymisation.
 *
 * La propriété qui compte ici est juridique, pas technique : **une facture émise
 * ne doit jamais pouvoir disparaître**. Elle se conserve dix ans (art. L123-22
 * C. com.), et une cascade qui l'emporterait ne se remarquerait qu'au contrôle
 * fiscal — c'est-à-dire trop tard. Ces tests vérifient donc autant ce qui est
 * supprimé que ce qui ne l'est PAS, et que le refus ne laisse aucune écriture
 * partielle derrière lui.
 *
 * Faux Prisma en mémoire : ni base, ni Redis.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { DeletionService } from "./deletion.service.ts";

// ---------------------------------------------------------------------------
// Faux Prisma — couvre les opérateurs de `where` réellement utilisés.
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

function matches(rec: any, where: any): boolean {
  for (const [key, cond] of Object.entries(where ?? {})) {
    // Relation imbriquée : le faux abonnement porte l'operatorId de son client.
    if (key === "user" && cond && typeof cond === "object") {
      if (rec.operatorId !== (cond as any).operatorId) return false;
      continue;
    }

    const val = rec[key];

    if (cond === null) {
      if (val !== null && val !== undefined) return false;
      continue;
    }

    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      const c = cond as Record<string, unknown>;
      if ("not" in c) {
        if (c["not"] === null ? val === null || val === undefined : val === c["not"]) return false;
      }
      if ("in" in c && !(c["in"] as unknown[]).includes(val)) return false;
      if ("notIn" in c && (c["notIn"] as unknown[]).includes(val)) return false;
      if ("startsWith" in c && !String(val ?? "").startsWith(String(c["startsWith"]))) return false;
      continue;
    }

    if (val !== cond) return false;
  }
  return true;
}

/** Délégué Prisma minimal sur un tableau d'objets. */
function delegate(rows: any[]) {
  return {
    rows,
    count: async ({ where }: any = {}) => rows.filter((r) => matches(r, where)).length,
    findFirst: async ({ where }: any = {}) => rows.find((r) => matches(r, where)) ?? null,
    findUnique: async ({ where }: any = {}) => rows.find((r) => r.id === where.id) ?? null,
    findMany: async ({ where }: any = {}) => rows.filter((r) => matches(r, where)),
    updateMany: async ({ where, data }: any) => {
      const cibles = rows.filter((r) => matches(r, where));
      for (const r of cibles) Object.assign(r, data);
      return { count: cibles.length };
    },
    update: async ({ where, data }: any) => {
      const cible = rows.find((r) => r.id === where.id);
      if (cible) Object.assign(cible, data);
      return cible;
    },
    deleteMany: async ({ where }: any = {}) => {
      const cibles = rows.filter((r) => matches(r, where));
      for (const r of cibles) rows.splice(rows.indexOf(r), 1);
      return { count: cibles.length };
    },
    delete: async ({ where }: any) => {
      const i = rows.findIndex((r) => r.id === where.id);
      const [removed] = rows.splice(i, 1);
      return removed;
    },
  };
}

const OP = "op-1";
const ADMIN = "admin-1";
const CLIENT = "client-1";

interface Fixture {
  users?: any[];
  quotes?: any[];
  invoices?: any[];
  orders?: any[];
  rotations?: any[];
  subscriptions?: any[];
  deliveryStops?: any[];
  refreshTokens?: any[];
  deviceTokens?: any[];
  passageResponses?: any[];
  notifications?: any[];
  notificationSettings?: any[];
  clientStocks?: any[];
  deliveryRounds?: any[];
}

function createFakePrisma(f: Fixture = {}) {
  const store = {
    user: delegate(
      f.users ?? [
        {
          id: CLIENT,
          operatorId: OP,
          role: "ROLE_CLIENT",
          name: "Gîte des Oliviers",
          email: "gite@example.test",
          passwordHash: "hash",
          phone: "0600000000",
          address: "12 rue des Oliviers",
          companyName: "SARL Oliviers",
          city: "Orange",
          postalCode: "84100",
          notes: "paie toujours en retard",
          requirements: "sonner deux fois",
          stripeCustomerId: "cus_123",
          isActive: true,
          deletedAt: null,
        },
      ],
    ),
    quote: delegate(f.quotes ?? []),
    invoice: delegate(f.invoices ?? []),
    order: delegate(f.orders ?? []),
    rotation: delegate(f.rotations ?? []),
    subscription: delegate(f.subscriptions ?? []),
    deliveryStop: delegate(f.deliveryStops ?? []),
    refreshToken: delegate(f.refreshTokens ?? []),
    deviceToken: delegate(f.deviceTokens ?? []),
    passageResponse: delegate(f.passageResponses ?? []),
    notification: delegate(f.notifications ?? []),
    notificationSetting: delegate(f.notificationSettings ?? []),
    clientStock: delegate(f.clientStocks ?? []),
    deliveryRound: delegate(f.deliveryRounds ?? []),
    auditLog: { rows: [] as any[] },
  };

  const prisma: any = {
    ...store,
    auditLog: {
      create: async ({ data }: any) => {
        store.auditLog.rows.push(data);
        return data;
      },
    },
    // Transaction interactive : le faux applique directement, il n'y a rien à
    // annuler puisque les tests de refus vérifient qu'on n'entre jamais dedans.
    $transaction: async (fn: any) => fn(prisma),
  };

  return { prisma, store };
}

const service = (prisma: any) => new DeletionService(prisma);

function quote(over: any = {}) {
  return {
    id: `q-${Math.random()}`,
    userId: CLIENT,
    status: "BROUILLON",
    deletedAt: null,
    ...over,
  };
}
function invoice(over: any = {}) {
  return {
    id: `f-${Math.random()}`,
    userId: CLIENT,
    status: "DRAFT",
    deletedAt: null,
    periodStart: null,
    clientNom: "Gîte des Oliviers",
    clientEmail: "gite@example.test",
    clientAdresse: "12 rue des Oliviers",
    ...over,
  };
}
function rotation(over: any = {}) {
  return {
    id: `r-${Math.random()}`,
    userId: CLIENT,
    status: "LIVREE",
    formule: "PONCTUEL",
    deletedAt: null,
    clientNom: "Gîte des Oliviers",
    clientEmail: "gite@example.test",
    clientAdresse: "12 rue des Oliviers",
    ...over,
  };
}

// ===========================================================================

describe("aperçu avant suppression d'un client", () => {
  it("ventile devis, factures et rotations par état", async () => {
    const { prisma } = createFakePrisma({
      quotes: [quote(), quote(), quote({ status: "ENVOYE" })],
      invoices: [invoice(), invoice({ status: "PAID" }), invoice({ status: "SENT" })],
      orders: [{ id: "o1", userId: CLIENT, deletedAt: null }],
      rotations: [rotation(), rotation({ status: "REPRISE" }), rotation({ status: "ANNULEE" })],
      subscriptions: [{ id: "s1", userId: CLIENT, operatorId: OP }],
      deliveryStops: [
        { id: "st1", clientId: CLIENT, status: "PENDING" },
        { id: "st2", clientId: CLIENT, status: "PENDING" },
        // Déjà livré : compté à part, et il survivra à la suppression.
        { id: "st3", clientId: CLIENT, status: "COMPLETED" },
      ],
    });

    const preview = await service(prisma).previewUser(CLIENT, OP);

    assert.deepEqual(preview.quotes, { draft: 2, other: 1 });
    assert.deepEqual(preview.invoices, { draft: 1, issued: 2 });
    assert.equal(preview.orders, 1);
    assert.deepEqual(preview.rotations, { active: 1, closed: 2 });
    assert.equal(preview.subscription, true);
    assert.deepEqual(preview.deliveryStops, { pending: 2, joue: 1 });
  });

  it("annonce le blocage quand une facture est émise", async () => {
    const { prisma } = createFakePrisma({ invoices: [invoice({ status: "SENT" })] });
    const preview = await service(prisma).previewUser(CLIENT, OP);

    assert.equal(preview.canHardDelete, false);
    assert.equal(preview.blockingReason, "CLIENT_HAS_ISSUED_INVOICES");
  });

  it("autorise la suppression quand il n'y a que des brouillons", async () => {
    const { prisma } = createFakePrisma({ invoices: [invoice(), invoice()] });
    const preview = await service(prisma).previewUser(CLIENT, OP);

    assert.equal(preview.canHardDelete, true);
    assert.equal(preview.blockingReason, undefined);
  });

  it("ignore ce qui est déjà supprimé", async () => {
    const { prisma } = createFakePrisma({
      quotes: [quote({ deletedAt: new Date() })],
      invoices: [invoice({ status: "PAID", deletedAt: new Date() })],
    });

    const preview = await service(prisma).previewUser(CLIENT, OP);
    assert.deepEqual(preview.quotes, { draft: 0, other: 0 });
    assert.equal(preview.canHardDelete, true, "une facture déjà supprimée ne bloque plus");
  });

  it("refuse un client d'un autre opérateur", async () => {
    const { prisma } = createFakePrisma();
    await assert.rejects(() => service(prisma).previewUser(CLIENT, "autre-operateur"), {
      code: "NOT_FOUND",
    });
  });
});

describe("garde-fou légal — facture émise", () => {
  // CANCELLED et REFUNDED comptent aussi : une facture annulée reste une pièce
  // numérotée dans la séquence comptable, elle ne s'efface pas non plus.
  const emises = ["SENT", "PAID", "OVERDUE", "CANCELLED", "REFUNDED"];

  for (const status of emises) {
    it(`refuse la cascade en 422 pour une facture ${status}`, async () => {
      const { prisma } = createFakePrisma({ invoices: [invoice({ status })] });

      await assert.rejects(
        () => service(prisma).cascadeDeleteUser(CLIENT, OP, ADMIN, "ROLE_ADMIN"),
        (err: any) => {
          assert.equal(err.statusCode, 422);
          assert.equal(err.code, "CLIENT_HAS_ISSUED_INVOICES");
          return true;
        },
      );
    });
  }

  it("ne supprime STRICTEMENT RIEN quand il refuse", async () => {
    const { prisma, store } = createFakePrisma({
      quotes: [quote()],
      invoices: [invoice(), invoice({ status: "PAID" })],
      orders: [{ id: "o1", userId: CLIENT, deletedAt: null }],
      rotations: [rotation()],
      subscriptions: [{ id: "s1", userId: CLIENT, operatorId: OP }],
    });

    await assert.rejects(() => service(prisma).cascadeDeleteUser(CLIENT, OP, ADMIN, "ROLE_ADMIN"));

    // Un refus qui aurait déjà supprimé les devis serait pire qu'une cascade
    // complète : l'admin croirait n'avoir rien fait.
    assert.equal(store.quote.rows[0]?.deletedAt, null);
    assert.equal(store.order.rows[0]?.deletedAt, null);
    assert.equal(store.rotation.rows[0]?.deletedAt, null);
    assert.equal(store.subscription.rows.length, 1, "l'abonnement est intact");
    assert.equal(store.user.rows[0]?.deletedAt, null, "le client reste actif");
  });

  it("laisse passer quand la seule facture émise est déjà supprimée", async () => {
    const { prisma } = createFakePrisma({
      invoices: [invoice({ status: "PAID", deletedAt: new Date() })],
    });

    const result = await service(prisma).cascadeDeleteUser(CLIENT, OP, ADMIN, "ROLE_ADMIN");
    assert.ok(result.deleted);
  });
});

describe("cascade sur un client", () => {
  let ctx: ReturnType<typeof createFakePrisma>;

  beforeEach(() => {
    ctx = createFakePrisma({
      quotes: [quote(), quote({ status: "ENVOYE" })],
      invoices: [invoice(), invoice()],
      orders: [
        { id: "o1", userId: CLIENT, deletedAt: null },
        { id: "o2", userId: CLIENT, deletedAt: null },
      ],
      rotations: [rotation(), rotation({ status: "REPRISE" })],
      subscriptions: [{ id: "s1", userId: CLIENT, operatorId: OP }],
      refreshTokens: [{ id: "rt1", userId: CLIENT, revokedAt: null }],
      deviceTokens: [{ id: "dt1", userId: CLIENT }],
    });
  });

  it("soft-delete devis, brouillons, commandes et rotations", async () => {
    const result = await service(ctx.prisma).cascadeDeleteUser(CLIENT, OP, ADMIN, "ROLE_ADMIN");

    assert.deepEqual(result.deleted, {
      quotes: 2,
      invoices: 2,
      orders: 2,
      rotations: 2,
      subscription: true,
      deliveryStops: 0,
      passageResponses: 0,
      notifications: 0,
      stocksLiberes: [],
    });
    assert.ok(ctx.store.quote.rows.every((q) => q.deletedAt !== null));
    assert.ok(ctx.store.order.rows.every((o) => o.deletedAt !== null));
    assert.ok(ctx.store.rotation.rows.every((r) => r.deletedAt !== null));
  });

  it("supprime réellement l'abonnement — un soft-delete empêcherait de se réabonner", async () => {
    // `Subscription.userId` est UNIQUE : une ligne conservée bloquerait à jamais
    // la création d'un nouvel abonnement pour ce client.
    await service(ctx.prisma).cascadeDeleteUser(CLIENT, OP, ADMIN, "ROLE_ADMIN");
    assert.equal(ctx.store.subscription.rows.length, 0);
  });

  it("révoque les sessions et retire les jetons push", async () => {
    await service(ctx.prisma).cascadeDeleteUser(CLIENT, OP, ADMIN, "ROLE_ADMIN");

    assert.notEqual(ctx.store.refreshToken.rows[0]?.revokedAt, null);
    assert.equal(ctx.store.deviceToken.rows.length, 0, "plus de push vers un compte supprimé");
  });

  it("désactive le compte", async () => {
    await service(ctx.prisma).cascadeDeleteUser(CLIENT, OP, ADMIN, "ROLE_ADMIN");

    assert.notEqual(ctx.store.user.rows[0]?.deletedAt, null);
    assert.equal(ctx.store.user.rows[0]?.isActive, false);
  });

  it("écrit une trace d'audit détaillée", async () => {
    await service(ctx.prisma).cascadeDeleteUser(CLIENT, OP, ADMIN, "ROLE_ADMIN");

    const entry = ctx.store.auditLog.rows[0];
    assert.equal(entry?.action, "DELETE");
    assert.equal(entry?.entity, "User");
    assert.equal(entry?.entityId, CLIENT);
    // Sans le détail, impossible de répondre plus tard à « où sont passés les
    // devis de ce client ? ».
    assert.equal((entry?.changes as any)?.cascade, true);
    assert.equal((entry?.changes as any)?.deleted?.quotes, 2);
  });

  it("interdit de se supprimer soi-même", async () => {
    await assert.rejects(
      () => service(ctx.prisma).cascadeDeleteUser(CLIENT, OP, CLIENT, "ROLE_ADMIN"),
      { code: "CANNOT_DELETE_SELF" },
    );
  });

  it("interdit à un ADMIN de supprimer un SUPER_ADMIN", async () => {
    const { prisma } = createFakePrisma({
      users: [
        { id: CLIENT, operatorId: OP, role: "ROLE_SUPER_ADMIN", name: "Patron", deletedAt: null },
      ],
    });

    await assert.rejects(() => service(prisma).cascadeDeleteUser(CLIENT, OP, ADMIN, "ROLE_ADMIN"), {
      code: "FORBIDDEN",
    });
  });
});

describe("anonymisation", () => {
  it("remplace l'identité par un pseudonyme numéroté", async () => {
    const { prisma, store } = createFakePrisma();
    const result = await service(prisma).anonymizeUser(CLIENT, OP, ADMIN, "ROLE_ADMIN");

    assert.equal(result.name, "Client anonymisé #1");
    assert.equal(store.user.rows[0]?.name, "Client anonymisé #1");
  });

  it("efface toutes les données nominatives du compte", async () => {
    const { prisma, store } = createFakePrisma();
    await service(prisma).anonymizeUser(CLIENT, OP, ADMIN, "ROLE_ADMIN");

    const user = store.user.rows[0];
    for (const champ of [
      "email",
      "phone",
      "address",
      "companyName",
      "city",
      "postalCode",
      "notes",
      "requirements",
      "stripeCustomerId",
    ]) {
      assert.equal(user?.[champ], null, `${champ} doit être vidé`);
    }
  });

  it("vide le mot de passe en même temps que l'email", async () => {
    // La contrainte `users_password_requires_email` (password_hash IS NULL OR
    // email IS NOT NULL) rejetterait sinon toute la transaction en base.
    const { prisma, store } = createFakePrisma();
    await service(prisma).anonymizeUser(CLIENT, OP, ADMIN, "ROLE_ADMIN");

    assert.equal(store.user.rows[0]?.passwordHash, null);
    assert.equal(store.user.rows[0]?.email, null);
  });

  it("anonymise les snapshots des devis et des rotations", async () => {
    const { prisma, store } = createFakePrisma({
      quotes: [quote({ clientNom: "Gîte des Oliviers", clientEmail: "g@x.test" })],
      rotations: [rotation()],
    });

    await service(prisma).anonymizeUser(CLIENT, OP, ADMIN, "ROLE_ADMIN");

    assert.equal(store.quote.rows[0]?.clientNom, "Client anonymisé #1");
    assert.equal(store.quote.rows[0]?.clientEmail, null);
    assert.equal(store.rotation.rows[0]?.clientNom, "Client anonymisé #1");
    assert.equal(store.rotation.rows[0]?.clientAdresse, null);
  });

  it("anonymise les factures BROUILLON mais PRÉSERVE les émises", async () => {
    // Une facture doit nommer son client pour rester opposable : effacer le
    // snapshot d'une facture émise la rendrait non conforme.
    const { prisma, store } = createFakePrisma({
      invoices: [invoice({ id: "draft" }), invoice({ id: "emise", status: "PAID" })],
    });

    const result = await service(prisma).anonymizeUser(CLIENT, OP, ADMIN, "ROLE_ADMIN");

    const draft = store.invoice.rows.find((i) => i.id === "draft");
    const emise = store.invoice.rows.find((i) => i.id === "emise");

    assert.equal(draft?.clientNom, "Client anonymisé #1");
    assert.equal(emise?.clientNom, "Gîte des Oliviers", "la facture émise garde son client");
    assert.equal(emise?.clientEmail, "gite@example.test");
    assert.deepEqual(result.invoices, { anonymized: 1, preserved: 1 });
  });

  it("numérote à la suite des anonymisations précédentes", async () => {
    const { prisma } = createFakePrisma({
      users: [
        { id: CLIENT, operatorId: OP, role: "ROLE_CLIENT", name: "Vrai Client", deletedAt: null },
        { id: "x", operatorId: OP, role: "ROLE_CLIENT", name: "Client anonymisé #1" },
        { id: "y", operatorId: OP, role: "ROLE_CLIENT", name: "Client anonymisé #2" },
      ],
    });

    const result = await service(prisma).anonymizeUser(CLIENT, OP, ADMIN, "ROLE_ADMIN");
    assert.equal(result.name, "Client anonymisé #3");
  });

  it("refuse d'anonymiser deux fois", async () => {
    const { prisma } = createFakePrisma({
      users: [
        {
          id: CLIENT,
          operatorId: OP,
          role: "ROLE_CLIENT",
          name: "Client anonymisé #1",
          deletedAt: null,
        },
      ],
    });

    await assert.rejects(() => service(prisma).anonymizeUser(CLIENT, OP, ADMIN, "ROLE_ADMIN"), {
      code: "ALREADY_ANONYMIZED",
    });
  });

  it("interdit de s'anonymiser soi-même", async () => {
    const { prisma } = createFakePrisma();
    await assert.rejects(() => service(prisma).anonymizeUser(CLIENT, OP, CLIENT, "ROLE_ADMIN"), {
      code: "CANNOT_ANONYMIZE_SELF",
    });
  });

  it("reste possible sur un client déjà désactivé", async () => {
    // C'est même le cas le plus courant : on désactive, puis on anonymise.
    const { prisma } = createFakePrisma({
      users: [
        {
          id: CLIENT,
          operatorId: OP,
          role: "ROLE_CLIENT",
          name: "Ancien client",
          deletedAt: new Date(),
        },
      ],
    });

    const result = await service(prisma).anonymizeUser(CLIENT, OP, ADMIN, "ROLE_ADMIN");
    assert.equal(result.name, "Client anonymisé #1");
  });

  it("ne consigne aucune donnée personnelle dans l'audit", async () => {
    const { prisma, store } = createFakePrisma();
    await service(prisma).anonymizeUser(CLIENT, OP, ADMIN, "ROLE_ADMIN");

    const trace = JSON.stringify(store.auditLog.rows[0]);
    assert.ok(!trace.includes("gite@example.test"), "l'email ne doit pas fuir dans le journal");
    assert.ok(!trace.includes("0600000000"));
  });
});

describe("aperçu et suppression d'un abonnement", () => {
  const SUB = "sub-1";
  const base = {
    id: SUB,
    userId: CLIENT,
    operatorId: OP,
    status: "ACTIVE",
    committedUntil: null as Date | null,
  };

  it("compte les rotations d'abonnement et les factures récurrentes", async () => {
    const { prisma } = createFakePrisma({
      subscriptions: [{ ...base }],
      rotations: [
        rotation({ formule: "ABONNEMENT" }),
        rotation({ formule: "ABONNEMENT", status: "REPRISE" }),
        rotation({ formule: "PONCTUEL" }),
      ],
      invoices: [
        invoice({ status: "PAID", periodStart: new Date(2026, 5, 1) }),
        invoice({ status: "PAID" }),
      ],
    });

    const preview = await service(prisma).previewSubscription(SUB, OP);

    assert.deepEqual(preview.rotations, { active: 1, closed: 1 });
    assert.equal(preview.recurringInvoices, 1, "seule la facture avec période compte");
  });

  it("signale un engagement en cours sans bloquer", async () => {
    const now = new Date(2026, 6, 28);
    const { prisma } = createFakePrisma({
      subscriptions: [{ ...base, committedUntil: new Date(2026, 8, 1) }],
    });

    const preview = await service(prisma).previewSubscription(SUB, OP, now);

    assert.equal(preview.engagement.active, true);
    assert.equal(preview.engagement.joursRestants, 35);
    assert.equal(preview.canDelete, true, "l'engagement informe, il n'interdit pas");
  });

  it("ne signale rien quand l'engagement est échu", async () => {
    const now = new Date(2026, 6, 28);
    const { prisma } = createFakePrisma({
      subscriptions: [{ ...base, committedUntil: new Date(2026, 3, 1) }],
    });

    const preview = await service(prisma).previewSubscription(SUB, OP, now);
    assert.equal(preview.engagement.active, false);
    assert.equal(preview.engagement.joursRestants, 0);
  });

  it("supprime l'abonnement seul sans cascade", async () => {
    const { prisma, store } = createFakePrisma({
      subscriptions: [{ ...base }],
      rotations: [rotation({ formule: "ABONNEMENT" })],
    });

    const result = await service(prisma).deleteSubscription(SUB, OP, false, ADMIN);

    assert.equal(result.deleted.rotations, 0);
    assert.equal(store.subscription.rows.length, 0);
    assert.equal(store.rotation.rows[0]?.deletedAt, null, "la rotation survit sans cascade");
  });

  it("solde les rotations d'abonnement avec cascade, jamais les ponctuelles", async () => {
    const { prisma, store } = createFakePrisma({
      subscriptions: [{ ...base }],
      rotations: [
        rotation({ id: "abo", formule: "ABONNEMENT" }),
        rotation({ id: "ponctuel", formule: "PONCTUEL" }),
      ],
    });

    const result = await service(prisma).deleteSubscription(SUB, OP, true, ADMIN);

    assert.equal(result.deleted.rotations, 1);
    assert.notEqual(store.rotation.rows.find((r) => r.id === "abo")?.deletedAt, null);
    assert.equal(store.rotation.rows.find((r) => r.id === "ponctuel")?.deletedAt, null);
  });

  it("ne touche jamais aux factures récurrentes déjà émises", async () => {
    const { prisma, store } = createFakePrisma({
      subscriptions: [{ ...base }],
      invoices: [invoice({ status: "PAID", periodStart: new Date(2026, 5, 1) })],
    });

    const result = await service(prisma).deleteSubscription(SUB, OP, true, ADMIN);

    assert.equal(result.invoicesPreserved, 1);
    assert.equal(store.invoice.rows[0]?.deletedAt, null);
  });

  it("refuse un abonnement d'un autre opérateur", async () => {
    const { prisma } = createFakePrisma({ subscriptions: [{ ...base }] });
    await assert.rejects(() => service(prisma).previewSubscription(SUB, "autre-op"), {
      code: "NOT_FOUND",
    });
  });
});

// ===========================================================================

/**
 * Ce que la cascade laissait derrière elle.
 *
 * Le symptôme visible était un arrêt « Client supprimé » au milieu d'une
 * tournée : le client n'existait plus nulle part, sauf dans l'application du
 * livreur, qui partait le servir. Ces tests fixent la frontière entre ce qui
 * disparaît (la planification) et ce qui reste (les preuves).
 */
describe("cascade — tournées, passages et stock", () => {
  function contexte() {
    return createFakePrisma({
      deliveryStops: [
        { id: "st1", clientId: CLIENT, status: "PENDING" },
        { id: "st2", clientId: CLIENT, status: "COMPLETED" },
        { id: "st3", clientId: CLIENT, status: "SKIPPED" },
        { id: "st4", clientId: CLIENT, status: "FAILED" },
        // Arrêt d'un AUTRE client : la cascade ne doit jamais déborder.
        { id: "st5", clientId: "client-2", status: "PENDING" },
      ],
      passageResponses: [
        { id: "pr1", userId: CLIENT },
        { id: "pr2", userId: "client-2" },
      ],
      notifications: [
        { id: "n1", userId: CLIENT },
        { id: "n2", userId: "client-2" },
      ],
      notificationSettings: [{ id: "ns1", userId: CLIENT }],
      clientStocks: [
        { id: "cs1", userId: CLIENT, productRange: "BAIN", totalInCirculation: 12 },
        { id: "cs2", userId: CLIENT, productRange: "LIT", totalInCirculation: 0 },
      ],
    });
  }

  it("supprime les arrêts À VENIR du client", async () => {
    const { prisma, store } = contexte();
    const result = await service(prisma).cascadeDeleteUser(CLIENT, OP, ADMIN, "ROLE_ADMIN");

    assert.equal(result.deleted.deliveryStops, 1);
    assert.equal(
      store.deliveryStop.rows.find((s: any) => s.id === "st1"),
      undefined,
    );
  });

  it("CONSERVE les arrêts déjà joués — ils portent les preuves de remise", async () => {
    const { prisma, store } = contexte();
    await service(prisma).cascadeDeleteUser(CLIENT, OP, ADMIN, "ROLE_ADMIN");

    // Livré, sauté, échoué : trois faits datés. Les effacer réécrirait
    // l'historique d'une journée de livraison.
    for (const id of ["st2", "st3", "st4"]) {
      assert.ok(
        store.deliveryStop.rows.some((s: any) => s.id === id),
        "l'arrêt " + id + " devait survivre",
      );
    }
  });

  it("ne déborde jamais sur un autre client", async () => {
    const { prisma, store } = contexte();
    await service(prisma).cascadeDeleteUser(CLIENT, OP, ADMIN, "ROLE_ADMIN");

    assert.ok(store.deliveryStop.rows.some((s: any) => s.id === "st5"));
    assert.ok(store.passageResponse.rows.some((r: any) => r.id === "pr2"));
    assert.ok(store.notification.rows.some((n: any) => n.id === "n2"));
  });

  it("efface les réponses aux passages groupés", async () => {
    // En laisser une ferait charger du linge pour un client disparu.
    const { prisma, store } = contexte();
    const result = await service(prisma).cascadeDeleteUser(CLIENT, OP, ADMIN, "ROLE_ADMIN");

    assert.equal(result.deleted.passageResponses, 1);
    assert.equal(store.passageResponse.rows.filter((r: any) => r.userId === CLIENT).length, 0);
  });

  it("efface notifications et préférences", async () => {
    const { prisma, store } = contexte();
    const result = await service(prisma).cascadeDeleteUser(CLIENT, OP, ADMIN, "ROLE_ADMIN");

    assert.equal(result.deleted.notifications, 1);
    assert.equal(store.notificationSetting.rows.length, 0);
  });

  it("relève le linge encore dehors avant d'effacer l'attribution", async () => {
    // La suppression ne fait pas rentrer le textile : sans ce relevé, personne
    // ne saurait plus que 12 sets sont partis avec le compte.
    const { prisma, store } = contexte();
    const result = await service(prisma).cascadeDeleteUser(CLIENT, OP, ADMIN, "ROLE_ADMIN");

    assert.deepEqual(result.deleted.stocksLiberes, [{ gamme: "BAIN", sets: 12 }]);
    assert.equal(store.clientStock.rows.length, 0);
  });

  it("annonce dans l'aperçu ce que la suppression laissera dehors", async () => {
    const { prisma } = contexte();
    const preview = await service(prisma).previewUser(CLIENT, OP);

    assert.equal(preview.setsEnCirculation, 12);
    assert.equal(preview.passageResponses, 1);
    assert.deepEqual(preview.deliveryStops, { pending: 1, joue: 3 });
  });
});

/**
 * Le compte peut être un LIVREUR. `DeliveryRound.driverId` est obligatoire :
 * le supprimer laisserait des tournées attendues pointer un compte inexistant.
 */
describe("cascade — le cas du livreur", () => {
  const LIVREUR = CLIENT;

  it("refuse de supprimer un livreur attendu sur une tournée", async () => {
    const { prisma, store } = createFakePrisma({
      deliveryRounds: [{ id: "dr1", driverId: LIVREUR, status: "PLANNED" }],
      quotes: [quote()],
    });

    await assert.rejects(
      () => service(prisma).cascadeDeleteUser(LIVREUR, OP, ADMIN, "ROLE_ADMIN"),
      {
        code: "DRIVER_HAS_ACTIVE_ROUNDS",
      },
    );

    // Le refus ne laisse AUCUNE écriture partielle.
    assert.equal(store.quote.rows[0]?.deletedAt, null);
    assert.equal(store.user.rows[0]?.deletedAt, null);
  });

  it("refuse aussi pendant une tournée en cours", async () => {
    const { prisma } = createFakePrisma({
      deliveryRounds: [{ id: "dr1", driverId: LIVREUR, status: "IN_PROGRESS" }],
    });

    await assert.rejects(
      () => service(prisma).cascadeDeleteUser(LIVREUR, OP, ADMIN, "ROLE_ADMIN"),
      {
        code: "DRIVER_HAS_ACTIVE_ROUNDS",
      },
    );
  });

  it("laisse passer quand ses tournées sont soldées ou annulées", async () => {
    // C'est précisément ce que débloque l'annulation de tournée : l'admin annule,
    // puis le compte redevient supprimable.
    const { prisma } = createFakePrisma({
      deliveryRounds: [
        { id: "dr1", driverId: LIVREUR, status: "COMPLETED" },
        { id: "dr2", driverId: LIVREUR, status: "CANCELLED" },
      ],
    });

    const result = await service(prisma).cascadeDeleteUser(LIVREUR, OP, ADMIN, "ROLE_ADMIN");
    assert.ok(result.deleted);
  });

  it("signale le blocage dans l'aperçu, avant que l'admin ne tente", async () => {
    const { prisma } = createFakePrisma({
      deliveryRounds: [{ id: "dr1", driverId: LIVREUR, status: "PLANNED" }],
    });

    const preview = await service(prisma).previewUser(LIVREUR, OP);
    assert.equal(preview.canHardDelete, false);
    assert.equal(preview.blockingReason, "DRIVER_HAS_ACTIVE_ROUNDS");
    assert.equal(preview.activeDriverRounds, 1);
  });

  it("la facture émise reste prioritaire sur le motif livreur", async () => {
    const { prisma } = createFakePrisma({
      invoices: [invoice({ status: "SENT" })],
      deliveryRounds: [{ id: "dr1", driverId: LIVREUR, status: "PLANNED" }],
    });

    const preview = await service(prisma).previewUser(LIVREUR, OP);
    assert.equal(preview.blockingReason, "CLIENT_HAS_ISSUED_INVOICES");
  });
});

describe("anonymisation — exploitation", () => {
  it("retire les arrêts à venir et les réponses de passage", async () => {
    // Un camion ne doit pas continuer de se présenter chez « Client anonymisé ».
    const { prisma, store } = createFakePrisma({
      deliveryStops: [
        { id: "st1", clientId: CLIENT, status: "PENDING" },
        { id: "st2", clientId: CLIENT, status: "COMPLETED" },
      ],
      passageResponses: [{ id: "pr1", userId: CLIENT }],
      notifications: [{ id: "n1", userId: CLIENT }],
    });

    const result = await service(prisma).anonymizeUser(CLIENT, OP, ADMIN, "ROLE_ADMIN");

    assert.equal(result.deliveryStops, 1);
    assert.equal(result.passageResponses, 1);
    assert.ok(store.deliveryStop.rows.some((s: any) => s.id === "st2"));
    assert.equal(store.notification.rows.length, 0);
  });
});
