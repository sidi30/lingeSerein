import { test, expect } from "@playwright/test";
import fs from "node:fs";

/**
 * Smoke test : génération + téléchargement du contrat Pack Sérénité PDF (mode admin),
 * garde-fou d'accès (?admin=1 requis), et présence du générateur dans l'atelier /devis.
 */
test.describe("Contrat PDF — générateur admin", () => {
  test("génère et télécharge un contrat PDF valide", async ({ page }) => {
    await page.goto("/contrat?admin=1");
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByRole("heading", { name: /Générateur de contrat — Pack Sérénité/i }),
    ).toBeVisible();

    // Champs client (hydratation-safe : on réessaie tant que la valeur ne "prend" pas).
    const etablissement = page.getByLabel("Établissement / dénomination");
    await expect(async () => {
      await etablissement.fill("Gîte de Marie Thomassey");
      await expect(etablissement).toHaveValue("Gîte de Marie Thomassey", { timeout: 1500 });
    }).toPass({ timeout: 20_000 });

    await page.getByLabel("Nom du signataire").fill("Marie Thomassey");
    await page.getByLabel("Adresse du logement / de facturation").fill("Cheval Blanc (84460)");
    await page.getByLabel("Prise d'effet").fill("23 juillet 2026");

    const downloadBtn = page.getByRole("button", { name: /Télécharger le contrat/i });
    await expect(downloadBtn).toBeEnabled();

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 20_000 }),
      downloadBtn.click(),
    ]);

    const filePath = await download.path();
    expect(filePath).toBeTruthy();

    const buf = fs.readFileSync(filePath!);
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    // Contrat multi-pages (mentions légales) : nettement plus volumineux qu'un devis simple.
    expect(buf.length).toBeGreaterThan(3000);
  });

  test("l'outil n'est pas accessible sans ?admin=1", async ({ page }) => {
    await page.goto("/contrat");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(/Outil réservé à l.administration/i)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Générateur de contrat — Pack Sérénité/i }),
    ).not.toBeVisible();
  });
});

test.describe("Atelier devis — accès au générateur de contrat", () => {
  test("les deux générateurs (devis + contrat) sont présents sur /devis?admin=1", async ({
    page,
  }) => {
    await page.goto("/devis?admin=1");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: /Générateur de devis/i })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Générateur de contrat — Pack Sérénité/i }),
    ).toBeVisible();
  });
});

test.describe("Simulateur /devis — comparaison Pack Sérénité honnête", () => {
  test("l'économie affichée reste réaliste (~49 €), pas ~383 €", async ({ page }) => {
    await page.goto("/devis");
    await page.waitForLoadState("networkidle");

    const card = page
      .getByText(/Pack Sérénité — .* \/ mois/i)
      .locator("..")
      .locator("..");
    await expect(card).toBeVisible();

    const cardText = (await card.innerText()).replace(/\s+/g, " ");

    // Ne doit jamais afficher l'ancien montant erroné.
    expect(cardText).not.toContain("383");

    // Si un montant d'économie mensuelle est affiché, il doit rester modeste (≤ 100 €).
    const match = cardText.match(/économisez[^0-9]*([\d\s]+)\s?€/i);
    if (match) {
      const eco = Number(match[1].replace(/\s/g, ""));
      expect(eco).toBeGreaterThan(0);
      expect(eco).toBeLessThanOrEqual(100);
    }
  });
});
