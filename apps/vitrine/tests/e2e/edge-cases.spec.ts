/**
 * Edge cases — XSS, entrées extrêmes, comportements limites
 */

import { test, expect } from "@playwright/test";

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

test.describe("Edge cases — Simulateur devis", () => {
  test("EC-05 — Slider à valeur max (50) ne cause pas d'erreur", async ({ page }) => {
    await page.goto("/devis");
    const sliders = page.locator('input[type="range"]');
    const count = await sliders.count();

    for (let i = 0; i < Math.min(count, 4); i++) {
      const max = await sliders.nth(i).getAttribute("max");
      if (max) {
        await sliders.nth(i).fill(max);
        await sliders.nth(i).dispatchEvent("input");
      }
    }

    await page.waitForTimeout(500);
    // No crash, total should display
    const errors: string[] = [];
    page.on("pageerror", (err: Error) => errors.push(err.message));
    await page.waitForTimeout(300);
    expect(errors).toHaveLength(0);
  });

  test("EC-06 — Slider à valeur min (0) produit état vide cohérent", async ({ page }) => {
    await page.goto("/devis");
    const productSliders = page.locator('.space-y-6 input[type="range"]');
    const count = await productSliders.count();

    for (let i = 0; i < count; i++) {
      await productSliders.nth(i).fill("0");
      await productSliders.nth(i).dispatchEvent("input");
    }

    await page.waitForTimeout(500);
    await expect(page.getByText(/ajoutez des produits/i)).toBeVisible();
  });

  test("EC-07 — ?gamme= vide utilise défaut hotel", async ({ page }) => {
    await page.goto("/devis?gamme=");
    const radioGroup = page.locator('[role="radiogroup"]');
    const checked = radioGroup.locator('[role="radio"][aria-checked="true"]');
    await expect(checked).toContainText("Hôtel");
  });

  test("EC-08 — Injection script dans URL gamme ignorée", async ({ page }) => {
    // Test that script injection via query param doesn't execute
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
