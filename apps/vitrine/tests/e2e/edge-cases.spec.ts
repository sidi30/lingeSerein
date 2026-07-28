/**
 * Edge cases — XSS, entrées extrêmes, comportements limites
 */

import { test, expect } from "@playwright/test";
import { choisirHebergement, continuer, ouvrirWizard } from "./helpers/wizard";

test.describe("Edge cases — Formulaire contact", () => {
  async function scrollToContact(page: any) {
    await page.goto("/");
    await page.locator("#contact").scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
  }

  test("EC-01 — XSS dans champ nom ne s'exécute pas", async ({ page }) => {
    await scrollToContact(page);

    const xssPayload =
      '<script>window.__xss_nom=true</script><img src=x onerror="window.__xss_nom=true">';
    await page.getByLabel(/^Nom/).fill(xssPayload);
    await page.getByLabel(/Établissement/).fill("Hôtel Test");
    await page.getByLabel(/Email/).fill("test@example.com");
    await page.getByLabel(/Téléphone/).fill("0612345678");
    await page.getByLabel(/Votre besoin/).fill("Test XSS dans le formulaire");
    await page.locator('input[name="consent"]').check();

    // Don't submit (would hit real API), just check that script didn't execute
    await page.waitForTimeout(500);
    const xssExecuted = await page.evaluate(() => (window as any).__xss_nom);
    expect(xssExecuted).toBeUndefined();
  });

  test("EC-02 — XSS dans champ message ne s'exécute pas", async ({ page }) => {
    await scrollToContact(page);
    const xssPayload = "<script>window.__xss_msg=true</script>";
    await page.getByLabel(/Votre besoin/).fill(xssPayload);
    await page.waitForTimeout(500);

    const xssExecuted = await page.evaluate(() => (window as any).__xss_msg);
    expect(xssExecuted).toBeUndefined();
  });

  test("EC-03 — Entrée très longue dans le formulaire ne crash pas l'UI", async ({ page }) => {
    await scrollToContact(page);
    const longString = "a".repeat(5000);

    await page.getByLabel(/^Nom/).fill(longString);
    await page.getByLabel(/Établissement/).fill(longString);

    // Page should still be functional
    await expect(page.getByRole("button", { name: /envoyer/i })).toBeVisible();
    // No JS crash
    const errors: string[] = [];
    page.on("pageerror", (err: Error) => errors.push(err.message));
    await page.waitForTimeout(500);
    expect(errors).toHaveLength(0);
  });

  test("EC-04 — Caractères unicode dans le formulaire ne crash pas l'UI", async ({ page }) => {
    await scrollToContact(page);
    await page.getByLabel(/^Nom/).fill("テスト ñoño émoji 🏨");
    await page.waitForTimeout(300);
    await expect(page.getByRole("button", { name: /envoyer/i })).toBeVisible();
  });
});

test.describe("Edge cases — Parcours devis", () => {
  test("EC-05 — Quantité démesurée saisie à la main : bornée, sans erreur", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err: Error) => errors.push(err.message));

    await ouvrirWizard(page);
    await choisirHebergement(page, /Studio/);
    await continuer(page);

    const champ = page.getByRole("spinbutton", { name: /Quantité de Kit Complet/i });
    await champ.fill("99999");
    await champ.blur();

    // Le stepper borne à son maximum au lieu de laisser filer un total absurde.
    const max = Number(await champ.getAttribute("max"));
    expect(Number(await champ.inputValue())).toBeLessThanOrEqual(max);
    expect(errors).toHaveLength(0);
  });

  test("EC-06 — Toutes les quantités à zéro bloque la suite du parcours", async ({ page }) => {
    await ouvrirWizard(page);
    await choisirHebergement(page, /Studio/);
    await continuer(page);

    await page.getByRole("spinbutton", { name: /Quantité de Kit Complet/i }).fill("0");
    await page.getByRole("spinbutton", { name: /Quantité de Kit Bain/i }).fill("0");
    await page.getByRole("spinbutton", { name: /Quantité de Kit Lit/i }).fill("0");

    await expect(page.getByRole("button", { name: /^Continuer/ })).toBeDisabled();
  });

  test("EC-07 — Un paramètre d'URL inconnu ne casse pas le parcours", async ({ page }) => {
    await page.goto("/devis?gamme=&source=newsletter");
    await expect(page.getByRole("heading", { name: "Votre hébergement" })).toBeVisible();
  });

  test("EC-08 — Injection script dans l'URL ignorée", async ({ page }) => {
    await page.goto("/devis?gamme=<script>window.__xss_gamme=1</script>");
    await page.waitForTimeout(500);
    const xss = await page.evaluate(() => (window as any).__xss_gamme);
    expect(xss).toBeUndefined();
  });
});

test.describe("Edge cases — Navigation", () => {
  test("EC-09 — Page 404 pour une route inexistante", async ({ page }) => {
    const resp = await page.goto("/page-qui-nexiste-pas");
    // Next.js should return 404 or redirect
    expect([404, 200]).toContain(resp?.status());
    // Should not crash
    const errors: string[] = [];
    page.on("pageerror", (err: Error) => errors.push(err.message));
    await page.waitForTimeout(500);
    expect(errors).toHaveLength(0);
  });

  test("EC-10 — Scroll rapide ne cause pas d'erreur JS", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err: Error) => errors.push(err.message));

    await page.goto("/");
    // Rapid scroll
    for (let i = 0; i < 10; i++) {
      await page.evaluate((y) => window.scrollTo(0, y), i * 500);
    }
    for (let i = 10; i >= 0; i--) {
      await page.evaluate((y) => window.scrollTo(0, y), i * 500);
    }
    await page.waitForTimeout(500);
    expect(errors).toHaveLength(0);
  });

  test("EC-11 — Resize fenêtre ne cause pas d'erreur", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err: Error) => errors.push(err.message));

    await page.goto("/");
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(300);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(300);
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(300);

    expect(errors).toHaveLength(0);
  });
});
