/**
 * Rotations de linge — règles de détention, machine à états et résolution produit.
 *
 * Le linge est LOUÉ : il part chez le client, il doit revenir. Une « rotation »
 * matérialise un aller-retour : ce qui est sorti (lignes), quand, et quand ça
 * doit être repris. Ce module ne contient que du calcul pur — aucune dépendance
 * Prisma ni React : il est consommé à l'identique par l'API, l'admin et le mobile.
 */

import { CATALOG_PRODUCTS, SUBSCRIPTION_DEFAULTS, type ProductSlug } from "./constants";
import { addDays, differenceInCalendarDays } from "./dates";

// ============================================================================
// Formules & durées de détention
// ============================================================================

/** Régime contractuel d'une rotation — commande ponctuelle ou abonnement. */
export type RotationFormule = "PONCTUEL" | "ABONNEMENT";

/**
 * Durée maximale (en jours) pendant laquelle le linge reste chez le client.
 *
 * ⚠️ NE PAS « SIMPLIFIER » CES VALEURS — elles ne sont pas arbitraires.
 *
 * PONCTUEL = 7 jours : c'est le seuil du RENOUVELLEMENT HEBDOMADAIRE du linge de
 * maison exigé par la doctrine para-hôtelière (BOFiP, TVA applicable aux
 * locations meublées de tourisme — l'une des quatre prestations para-hôtelières,
 * avec l'accueil, le petit-déjeuner et le nettoyage). Nos clients (hôtes Airbnb,
 * gîtes, chambres d'hôtes) doivent pouvoir prouver ce rythme pour conserver leur
 * régime de TVA. Allonger cette durée les mettrait en risque fiscal — ce n'est
 * pas un réglage de confort.
 *
 * ABONNEMENT = {@link SUBSCRIPTION_DEFAULTS.MAX_LINEN_KEEP_DAYS} (14 jours) :
 * valeur CONTRACTUELLE, article 7 du contrat B2B (packages/ui/src/contract-pdf.tsx),
 * cohérente avec les deux passages mensuels du Pack Sérénité (un par quinzaine).
 * La modifier ici désaccorderait le calendrier du contrat signé.
 */
export const DETENTION_DAYS: Record<RotationFormule, number> = {
  PONCTUEL: 7,
  ABONNEMENT: SUBSCRIPTION_DEFAULTS.MAX_LINEN_KEEP_DAYS,
};

/**
 * Retard à partir duquel on cesse de considérer l'oubli comme un simple décalage :
 * au-delà, le linge est réputé non restitué et son remplacement DEVIENT facturable
 * au barème. La facturation reste une décision humaine — le système se contente de
 * lever le drapeau.
 */
export const RETARD_ESCALADE_JOURS = 3;

/** Énoncé unique de la règle de détention, repris tel quel par l'admin et le mobile. */
export const DETENTION_RULE_TEXT =
  `Le linge loué est repris au plus tard ${DETENTION_DAYS.PONCTUEL} jours après la livraison ` +
  `en location ponctuelle (renouvellement hebdomadaire para-hôtelier) et ` +
  `${DETENTION_DAYS.ABONNEMENT} jours dans le cadre du ${SUBSCRIPTION_DEFAULTS.PLAN_NAME} ` +
  `(article 7 du contrat).`;

// ============================================================================
// Machine à états — Rotation
// ============================================================================

export type RotationStatus = "PLANIFIEE" | "LIVREE" | "REPRISE" | "EN_RETARD" | "ANNULEE";

/**
 * Transitions autorisées — calqué sur QUOTE_TRANSITIONS : source de vérité
 * partagée front/back, le front s'en sert pour griser les boutons.
 *
 * REPRISE et ANNULEE sont terminaux. EN_RETARD n'est pas une impasse : c'est un
 * état d'alerte posé par le cron, dont on sort en enregistrant la reprise.
 */
export const ROTATION_TRANSITIONS: Record<RotationStatus, RotationStatus[]> = {
  PLANIFIEE: ["LIVREE", "ANNULEE"],
  LIVREE: ["REPRISE", "EN_RETARD", "ANNULEE"],
  EN_RETARD: ["REPRISE", "ANNULEE"],
  REPRISE: [],
  ANNULEE: [],
};

/** Statuts pour lesquels du linge est effectivement dehors, chez le client. */
export const ROTATION_EN_COURS: RotationStatus[] = ["PLANIFIEE", "LIVREE", "EN_RETARD"];

/** Statuts terminaux : plus aucun linge attendu, plus aucune relance à envoyer. */
export const ROTATION_TERMINAL: RotationStatus[] = ["REPRISE", "ANNULEE"];

// ============================================================================
// Dates
// ============================================================================

/** Vue minimale d'une rotation suffisante aux calculs de retard. */
export interface RotationForRetard {
  status: RotationStatus;
  dateReprisePrevue: Date | string;
  dateRepriseReelle?: Date | string | null;
}

function toDate(value: Date | string): Date {
  const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new RangeError(`Date invalide : ${String(value)}`);
  }
  return d;
}

/**
 * Date de reprise prévue = date de livraison + la durée de détention de la formule.
 * C'est LA règle du calendrier de rotations : tout le reste (rappels, retards)
 * s'en déduit.
 *
 * Les jours se comptent via les utilitaires de `./dates` — mêmes minuits locaux
 * que le reste du calendrier, pas de second jeu de primitives de dates.
 */
export function computeDateReprise(input: {
  dateLivraison: Date | string;
  formule: RotationFormule;
}): Date {
  return addDays(toDate(input.dateLivraison), DETENTION_DAYS[input.formule]);
}

/**
 * Jours de retard d'une rotation, en jours entiers, jamais négatif.
 *
 * Une rotation déjà reprise ou annulée n'est jamais en retard — même reprise
 * après l'échéance : le retard est un état vivant, pas un historique.
 */
export function joursDeRetard(
  rotation: RotationForRetard,
  now: Date | string = new Date(),
): number {
  if (ROTATION_TERMINAL.includes(rotation.status)) return 0;
  if (rotation.dateRepriseReelle) return 0;
  return Math.max(0, differenceInCalendarDays(toDate(rotation.dateReprisePrevue), toDate(now)));
}

/** Vrai si le linge aurait dû être repris et ne l'est pas. */
export function isEnRetard(rotation: RotationForRetard, now: Date | string = new Date()): boolean {
  return joursDeRetard(rotation, now) > 0;
}

/**
 * Vrai si le retard a dépassé {@link RETARD_ESCALADE_JOURS} : le remplacement du
 * linge devient facturable au barème. Ne déclenche AUCUNE facturation — c'est un
 * indicateur exposé à l'exploitant, qui tranche.
 */
export function isFacturableRemplacement(
  rotation: RotationForRetard,
  now: Date | string = new Date(),
): boolean {
  return joursDeRetard(rotation, now) > RETARD_ESCALADE_JOURS;
}

// ============================================================================
// Résolution designation → slug catalogue
// ============================================================================

/**
 * Normalisation de comparaison : sans accent, sans casse, sans ponctuation, et
 * au singulier. Appliquée AUX DEUX CÔTÉS (motifs et texte saisi) pour que la
 * dé-pluralisation grossière (« tapis » → « tapi ») reste sans conséquence.
 */
function normalizeDesignation(input: string): string {
  return input
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .map((word) =>
      word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word,
    )
    .join(" ");
}

/**
 * Formulations rencontrées sur les lignes de devis et de facture, par slug.
 *
 * Elles sont saisies à la main par l'exploitant : « Kit bain », « KITS BAIN »,
 * « Grand drap de bain », « Serviettes 50x90 »… d'où le rapprochement par
 * sous-chaîne normalisée plutôt que par égalité stricte.
 */
const SLUG_ALIASES: Record<ProductSlug, string[]> = {
  "kit-complet": ["kit complet", "kit bain et lit", "kit bain lit"],
  "kit-bain": ["kit bain", "kit de bain", "kit salle de bain"],
  "kit-lit": ["kit lit", "kit de lit", "kit literie", "kit couchage"],
  "drap-bain": ["grand drap de bain", "drap de bain", "drap bain", "70x150"],
  "tapis-bain": ["tapis de bain", "tapis bain", "50x70"],
  "petite-serviette": ["petite serviette", "serviette invite", "30x50"],
  serviette: ["serviette de toilette", "serviette 50x90", "serviette", "50x90"],
  "drap-housse": ["drap housse", "drap de housse"],
  "housse-couette": ["housse de couette", "housse couette", "couette"],
};

interface AliasEntry {
  slug: ProductSlug;
  pattern: string;
}

/** Motifs normalisés, du plus long au plus court — le plus spécifique gagne. */
const ALIAS_ENTRIES: AliasEntry[] = Object.entries(SLUG_ALIASES)
  .flatMap(([slug, patterns]) =>
    patterns.map((pattern) => ({
      slug: slug as ProductSlug,
      pattern: normalizeDesignation(pattern),
    })),
  )
  .sort((a, b) => b.pattern.length - a.pattern.length);

/**
 * Rapproche une désignation libre (ligne de devis / de facture) d'un slug du
 * catalogue. Renvoie `null` si rien ne correspond OU si deux produits différents
 * correspondent aussi bien l'un que l'autre : **on ne devine pas**. Une ligne non
 * résolue reste une ligne de rotation valide (la désignation est conservée), elle
 * ne bouge simplement pas le stock — mieux vaut un stock incomplet qu'un stock faux.
 *
 * Le motif le PLUS LONG l'emporte, ce qui règle les inclusions naturelles :
 * « Petite serviette » ne devient pas « serviette », « Kit Complet (Bain + Lit) »
 * ne devient pas « Kit Bain ». Une ligne qui mélange réellement deux produits
 * (« Kit Bain + Kit Lit ») doit être scindée en deux lignes en amont.
 */
export function resolveProductSlug(designation: string): ProductSlug | null {
  const text = normalizeDesignation(designation ?? "");
  if (!text) return null;

  const matches = ALIAS_ENTRIES.filter((entry) => text.includes(entry.pattern));
  const best = matches[0];
  if (!best) return null;

  // Égalité de longueur entre deux produits distincts = ambiguïté réelle.
  const tied = matches.filter(
    (m) => m.pattern.length === best.pattern.length && m.slug !== best.slug,
  );
  if (tied.length > 0) return null;

  return best.slug;
}

/** Libellé catalogue d'un slug — pour afficher un stock sans requêter la base. */
export function productNameFromSlug(slug: string): string | null {
  return CATALOG_PRODUCTS.find((p) => p.slug === slug)?.name ?? null;
}
