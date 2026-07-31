/**
 * UI tests — F7 Jauge d'urgence & catalogue du formulaire de devis
 *
 * - Les 4 niveaux d'urgence sont proposés (Standard / Express 24 h / Jour même / Flash)
 * - Jour même → forfait 39 € applicable au champ « frais de livraison »
 * - Express 24 h → forfait 25 €
 * - Flash < 3 h → « sur devis », bouton « Appliquer » masqué (aucun tarif public)
 * - Zones : les 4 paliers du barème Vaucluse + hors zone, plus aucune « zone élargie »
 * - Catalogue : le Kit Complet est proposé à 29 € (valeur du catalogue partagé)
 */

import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("UI F7 — Jauge d'urgence (devis)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/devis/nouveau");
    await expect(page.locator("form")).toBeVisible({ timeout: 10_000 });
  });

  test("Les 4 niveaux d'urgence sont proposés", async ({ page }) => {
    const group = page.getByRole("group", { name: /urgence/i });
    await expect(group).toBeVisible({ timeout: 8_000 });

    await expect(group.getByRole("button", { name: /standard/i })).toBeVisible();
    await expect(group.getByRole("button", { name: /express 24/i })).toBeVisible();
    await expect(group.getByRole("button", { name: /jour même/i })).toBeVisible();
    await expect(group.getByRole("button", { name: /flash/i })).toBeVisible();
  });

  test("L'ancien sélecteur de délai en jours a disparu", async ({ page }) => {
    // Remplacé par la jauge : plus de select #delaiJours ni d'options « J+1 ».
    await expect(page.locator("#delaiJours")).toHaveCount(0);
    await expect(page.getByText(/J\+1 — urgence/i)).toHaveCount(0);
  });

  test("Jour même → forfait 39 € appliqué au champ livraison", async ({ page }) => {
    await page
      .getByRole("group", { name: /urgence/i })
      .getByRole("button", { name: /jour même/i })
      .click();

    await expect(page.getByText(/forfait/i).first()).toBeVisible({ timeout: 8_000 });

    await page.getByRole("button", { name: /^appliquer$/i }).click();
    await expect(page.locator("#livraisonEuros")).toHaveValue("39");
  });

  test("Express 24 h → forfait 25 € appliqué au champ livraison", async ({ page }) => {
    await page
      .getByRole("group", { name: /urgence/i })
      .getByRole("button", { name: /express 24/i })
      .click();

    await page.getByRole("button", { name: /^appliquer$/i }).click();
    await expect(page.locator("#livraisonEuros")).toHaveValue("25");
  });

  test("Flash < 3 h → sur devis, sans bouton Appliquer", async ({ page }) => {
    await page
      .getByRole("group", { name: /urgence/i })
      .getByRole("button", { name: /flash/i })
      .click();

    // Aucun tarif public : l'admin doit chiffrer lui-même.
    await expect(page.getByText(/sur devis/i).first()).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole("button", { name: /^appliquer$/i })).toHaveCount(0);
    await expect(page.getByText(/à chiffrer/i).first()).toBeVisible();
  });

  test("Hors zone → sur devis quel que soit le niveau d'urgence", async ({ page }) => {
    await page.locator("#zoneLivraison").selectOption("HORS_ZONE");
    await expect(page.getByText(/sur devis/i).first()).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole("button", { name: /^appliquer$/i })).toHaveCount(0);
  });

  test("Le sélecteur propose les 4 paliers du Vaucluse, sans zone élargie", async ({ page }) => {
    const zone = page.locator("#zoneLivraison");
    await expect(zone).toBeVisible({ timeout: 8_000 });

    // Barème Vaucluse : les paliers se comptent depuis Orange, et le hors-Vaucluse
    // n'a aucun tarif public. « ELARGIE » appartenait au barème précédent.
    const values = await zone
      .locator("option")
      .evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value));
    expect(values).toEqual(["ORANGE", "PROCHE", "INTERMEDIAIRE", "ELOIGNE", "HORS_ZONE"]);
    await expect(zone).not.toContainText(/élargie/i);
  });

  test("Standard : Orange est offerte, le palier PROCHE vaut 12 €", async ({ page }) => {
    const urgence = page.getByRole("group", { name: /urgence/i });
    const appliquer = page.getByRole("button", { name: /^appliquer$/i });
    await urgence.getByRole("button", { name: /standard/i }).click();

    // Premier palier payant : jusqu'à 15 km d'Orange.
    await page.locator("#zoneLivraison").selectOption("PROCHE");
    await appliquer.click();
    await expect(page.locator("#livraisonEuros")).toHaveValue("12");

    // Orange = commune du siège : la course est incluse. « Appliquer » disparaît
    // dès que le champ porte déjà le tarif du barème — ici 0 — donc on ne clique
    // que s'il est encore proposé, sinon le montant est déjà bon.
    await page.locator("#zoneLivraison").selectOption("ORANGE");
    await expect(page.getByText(/offerte/i).first()).toBeVisible({ timeout: 8_000 });
    if (await appliquer.isVisible().catch(() => false)) await appliquer.click();
    await expect(page.locator("#livraisonEuros")).toHaveValue("0");
  });

  test("Catalogue : Kit Complet proposé à 29 € (catalogue partagé)", async ({ page }) => {
    // Le prix vient de CATALOG_PRODUCTS, plus d'un tableau codé en dur à 22 €.
    const chip = page.getByRole("button", { name: /kit complet/i }).first();
    await expect(chip).toBeVisible({ timeout: 8_000 });
    await expect(chip).toContainText("29,00");
    await expect(chip).not.toContainText("22,00");
  });
});
