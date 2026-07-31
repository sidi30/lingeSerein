import { communeParInsee } from "@lingengo/shared";

/** Les trois champs qui décrivent le lieu de livraison sur une fiche client. */
export interface AdresseSaisie {
  communeInsee?: string | null;
  city?: string | null;
  postalCode?: string | null;
}

/**
 * Ville et code postal RÉALIGNÉS sur la commune choisie — `null` s'il n'y a rien
 * à aligner (aucune commune fournie, ou commune hors périmètre).
 *
 * Trois champs décrivent le même lieu et un seul est vérifié contre une liste
 * fermée : le code INSEE. Les laisser diverger produit des fiches
 * « Orange / 84300 / Cavaillon » où le tarif suit la commune, l'étiquette de
 * livraison suit la ville, et personne ne sait laquelle croire. La commune fait
 * donc autorité sur les deux autres — c'est le seul des trois que l'utilisateur
 * ait choisi dans une liste, les autres sont de la saisie libre.
 *
 * Le code postal saisi est CONSERVÉ s'il appartient à la commune : Avignon en
 * porte deux (84000 et 84140), et écraser le 84140 d'un client par le premier de
 * la liste dégraderait une adresse pourtant juste.
 */
export function alignementCommune(
  saisie: AdresseSaisie,
): { city: string; postalCode: string } | null {
  const insee = (saisie.communeInsee ?? "").trim();
  if (!insee) return null;

  const commune = communeParInsee(insee);
  if (!commune) return null;

  const cpSaisi = (saisie.postalCode ?? "").trim();
  const codePostal =
    cpSaisi && commune.codesPostaux.includes(cpSaisi) ? cpSaisi : commune.codesPostaux[0];

  // Toute commune de la table porte au moins un code postal ; le repli sur la
  // saisie ne sert qu'à ne jamais rendre `undefined` à Prisma.
  return { city: commune.nom, postalCode: codePostal ?? cpSaisi };
}
