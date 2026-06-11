/**
 * UI tests — F1 Devis (parcours critiques)
 *
 * - Navigation /devis → liste visible
 * - Sidebar lien "Devis"
 * - Page /devis accessible après login
 * - Lien "Nouveau devis" visible
 * Note: création complète via UI est testée en mode light car le formulaire
 * peut dépendre de composants complexes — on vérifie surtout que les routes
 * existent et sont accessibles, sans server-error 500.
 */

import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";
import { createQuote } from "./helpers/api";

test.describe("UI F1 — Devis", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("Page /devis se charge sans erreur 500", async ({ page }) => {
    const response = await page.goto("/devis");
    expect(response?.status()).toBeLessThan(400);
    // No uncaught server error text
    await expect(page.locator("body")).not.toContainText("Internal Server Error", {
      timeout: 5_000,
    });
    await expect(page.locator("body")).not.toContainText("500", { timeout: 2_000 });
  });

  test('Sidebar contient lien "Devis"', async ({ page }) => {
    await page.goto("/");
    await expect(
      page.locator('nav a[href*="/devis"], aside a[href*="/devis"]').first(),
    ).toBeVisible({ timeout: 8_000 });
  });

  test("Liste /devis affiche un titre ou entête de page", async ({ page }) => {
    await page.goto("/devis");
    // Heading with "Devis" or similar
    const heading = page
      .getByRole("heading", { name: /devis/i })
      .or(page.locator("h1, h2").filter({ hasText: /devis/i }))
      .first();
    await expect(heading).toBeVisible({ timeout: 8_000 });
  });

  test('Bouton "Nouveau devis" visible sur /devis', async ({ page }) => {
    await page.goto("/devis");
    const newBtn = page
      .getByRole("button", { name: /nouveau.*devis|créer.*devis/i })
      .or(page.getByRole("link", { name: /nouveau.*devis|créer.*devis/i }))
      .first();
    await expect(newBtn).toBeVisible({ timeout: 8_000 });
  });

  test("Page /devis/nouveau accessible", async ({ page }) => {
    const response = await page.goto("/devis/nouveau");
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
    // Form should be present
    await expect(page.locator("form")).toBeVisible({ timeout: 8_000 });
  });

  test("Page /devis/:id accessible pour un devis existant", async ({ page }) => {
    const quote = await createQuote();
    const response = await page.goto(`/devis/${quote.id}`);
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
    // Quote number or details should appear
    await expect(page.locator("body")).toContainText(quote.numero, { timeout: 8_000 });
  });

  test("Bouton PDF visible sur page /devis/:id", async ({ page }) => {
    const quote = await createQuote();
    await page.goto(`/devis/${quote.id}`);

    const pdfBtn = page
      .getByRole("button", { name: /pdf|télécharger|download/i })
      .or(page.getByRole("link", { name: /pdf|télécharger|download/i }))
      .first();
    await expect(pdfBtn).toBeVisible({ timeout: 8_000 });
  });

  test("Bouton changement statut BROUILLON→ENVOYE visible sur /devis/:id", async ({ page }) => {
    const quote = await createQuote();
    await page.goto(`/devis/${quote.id}`);

    const envoyerBtn = page.getByRole("button", { name: /envoyer|marquer.*envoy/i }).first();
    await expect(envoyerBtn).toBeVisible({ timeout: 8_000 });
  });
});
