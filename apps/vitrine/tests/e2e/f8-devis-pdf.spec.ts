import { test, expect } from "@playwright/test";
import fs from "node:fs";

/**
 * Smoke test : génération + téléchargement du devis PDF (mode admin).
 * Vérifie que le bouton produit bien un fichier PDF valide (entête %PDF, non vide).
 */
test.describe("Devis PDF — générateur admin", () => {
  test("génère et télécharge un PDF valide", async ({ page }) => {
    await page.goto("/devis?admin=1");
    await page.waitForLoadState("networkidle");

    // Le générateur admin doit être monté
    await expect(page.getByRole("heading", { name: /Générateur de devis/i })).toBeVisible();

    // Hydratation-safe : un clic n'a d'effet qu'une fois React hydraté.
    // On réessaie jusqu'à ce que la ligne catalogue soit réellement ajoutée.
    const firstDesignation = page.getByPlaceholder("Désignation").first();
    await expect(async () => {
      await page.getByRole("button", { name: /Kit Bain/i }).click();
      await expect(firstDesignation).toHaveValue(/Kit Bain/i, { timeout: 1500 });
    }).toPass({ timeout: 20_000 });

    await page.getByRole("button", { name: /Kit Lit/i }).click();

    // Client (inputs hydratés désormais)
    await page.getByLabel("Établissement").fill("Hôtel Le Mas Provençal");
    await page.getByLabel("Nom du contact").fill("Marie-Claire D.");

    const downloadBtn = page.getByRole("button", { name: /Télécharger le PDF/i });
    await expect(downloadBtn).toBeEnabled();

    // Déclenche le téléchargement et capture le fichier
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 20_000 }),
      downloadBtn.click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^devis-.*\.pdf$/);

    const filePath = await download.path();
    expect(filePath).toBeTruthy();

    const buf = fs.readFileSync(filePath!);
    // Entête PDF
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    // Fichier non trivial (logo + contenu)
    expect(buf.length).toBeGreaterThan(2000);
  });
});
