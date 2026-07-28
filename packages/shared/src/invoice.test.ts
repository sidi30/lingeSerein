/**
 * Snapshot de facture : normalisation des lignes et garde-fou de cohérence.
 *
 * Point sensible : DEUX producteurs écrivent `metadata.lines` avec des clés
 * différentes — la facturation d'un devis (`designation`/`qty`) et le worker
 * d'abonnement (`product`/`quantity`). Les deux doivent s'imprimer.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  INVOICE_WARNING_LABELS,
  checkInvoiceTotals,
  normalizeInvoiceLines,
  type InvoiceForPdf,
} from "./invoice.ts";

function facture(over: Partial<InvoiceForPdf> = {}): InvoiceForPdf {
  return {
    invoiceNumber: "FACT-2026-0042",
    status: "SENT",
    clientNom: "Gîte des Oliviers",
    clientEmail: null,
    clientAdresse: null,
    totalHtCents: 12960,
    vatRate: 0,
    vatAmountCents: 0,
    totalTtcCents: 12960,
    dueDate: "2026-08-27T00:00:00.000Z",
    paidAt: null,
    createdAt: "2026-07-28T09:12:00.000Z",
    metadata: {
      lines: [
        { designation: "Kit Complet (Bain + Lit)", qty: 4, unitCents: 2900, totalCents: 11600 },
        { designation: "Kit Bain", qty: 2, unitCents: 750, totalCents: 1500 },
      ],
      sousTotalCents: 13100,
      remisePct: 1000,
      remiseCents: 1310,
      livraisonCents: 1170,
    },
    ...over,
  };
}

describe("normalizeInvoiceLines", () => {
  it("accepte la forme écrite lors de la facturation d'un devis", () => {
    const lines = normalizeInvoiceLines([
      { designation: "Kit Bain", qty: 2, unitCents: 750, totalCents: 1500 },
    ]);
    assert.deepEqual(lines, [
      { designation: "Kit Bain", qty: 2, unitCents: 750, totalCents: 1500 },
    ]);
  });

  it("accepte la forme écrite par le worker d'abonnement", () => {
    const lines = normalizeInvoiceLines([
      { product: "Pack Sérénité", quantity: 1, unitCents: 8900, totalCents: 8900 },
    ]);
    assert.deepEqual(lines, [
      { designation: "Pack Sérénité", qty: 1, unitCents: 8900, totalCents: 8900 },
    ]);
  });

  it("n'imprime jamais « undefined » sur une ligne d'abonnement", () => {
    const [ligne] = normalizeInvoiceLines([
      { product: "Pack Sérénité", quantity: 2, unitCents: 8900 },
    ]);
    assert.equal(ligne?.designation, "Pack Sérénité");
    assert.equal(ligne?.qty, 2);
    assert.ok(!String(ligne?.designation).includes("undefined"));
  });

  it("déduit le total de ligne manquant de qté × prix unitaire", () => {
    const [ligne] = normalizeInvoiceLines([{ designation: "Kit Bain", qty: 3, unitCents: 750 }]);
    assert.equal(ligne?.totalCents, 2250);
  });

  it("préfère le total figé au recalcul, même s'il diffère", () => {
    // Le snapshot fait foi : une remise de ligne consentie à l'émission doit
    // survivre, pas être écrasée par un recalcul.
    const [ligne] = normalizeInvoiceLines([
      { designation: "Kit Bain", qty: 3, unitCents: 750, totalCents: 2000 },
    ]);
    assert.equal(ligne?.totalCents, 2000);
  });

  it("tolère une facture sans lignes", () => {
    assert.deepEqual(normalizeInvoiceLines(undefined), []);
    assert.deepEqual(normalizeInvoiceLines([]), []);
  });

  it("remplace une désignation absente par une chaîne vide, jamais « undefined »", () => {
    const [ligne] = normalizeInvoiceLines([{ qty: 1, unitCents: 100 }]);
    assert.equal(ligne?.designation, "");
  });
});

describe("checkInvoiceTotals", () => {
  it("valide une facture issue d'un devis (lignes − remise + livraison = HT)", () => {
    const check = checkInvoiceTotals(facture());
    assert.equal(check.ok, true);
    assert.equal(check.verifiable, true);
    assert.equal(check.computedCents, 12960);
  });

  it("valide une facture d'abonnement sans remise ni livraison", () => {
    const check = checkInvoiceTotals(
      facture({
        totalHtCents: 8900,
        vatRate: 2000,
        vatAmountCents: 1780,
        totalTtcCents: 10680,
        metadata: {
          plan: "Pack Sérénité",
          lines: [{ product: "Pack Sérénité", quantity: 1, unitCents: 8900, totalCents: 8900 }],
        },
      }),
    );
    assert.equal(check.ok, true);
    assert.equal(check.computedCents, 8900);
  });

  it("détecte un total HT qui ne correspond pas au détail", () => {
    const check = checkInvoiceTotals(facture({ totalHtCents: 9999 }));
    assert.equal(check.ok, false);
    assert.equal(check.verifiable, true);
    assert.equal(check.computedCents, 12960);
    assert.equal(check.totalHtCents, 9999);
  });

  it("détecte une remise trafiquée après émission", () => {
    const f = facture();
    const check = checkInvoiceTotals({
      ...f,
      metadata: { ...f.metadata, remiseCents: 5000 },
    });
    assert.equal(check.ok, false);
  });

  it("se déclare non vérifiable — sans échouer — sur une facture sans lignes", () => {
    const check = checkInvoiceTotals(facture({ metadata: { plan: "Pack Sérénité" } }));
    assert.equal(check.verifiable, false);
    assert.equal(check.ok, true, "une facture d'abonnement sans lignes doit rester imprimable");
    assert.equal(check.computedCents, check.totalHtCents);
  });

  it("traite remise et livraison absentes comme nulles", () => {
    const check = checkInvoiceTotals(
      facture({
        totalHtCents: 1500,
        metadata: { lines: [{ designation: "Kit Bain", qty: 2, unitCents: 750 }] },
      }),
    );
    assert.equal(check.ok, true);
    assert.equal(check.computedCents, 1500);
  });
});

describe("INVOICE_WARNING_LABELS", () => {
  it("signale les statuts qui ne doivent pas passer pour une facture due", () => {
    assert.equal(INVOICE_WARNING_LABELS.DRAFT, "BROUILLON");
    assert.equal(INVOICE_WARNING_LABELS.CANCELLED, "FACTURE ANNULÉE");
    assert.equal(INVOICE_WARNING_LABELS.REFUNDED, "FACTURE REMBOURSÉE");
  });

  it("laisse les factures exigibles sans filigrane", () => {
    assert.equal(INVOICE_WARNING_LABELS.SENT, undefined);
    assert.equal(INVOICE_WARNING_LABELS.PAID, undefined);
    assert.equal(INVOICE_WARNING_LABELS.OVERDUE, undefined);
  });
});
