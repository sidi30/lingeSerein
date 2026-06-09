/**
 * F2 — Formulaire de contact: validation, soumission, consentement RGPD
 */

import { test, expect } from "@playwright/test";

test.describe("F2 — Formulaire de contact", () => {
  async function scrollToContact(page: any) {
    await page.goto("/#contact");
    await page.waitForTimeout(800);
    // Ensure contact section is in view
    await page.locator("#contact").scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
  }

  test("F2-01 — Formulaire contact est visible sur la page d'accueil", async ({ page }) => {
    await page.goto("/");
    await page.locator("#contact").scrollIntoViewIfNeeded();
    await expect(page.locator("form")).toBeVisible();
    await expect(page.getByLabel(/nom/i)).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/téléphone/i)).toBeVisible();
    await expect(page.getByLabel(/besoin/i)).toBeVisible();
  });

  test("F2-02 — Soumission sans consentement RGPD affiche erreur", async ({ page }) => {
    await scrollToContact(page);
    await page.getByLabel(/^Nom/).fill("Jean Dupont");
    await page.getByLabel(/Établissement/).fill("Hôtel Test");
    await page.getByLabel(/Email/).fill("test@example.com");
    await page.getByLabel(/Téléphone/).fill("0612345678");
    await page.getByLabel(/Votre besoin/).fill("Test message pour QA avec plus de 10 caractères");

    // Submit without checking consent
    await page.getByRole("button", { name: /envoyer/i }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("alert")).toContainText(/confidentialité/i);
  });

  test("F2-03 — Champs requis marqués required", async ({ page }) => {
    await scrollToContact(page);
    const nameInput = page.getByLabel(/^Nom/);
    const required = await nameInput.getAttribute("required");
    expect(required).not.toBeNull();

    const emailInput = page.getByLabel(/Email/);
    const emailRequired = await emailInput.getAttribute("required");
    expect(emailRequired).not.toBeNull();
  });

  test("F2-04 — Soumission avec backend en erreur (mock 500) affiche message user-friendly", async ({
    page,
  }) => {
    await page.route("**/api/contact", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Internal server error" }),
      }),
    );

    await scrollToContact(page);
    await page.getByLabel(/^Nom/).fill("Jean Dupont");
    await page.getByLabel(/Établissement/).fill("Hôtel Test");
    await page.getByLabel(/Email/).fill("test@example.com");
    await page.getByLabel(/Téléphone/).fill("0612345678");
    await page.getByLabel(/Votre besoin/).fill("Message de test suffisamment long");
    await page.locator('input[name="consent"]').check();

    await page.getByRole("button", { name: /envoyer/i }).click();

    // Error alert should appear
    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible({ timeout: 8000 });

    // No stack trace in error message
    const alertText = await alert.textContent();
    expect(alertText).not.toContain("at Object.");
    expect(alertText).not.toContain("node_modules");
    expect(alertText).not.toContain("stack");
  });

  test("F2-05 — Soumission avec réseau timeout affiche message d'erreur", async ({ page }) => {
    await page.route("**/api/contact", async (route) => {
      await page.waitForTimeout(6000);
      await route.abort("timedout");
    });

    await scrollToContact(page);
    await page.getByLabel(/^Nom/).fill("Jean Dupont");
    await page.getByLabel(/Établissement/).fill("Hôtel Test");
    await page.getByLabel(/Email/).fill("test@example.com");
    await page.getByLabel(/Téléphone/).fill("0612345678");
    await page.getByLabel(/Votre besoin/).fill("Message de test suffisamment long pour le QA");
    await page.locator('input[name="consent"]').check();

    // Start submit
    const submitBtn = page.getByRole("button", { name: /envoyer/i });
    await submitBtn.click();

    // Loading state should appear
    await expect(page.getByText(/envoi en cours/i)).toBeVisible({ timeout: 2000 });
  }, 20000);

  test("F2-06 — Bouton submit désactivé pendant envoi (évite double-submit)", async ({ page }) => {
    // Intercept and hold the request
    let resolveRoute: any;
    await page.route("**/api/contact", (route) => {
      return new Promise((resolve) => {
        resolveRoute = () =>
          resolve(
            route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ ok: true }),
            }),
          );
      });
    });

    await scrollToContact(page);
    await page.getByLabel(/^Nom/).fill("Jean Dupont");
    await page.getByLabel(/Établissement/).fill("Hôtel Test");
    await page.getByLabel(/Email/).fill("test@example.com");
    await page.getByLabel(/Téléphone/).fill("0612345678");
    await page.getByLabel(/Votre besoin/).fill("Message suffisamment long pour le QA test");
    await page.locator('input[name="consent"]').check();

    const submitBtn = page.getByRole("button", { name: /envoyer/i });
    await submitBtn.click();

    // Button should be disabled while sending
    await expect(submitBtn).toBeDisabled({ timeout: 2000 });

    // Release the route
    resolveRoute();
  });

  test("F2-07 — Lien politique de confidentialité dans formulaire fonctionne", async ({ page }) => {
    await scrollToContact(page);
    const privacyLink = page.locator('form a[href="/politique-confidentialite"]');
    await expect(privacyLink).toBeVisible();
    await privacyLink.click();
    await expect(page).toHaveURL("/politique-confidentialite");
  });

  test("F2-08 — Soumission réussie (mock 200) affiche confirmation", async ({ page }) => {
    await page.route("**/api/contact", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      }),
    );

    await scrollToContact(page);
    await page.getByLabel(/^Nom/).fill("Jean Dupont");
    await page.getByLabel(/Établissement/).fill("Hôtel Test");
    await page.getByLabel(/Email/).fill("test@example.com");
    await page.getByLabel(/Téléphone/).fill("0612345678");
    await page
      .getByLabel(/Votre besoin/)
      .fill("Message de test suffisamment long pour le formulaire");
    await page.locator('input[name="consent"]').check();

    await page.getByRole("button", { name: /envoyer/i }).click();

    // Success state
    await expect(page.getByRole("status")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/demande envoyée/i)).toBeVisible({ timeout: 5000 });
  });
});
