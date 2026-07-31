/**
 * UI tests — F6 Factures (bouton d'émission + page /factures)
 *
 * - Bouton « Générer la facture » désactivé sur un BROUILLON, avec explication
 * - Actif sur ENVOYE et ACCEPTE, et redirige vers la facture créée
 * - Page /factures : liste, badge de statut, navigation vers le détail
 * - Fiche facture : transitions proposées, suppression réservée au brouillon
 */

import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";
import { createQuoteWithStatus, invoiceFromQuote } from "./helpers/api";

test.describe("UI F6 — Factures", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("Bouton facture DÉSACTIVÉ sur un devis BROUILLON", async ({ page }) => {
    const quote = await createQuoteWithStatus("BROUILLON");
    await page.goto(`/devis/${quote.id}`);

    const btn = page.getByRole("button", { name: /générer la facture/i }).first();
    await expect(btn).toBeVisible({ timeout: 8_000 });
    await expect(btn).toBeDisabled();

    // L'explication vit sur le span parent : un bouton désactivé a
    // pointer-events:none et n'afficherait jamais son propre tooltip.
    const wrapper = page.locator('span[title*="brouillon" i]').first();
    await expect(wrapper).toBeVisible();
  });

  test("Bouton facture ACTIF sur un devis ENVOYE", async ({ page }) => {
    const quote = await createQuoteWithStatus("ENVOYE");
    await page.goto(`/devis/${quote.id}`);

    const btn = page.getByRole("button", { name: /générer la facture/i }).first();
    await expect(btn).toBeVisible({ timeout: 8_000 });
    await expect(btn).toBeEnabled();
  });

  test("Émission depuis un devis ACCEPTE redirige vers la facture", async ({ page }) => {
    const quote = await createQuoteWithStatus("ACCEPTE");
    await page.goto(`/devis/${quote.id}`);

    await page
      .getByRole("button", { name: /générer la facture/i })
      .first()
      .click();

    await page.waitForURL(/\/factures\/[0-9a-f-]{36}$/i, { timeout: 15_000 });
    await expect(page.locator("body")).toContainText(/FACT-\d{4}-\d{4}/, { timeout: 8_000 });
  });

  test("Sidebar contient le lien Factures", async ({ page }) => {
    await page.goto("/");
    await expect(
      page
        .getByRole("complementary", { name: "Menu principal" })
        .locator('a[href*="/factures"]')
        .first(),
    ).toBeVisible({ timeout: 8_000 });
  });

  test("Page /factures se charge et liste la facture émise", async ({ page }) => {
    const quote = await createQuoteWithStatus("ACCEPTE");
    const created = await invoiceFromQuote(quote.id);
    const invoice = (created.json as { data: { invoiceNumber: string } }).data;

    const response = await page.goto("/factures");
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator("body")).not.toContainText("Internal Server Error");

    // Une facture naît BROUILLON, et la page sépare « Émises » de « Brouillons » —
    // l'onglet par défaut ne montre que les émises. Chercher le numéro sans
    // changer d'onglet reviendrait à tester la mauvaise liste.
    await page.getByRole("tab", { name: /brouillons/i }).click();
    await expect(page.locator("body")).toContainText(invoice.invoiceNumber, { timeout: 10_000 });
    await expect(page.getByText("Brouillon").first()).toBeVisible({ timeout: 8_000 });
  });

  test("Clic sur une ligne de /factures ouvre le détail", async ({ page }) => {
    const quote = await createQuoteWithStatus("ACCEPTE");
    const created = await invoiceFromQuote(quote.id);
    const invoice = (created.json as { data: { invoiceNumber: string } }).data;

    await page.goto("/factures");
    await page.getByRole("tab", { name: /brouillons/i }).click();
    await page.getByText(invoice.invoiceNumber).first().click();

    await page.waitForURL(/\/factures\/[0-9a-f-]{36}$/i, { timeout: 10_000 });
    await expect(page.locator("body")).toContainText(invoice.invoiceNumber);
    // Le devis source doit rester atteignable depuis la facture.
    await expect(page.getByRole("link", { name: new RegExp(quote.numero) })).toBeVisible({
      timeout: 8_000,
    });
  });

  test("Fiche facture : transitions proposées et suppression du brouillon", async ({ page }) => {
    const quote = await createQuoteWithStatus("ACCEPTE");
    const created = await invoiceFromQuote(quote.id);
    const invoice = (created.json as { data: { id: string } }).data;

    await page.goto(`/factures/${invoice.id}`);

    // DRAFT → SENT | CANCELLED, et rien d'autre : « payée » ne doit pas être
    // proposée tant que la facture n'est pas envoyée.
    await expect(page.getByRole("button", { name: /marquer comme envoyée/i })).toBeVisible({
      timeout: 8_000,
    });
    await expect(page.getByRole("button", { name: /annuler la facture/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /marquer comme payée/i })).toHaveCount(0);

    // Un brouillon est supprimable.
    await expect(page.getByRole("button", { name: /supprimer/i }).first()).toBeVisible();
  });

  test("Mention TVA 293 B affichée sur une facture sans TVA", async ({ page }) => {
    const quote = await createQuoteWithStatus("ACCEPTE", { tvaApplicable: false });
    const created = await invoiceFromQuote(quote.id);
    const invoice = (created.json as { data: { id: string } }).data;

    await page.goto(`/factures/${invoice.id}`);
    await expect(page.locator("body")).toContainText(/293 B/, { timeout: 8_000 });
  });
});
