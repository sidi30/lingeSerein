/**
 * UI tests — F13 Suppressions (motif transverse) et regroupement des factures.
 *
 * Ce qui est vérifié tient en une phrase : un bouton « Supprimer » ne doit
 * JAMAIS échouer. Soit il est actif et l'API accepte, soit il est désactivé et
 * porte la raison du refus. Les cas ci-dessous couvrent les deux côtés de cette
 * règle, plus le garde-fou de saisie et l'isolement des brouillons de facture.
 */

import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";
import { createQuoteWithStatus, invoiceFromQuote, apiRequest } from "./helpers/api";

test.describe("UI F13 — Suppressions", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  /* ─── Devis : la règle BROUILLON ─── */

  test("Devis BROUILLON — bouton Supprimer actif sur la fiche", async ({ page }) => {
    const quote = await createQuoteWithStatus("BROUILLON");
    await page.goto(`/devis/${quote.id}`);

    const btn = page.getByRole("button", { name: /^supprimer$/i }).first();
    await expect(btn).toBeVisible({ timeout: 8_000 });
    await expect(btn).toBeEnabled();
  });

  test("Devis ENVOYE — bouton Supprimer désactivé AVEC sa raison", async ({ page }) => {
    const quote = await createQuoteWithStatus("ENVOYE");
    await page.goto(`/devis/${quote.id}`);

    const btn = page.getByRole("button", { name: /^supprimer$/i }).first();
    await expect(btn).toBeVisible({ timeout: 8_000 });
    await expect(btn).toBeDisabled();

    // Le title vit sur le span parent : un bouton désactivé a
    // pointer-events:none et n'afficherait jamais son propre tooltip.
    await expect(page.locator('span[title*="brouillon" i]').first()).toBeVisible();
  });

  test("Devis BROUILLON — suppression confirmée, disparaît de la liste", async ({ page }) => {
    const quote = await createQuoteWithStatus("BROUILLON");
    await page.goto(`/devis/${quote.id}`);

    await page
      .getByRole("button", { name: /^supprimer$/i })
      .first()
      .click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible({ timeout: 8_000 });
    await expect(dialog).toContainText(quote.numero);

    await dialog.getByRole("button", { name: /supprimer/i }).click();
    await page.waitForURL(/\/devis$/, { timeout: 10_000 });

    // La liste ne doit plus porter ce numéro.
    await expect(page.locator("body")).not.toContainText(quote.numero, { timeout: 8_000 });
  });

  /* ─── Factures : conservation légale ─── */

  test("Facture émise — Supprimer désactivé, la raison légale est affichée", async ({ page }) => {
    const quote = await createQuoteWithStatus("ACCEPTE");
    const created = await invoiceFromQuote(quote.id);
    const invoice = (created.json as { data: { id: string } }).data;

    // DRAFT → SENT : la facture devient une pièce comptable.
    await apiRequest("PATCH", `/invoices/${invoice.id}/status`, { status: "SENT" });
    await page.goto(`/factures/${invoice.id}`);

    const btn = page.getByRole("button", { name: /^supprimer$/i }).first();
    await expect(btn).toBeVisible({ timeout: 8_000 });
    await expect(btn).toBeDisabled();
    await expect(page.locator('span[title*="pièce comptable" i]').first()).toBeVisible();
  });

  test("Facture DRAFT — Supprimer actif", async ({ page }) => {
    const quote = await createQuoteWithStatus("ACCEPTE");
    const created = await invoiceFromQuote(quote.id);
    const invoice = (created.json as { data: { id: string } }).data;

    await page.goto(`/factures/${invoice.id}`);
    const btn = page.getByRole("button", { name: /^supprimer$/i }).first();
    await expect(btn).toBeVisible({ timeout: 8_000 });
    await expect(btn).toBeEnabled();
  });

  /* ─── Factures : onglets et regroupement ─── */

  test("Page /factures — onglets Émises / Brouillons présents", async ({ page }) => {
    await page.goto("/factures");

    await expect(page.getByRole("tab", { name: /émises/i })).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole("tab", { name: /brouillons/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /émises/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("Onglet Brouillons — un brouillon y apparaît et PAS dans Émises", async ({ page }) => {
    const quote = await createQuoteWithStatus("ACCEPTE");
    const created = await invoiceFromQuote(quote.id);
    const invoice = (created.json as { data: { invoiceNumber: string } }).data;

    await page.goto("/factures");
    // Onglet « Émises » (défaut) : le brouillon ne doit pas polluer la vue.
    await expect(page.locator("body")).not.toContainText(invoice.invoiceNumber, {
      timeout: 8_000,
    });

    await page.getByRole("tab", { name: /brouillons/i }).click();
    await expect(page.locator("body")).toContainText(invoice.invoiceNumber, { timeout: 8_000 });
  });

  test("Le filtre de statut de l'onglet Émises ne propose pas Brouillon", async ({ page }) => {
    await page.goto("/factures");
    const select = page.getByLabel(/filtrer par statut/i).first();
    await expect(select).toBeVisible({ timeout: 8_000 });
    await expect(select.locator('option[value="DRAFT"]')).toHaveCount(0);
  });

  /* ─── Garde-fou : saisie obligatoire ─── */

  test("Client — la suppression exige la saisie du nom", async ({ page }) => {
    await page.goto("/clients");

    const btn = page.getByRole("button", { name: /^supprimer/i }).first();
    await expect(btn).toBeVisible({ timeout: 10_000 });
    await btn.click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible({ timeout: 8_000 });

    // Confirmation inerte tant que le nom n'est pas saisi : c'est ce qui
    // empêche la suppression au clic réflexe.
    await expect(dialog.getByRole("button", { name: /supprimer|anonymiser/i })).toBeDisabled();
    await expect(dialog).toContainText(/pour confirmer, saisissez/i);
  });
});
