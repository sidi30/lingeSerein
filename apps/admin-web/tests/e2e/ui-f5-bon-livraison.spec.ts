/**
 * UI tests — F5 Bon de livraison & décharge (depuis /devis/:id)
 *
 * - Bouton « Bon de livraison » présent sur la fiche devis
 * - Modale : numéro BL en aperçu, dérivé du numéro de devis
 * - Le numéro suit le n° de passage (passage 2 → suffixe -02)
 * - Adresse de livraison pré-remplie depuis le devis
 * - Génération : déclenche un téléchargement, sans erreur en console
 */

import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";
import { createQuote } from "./helpers/api";

test.describe("UI F5 — Bon de livraison", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('Bouton "Bon de livraison" visible sur /devis/:id', async ({ page }) => {
    const quote = await createQuote();
    await page.goto(`/devis/${quote.id}`);

    await expect(page.getByRole("button", { name: /bon de livraison/i }).first()).toBeVisible({
      timeout: 8_000,
    });
  });

  test("Modale affiche le numéro BL dérivé du devis", async ({ page }) => {
    const quote = await createQuote();
    await page.goto(`/devis/${quote.id}`);
    await page
      .getByRole("button", { name: /bon de livraison/i })
      .first()
      .click();

    // Passage 1 par défaut → BL-<numéro devis>-01
    await expect(page.getByText(`BL-${quote.numero}-01`)).toBeVisible({ timeout: 8_000 });
  });

  test("Le numéro BL suit le n° de passage", async ({ page }) => {
    const quote = await createQuote();
    await page.goto(`/devis/${quote.id}`);
    await page
      .getByRole("button", { name: /bon de livraison/i })
      .first()
      .click();

    const passageInput = page.locator("#bl-passage");
    await expect(passageInput).toBeVisible({ timeout: 8_000 });

    await passageInput.fill("2");
    // L'aperçu est recalculé en direct : c'est ce qui évite d'émettre deux bons
    // sous le même numéro sans s'en rendre compte.
    await expect(page.getByText(`BL-${quote.numero}-02`)).toBeVisible({ timeout: 8_000 });
  });

  test("Adresse de livraison pré-remplie depuis le devis", async ({ page }) => {
    const adresse = "12 rue de la Paix, 84100 Orange";
    const quote = await createQuote({ clientAdresse: adresse });
    await page.goto(`/devis/${quote.id}`);
    await page
      .getByRole("button", { name: /bon de livraison/i })
      .first()
      .click();

    await expect(page.locator("#bl-adresse")).toHaveValue(adresse, { timeout: 8_000 });
  });

  test("Hint d'incrémentation du passage affiché", async ({ page }) => {
    const quote = await createQuote();
    await page.goto(`/devis/${quote.id}`);
    await page
      .getByRole("button", { name: /bon de livraison/i })
      .first()
      .click();

    await expect(page.getByText(/incrémenter/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test("Génération du PDF déclenche un téléchargement", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    const quote = await createQuote();
    await page.goto(`/devis/${quote.id}`);
    await page
      .getByRole("button", { name: /bon de livraison/i })
      .first()
      .click();

    await page.locator("#bl-date").fill("28 juillet 2026");

    // @react-pdf est chargé dynamiquement au clic : laisser le temps au bundle.
    const downloadPromise = page.waitForEvent("download", { timeout: 25_000 });
    await page.getByRole("button", { name: /télécharger le bon/i }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
    // Un échec de génération est rattrapé par un toast : on vérifie qu'aucune
    // erreur de CSP/worker n'a été loguée au passage.
    expect(consoleErrors.filter((e) => /Content Security Policy|worker/i.test(e))).toHaveLength(0);
  });
});
