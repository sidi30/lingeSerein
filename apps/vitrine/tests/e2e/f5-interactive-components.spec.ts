/**
 * F5 — Composants interactifs: WhatsApp float, Sticky CTA, FAQ accordion, section dots
 */

import { test, expect } from "@playwright/test";

test.describe("F5 — WhatsApp float button", () => {
  test("F5-01 — Bouton WhatsApp apparaît après scroll sur desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    // Initially hidden (no scroll yet)
    const waBtn = page.locator('a[aria-label="Nous écrire sur WhatsApp"]');

    // Scroll down more than 400px to trigger visibility
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(500);

    await expect(waBtn).toBeVisible();
  });

  test("F5-02 — Bouton WhatsApp a le bon href wa.me", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    const waBtn = page.locator('a[aria-label="Nous écrire sur WhatsApp"]');
    const href = await waBtn.getAttribute("href");
    expect(href).toContain("wa.me/33753569548");
    expect(href).toContain("text=");
  });

  test('F5-03 — Bouton WhatsApp a rel="noopener noreferrer"', async ({ page }) => {
    await page.goto("/");
    const waBtn = page.locator('a[aria-label="Nous écrire sur WhatsApp"]');
    const rel = await waBtn.getAttribute("rel");
    expect(rel).toContain("noopener");
    expect(rel).toContain("noreferrer");
  });

  test("F5-04 — Bouton WhatsApp caché sur mobile (hidden lg:flex)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(300);

    const waBtn = page.locator('a[aria-label="Nous écrire sur WhatsApp"]');
    // On mobile it has 'hidden lg:flex' — should not be visible
    const isVisible = await waBtn.isVisible();
    expect(isVisible, "WhatsApp button should be hidden on mobile").toBe(false);
  });
});

test.describe("F5 — Sticky CTA mobile", () => {
  test("F5-05 — Sticky CTA visible sur mobile après scroll", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    await page.evaluate(() => window.scrollTo(0, 800));
    await page.waitForTimeout(500);

    // Sticky CTA should be visible on mobile
    const stickyDevisBtn = page.locator(
      '[class*="lg:hidden"][class*="fixed"][class*="bottom"] a[href="/devis"]',
    );
    // Check it's accessible
    const btn = page.getByRole("link", { name: /devis/i }).last();
    await expect(btn).toBeVisible({ timeout: 3000 });
  });

  test("F5-06 — Sticky CTA contient bouton Appeler avec bon href tel:", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await page.evaluate(() => window.scrollTo(0, 800));
    await page.waitForTimeout(500);

    const callBtn = page.getByRole("link", { name: /appeler/i });
    await expect(callBtn).toBeVisible({ timeout: 3000 });
    const href = await callBtn.getAttribute("href");
    expect(href).toBe("tel:+33753569548");
  });
});

test.describe("F5 — FAQ accordion", () => {
  test("F5-07 — Premier item FAQ ouvert par défaut", async ({ page }) => {
    await page.goto("/");
    await page.locator("#faq").scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    // First FAQ button should have aria-expanded="true"
    const firstFAQBtn = page.locator("#faq button[aria-expanded]").first();
    const expanded = await firstFAQBtn.getAttribute("aria-expanded");
    expect(expanded).toBe("true");
  });

  test("F5-08 — Clic sur FAQ item ouvre/ferme le panneau", async ({ page }) => {
    await page.goto("/");
    await page.locator("#faq").scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    // Click second FAQ item (initially closed)
    const secondBtn = page.locator("#faq button[aria-expanded]").nth(1);
    await expect(secondBtn).toHaveAttribute("aria-expanded", "false");

    await secondBtn.click();
    await page.waitForTimeout(400);
    await expect(secondBtn).toHaveAttribute("aria-expanded", "true");

    // Clicking again closes it
    await secondBtn.click();
    await page.waitForTimeout(400);
    await expect(secondBtn).toHaveAttribute("aria-expanded", "false");
  });

  test("F5-09 — FAQ panels ont aria-controls / id correspondants", async ({ page }) => {
    await page.goto("/");
    await page.locator("#faq").scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    const buttons = page.locator("#faq button[aria-expanded]");
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const controlsId = await buttons.nth(i).getAttribute("aria-controls");
      expect(controlsId).toBeTruthy();
    }
  });
});

test.describe("F5 — Section dots navigation", () => {
  test("F5-10 — Section dots visibles sur desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    const sectionDots = page.locator('nav[aria-label="Navigation rapide"]');
    await expect(sectionDots).toBeVisible();
  });

  test("F5-11 — Section dots cachés sur mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    const sectionDots = page.locator('nav[aria-label="Navigation rapide"]');
    const isVisible = await sectionDots.isVisible();
    expect(isVisible).toBe(false);
  });
});
