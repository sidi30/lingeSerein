/**
 * F7 — Erreurs console JS, hydration warnings React
 */

import { test, expect } from "@playwright/test";

// Categories of console messages to capture
type ConsoleEntry = { type: string; text: string };

async function collectConsoleErrors(page: any, url: string): Promise<ConsoleEntry[]> {
  const entries: ConsoleEntry[] = [];

  page.on("console", (msg: any) => {
    const type = msg.type();
    const text = msg.text();

    // Capture errors and warnings (skip noisy known-good ones)
    if (type === "error" || type === "warning") {
      // Skip known browser extension noise
      if (text.includes("chrome-extension://")) return;
      // Skip font preload warnings (external resources)
      if (text.includes("fonts.googleapis.com") || text.includes("fonts.gstatic.com")) return;
      entries.push({ type, text });
    }
  });

  page.on("pageerror", (err: Error) => {
    entries.push({ type: "pageerror", text: err.message });
  });

  await page.goto(url);
  // Wait for hydration and dynamic content
  await page.waitForTimeout(2000);

  return entries;
}

test.describe("F7 — Console errors & hydration", () => {
  test("F7-01 — Aucune erreur JS critique sur la page d'accueil", async ({ page }) => {
    const errors = await collectConsoleErrors(page, "/");
    const criticalErrors = errors.filter(
      (e) =>
        e.type === "pageerror" ||
        (e.type === "error" && !e.text.includes("Warning:") && !e.text.includes("favicon")),
    );
    expect(
      criticalErrors,
      `Critical JS errors on /:\n${criticalErrors.map((e) => `[${e.type}] ${e.text}`).join("\n")}`,
    ).toHaveLength(0);
  });

  test("F7-02 — Aucune erreur d'hydration React sur la page d'accueil", async ({ page }) => {
    const warnings: ConsoleEntry[] = [];

    page.on("console", (msg: any) => {
      const text = msg.text();
      if (
        text.includes("Hydration") ||
        text.includes("hydration") ||
        text.includes("did not match") ||
        text.includes("Text content did not match")
      ) {
        warnings.push({ type: msg.type(), text });
      }
    });

    await page.goto("/");
    await page.waitForTimeout(2000);

    expect(warnings, `Hydration warnings:\n${warnings.map((w) => w.text).join("\n")}`).toHaveLength(
      0,
    );
  });

  test("F7-03 — Aucune erreur JS critique sur la page /devis", async ({ page }) => {
    const errors = await collectConsoleErrors(page, "/devis");
    const criticalErrors = errors.filter(
      (e) => e.type === "pageerror" || (e.type === "error" && !e.text.includes("favicon")),
    );
    expect(
      criticalErrors,
      `Critical JS errors on /devis:\n${criticalErrors.map((e) => `[${e.type}] ${e.text}`).join("\n")}`,
    ).toHaveLength(0);
  });

  test("F7-04 — Aucune erreur d'hydration sur /devis", async ({ page }) => {
    const warnings: ConsoleEntry[] = [];

    page.on("console", (msg: any) => {
      const text = msg.text();
      if (
        text.includes("Hydration") ||
        text.includes("hydration") ||
        text.includes("did not match")
      ) {
        warnings.push({ type: msg.type(), text });
      }
    });

    await page.goto("/devis");
    await page.waitForTimeout(2000);

    expect(
      warnings,
      `Hydration warnings on /devis:\n${warnings.map((w) => w.text).join("\n")}`,
    ).toHaveLength(0);
  });

  test("F7-05 — Aucune erreur critique sur les pages légales", async ({ page }) => {
    const legalPages = [
      "/cgv",
      "/cgps",
      "/mentions-legales",
      "/politique-confidentialite",
      "/zone-de-livraison",
    ];

    for (const url of legalPages) {
      const errors: ConsoleEntry[] = [];
      page.on("console", (msg: any) => {
        if (msg.type() === "error" || msg.type() === "pageerror") {
          errors.push({ type: msg.type(), text: msg.text() });
        }
      });
      page.on("pageerror", (err: Error) => {
        errors.push({ type: "pageerror", text: err.message });
      });

      await page.goto(url);
      await page.waitForTimeout(1000);

      const criticalErrors = errors.filter(
        (e) => !e.text.includes("favicon") && !e.text.includes("chrome-extension"),
      );
      expect(
        criticalErrors,
        `Errors on ${url}:\n${criticalErrors.map((e) => `[${e.type}] ${e.text}`).join("\n")}`,
      ).toHaveLength(0);
    }
  });

  test("F7-06 — Scroll progress bar n'émet pas d'erreur", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err: Error) => errors.push(err.message));

    await page.goto("/");
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);

    expect(errors).toHaveLength(0);
  });
});
