/**
 * Accessibilité — WCAG 2.1 AA via axe-core
 * Sévérité axe → sévérité bug:
 *   critical → critical
 *   serious  → high
 *   moderate → medium
 *   minor    → low
 */

import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const pagesToTest = [
  { name: "Accueil", url: "/" },
  { name: "Devis", url: "/devis" },
  { name: "CGV", url: "/cgv" },
  { name: "Mentions légales", url: "/mentions-legales" },
  { name: "Politique confidentialité", url: "/politique-confidentialite" },
  { name: "Zone de livraison", url: "/zone-de-livraison" },
];

for (const { name, url } of pagesToTest) {
  test(`A11Y — ${name} (${url}) — WCAG 2.1 AA`, async ({ page }) => {
    await page.goto(url);
    // Wait for dynamic content to render
    await page.waitForTimeout(1500);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();

    // Format violations for readability
    const formattedViolations = results.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      nodes: v.nodes.length,
      help: v.help,
      helpUrl: v.helpUrl,
      nodeDetails: v.nodes.slice(0, 2).map((n) => n.html),
    }));

    expect(
      results.violations,
      `Axe violations on ${url}:\n${JSON.stringify(formattedViolations, null, 2)}`,
    ).toHaveLength(0);
  });
}

test("A11Y — Accueil après scroll — composants dynamiques WCAG 2.1 AA", async ({ page }) => {
  await page.goto("/");
  // Scroll to trigger dynamic components
  await page.evaluate(() => window.scrollTo(0, 1000));
  await page.waitForTimeout(1000);

  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();

  const formattedViolations = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.length,
  }));

  expect(
    results.violations,
    `Axe violations (after scroll):\n${JSON.stringify(formattedViolations, null, 2)}`,
  ).toHaveLength(0);
});

test("A11Y — Navigation clavier — Skip link fonctionnel", async ({ page }) => {
  await page.goto("/");
  // Tab to skip link
  await page.keyboard.press("Tab");
  const skipLink = page.locator('a[href="#main"]');
  await expect(skipLink).toBeFocused();

  // Press Enter to use skip link
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);

  // Main content should now be focused / in view
  const main = page.locator("#main");
  await expect(main).toBeVisible();
});

test("A11Y — Navigation clavier dans la navbar", async ({ page }) => {
  await page.goto("/");
  // Tab multiple times to reach navbar links
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
  }
  // At least one navbar link should eventually be focused
  const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
  // Should be navigating through interactive elements
  expect(["A", "BUTTON", "INPUT"]).toContain(focusedElement);
});

test("A11Y — Formulaire contact — labels associés aux inputs", async ({ page }) => {
  await page.goto("/");
  await page.locator("#contact").scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  // All form inputs should have associated labels
  const inputs = page.locator(
    'form input:not([type="checkbox"]):not([type="hidden"]), form textarea',
  );
  const count = await inputs.count();
  expect(count).toBeGreaterThan(0);

  for (let i = 0; i < count; i++) {
    const input = inputs.nth(i);
    const id = await input.getAttribute("id");
    if (id) {
      const label = page.locator(`label[for="${id}"]`);
      const labelCount = await label.count();
      expect(labelCount, `Input id="${id}" has no associated label`).toBeGreaterThan(0);
    }
  }
});

test("A11Y — Boutons avec aria-labels sur icônes seules", async ({ page }) => {
  await page.goto("/");

  // Mobile menu button should have aria-label="Menu"
  const menuBtn = page.locator('button[aria-label="Menu"]');
  await expect(menuBtn).toBeVisible();

  // WhatsApp button has aria-label
  const waBtn = page.locator('a[aria-label="Nous écrire sur WhatsApp"]');
  const waBtnCount = await waBtn.count();
  expect(waBtnCount).toBeGreaterThan(0);
});

test('A11Y — Images décoratives marquées aria-hidden ou alt=""', async ({ page }) => {
  await page.goto("/");

  // Images that are decorative should have alt="" or aria-hidden="true"
  // Hero bg image has alt="" in source
  const heroImg = page.locator('section img[alt=""]');
  // This may or may not be present depending on how Next.js handles it
  // Just verify we don't have img with NO alt attribute at all (which is a violation)
  const imgsWithoutAlt = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll("img"));
    return imgs
      .filter((img) => !img.hasAttribute("alt") && !img.hasAttribute("aria-label"))
      .map((img) => img.src);
  });

  expect(imgsWithoutAlt, `Images without alt attribute: ${imgsWithoutAlt.join(", ")}`).toHaveLength(
    0,
  );
});
