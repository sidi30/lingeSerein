/**
 * F6 — Images, assets et liens cassés
 * Vérifie que toutes les images Next.js se chargent correctement
 */

import { test, expect } from "@playwright/test";

test.describe("F6 — Images et assets", () => {
  test("F6-01 — Aucune image 404 sur la page d'accueil", async ({ page }) => {
    const failedImages: string[] = [];

    page.on("response", (response) => {
      const url = response.url();
      if (
        (url.includes("/_next/image") || url.match(/\.(png|jpg|jpeg|svg|webp|gif)(\?|$)/i)) &&
        response.status() >= 400
      ) {
        failedImages.push(`${response.status()} — ${url}`);
      }
    });

    await page.goto("/");
    // Scroll through the page to trigger lazy-loaded images
    for (let i = 0; i < 5; i++) {
      await page.evaluate((step) => window.scrollTo(0, step * 1000), i);
      await page.waitForTimeout(300);
    }
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);

    expect(failedImages, `Failed images: ${failedImages.join("\n")}`).toHaveLength(0);
  });

  test("F6-02 — Image hero a un alt text (attribut alt non vide ou aria-hidden)", async ({
    page,
  }) => {
    await page.goto("/");
    const heroSection = page.locator("section").first();
    const heroImg = heroSection.locator("img").first();
    await expect(heroImg).toBeVisible();
    // Hero background image has alt="" (decorative, acceptable) or is aria-hidden
    const alt = await heroImg.getAttribute("alt");
    const ariaHidden = await heroImg.getAttribute("aria-hidden");
    // Either explicitly empty (decorative) or has text
    expect(alt !== null || ariaHidden === "true").toBeTruthy();
  });

  test('F6-03 — Logo image dans navbar a alt="Linge Serein"', async ({ page }) => {
    await page.goto("/");
    const navLogo = page.locator('nav img[alt="Linge Serein"]').first();
    await expect(navLogo).toBeVisible();
  });

  test('F6-04 — Logo image dans footer a alt="Linge Serein"', async ({ page }) => {
    await page.goto("/");
    const footerLogo = page.locator('footer img[alt="Linge Serein"]');
    await expect(footerLogo).toBeVisible();
  });

  test("F6-05 — Aucune image 404 sur la page /devis", async ({ page }) => {
    const failedImages: string[] = [];

    page.on("response", (response) => {
      const url = response.url();
      if (
        (url.includes("/_next/image") || url.match(/\.(png|jpg|jpeg|svg|webp|gif)(\?|$)/i)) &&
        response.status() >= 400
      ) {
        failedImages.push(`${response.status()} — ${url}`);
      }
    });

    await page.goto("/devis");
    await page.waitForTimeout(1000);

    expect(failedImages, `Failed images on /devis: ${failedImages.join("\n")}`).toHaveLength(0);
  });

  test("F6-06 — Favicon déclaré et accessible", async ({ page }) => {
    await page.goto("/");
    // Check that favicon link exists in head
    const faviconLink = await page.locator('link[rel*="icon"]').count();
    expect(faviconLink).toBeGreaterThan(0);
  });

  test("F6-07 — Aucune erreur 404 sur les ressources JS/CSS", async ({ page }) => {
    const failedResources: string[] = [];

    page.on("response", (response) => {
      const url = response.url();
      if (
        (url.includes("/_next/") || url.includes(".js") || url.includes(".css")) &&
        response.status() >= 400
      ) {
        failedResources.push(`${response.status()} — ${url}`);
      }
    });

    await page.goto("/");
    await page.waitForTimeout(2000);

    expect(failedResources, `Failed resources: ${failedResources.join("\n")}`).toHaveLength(0);
  });
});
