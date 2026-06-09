/**
 * F4 — Footer et liens légaux
 */

import { test, expect } from "@playwright/test";

test.describe("F4 — Footer et liens légaux", () => {
  test("F4-01 — Footer visible en bas de page d'accueil", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer");
    await footer.scrollIntoViewIfNeeded();
    await expect(footer).toBeVisible();
    await expect(footer).toContainText("Linge Serein");
  });

  test("F4-02 — Footer contient lien Mentions légales", async ({ page }) => {
    await page.goto("/");
    await page.locator("footer").scrollIntoViewIfNeeded();
    const link = page.locator('footer a[href="/mentions-legales"]');
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL("/mentions-legales");
    await expect(page.locator("h1")).toBeVisible();
  });

  test("F4-03 — Footer contient lien Politique de confidentialité", async ({ page }) => {
    await page.goto("/");
    await page.locator("footer").scrollIntoViewIfNeeded();
    const link = page.locator('footer a[href="/politique-confidentialite"]');
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL("/politique-confidentialite");
  });

  test("F4-04 — Footer contient lien CGV", async ({ page }) => {
    await page.goto("/");
    await page.locator("footer").scrollIntoViewIfNeeded();
    const link = page.locator('footer a[href="/cgv"]');
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL("/cgv");
  });

  test("F4-05 — Footer contient lien CGPS", async ({ page }) => {
    await page.goto("/");
    await page.locator("footer").scrollIntoViewIfNeeded();
    const link = page.locator('footer a[href="/cgps"]');
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL("/cgps");
  });

  test("F4-06 — Footer contient numéro de téléphone cliquable", async ({ page }) => {
    await page.goto("/");
    await page.locator("footer").scrollIntoViewIfNeeded();
    const telLink = page.locator('footer a[href="tel:+33753569548"]');
    await expect(telLink).toBeVisible();
    await expect(telLink).toContainText("07 53 56 95 48");
  });

  test("F4-07 — Footer contient email cliquable", async ({ page }) => {
    await page.goto("/");
    await page.locator("footer").scrollIntoViewIfNeeded();
    const mailLink = page.locator('footer a[href="mailto:lingeserein@gmail.com"]');
    await expect(mailLink).toBeVisible();
    await expect(mailLink).toContainText("lingeserein@gmail.com");
  });

  test('F4-08 — Footer lien "Simulateur de devis" fonctionne', async ({ page }) => {
    await page.goto("/");
    await page.locator("footer").scrollIntoViewIfNeeded();
    const devisLink = page.locator('footer a[href="/devis"]');
    await expect(devisLink).toBeVisible();
    await devisLink.click();
    await expect(page).toHaveURL("/devis");
  });

  test('F4-09 — Footer lien "Zone de livraison" fonctionne', async ({ page }) => {
    await page.goto("/");
    await page.locator("footer").scrollIntoViewIfNeeded();
    const zoneLink = page.locator('footer a[href="/zone-de-livraison"]');
    await expect(zoneLink).toBeVisible();
    await zoneLink.click();
    await expect(page).toHaveURL("/zone-de-livraison");
  });

  test("F4-10 — Footer affiche l'année courante dans le copyright", async ({ page }) => {
    await page.goto("/");
    await page.locator("footer").scrollIntoViewIfNeeded();
    const currentYear = new Date().getFullYear().toString();
    await expect(page.locator("footer")).toContainText(currentYear);
  });

  test("F4-11 — Logo dans footer est visible", async ({ page }) => {
    await page.goto("/");
    await page.locator("footer").scrollIntoViewIfNeeded();
    const footerLogo = page.locator('footer img[alt="Linge Serein"]');
    await expect(footerLogo).toBeVisible();
  });
});
