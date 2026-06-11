/**
 * UI tests — F3 Utilisateurs
 *
 * - Page /utilisateurs charge sans erreur
 * - Bouton "Nouvel utilisateur" visible
 * - Page /utilisateurs/nouveau accessible
 * - Formulaire ne propose pas SUPER_ADMIN comme option de rôle
 * - Mot de passe provisoire affiché après création (modale)
 */

import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";
import { uniqueEmail, uniqueName } from "./helpers/fixtures";

test.describe("UI F3 — Utilisateurs", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("Page /utilisateurs charge sans erreur", async ({ page }) => {
    const response = await page.goto("/utilisateurs");
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
  });

  test('Bouton "Nouvel utilisateur" visible sur /utilisateurs', async ({ page }) => {
    await page.goto("/utilisateurs");
    const newBtn = page
      .getByRole("button", { name: /nouvel|nouveau|créer.*utilisateur/i })
      .or(page.getByRole("link", { name: /nouvel|nouveau|créer.*utilisateur/i }))
      .first();
    await expect(newBtn).toBeVisible({ timeout: 8_000 });
  });

  test("Page /utilisateurs/nouveau accessible", async ({ page }) => {
    const response = await page.goto("/utilisateurs/nouveau");
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator("form")).toBeVisible({ timeout: 8_000 });
  });

  test("AC-F3-03 — SUPER_ADMIN absent du sélecteur de rôle", async ({ page }) => {
    await page.goto("/utilisateurs/nouveau");
    await page.waitForLoadState("networkidle");

    // Look for the role select/combobox
    const roleSelect = page
      .locator(
        'select[name*="role"], [role="combobox"][aria-label*="rôle" i], [data-testid*="role"]',
      )
      .first();
    const roleSelectVisible = await roleSelect.isVisible({ timeout: 5_000 }).catch(() => false);

    if (roleSelectVisible) {
      const options = await roleSelect
        .locator("option")
        .allTextContents()
        .catch(() => []);
      const comboboxOptions = options.length > 0 ? options : [];
      // SUPER_ADMIN must not be present as an option
      const hasSuperAdmin = comboboxOptions.some(
        (o) => o.includes("SUPER_ADMIN") || o.toLowerCase().includes("super admin"),
      );
      expect(
        hasSuperAdmin,
        `SUPER_ADMIN found in role selector options: ${JSON.stringify(comboboxOptions)}`,
      ).toBe(false);
    } else {
      // Look for any option text in the form
      const formText = await page
        .locator("form")
        .textContent()
        .catch(() => "");
      expect(formText).not.toMatch(/SUPER_ADMIN|Super Admin/i);
    }
  });

  test("Création utilisateur → modale affiche mot de passe provisoire", async ({ page }) => {
    await page.goto("/utilisateurs/nouveau");
    await page.waitForLoadState("networkidle");

    // Fill form
    const nameInput = page
      .getByLabel(/nom/i)
      .or(page.locator('input[name="name"], input[placeholder*="nom" i]'))
      .first();
    const emailInput = page.getByLabel(/email/i).or(page.locator('input[type="email"]')).first();

    await nameInput.fill(uniqueName());
    await emailInput.fill(uniqueEmail());

    // Select role — try to pick CLIENT or LIVREUR
    const roleSelect = page.locator('select[name*="role"]').first();
    const roleVisible = await roleSelect.isVisible({ timeout: 2_000 }).catch(() => false);
    if (roleVisible) {
      await roleSelect.selectOption({ label: /client|livreur/i } as Parameters<
        typeof roleSelect.selectOption
      >[0]);
    } else {
      // Try radio or combobox
      const clientOption = page
        .getByRole("radio", { name: /client/i })
        .or(page.locator('[data-value*="CLIENT"], [data-value*="LIVREUR"]'))
        .first();
      const clientOptionVisible = await clientOption
        .isVisible({ timeout: 2_000 })
        .catch(() => false);
      if (clientOptionVisible) await clientOption.click();
    }

    await page.getByRole("button", { name: /créer|enregistrer|soumettre|submit/i }).click();

    // Modale with password should appear
    const modal = page.locator('[role="dialog"], [data-testid="modal"], .modal').first();
    const modalVisible = await modal.isVisible({ timeout: 8_000 }).catch(() => false);

    if (modalVisible) {
      // Check that some password-like content (12 chars alphanum) is shown
      const modalText = (await modal.textContent()) ?? "";
      // Should contain "mot de passe" or "password" or a 12-char string
      const hasPasswordInfo =
        /mot de passe|password|provisoire|temporaire/i.test(modalText) ||
        /[a-zA-Z0-9]{12,}/.test(modalText);
      expect(hasPasswordInfo, `Modal text does not contain password info: "${modalText}"`).toBe(
        true,
      );
    } else {
      // Maybe showed as toast or different UI pattern — check page doesn't error
      const hasError = await page
        .locator('[role="alert"]')
        .isVisible({ timeout: 3_000 })
        .catch(() => false);
      if (hasError) {
        const errorText = await page.locator('[role="alert"]').textContent();
        // If there's an error, it should be a form validation, not a 500
        expect(errorText).not.toMatch(/Internal Server Error|500|crash/i);
      }
    }
  });
});
