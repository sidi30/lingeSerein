import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { allerAuRecap, texteRecap } from "./helpers/wizard";

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

test.describe("Devis — comparaison Pack Sérénité honnête", () => {
  // L'économie annoncée doit rester celle du modèle : 150 € d'équivalent à l'unité
  // (8 kits bain + 4 kits lit + 2 livraisons) − 89 € de forfait = 61 €/mois.
  // Le bug historique multipliait par le nombre de rotations et affichait ~383 €.
  function verifierEconomie(texte: string) {
    expect(texte).not.toContain("383");
    const match = texte.match(/économisez[^0-9]*([\d\s]+)[,.]?\d*\s?€/i);
    expect(match).not.toBeNull();
    const eco = Number(match![1].replace(/\s/g, ""));
    expect(eco).toBe(61);
  }

  test("le récap du parcours public annonce 61 €/mois", async ({ page }) => {
    await allerAuRecap(page);
    verifierEconomie(await texteRecap(page));
  });

  test("le simulateur commercial annonce le même montant", async ({ page }) => {
    await page.goto("/devis?admin=1");
    await page.waitForLoadState("networkidle");

    const texte = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    expect(texte).toContain("Pack Sérénité");
    verifierEconomie(texte);
  });
});
