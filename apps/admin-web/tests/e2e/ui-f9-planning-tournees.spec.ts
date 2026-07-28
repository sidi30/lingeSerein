/**
 * UI F9 — Non-régression du crash de la page Planning
 *
 * Le bug était INVISIBLE tant qu'aucune tournée n'existait : l'état vide masquait
 * trois défauts qui faisaient écran blanc dès la première tournée créée.
 *   1. `{r.driver}` rendait un OBJET → « Objects are not valid as a React child ».
 *   2. `r.stops.length` sur une liste qui ne renvoie que `_count.stops` → TypeError.
 *   3. Statuts comparés en minuscules alors que Prisma renvoie des MAJUSCULES.
 *
 * Ce test monte donc une VRAIE tournée avant d'ouvrir la page. Sans cette
 * précondition, il passerait au vert même avec le bug d'origine.
 */

import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";
import { createUser } from "./helpers/api";
import { collectPageErrors } from "./helpers/console";
import { createClient, createRound, isoDay } from "./helpers/rotations";

const SETS_TO_DELIVER = 3;

let driverName: string;
let clientName: string;

test.describe("UI F9 — Planning : la vue Tournées ne plante plus", () => {
  test.beforeAll(async () => {
    const ts = Date.now();
    driverName = `QA Livreur ${ts}`;
    const driver = await createUser({ name: driverName, role: "LIVREUR" });
    const client = await createClient({ name: `QA Hotel Tournee ${ts}` });
    clientName = client.name;

    await createRound({
      date: isoDay(0),
      driverId: driver.user.id,
      stops: [{ clientId: client.id, stopOrder: 1, setsToDeliver: SETS_TO_DELIVER }],
    });
  });

  test("La tournée s'affiche : nom du livreur, nombre d'arrêts, aucune erreur", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);

    await loginAsAdmin(page);
    await page.goto("/planning");
    await page.getByRole("tab", { name: /tournées/i }).click();

    // Le livreur est un objet côté API : c'est `driver.name` qui doit sortir,
    // jamais l'objet lui-même ni un « [object Object] ».
    await expect(page.getByText(driverName).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("[object Object]")).toHaveCount(0);

    // Le compte vient de `_count.stops` — la liste ne contient aucun tableau `stops`.
    await expect(page.getByText(/1 arrêt(?!s)/).first()).toBeVisible();

    expect(
      errors.pageErrors,
      `Exception de rendu sur /planning : ${errors.pageErrors.join(" | ")}`,
    ).toEqual([]);
    expect(
      errors.consoleErrors.filter((m) => /not valid as a React child|Cannot read propert/i.test(m)),
    ).toEqual([]);
  });

  test("Le détail de la tournée liste les arrêts (client, adresse, kits)", async ({ page }) => {
    const errors = collectPageErrors(page);

    await loginAsAdmin(page);
    await page.goto("/planning");
    await page.getByRole("tab", { name: /tournées/i }).click();

    await page
      .getByRole("button", { name: new RegExp(driverName, "i") })
      .first()
      .click();

    // Les arrêts ne sont PAS dans la liste : ils viennent de GET /rounds/:id.
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText(clientName)).toBeVisible();
    await expect(dialog.getByText(/Arrêts \(1\)/)).toBeVisible();
    await expect(dialog.getByText(`${SETS_TO_DELIVER} kit(s)`)).toBeVisible();

    // `stopOrder`, et non `stop.order` qui est la relation *commande*.
    await expect(dialog.getByText("1", { exact: true }).first()).toBeVisible();

    expect(errors.pageErrors).toEqual([]);
  });

  test("Le statut est lu en MAJUSCULES (une tournée neuve est « Planifiée »)", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/planning");
    await page.getByRole("tab", { name: /tournées/i }).click();
    await page
      .getByRole("button", { name: new RegExp(driverName, "i") })
      .first()
      .click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    // PLANNED → « Planifiée ». Le libellé tombait déjà juste par défaut ;
    // ce qui compte est qu'il ne soit pas resté bloqué dessus pour COMPLETED.
    await expect(dialog.getByText(/Planifiée/)).toBeVisible();
  });

  test("L'onglet Calendrier est celui ouvert par défaut", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/planning");

    await expect(page.getByRole("tab", { name: /calendrier/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
