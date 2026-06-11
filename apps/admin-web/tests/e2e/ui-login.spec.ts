/**
 * UI tests — Login & Navigation de base
 * Vérifie que la pile admin-web tourne et que l'auth fonctionne.
 */

import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("UI — Login", () => {
  test("Accès /login affiche le formulaire", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("form")).toBeVisible({ timeout: 10_000 });
    // Email + password inputs
    const emailInput = page
      .locator('input[type="email"], input[name="email"], input[placeholder*="mail" i]')
      .first();
    await expect(emailInput).toBeVisible();
  });

  test("Login admin réussi → redirection vers dashboard", async ({ page }) => {
    await loginAsAdmin(page);
    // Should land on dashboard / main page (not /login)
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
    // Sidebar should be visible
    await expect(page.locator('nav, aside, [data-testid="sidebar"]')).toBeVisible({
      timeout: 8_000,
    });
  });

  test("Redirection /login si non authentifié", async ({ page }) => {
    await page.goto("/devis");
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });
  });

  test("Login avec mauvais mot de passe → erreur visible", async ({ page }) => {
    await page.goto("/login");
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    await emailInput.fill("sirtecnologie@gmail.com");
    await passwordInput.fill("WrongPassword!");
    await page.getByRole("button", { name: /connexion|login|se connecter/i }).click();

    // Error message should appear
    await expect(
      page.locator('[role="alert"], .text-red, .text-destructive, [class*="error"]').first(),
    ).toBeVisible({ timeout: 8_000 });
    await expect(page).toHaveURL(/\/login/);
  });
});
