/**
 * Utilitaires de dates pour la grille calendrier.
 *
 * Tout est calculé en heure LOCALE. `toISOString()` est volontairement banni
 * ici : il convertit en UTC, si bien qu'en France une date du 3 à 01 h donne
 * la clé « 02 » et se rangeait dans la mauvaise case (le surlignage
 * « aujourd'hui » sautait une partie de la nuit).
 */

/** Clé de jour `AAAA-MM-JJ` en heure locale. */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Clé de jour d'une date ISO renvoyée par l'API.
 * Les dates métier (livraison, reprise) sont des jours, pas des instants :
 * on prend la partie date telle quelle quand elle est présente, sans conversion
 * de fuseau qui pourrait la décaler d'un jour.
 */
export function dayKeyFromISO(iso: string): string {
  const datePart = iso.split("T")[0];
  if (datePart && /^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart;
  return dayKey(new Date(iso));
}

export function todayKey(): string {
  return dayKey(new Date());
}

/** Date locale à minuit à partir d'une clé `AAAA-MM-JJ`. */
export function dateFromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** Nombre de jours entiers entre deux clés (b - a). */
export function daysBetweenKeys(a: string, b: string): number {
  const MS_PER_DAY = 86_400_000;
  return Math.round((dateFromKey(b).getTime() - dateFromKey(a).getTime()) / MS_PER_DAY);
}

export function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

/**
 * Les 42 jours (6 semaines) d'une grille mensuelle commençant un lundi.
 * Toujours 6 lignes : la hauteur de la grille ne saute pas d'un mois à l'autre.
 */
export function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const weekday = first.getDay(); // 0 = dimanche
  const offsetToMonday = weekday === 0 ? -6 : 1 - weekday;
  const start = addDays(first, offsetToMonday);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/** Les 7 jours à partir d'aujourd'hui (vue liste mobile). */
export function nextSevenDays(): Date[] {
  const today = new Date();
  return Array.from({ length: 7 }, (_, i) => addDays(today, i));
}

export const DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"] as const;

export const MONTH_LABELS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
] as const;

export function monthLabel(year: number, month: number): string {
  return `${MONTH_LABELS[month] ?? ""} ${year}`;
}

/** Libellé court « lun. 3 févr. » pour la vue liste. */
export function shortDayLabel(d: Date): string {
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}
