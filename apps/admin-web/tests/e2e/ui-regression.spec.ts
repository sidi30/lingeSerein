/**
 * Tests de régression — pages existantes toujours fonctionnelles
 *
 * Vérifie que les pages pré-existantes ne sont pas cassées par les nouvelles features:
 * - /         (dashboard)
 * - /commandes (liste)
 * - /clients
 * - /stock
 * - /produits
 * - /abonnements
 * - /planning
 */

import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

/** Lien de menu vers l'ancien simulateur — doit rester introuvable. */
function sidebarLink(page: Page) {
  return page.locator('nav a[href*="/simulateur"], aside a[href*="/simulateur"]');
}

const EXISTING_ROUTES = [
  { path: "/", label: "Dashboard" },
  { path: "/commandes", label: "Liste commandes" },
  { path: "/clients", label: "Clients" },
  { path: "/stock", label: "Stock" },
  { path: "/produits", label: "Produits" },
  { path: "/abonnements", label: "Abonnements" },
  { path: "/planning", label: "Planning" },
  { path: "/factures", label: "Factures" },
];

test.describe("Régression — pages existantes", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  for (const { path, label } of EXISTING_ROUTES) {
    test(`${label} (${path}) — charge sans erreur 5xx`, async ({ page }) => {
      const response = await page.goto(path);
      // No 5xx response
      const status = response?.status() ?? 200;
      expect(status, `Page ${path} returned ${status}`).toBeLessThan(500);

      // No visible server error text
      await expect(page.locator("body")).not.toContainText("Internal Server Error", {
        timeout: 5_000,
      });

      // Page should have some content
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
      const body = page.locator('main, [role="main"], body').first();
      await expect(body).toBeVisible({ timeout: 5_000 });
    });
  }

  test("Dashboard affiche des métriques ou widgets", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
    // Main content should have some substance
    const mainText = await page
      .locator("main")
      .textContent()
      .catch(() => "");
    expect((mainText ?? "").trim().length).toBeGreaterThan(20);
  });

  test("Sidebar affiche les 4 nouvelles entrées", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

    const sidebar = page.locator("nav, aside").first();
    await expect(sidebar).toBeVisible({ timeout: 8_000 });

    // Check new entries are present
    await expect(sidebar.locator('a[href*="/devis"]').first()).toBeVisible({ timeout: 5_000 });
    await expect(sidebar.locator('a[href*="/utilisateurs"]').first()).toBeVisible({
      timeout: 5_000,
    });
    await expect(sidebar.locator('a[href*="/reglages"]').first()).toBeVisible({ timeout: 5_000 });
    await expect(sidebar.locator('a[href*="/factures"]').first()).toBeVisible({ timeout: 5_000 });
  });

  test("La page /simulateur a bien été retirée", async ({ page }) => {
    // Elle tournait sur le barème périmé (sets Confort/Hôtel/Prestige, livraison
    // 5 €) et était confondable avec le vrai formulaire de devis.
    const response = await page.goto("/simulateur");
    expect(response?.status()).toBe(404);
    await expect(sidebarLink(page)).toHaveCount(0);
  });

  test("Page /reglages accessible", async ({ page }) => {
    const response = await page.goto("/reglages");
    expect(response?.status()).toBeLessThan(500);
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
  });
});
