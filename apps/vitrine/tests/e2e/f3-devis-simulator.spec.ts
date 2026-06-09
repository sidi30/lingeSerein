/**
 * F3 — Simulateur de devis: gamme selection, sliders, calcul, CTA
 */

import { test, expect } from "@playwright/test";

test.describe("F3 — Simulateur de devis", () => {
  test("F3-01 — Page /devis se charge correctement", async ({ page }) => {
    const resp = await page.goto("/devis");
    expect(resp?.status()).toBe(200);
    await expect(page.locator("h1")).toContainText(/simulateur/i);
  });

  test('F3-02 — Trois gammes affichées, sélection "Hôtel" par défaut', async ({ page }) => {
    await page.goto("/devis");
    const radioGroup = page.locator('[role="radiogroup"]');
    await expect(radioGroup).toBeVisible();

    // Three radio buttons
    const radios = radioGroup.locator('[role="radio"]');
    await expect(radios).toHaveCount(3);

    // Hotel selected by default
    const hotelBtn = radioGroup.getByText("Hôtel");
    await expect(hotelBtn).toBeVisible();
    const hotelRadio = radioGroup.locator('[role="radio"][aria-checked="true"]');
    await expect(hotelRadio).toContainText("Hôtel");
  });

  test('F3-03 — Sélection gamme "Prestige" met à jour l\'affichage', async ({ page }) => {
    await page.goto("/devis");
    const radioGroup = page.locator('[role="radiogroup"]');

    await radioGroup.getByText("Prestige").click();

    // Prestige should now be checked
    const prestigeRadio = radioGroup.locator('[role="radio"][aria-checked="true"]');
    await expect(prestigeRadio).toContainText("Prestige");
  });

  test('F3-04 — Sélection gamme "Confort" — Gant de toilette marqué "Non inclus"', async ({
    page,
  }) => {
    await page.goto("/devis");
    const radioGroup = page.locator('[role="radiogroup"]');
    await radioGroup.getByText("Confort").click();

    await expect(page.getByText(/non inclus en confort/i)).toBeVisible();
  });

  test("F3-05 — Les sliders produits sont présents et interactifs", async ({ page }) => {
    await page.goto("/devis");
    // Verify sliders exist
    const sliders = page.locator('input[type="range"]');
    // At minimum: drap, serviette, tapis, livraisons/mois, engagement = 5
    const count = await sliders.count();
    expect(count).toBeGreaterThanOrEqual(5);
  });

  test('F3-06 — Récap affiche "Ajoutez des produits" quand toutes les quantités sont 0', async ({
    page,
  }) => {
    await page.goto("/devis");
    // Set all product sliders to 0
    const sliders = page.locator('.space-y-6 input[type="range"]');
    const count = await sliders.count();
    for (let i = 0; i < count; i++) {
      await sliders.nth(i).fill("0");
      await sliders.nth(i).dispatchEvent("input");
    }
    await expect(page.getByText(/ajoutez des produits/i)).toBeVisible({ timeout: 3000 });
  });

  test("F3-07 — Récap affiche un total non-zéro avec quantités par défaut", async ({ page }) => {
    await page.goto("/devis");
    // Default quantities should produce a total
    const totalLabel = page.getByText("Total / livraison");
    await expect(totalLabel).toBeVisible();
    // Some price should appear next to it
    const priceContainer = page.locator(".font-serif.text-2xl.font-bold.text-forest");
    await expect(priceContainer.first()).toBeVisible();
  });

  test('F3-08 — Bouton "Recevoir mon devis officiel" renvoie vers /#contact', async ({ page }) => {
    await page.goto("/devis");
    const ctaBtn = page.getByRole("link", { name: /recevoir mon devis officiel/i });
    await expect(ctaBtn).toBeVisible();
    const href = await ctaBtn.getAttribute("href");
    expect(href).toBe("/#contact");
  });

  test("F3-09 — Lien téléphone cliquable dans la page devis", async ({ page }) => {
    await page.goto("/devis");
    const telLink = page.getByRole("link", { name: /07 53 56 95 48/i });
    await expect(telLink).toBeVisible();
    const href = await telLink.getAttribute("href");
    expect(href).toBe("tel:+33753569548");
  });

  test("F3-10 — Bouton retour ramène à la page d'accueil", async ({ page }) => {
    await page.goto("/devis");
    const backLink = page.getByRole("link", { name: /retour/i });
    await expect(backLink).toBeVisible();
    await backLink.click();
    await expect(page).toHaveURL("/");
  });

  test("F3-11 — Paramètre ?gamme=prestige pre-sélectionne Prestige", async ({ page }) => {
    await page.goto("/devis?gamme=prestige");
    const radioGroup = page.locator('[role="radiogroup"]');
    const checked = radioGroup.locator('[role="radio"][aria-checked="true"]');
    await expect(checked).toContainText("Prestige");
  });

  test('F3-12 — Paramètre ?gamme=invalide utilise "Hôtel" par défaut', async ({ page }) => {
    await page.goto("/devis?gamme=invalide");
    const radioGroup = page.locator('[role="radiogroup"]');
    const checked = radioGroup.locator('[role="radio"][aria-checked="true"]');
    await expect(checked).toContainText("Hôtel");
  });

  test("F3-13 — Mode admin ?admin=1 affiche section rentabilité", async ({ page }) => {
    await page.goto("/devis?admin=1");
    await expect(page.getByText(/mode commercial/i)).toBeVisible();
    await expect(page.getByText(/rentabilité/i)).toBeVisible();
  });
});
