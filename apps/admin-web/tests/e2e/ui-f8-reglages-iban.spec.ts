/**
 * UI tests — F8 Coordonnées bancaires dans les réglages
 *
 * - Champs IBAN / BIC présents dans l'onglet « Informations opérateur »
 * - IBAN valide (avec espaces, comme un copier-coller réel) → enregistré
 * - IBAN manifestement invalide → erreur de validation, pas d'enregistrement
 * - Onglet Pack Sérénité : la dotation est annoncée en 2 passages/mois
 */

import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

const IBAN_VALIDE = "FR76 3000 6000 0112 3456 7890 189";

async function ouvrirOngletOperateur(page: import("@playwright/test").Page) {
  await page.goto("/reglages");
  // Les sections des réglages sont des `role="tab"` : un rôle explicite prime
  // sur la balise, donc `getByRole("button")` ne les voit pas et l'attente
  // partait au bout de 30 s.
  await page
    .getByRole("tab", { name: /informations opérateur|opérateur/i })
    .first()
    .click();
  await expect(page.locator("#op-iban")).toBeVisible({ timeout: 10_000 });
}

test.describe("UI F8 — Réglages : coordonnées bancaires", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("Champs IBAN et BIC présents avec leur mention factures", async ({ page }) => {
    await ouvrirOngletOperateur(page);

    await expect(page.locator("#op-iban")).toBeVisible();
    await expect(page.locator("#op-bic")).toBeVisible();
    // Le hint doit dire où ces valeurs atterrissent.
    await expect(page.getByText(/imprimées sur les factures/i)).toBeVisible();
  });

  test("IBAN valide saisi avec espaces → enregistré", async ({ page }) => {
    await ouvrirOngletOperateur(page);

    await page.locator("#op-iban").fill(IBAN_VALIDE);
    await page.locator("#op-bic").fill("AGRIFRPP");
    await page
      .getByRole("button", { name: /enregistrer/i })
      .first()
      .click();

    // Un IBAN se copie-colle par groupes de 4 : cette forme doit être acceptée.
    await expect(page.getByText(/enregistr/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("IBAN invalide → message d'erreur, pas d'enregistrement", async ({ page }) => {
    await ouvrirOngletOperateur(page);

    await page.locator("#op-iban").fill("PAS-UN-IBAN");
    await page
      .getByRole("button", { name: /enregistrer/i })
      .first()
      .click();

    await expect(page.getByText(/format d'iban invalide/i)).toBeVisible({ timeout: 8_000 });
  });

  test("BIC invalide → message d'erreur", async ({ page }) => {
    await ouvrirOngletOperateur(page);

    await page.locator("#op-iban").fill(IBAN_VALIDE);
    await page.locator("#op-bic").fill("123");
    await page
      .getByRole("button", { name: /enregistrer/i })
      .first()
      .click();

    await expect(page.getByText(/format de bic invalide/i)).toBeVisible({ timeout: 8_000 });
  });

  test("Pack Sérénité : dotation annoncée en 2 passages par mois", async ({ page }) => {
    await page.goto("/reglages");
    await page
      .getByRole("tab", { name: /pack sérénité/i })
      .first()
      .click();

    await expect(page.getByText(/2 passages/i).first()).toBeVisible({ timeout: 10_000 });
    // La reprise sous 14 jours fait partie de l'engagement contractuel.
    await expect(page.getByText(/14 jours/i).first()).toBeVisible();
  });
});
