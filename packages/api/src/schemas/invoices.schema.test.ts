/**
 * Filtre `excludeStatus` de la liste des factures.
 *
 * Un mauvais découpage ne lève aucune erreur : il masque des factures réelles ou
 * laisse passer les brouillons, et personne ne s'en aperçoit avant de chercher
 * une facture qui « a disparu ». D'où ces cas explicites.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { listInvoicesQuerySchema } from "./invoices.schema.ts";

/** Raccourci : ne renvoie que les statuts exclus après validation. */
function exclus(query: Record<string, string>): string[] {
  const parsed = listInvoicesQuerySchema.safeParse(query);
  assert.ok(parsed.success, "la requête doit rester valide");
  return parsed.data.excludeStatus;
}

describe("excludeStatus", () => {
  it("est vide par défaut — aucun filtrage implicite", () => {
    assert.deepEqual(exclus({}), []);
  });

  it("accepte un statut seul", () => {
    assert.deepEqual(exclus({ excludeStatus: "DRAFT" }), ["DRAFT"]);
  });

  it("accepte plusieurs statuts en CSV", () => {
    assert.deepEqual(exclus({ excludeStatus: "DRAFT,CANCELLED" }), ["DRAFT", "CANCELLED"]);
  });

  it("tolère espaces et minuscules", () => {
    assert.deepEqual(exclus({ excludeStatus: " draft , Cancelled " }), ["DRAFT", "CANCELLED"]);
  });

  it("ignore un statut inconnu au lieu de rejeter la requête", () => {
    // Un filtre d'affichage ne doit jamais transformer une liste en erreur 400.
    assert.deepEqual(exclus({ excludeStatus: "DRAFT,PLOP" }), ["DRAFT"]);
    assert.deepEqual(exclus({ excludeStatus: "PLOP" }), []);
  });

  it("n'écrase pas les autres filtres", () => {
    const parsed = listInvoicesQuerySchema.safeParse({
      excludeStatus: "DRAFT",
      year: "2026",
      page: "2",
    });
    assert.ok(parsed.success);
    assert.equal(parsed.data.year, 2026);
    assert.equal(parsed.data.page, 2);
    assert.equal(parsed.data.limit, 20, "la valeur par défaut reste appliquée");
  });
});
