/**
 * UI F11 — Stock par article du catalogue
 *
 * L'écran historique était agrégé par gamme (CONFORT/HOTEL/PRESTIGE), inutilisable
 * avec un catalogue par slug. La vue « Par article » est la nouvelle référence :
 * elle met en avant le DISPONIBLE, seul chiffre qui décide si on peut vendre.
 *
 * Cas limite couvert : `disponible` peut être NÉGATIF (plus de linge dehors que
 * le parc déclaré). L'API ne le borne pas volontairement — l'écran doit le dire,
 * pas le masquer.
 */

import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";
import { collectPageErrors } from "./helpers/console";
import { createRotation, getStockItem, isoDay, setStockOwned } from "./helpers/rotations";

const SLUG = "tapis-bain";
const ARTICLE_NAME = "Tapis de bain";

/**
 * Carte de l'article, isolée par le champ « parc possédé » qu'elle contient —
 * son id porte le slug, donc c'est le seul ancrage unique de la grille. Filtrer
 * sur le nom visible ne suffirait pas : plusieurs cartes peuvent afficher les
 * mêmes chiffres, et « Parc sur-engagé » peut apparaître sur plusieurs articles.
 */
function articleCard(page: Page) {
  return page.locator(`div.rounded-xl:has(#owned-${SLUG})`).first();
}

test.describe("UI F11 — Stock par article", () => {
  test("La vue « Par article » est celle ouverte par défaut", async ({ page }) => {
    const errors = collectPageErrors(page);

    await loginAsAdmin(page);
    await page.goto("/stock");

    await expect(page.getByRole("tab", { name: /par article/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // L'ancienne vue reste accessible, elle n'est pas supprimée.
    await expect(page.getByRole("tab", { name: /par gamme/i })).toBeVisible();

    expect(errors.pageErrors).toEqual([]);
  });

  test("Éditer le parc possédé le persiste (PATCH /stock/item/:slug)", async ({ page }) => {
    await setStockOwned(SLUG, 0);

    await loginAsAdmin(page);
    await page.goto("/stock");

    const input = page.locator(`#owned-${SLUG}`);
    await expect(input).toBeVisible({ timeout: 10_000 });
    await input.fill("60");

    // Le bouton n'apparaît qu'une fois la valeur modifiée.
    await page
      .getByRole("button", { name: /^Enregistrer$/ })
      .first()
      .click();
    await expect(page.getByText(/Parc mis à jour/)).toBeVisible({ timeout: 10_000 });

    const item = await getStockItem(SLUG);
    expect(item.totalOwned).toBe(60);
  });

  test("Le disponible affiché suit totalOwned − circulation − sale − retiré", async ({ page }) => {
    await setStockOwned(SLUG, 40);
    const expected = await getStockItem(SLUG);

    await loginAsAdmin(page);
    await page.goto("/stock");

    const card = articleCard(page);
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(
      card.getByText(String(expected.disponible), { exact: true }).first(),
    ).toBeVisible();
    await expect(card.getByText(/disponible/)).toBeVisible();
  });

  test("Parc sur-engagé : un disponible négatif est signalé, pas masqué", async ({ page }) => {
    // Parc à zéro puis sortie de linge → disponible = 0 − qtyLivree < 0.
    await setStockOwned(SLUG, 0);
    await createRotation({
      clientNom: `QA Sur-engagement ${Date.now()}`,
      dateLivraison: isoDay(0),
      dateReprisePrevue: isoDay(3),
      lignes: [{ designation: ARTICLE_NAME, qtyLivree: 5, productSlug: SLUG }],
    });

    const item = await getStockItem(SLUG);
    expect(item.disponible).toBeLessThan(0);

    await loginAsAdmin(page);
    await page.goto("/stock");

    const card = articleCard(page);
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card.getByText(/Parc sur-engagé/)).toBeVisible();
    await expect(card.getByText(String(item.disponible), { exact: true }).first()).toBeVisible();
  });

  test("Le seuil d'alerte est affiché sur chaque article", async ({ page }) => {
    await setStockOwned(SLUG, 40);

    await loginAsAdmin(page);
    await page.goto("/stock");

    // 20 % du parc, minimum 1 — la règle doit être lisible, pas devinée.
    await expect(articleCard(page).getByText(/seuil d'alerte\s*:\s*8/)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("La vue legacy par gamme reste fonctionnelle après la refonte", async ({ page }) => {
    const errors = collectPageErrors(page);

    await loginAsAdmin(page);
    await page.goto("/stock");
    await page.getByRole("tab", { name: /par gamme/i }).click();

    // L'ancien écran ne devait pas être cassé en ajoutant la vue par article.
    await expect(page.getByText(/Stock opérateur par gamme/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Stock par client/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Ajustement manuel/ })).toBeVisible();

    expect(errors.pageErrors).toEqual([]);
  });
});
