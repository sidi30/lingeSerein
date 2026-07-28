/**
 * F3 — Parcours devis public : wizard 7 étapes (profil, kits, extras, zone,
 * délai, récap, demande) + garde-fous du mode commercial ?admin=1.
 */

import { test, expect } from "@playwright/test";
import {
  allerAuRecap,
  choisirHebergement,
  continuer,
  ouvrirWizard,
  texteRecap,
} from "./helpers/wizard";

test.describe("F3 — Parcours devis public (wizard)", () => {
  test("F3-01 — /devis se charge et démarre sur la première étape", async ({ page }) => {
    const resp = await page.goto("/devis");
    expect(resp?.status()).toBe(200);
    await expect(page.locator("h1")).toContainText(/votre devis en 2 minutes/i);
    await expect(page.getByRole("heading", { name: "Votre hébergement" })).toBeVisible();
  });

  test("F3-02 — 5 profils d'hébergement, aucun présélectionné, Continuer bloqué", async ({
    page,
  }) => {
    await ouvrirWizard(page);
    const groupe = page.getByRole("radiogroup", { name: /hébergement/i });
    await expect(groupe.getByRole("radio")).toHaveCount(5);
    await expect(groupe.locator('[role="radio"][aria-checked="true"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Continuer/ })).toBeDisabled();
  });

  test("F3-03 — Choisir un profil débloque l'étape et pré-remplit les kits", async ({ page }) => {
    await ouvrirWizard(page);
    await choisirHebergement(page, /Studio/);
    await expect(page.getByRole("button", { name: /^Continuer/ })).toBeEnabled();

    await continuer(page);
    await expect(page.getByRole("heading", { name: "Vos kits" })).toBeVisible();
    // Studio / T2 → 2 Kit Complet suggérés.
    await expect(page.getByRole("spinbutton", { name: /Quantité de Kit Complet/i })).toHaveValue(
      "2",
    );
  });

  test("F3-04 — Les steppers de quantité mettent à jour le total en direct", async ({ page }) => {
    await ouvrirWizard(page);
    await choisirHebergement(page, /Studio/);
    await continuer(page);

    // 2 Kit Complet à 29 € = 58 €
    await expect(page.getByText("58,00 € / rotation")).toBeVisible();

    await page.getByRole("button", { name: /Ajouter un Kit Complet/i }).click();
    await expect(page.getByText("87,00 € / rotation")).toBeVisible();

    await page.getByRole("button", { name: /Retirer un Kit Complet/i }).click();
    await expect(page.getByText("58,00 € / rotation")).toBeVisible();
  });

  test("F3-05 — L'étape Extras est facultative (bouton Passer)", async ({ page }) => {
    await ouvrirWizard(page);
    await choisirHebergement(page, /Studio/);
    await continuer(page);
    await continuer(page);

    await expect(page.getByRole("heading", { name: "Des extras ?" })).toBeVisible();
    await page.getByRole("button", { name: /^Passer$/ }).click();
    await expect(page.getByRole("heading", { name: "Où vous livrer ?" })).toBeVisible();
  });

  test("F3-06 — Hors zone affiche un devis personnalisé sans bloquer", async ({ page }) => {
    await ouvrirWizard(page);
    await choisirHebergement(page, /Studio/);
    await continuer(page);
    await continuer(page);
    await continuer(page);

    await page.getByRole("radio", { name: /Au-delà/ }).click();
    await expect(page.getByText(/devis personnalisé/i)).toBeVisible();
    // Non bloquant : on peut poursuivre le parcours.
    await expect(page.getByRole("button", { name: /^Continuer/ })).toBeEnabled();
  });

  test("F3-07 — La jauge d'urgence expose les 4 paliers et leurs forfaits", async ({ page }) => {
    await ouvrirWizard(page);
    await choisirHebergement(page, /Studio/);
    await continuer(page);
    await continuer(page);
    await continuer(page);
    await continuer(page);

    const groupe = page.getByRole("radiogroup", { name: /délai/i });
    await expect(groupe.getByRole("radio")).toHaveCount(4);

    const texte = (await groupe.innerText()).replace(/\s+/g, " ");
    expect(texte).toContain("Standard");
    expect(texte).toContain("Express 24 h");
    expect(texte).toContain("25 €");
    expect(texte).toContain("Jour même");
    expect(texte).toContain("39 €");
    expect(texte).toMatch(/Flash.*Sur devis/);
  });

  test("F3-08 — Récap standard à Orange : livraison offerte dès 4 kits", async ({ page }) => {
    // 2 Kit Complet = 4 kits physiques → seuil de gratuité Orange atteint.
    await allerAuRecap(page);
    const texte = await texteRecap(page);

    expect(texte).toContain("2× Kit Complet");
    expect(texte).toMatch(/Livraison offerte.*Offerte/);
    expect(texte).toContain("Total / rotation");
    expect(texte).toContain("58,00 €");
  });

  test("F3-09 — Le forfait Express 24 h remplace la gratuité de zone", async ({ page }) => {
    // 2 Kit Complet (58 €) + forfait Express 25 € = 83 €, malgré les 4 kits à Orange.
    await allerAuRecap(page, { urgence: /Express 24 h/ });
    const texte = await texteRecap(page);

    expect(texte).toContain("Livraison Express 24 h");
    expect(texte).toContain("25,00 €");
    expect(texte).toMatch(/Total \/ rotation 83,00 €/);
  });

  test("F3-10 — Le récap propose le Pack Sérénité avec une économie honnête", async ({ page }) => {
    await allerAuRecap(page);
    const texte = await texteRecap(page);

    expect(texte).toContain("Pack Sérénité");
    expect(texte).toContain("89,00 € / mois");
    // Économie réelle du modèle : 150 € à l'unité − 89 € = 61 €.
    expect(texte).toMatch(/économisez\s*~?\s*61,00 €/);
    expect(texte).not.toContain("383");
    await expect(page.getByRole("button", { name: /passer au pack/i })).toBeVisible();
  });

  test("F3-11 — « Passer au Pack » bascule la demande sur l'abonnement", async ({ page }) => {
    await allerAuRecap(page);
    await page.getByRole("button", { name: /passer au pack/i }).click();
    await expect(page.getByRole("button", { name: /pack sérénité retenu/i })).toBeVisible();

    await continuer(page); // → Recevoir mon devis
    const texte = await texteRecap(page);
    expect(texte).toContain("Pack Sérénité — 89,00 € / mois");
    // Un abonnement suit des rotations planifiées : pas de forfait d'urgence affiché.
    expect(texte).toContain("passages / mois");
  });

  test("F3-12 — La dernière étape présente le formulaire de demande", async ({ page }) => {
    await allerAuRecap(page);
    await continuer(page);

    await expect(page.getByRole("heading", { name: "Recevoir mon devis" })).toBeVisible();
    await page.getByRole("button", { name: /recevoir mon devis officiel/i }).click();
    await expect(page.getByPlaceholder(/Établissement/)).toBeVisible();
    await expect(page.getByRole("button", { name: /envoyer ma demande/i })).toBeVisible();
  });

  test("F3-13 — Le retour arrière conserve les choix saisis", async ({ page }) => {
    await ouvrirWizard(page);
    await choisirHebergement(page, /Maison/);
    await continuer(page);
    await expect(page.getByRole("spinbutton", { name: /Quantité de Kit Complet/i })).toHaveValue(
      "4",
    );

    await page.getByRole("button", { name: /^Retour$/ }).click();
    await expect(page.getByRole("heading", { name: "Votre hébergement" })).toBeVisible();
    await expect(page.getByRole("radio", { name: /Maison/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await continuer(page);
    await expect(page.getByRole("spinbutton", { name: /Quantité de Kit Complet/i })).toHaveValue(
      "4",
    );
  });

  test("F3-14 — Les prix des kits restent dans le HTML initial (SEO)", async ({ page }) => {
    await page.goto("/devis");
    const rappel = page.getByRole("heading", { name: /Nos tarifs en un coup d/i });
    await expect(rappel).toBeVisible();

    const texte = (await page.locator("section").last().innerText()).replace(/\s+/g, " ");
    expect(texte).toContain("29 €"); // Kit Complet
    expect(texte).toContain("7,50 €"); // Kit Bain
    expect(texte).toContain("16,50 €"); // Kit Lit
  });

  test("F3-15 — Lien téléphone cliquable", async ({ page }) => {
    await page.goto("/devis");
    const tel = page.getByRole("link", { name: /07 53 56 95 48/ }).first();
    await expect(tel).toBeVisible();
    expect(await tel.getAttribute("href")).toBe("tel:+33753569548");
  });

  test("F3-16 — Le lien Retour ramène à l'accueil", async ({ page }) => {
    await page.goto("/devis");
    await page.getByRole("link", { name: /^Retour$/ }).click();
    await expect(page).toHaveURL("/");
  });
});

test.describe("F3 — Mode commercial ?admin=1", () => {
  test("F3-17 — Le simulateur commercial remplace le wizard", async ({ page }) => {
    await page.goto("/devis?admin=1");
    await expect(page.locator("h1")).toContainText(/simulateur de devis/i);
    await expect(page.getByText(/mode commercial/i)).toBeVisible();
    await expect(page.getByText(/rentabilité/i).first()).toBeVisible();
    // Le parcours public n'est pas monté en mode admin.
    await expect(page.getByRole("heading", { name: "Votre hébergement" })).toHaveCount(0);
  });

  test("F3-18 — Les sliders et le groupage du simulateur restent opérants", async ({ page }) => {
    await page.goto("/devis?admin=1");
    const sliders = page.locator('input[type="range"]');
    expect(await sliders.count()).toBeGreaterThanOrEqual(5);

    // Défaut : 8 kits bain + 4 kits lit groupés → 4 Kit Complet + 4 Kit Bain.
    const recap = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    expect(recap).toContain("4× Kit Complet");
    expect(recap).toContain("146,00 €");
  });
});

test.describe("F3 — Parcours mobile (390 px)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("F3-19 — Le wizard est utilisable sur mobile", async ({ page }) => {
    await ouvrirWizard(page);

    // Le stepper détaillé cède la place à la barre de progression compacte.
    await expect(page.getByText(/Étape 1 sur 7/)).toBeVisible();

    const carte = page.getByRole("radio", { name: /Studio/ });
    await expect(carte).toBeVisible();
    const box = await carte.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(390);
    // Cible tactile confortable.
    expect(box!.height).toBeGreaterThanOrEqual(44);

    await carte.click();
    await continuer(page);
    await expect(page.getByText(/Étape 2 sur 7/)).toBeVisible();

    // Les steppers de quantité restent atteignables et dimensionnés pour le doigt.
    const plus = page.getByRole("button", { name: /Ajouter un Kit Complet/i });
    await expect(plus).toBeVisible();
    const plusBox = await plus.boundingBox();
    expect(plusBox!.height).toBeGreaterThanOrEqual(38);

    // Aucun débordement horizontal du document.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("F3-20 — Le parcours mobile va jusqu'au récapitulatif", async ({ page }) => {
    await allerAuRecap(page, { urgence: /Express 24 h/ });
    const texte = await texteRecap(page);
    expect(texte).toMatch(/Total \/ rotation 83,00 €/);
  });
});
