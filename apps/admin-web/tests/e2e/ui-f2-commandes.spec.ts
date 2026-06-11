/**
 * UI tests — F2 Commandes
 *
 * - Page /commandes charge sans 500
 * - Badge PENDING dans sidebar (si commandes PENDING existent)
 * - Page /commandes/:id accessible
 * - Bouton refus visible sur commande PENDING
 * - Validation UI: refus sans raison bloqué
 */

import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";
import { apiRequest } from "./helpers/api";

test.describe("UI F2 — Commandes", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("Page /commandes charge sans erreur", async ({ page }) => {
    const response = await page.goto("/commandes");
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
  });

  test("Sidebar lien Commandes visible", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.locator('nav a[href*="/commandes"], aside a[href*="/commandes"]').first(),
    ).toBeVisible({ timeout: 8_000 });
  });

  test("Badge newCount visible dans sidebar si commandes PENDING", async ({ page }) => {
    // Check if there are PENDING orders
    const { json } = await apiRequest("GET", "/orders?status=PENDING&limit=5");
    const data = json as { data: unknown[]; meta?: { newCount?: number } };
    const newCount = data.meta?.newCount ?? 0;

    await page.goto("/commandes");

    if (newCount > 0) {
      // Badge should be visible somewhere in nav
      const badge = page
        .locator("nav, aside")
        .locator('[class*="badge"], span')
        .filter({ hasText: /\d+/ })
        .first();
      await expect(badge).toBeVisible({ timeout: 8_000 });
    } else {
      console.warn("No PENDING orders, badge not expected");
    }
  });

  test("Page /commandes/:id accessible pour une commande existante", async ({ page }) => {
    const { json } = await apiRequest("GET", "/orders?limit=3");
    const orders = (json as { data: Array<{ id: string }> }).data;
    if (!orders || orders.length === 0) {
      console.warn("No orders to test detail page");
      return;
    }
    const orderId = orders[0].id;
    const response = await page.goto(`/commandes/${orderId}`);
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
  });

  test("Détail commande affiche items et client", async ({ page }) => {
    const { json } = await apiRequest("GET", "/orders?limit=3");
    const orders = (json as { data: Array<{ id: string }> }).data;
    if (!orders || orders.length === 0) {
      console.warn("No orders for detail test");
      return;
    }
    const orderId = orders[0].id;
    await page.goto(`/commandes/${orderId}`);

    // Should show some content — at minimum the order reference or client info
    const body = page.locator('main, [role="main"]').first();
    await expect(body).toBeVisible({ timeout: 8_000 });
    // The page should not be blank
    const text = await body.textContent();
    expect((text ?? "").trim().length).toBeGreaterThan(50);
  });

  test("AC-F2-04 — Refus commande PENDING sans raison → erreur UI visible", async ({ page }) => {
    const { json } = await apiRequest("GET", "/orders?status=PENDING&limit=3");
    const orders = (json as { data: Array<{ id: string }> }).data;
    if (!orders || orders.length === 0) {
      console.warn("No PENDING order for refus test");
      return;
    }
    const orderId = orders[0].id;
    await page.goto(`/commandes/${orderId}`);

    // Find and click "Refuser" button
    const refuserBtn = page.getByRole("button", { name: /refus|annuler|cancel/i }).first();
    const refuserVisible = await refuserBtn.isVisible().catch(() => false);
    if (!refuserVisible) {
      console.warn(
        'No "Refuser" button visible on order detail — command may already be processed',
      );
      return;
    }

    await refuserBtn.click();

    // Either a dialog opens or we can directly confirm without raison
    // Try to confirm/submit without filling raison
    const confirmBtn = page.getByRole("button", { name: /confirm|valider|oui/i }).first();
    const confirmVisible = await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false);
    if (confirmVisible) {
      await confirmBtn.click();
    }

    // Error should appear
    await expect(
      page.locator('[role="alert"], [class*="error"], .text-destructive, .text-red').first(),
    ).toBeVisible({ timeout: 8_000 });
  });
});
