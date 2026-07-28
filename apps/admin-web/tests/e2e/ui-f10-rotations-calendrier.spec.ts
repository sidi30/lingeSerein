/**
 * UI F10 — Calendrier des rotations et saisie de la reprise
 *
 * Le geste métier central : le propriétaire voit quand le linge doit revenir,
 * et enregistre ce qui est effectivement revenu.
 *
 * La vue « 7 jours » est utilisée plutôt que la grille mensuelle : elle couvre
 * toujours aujourd'hui → +6 j quelle que soit la position dans le mois, là où la
 * grille mensuelle pourrait faire tomber une reprise juste au-delà de sa
 * dernière case en fin de mois.
 */

import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";
import { collectPageErrors } from "./helpers/console";
import { createRotation, getRotation, isoDay, type RotationView } from "./helpers/rotations";

const QTY_LIVREE = 4;

let rotation: RotationView;
let clientNom: string;

/** Rotation neuve à chaque test : la reprise clôture la rotation, elle n'est pas rejouable. */
test.beforeEach(async () => {
  clientNom = `QA Rotation ${Date.now()}`;
  rotation = await createRotation({
    clientNom,
    clientAdresse: "8 avenue de la Gare, 84100 Orange",
    dateLivraison: isoDay(0),
    dateReprisePrevue: isoDay(2),
    formule: "PONCTUEL",
    lignes: [{ designation: "Kit Bain", qtyLivree: QTY_LIVREE, productSlug: "kit-bain" }],
  });
});

async function openSevenDayView(page: Page) {
  await loginAsAdmin(page);
  await page.goto("/planning");
  await page.getByRole("button", { name: /^7 jours$/ }).click();
}

function repriseRow(page: Page) {
  return page
    .getByRole("button")
    .filter({ hasText: clientNom })
    .filter({ hasText: /Reprise à venir/ });
}

test.describe("UI F10 — Calendrier des rotations", () => {
  test("La rotation occupe deux jours : la livraison et la reprise", async ({ page }) => {
    const errors = collectPageErrors(page);
    await openSevenDayView(page);

    // Une rotation = deux événements distincts, c'est tout l'intérêt de l'écran.
    const rows = page.getByRole("button").filter({ hasText: clientNom });
    await expect(rows).toHaveCount(2, { timeout: 10_000 });
    await expect(rows.filter({ hasText: /Livraison/ })).toHaveCount(1);
    await expect(repriseRow(page)).toHaveCount(1);

    expect(errors.pageErrors).toEqual([]);
  });

  test("La reprise à venir n'est pas signalée en retard", async ({ page }) => {
    await openSevenDayView(page);

    const row = repriseRow(page);
    await expect(row).toBeVisible({ timeout: 10_000 });
    // Échéance à J+2 : aucun badge « +N j ».
    await expect(row).not.toContainText(/\+\d+ j/);
  });

  test("Le détail affiche le client, les articles et les dates", async ({ page }) => {
    await openSevenDayView(page);
    await repriseRow(page).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText(clientNom).first()).toBeVisible();
    await expect(dialog.getByText(/8 avenue de la Gare/)).toBeVisible();
    await expect(dialog.getByText(/Kit Bain/).first()).toBeVisible();
    await expect(dialog.getByText(/Ponctuel/)).toBeVisible();
    await expect(dialog.getByText(new RegExp(`0 / ${QTY_LIVREE}`))).toBeVisible();
    await expect(dialog.getByText(new RegExp(`${QTY_LIVREE} à reprendre`))).toBeVisible();
  });

  test("Enregistrer la reprise complète clôture la rotation", async ({ page }) => {
    await openSevenDayView(page);
    await repriseRow(page).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await dialog.getByRole("button", { name: /^Enregistrer la reprise$/ }).click();

    // Pré-rempli au reste à récupérer : le cas courant est « tout est revenu ».
    const ligneId = rotation.lignes[0]!.id;
    await expect(page.locator(`#reprise-${ligneId}`)).toHaveValue(String(QTY_LIVREE));
    await expect(page.locator("#date-reprise-reelle")).toHaveValue(isoDay(0));

    await dialog.getByRole("button", { name: /^Valider la reprise/ }).click();
    await expect(page.getByText(/Reprise enregistrée/)).toBeVisible({ timeout: 10_000 });

    const after = await getRotation(rotation.id);
    expect(after.status).toBe("REPRISE");
    expect(after.lignes[0]!.qtyReprise).toBe(QTY_LIVREE);
    expect(after.dateRepriseReelle).not.toBeNull();
  });

  test("Reprise partielle : l'écart livré/repris est conservé tel quel", async ({ page }) => {
    const QTY_RENDUE = 3; // une pièce perdue ou abîmée

    await openSevenDayView(page);
    await repriseRow(page).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await dialog.getByRole("button", { name: /^Enregistrer la reprise$/ }).click();

    const ligneId = rotation.lignes[0]!.id;
    await page.locator(`#reprise-${ligneId}`).fill(String(QTY_RENDUE));

    await dialog.getByRole("button", { name: /^Valider la reprise/ }).click();
    await expect(page.getByText(/Reprise enregistrée/)).toBeVisible({ timeout: 10_000 });

    // L'écart ne doit surtout pas être « corrigé » en silence.
    const after = await getRotation(rotation.id);
    expect(after.lignes[0]!.qtyReprise).toBe(QTY_RENDUE);
    expect(after.lignes[0]!.qtyLivree).toBe(QTY_LIVREE);
  });

  test("La recherche client filtre le calendrier", async ({ page }) => {
    await openSevenDayView(page);
    await expect(repriseRow(page)).toBeVisible({ timeout: 10_000 });

    await page.locator("#rotation-search").fill("ZZZ aucun client ne porte ce nom");
    await expect(page.getByRole("button").filter({ hasText: clientNom })).toHaveCount(0);

    await page.locator("#rotation-search").fill(clientNom);
    await expect(repriseRow(page)).toBeVisible();
  });
});
