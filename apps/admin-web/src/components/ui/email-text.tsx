/**
 * Affichage d'un email potentiellement absent.
 *
 * Depuis le CRM client, `User.email` est nullable : un client saisi par
 * l'artisan (bouche à oreille, marché…) n'a pas forcément d'adresse. Sans repli
 * explicite on affichait « null » ou une chaîne vide qui faisait s'effondrer la
 * hauteur de la ligne. Ce composant garantit un texte toujours présent.
 */

export const NO_EMAIL_LABEL = "pas d'email";

/** Repli texte pur, pour les endroits qui ont besoin d'une string. */
export function displayEmail(email: string | null | undefined): string {
  const trimmed = email?.trim();
  return trimmed ? trimmed : NO_EMAIL_LABEL;
}

interface EmailTextProps {
  email: string | null | undefined;
  /** Classes appliquées uniquement quand l'email existe. */
  className?: string;
  /** Classes appliquées uniquement au repli. */
  fallbackClassName?: string;
}

export function EmailText({ email, className = "", fallbackClassName = "" }: EmailTextProps) {
  const trimmed = email?.trim();
  if (!trimmed) {
    return <span className={`italic text-gray-400 ${fallbackClassName}`}>{NO_EMAIL_LABEL}</span>;
  }
  // break-all : une adresse longue ne doit jamais élargir la page à 390px.
  return <span className={`break-all ${className}`}>{trimmed}</span>;
}
