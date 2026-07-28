/**
 * Utilitaires de dates partagés (@lingengo/shared).
 */

/**
 * Ajoute `months` mois calendaires à `date`, en bornant au dernier jour du mois
 * cible si le jour d'origine n'existe pas (ex : 31 janvier + 1 mois → 28/29 février).
 *
 * Évite le débordement de `Date.setMonth` (31 jan +3 mois → 1-3 mai au lieu du 30 avr).
 * Utilisé pour committedUntil (engagement) — ADR-V2-006.
 */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const targetDay = result.getDate();
  // Se placer au 1er du mois cible pour éviter le débordement de setMonth
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  // Dernier jour du mois cible
  const lastDayOfTargetMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(targetDay, lastDayOfTargetMonth));
  return result;
}

/** Ajoute `days` jours calendaires à `date` (l'heure de la journée est conservée). */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Minuit LOCAL du jour de `date`.
 *
 * Une date de livraison ou de reprise désigne un JOUR, pas un instant. Tout ce
 * qui les compare doit passer par ici, sinon « aujourd'hui à 14 h » est jugé
 * postérieur à « aujourd'hui » et un rappel du jour est classé en retard.
 */
export function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Nombre de jours calendaires de `from` vers `to` (négatif si `to` précède).
 *
 * Compte des jours, pas des tranches de 24 h : le calcul se fait sur les minuits
 * locaux et l'arrondi absorbe l'heure gagnée ou perdue au changement d'heure —
 * sans lui, un passage à l'heure d'été décalerait un rappel d'une journée entière.
 */
export function differenceInCalendarDays(from: Date, to: Date): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / MS_PER_DAY);
}
