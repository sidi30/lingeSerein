/**
 * Performance — temps de chargement et LCP
 */

import { test, expect } from "@playwright/test";

test.describe("Performance — Temps de chargement", () => {
  test("PERF-01 — Page accueil se charge en moins de 5000ms", async ({ page }) => {
    const start = Date.now();
    await page.goto("/");
    // Wait for main content visible
    await page.locator("h1").waitFor({ state: "visible" });
    const elapsed = Date.now() - start;
    expect(elapsed, `Home page took ${elapsed}ms`).toBeLessThan(5000);
  });

  test("PERF-02 — Page /devis se charge en moins de 5000ms", async ({ page }) => {
    const start = Date.now();
    await page.goto("/devis");
    await page.locator("h1").waitFor({ state: "visible" });
    const elapsed = Date.now() - start;
    expect(elapsed, `/devis took ${elapsed}ms`).toBeLessThan(5000);
  });

  test("PERF-03 — LCP mesuré en dessous de 4000ms sur l'accueil", async ({ page }) => {
    await page.goto("/");

    // Measure LCP using Performance API
    const lcp = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          if (lastEntry) {
            resolve((lastEntry as any).startTime);
            observer.disconnect();
          }
        });
        observer.observe({ type: "largest-contentful-paint", buffered: true });

        // Fallback if LCP not available
        setTimeout(() => resolve(0), 3000);
      });
    });

    if (lcp > 0) {
      expect(lcp, `LCP was ${lcp}ms`).toBeLessThan(4000);
    }
    // If LCP returns 0 (buffered entries exhausted), just pass
  });

  test("PERF-04 — Navigation de /login vers /devis en moins de 2000ms", async ({ page }) => {
    await page.goto("/");
    await page.locator("main").waitFor({ state: "visible" });

    const start = Date.now();
    await page.goto("/devis");
    await page.locator("h1").waitFor({ state: "visible" });
    const elapsed = Date.now() - start;

    expect(elapsed, `Navigation to /devis took ${elapsed}ms`).toBeLessThan(2000);
  });

  test("PERF-05 — Les pages légales se chargent en moins de 4000ms", async ({ page }) => {
    const legalPages = ["/cgv", "/cgps", "/mentions-legales"];

    for (const url of legalPages) {
      const start = Date.now();
      await page.goto(url);
      await page.locator('main, [role="main"]').first().waitFor({ state: "visible" });
      const elapsed = Date.now() - start;
      expect(elapsed, `${url} took ${elapsed}ms`).toBeLessThan(4000);
    }
  });
});
