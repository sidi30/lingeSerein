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
