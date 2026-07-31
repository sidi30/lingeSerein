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

/** Fuseau de l'exploitation : toutes les dates « métier » se lisent depuis Orange. */
export const FUSEAU_OPERATEUR = "Europe/Paris";

/**
 * Jour calendaire canonique : MINUIT UTC du jour désigné.
 *
 * À utiliser pour tout ce qui est stocké dans une colonne `@db.Date`
 * (`dateLivraison`, `dateReprisePrevue`, `dateRepriseReelle`). PostgreSQL n'y
 * retient que la partie date de l'instant UTC : une date construite à minuit
 * LOCAL est écrite la veille dès que le serveur est en avance sur UTC. Vécu :
 * une rotation livrée le 31/07 saisie depuis un poste à Paris (UTC+2) atterrit
 * en base au 30/07, disparaît de la vue « 7 jours » du planning et fait partir
 * le rappel de reprise un jour trop tôt.
 *
 * Une chaîne `AAAA-MM-JJ` est prise au mot (c'est déjà un jour, pas un instant).
 * Un instant est traduit en jour tel qu'il est LU dans {@link FUSEAU_OPERATEUR} :
 * à 1 h du matin à Paris, on est déjà « demain » pour l'exploitation alors qu'il
 * est encore la veille à UTC.
 */
export function jourCalendaire(valeur: Date | string, fuseau = FUSEAU_OPERATEUR): Date {
  if (typeof valeur === "string") {
    const jourNu = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valeur);
    if (jourNu) {
      return new Date(Date.UTC(Number(jourNu[1]), Number(jourNu[2]) - 1, Number(jourNu[3])));
    }
  }

  const instant = valeur instanceof Date ? valeur : new Date(valeur);
  if (Number.isNaN(instant.getTime())) return instant;

  const parties = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuseau,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
  const [annee, mois, jour] = parties.split("-").map(Number);
  return new Date(Date.UTC(annee as number, (mois as number) - 1, jour as number));
}

/** Le jour calendaire d'aujourd'hui, au sens de l'exploitation. */
export function aujourdHui(now: Date = new Date(), fuseau = FUSEAU_OPERATEUR): Date {
  return jourCalendaire(now, fuseau);
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
