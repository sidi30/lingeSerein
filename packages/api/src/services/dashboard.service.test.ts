/**
 * Chiffre d'affaires du tableau de bord.
 *
 * Le KPI ne sommait que `total_cents`, c'est-à-dire le sous-total des ARTICLES :
 * la livraison, facturée depuis qu'elle a sa propre colonne, n'entrait dans aucun
 * chiffre. L'écart grandit avec chaque course sortie de la gratuité, et il est
 * invisible — un CA sous-évalué ressemble à un CA.
 *
 * Deux propriétés, la seconde autant que la première :
 *   1. le CA additionne articles ET livraison ;
 *   2. les commandes ANTÉRIEURES ne bougent pas. `delivery_fee_cents` vaut 0 par
 *      DEFAULT sur tout l'historique (migration additive) : la courbe des douze
 *      mois doit rendre exactement les mêmes montants qu'avant.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { DashboardService } from "./dashboard.service.ts";

interface Somme {
  totalCents: number | null;
  deliveryFeeCents?: number | null;
}

/** Prisma minimal : `order.aggregate` rend la somme demandée, le reste est muet. */
function fakePrisma(sommes: Somme[]) {
  let appel = 0;
  const champsDemandes: Record<string, unknown>[] = [];

  return {
    champsDemandes,
    client: {
      order: {
        aggregate: (args: { _sum: Record<string, unknown> }) => {
          champsDemandes.push(args._sum);
          const somme = sommes[Math.min(appel, sommes.length - 1)];
          appel += 1;
          return Promise.resolve({
            _sum: { totalCents: somme?.totalCents ?? null, ...somme },
          });
        },
      },
      deliveryStop: { count: () => Promise.resolve(0) },
      user: { count: () => Promise.resolve(0) },
      subscription: { count: () => Promise.resolve(0) },
      $queryRaw: () => Promise.resolve([{ count: 0n }]),
    },
  };
}

describe("DashboardService.getKpis — le CA inclut la livraison", () => {
  it("additionne articles et frais de livraison", async () => {
    // 15 000 € d'articles + 1 200 € de livraison cette semaine ; 10 000 + 0 la
    // précédente (semaine d'avant le sprint, aucune livraison facturée).
    const fake = fakePrisma([
      { totalCents: 1500000, deliveryFeeCents: 120000 },
      { totalCents: 1000000, deliveryFeeCents: 0 },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kpis = await new DashboardService(fake.client as any).getKpis("op-1");

    assert.equal(kpis.revenueCents, 1620000);
    assert.equal(kpis.revenuePrevWeekCents, 1000000);
    // La colonne doit être DEMANDÉE à Prisma : sans elle, `_sum` ne la porte pas
    // et l'addition ci-dessus resterait vraie en ajoutant zéro, indéfiniment.
    assert.equal(fake.champsDemandes[0]?.["deliveryFeeCents"], true);
  });

  it("ne bouge d'aucun centime sur les commandes antérieures", async () => {
    // Tout l'historique porte `delivery_fee_cents = 0` (DEFAULT de la migration).
    const fake = fakePrisma([
      { totalCents: 830000, deliveryFeeCents: 0 },
      { totalCents: 790000, deliveryFeeCents: 0 },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kpis = await new DashboardService(fake.client as any).getKpis("op-1");

    assert.equal(kpis.revenueCents, 830000);
    assert.equal(kpis.revenuePrevWeekCents, 790000);
  });

  it("rend 0 plutôt que NaN quand aucune commande n'entre dans la période", async () => {
    // `_sum` d'un agrégat vide renvoie `null` sur CHAQUE colonne.
    const fake = fakePrisma([{ totalCents: null, deliveryFeeCents: null }]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kpis = await new DashboardService(fake.client as any).getKpis("op-1");

    assert.equal(kpis.revenueCents, 0);
    assert.equal(kpis.revenuePrevWeekCents, 0);
  });
});

describe("DashboardService.getRevenueChart — même règle sur les douze mois", () => {
  it("inclut la livraison dans chaque point de la courbe", async () => {
    const fake = fakePrisma([{ totalCents: 200000, deliveryFeeCents: 2400 }]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mois = await new DashboardService(fake.client as any).getRevenueChart();

    assert.equal(mois.length, 12);
    for (const point of mois) {
      assert.equal(point.revenueCents, 202400);
    }
  });
});
