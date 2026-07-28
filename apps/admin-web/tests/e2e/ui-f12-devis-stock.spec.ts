/**
 * UI F12 — Devis contraint par le stock disponible
 *
 * L'avertissement est volontairement NON BLOQUANT : survendre est une décision
 * légitime (l'admin sait qu'il rachètera). Ce que le devis doit garantir, c'est
 * qu'il la prenne en connaissance de cause.
 *
 * Le cas qui compte est le CUMUL : deux lignes du même article puisent dans le
 * même parc. Comparer ligne à ligne laisserait passer 2 + 2 sur un stock de 3.
 */

import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";
import { collectPageErrors } from "./helpers/console";
import { getStockItem, setStockOwned } from "./helpers/rotations";

const SLUG = "petite-serviette";
const ARTICLE_NAME = "Petite serviette";

/** Amène le disponible de l'article à la valeur voulue, quel que soit l'état courant. */
async function forceDisponible(cible: number): Promise<number> {
  await setStockOwned(SLUG, 0);
  const base = await getStockItem(SLUG); // disponible = −(circulation + sale + retiré)
  const owned = cible - base.disponible;
  await setStockOwned(SLUG, Math.max(owned, 0));
  return (await getStockItem(SLUG)).disponible;
}

test.describe("UI F12 — Devis contraint par le stock", () => {
  test("La disponibilité est rappelée sous chaque ligne du catalogue", async ({ page }) => {
    const errors = collectPageErrors(page);
    const dispo = await forceDisponible(12);

    await loginAsAdmin(page);
    await page.goto("/devis/nouveau");
    await expect(page.locator("form")).toBeVisible({ timeout: 10_000 });

    await page
      .getByRole("button", { name: new RegExp(`${ARTICLE_NAME}.*·`) })
      .first()
      .click();
    await expect(page.getByText(new RegExp(`Disponible\\s*:\\s*${dispo} en parc`))).toBeVisible({
      timeout: 10_000,
    });

    expect(errors.pageErrors).toEqual([]);
  });

  test("Deux lignes du même article : c'est le CUMUL qui déclenche l'alerte", async ({ page }) => {
    const dispo = await forceDisponible(3);

    await loginAsAdmin(page);
    await page.goto("/devis/nouveau");
    await expect(page.locator("form")).toBeVisible({ timeout: 10_000 });

    const chip = page.getByRole("button", { name: new RegExp(`${ARTICLE_NAME}.*·`) }).first();
    await chip.click();
    await chip.click();

    const quantites = page.getByLabel("Quantité");
    // 2 + 2 = 4 > 3 alors qu'aucune ligne seule ne dépasse : c'est le piège.
    await quantites.nth(1).fill("2");
    await quantites.nth(2).fill("2");

    await expect(page.getByText(/référence.? au-delà du stock disponible/i)).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByText(new RegExp(`${ARTICLE_NAME}\\s*:\\s*4 demandés pour ${dispo} en stock`)),
    ).toBeVisible();
  });

  test("Sous le disponible, aucune alerte", async ({ page }) => {
    await forceDisponible(10);

    await loginAsAdmin(page);
    await page.goto("/devis/nouveau");
    await expect(page.locator("form")).toBeVisible({ timeout: 10_000 });

    await page
      .getByRole("button", { name: new RegExp(`${ARTICLE_NAME}.*·`) })
      .first()
      .click();
    await page.getByLabel("Quantité").nth(1).fill("2");

    await expect(page.getByText(/au-delà du stock disponible/i)).toHaveCount(0);
  });

  test("L'alerte reste NON bloquante : le devis peut être enregistré", async ({ page }) => {
    await forceDisponible(1);

    await loginAsAdmin(page);
    await page.goto("/devis/nouveau");
    await expect(page.locator("form")).toBeVisible({ timeout: 10_000 });

    await page.locator("#clientNom").fill(`QA Survente ${Date.now()}`);
    // La ligne vide par défaut doit porter une désignation, sinon c'est la
    // validation du formulaire — et non le stock — qui bloquerait l'envoi.
    await page.getByLabel("Désignation").first().fill("Prestation QA");
    await page
      .getByRole("button", { name: new RegExp(`${ARTICLE_NAME}.*·`) })
      .first()
      .click();
    await page.getByLabel("Quantité").nth(1).fill("50");

    await expect(page.getByText(/au-delà du stock disponible/i)).toBeVisible({ timeout: 10_000 });

    // Ni bouton désactivé, ni soumission refusée : l'admin garde la main.
    const submit = page.getByRole("button", { name: /^Créer le devis$/ }).first();
    await expect(submit).toBeEnabled();
    await submit.click();

    // La redirection vers le devis créé prouve que l'enregistrement est passé.
    await expect(page).toHaveURL(/\/devis\/[0-9a-f-]{36}/, { timeout: 15_000 });
  });

  test("« Ajouter depuis le stock disponible » ne propose que du stock réel", async ({ page }) => {
    await forceDisponible(7);

    await loginAsAdmin(page);
    await page.goto("/devis/nouveau");
    await expect(page.locator("form")).toBeVisible({ timeout: 10_000 });

    const carte = page.locator("div").filter({ hasText: /^Ajouter depuis le stock disponible/ });
    await expect(carte.first()).toBeVisible({ timeout: 10_000 });
    await expect(
      carte.getByRole("button", { name: new RegExp(`${ARTICLE_NAME}.*7 dispo`) }).first(),
    ).toBeVisible();
  });
});
