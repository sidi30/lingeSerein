/**
 * Helpers de navigation dans le parcours devis public (wizard 7 étapes).
 * Les sélecteurs passent par les rôles ARIA : ils cassent si l'accessibilité
 * régresse, ce qui est exactement le comportement voulu.
 */

import { expect, type Page } from "@playwright/test";

export const ETAPES = [
  "Votre hébergement",
  "Vos kits",
  "Des extras ?",
  "Où vous livrer ?",
  "Pour quand ?",
  "Votre récapitulatif",
  "Recevoir mon devis",
] as const;

export async function ouvrirWizard(page: Page): Promise<void> {
  await page.goto("/devis");
  await expect(page.getByRole("heading", { name: "Votre hébergement" })).toBeVisible();
}

export async function choisirHebergement(page: Page, nom: RegExp): Promise<void> {
  await page.getByRole("radio", { name: nom }).click();
}

/**
 * Clique le bouton d'avancement de l'étape courante. Il s'intitule « Continuer »
 * partout, sauf au récapitulatif où il devient « Recevoir mon devis » — l'ancrage
 * exact évite de confondre avec le « Recevoir mon devis officiel » du formulaire.
 */
export async function continuer(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^(Continuer|Recevoir mon devis)$/ }).click();
}

/** Titre de l'étape affichée (le h2 de la carte). */
export function titreEtape(page: Page) {
  return page.getByRole("heading", { level: 2 });
}

/**
 * Déroule le parcours jusqu'au récapitulatif.
 * Par défaut : Studio (2 Kit Complet), Orange, délai standard.
 */
export async function allerAuRecap(
  page: Page,
  opts: { hebergement?: RegExp; zone?: RegExp; urgence?: RegExp } = {},
): Promise<void> {
  const { hebergement = /Studio/, zone = /^Orange/, urgence = /Standard/ } = opts;

  await ouvrirWizard(page);
  await choisirHebergement(page, hebergement);
  await continuer(page); // → Vos kits
  await continuer(page); // → Des extras ?
  await continuer(page); // → Où vous livrer ?
  await page.getByRole("radio", { name: zone }).click();
  await continuer(page); // → Pour quand ?
  await page.getByRole("radio", { name: urgence }).click();
  await continuer(page); // → Votre récapitulatif

  await expect(page.getByRole("heading", { name: "Votre récapitulatif" })).toBeVisible();
}

/** Texte du récapitulatif, espaces normalisés — pratique pour les assertions de montants. */
export async function texteRecap(page: Page): Promise<string> {
  return (await page.locator("main").innerText()).replace(/\s+/g, " ");
}
