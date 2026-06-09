/**
 * F1 — Navigation: navbar, anchor links, logo, footer links
 */

import { test, expect } from "@playwright/test";

test.describe("F1 — Navigation navbar", () => {
  test("F1-01 — Page accueil se charge sans erreur HTTP", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/Linge Serein/i);
  });

  test("F1-02 — Navbar visible et contient les 5 liens attendus", async ({ page }) => {
    await page.goto("/");
    const nav = page.locator("nav").first();
    await expect(nav).toBeVisible();

    const expectedLabels = ["Services", "Comment ça marche", "Tarifs", "FAQ", "Contact"];
    for (const label of expectedLabels) {
      await expect(nav.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test('F1-03 — Bouton "Demander un devis" dans navbar navigue vers /devis', async ({ page }) => {
    await page.goto("/");
    // Desktop CTA in navbar
    const devisLink = page.locator('nav a[href="/devis"]').first();
    await expect(devisLink).toBeVisible();
    await devisLink.click();
    await expect(page).toHaveURL("/devis");
    await expect(page.locator("h1")).toContainText(/simulateur/i);
  });

  test("F1-04 — Logo navbar renvoie vers la page d'accueil", async ({ page }) => {
    await page.goto("/devis");
    // Logo in devis page header
    await page.locator('header a[href="/"]').first().click();
    await expect(page).toHaveURL("/");
  });

  test("F1-05 — Menu mobile s'ouvre et se ferme", async ({ page, viewport }) => {
    // Force mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    const menuButton = page.getByRole("button", { name: /menu/i });
    await expect(menuButton).toBeVisible();

    // Open menu
    await menuButton.click();
    await expect(page.getByText("Demander un devis").last()).toBeVisible();

    // Close menu
    await menuButton.click();
    // Menu panel should disappear
    await page.waitForTimeout(300);
    // The mobile menu panel should be hidden or not present
    const mobileMenuPanel = page.locator(".lg\\:hidden .flex-col").filter({ hasText: "Services" });
    // After closing, the mobile open state is false so the panel div is not rendered
    await expect(mobileMenuPanel).toHaveCount(0);
  });

  test("F1-06 — Lien #services dans navbar scrolle vers la section services", async ({ page }) => {
    await page.goto("/");
    // Find the services anchor link
    const servicesLink = page.locator('nav a[href="#services"]').first();
    await expect(servicesLink).toBeVisible();
    await servicesLink.click();
    // Wait for smooth scroll
    await page.waitForTimeout(1000);
    // The services section should be in viewport
    const servicesSection = page.locator("#services");
    await expect(servicesSection).toBeVisible();
  });

  test("F1-07 — Ancre #contact depuis navbar scrolle vers formulaire de contact", async ({
    page,
  }) => {
    await page.goto("/");
    const contactLink = page.locator('nav a[href="#contact"]').first();
    await expect(contactLink).toBeVisible();
    await contactLink.click();
    await page.waitForTimeout(1200);
    const contactSection = page.locator("#contact");
    await expect(contactSection).toBeVisible();
  });

  test("F1-08 — Toutes les pages légales retournent 200", async ({ page }) => {
    const legalPages = [
      "/cgv",
      "/cgps",
      "/mentions-legales",
      "/politique-confidentialite",
      "/zone-de-livraison",
    ];
    for (const url of legalPages) {
      const resp = await page.goto(url);
      expect(resp?.status(), `Page ${url} returned ${resp?.status()}`).toBe(200);
      await expect(page.locator('main, [role="main"]').first()).toBeVisible();
    }
  });
});
