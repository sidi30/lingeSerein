/**
 * Choix de la commune de livraison — logique pure, sans React Native.
 *
 * POURQUOI CE MODULE : la ville était un champ TEXTE LIBRE, et le tarif de
 * livraison se déduisait du seul `postalCode`, que le client écrit lui-même
 * depuis son profil. Saisir « 84100 » suffisait à s'offrir le tarif d'Orange.
 * Pire, un code postal ne désigne même pas une commune : 84100 couvre Orange
 * ET Uchaux, qui ne sont pas au même palier.
 *
 * La commune se choisit donc désormais dans une liste FERMÉE
 * (`VAUCLUSE_COMMUNES`, packages/shared), et c'est son code INSEE — le seul
 * identifiant stable — qui part au serveur. Ce module ne recopie ni un nom de
 * commune, ni un tarif : il branche `chercherCommunes` / `communeParInsee` sur
 * l'état d'un formulaire.
 *
 * Il porte aussi la RÉCONCILIATION des fiches antérieures : elles ont un `city`
 * et un `postalCode`, jamais de `communeInsee`. On ne devine pas leur commune en
 * silence — on propose des candidates que le client confirme, et c'est ce choix
 * qui fait ensuite foi.
 */

import {
  chercherCommunes,
  communeParInsee,
  communesParCodePostal,
  zoneParCodePostal,
  type CommuneLivrable,
  type DeliveryZone,
} from "@lingengo/shared";

export type { CommuneLivrable };

/**
 * Nombre de communes proposées sous le champ. La liste en compte 151 : les
 * rendre toutes d'un coup sur un téléphone d'entrée de gamme rame, et une
 * liste plus longue qu'un écran ne se lit pas. On borne, et on le dit quand
 * il en reste (`tronque`).
 */
export const COMMUNE_RESULTS_MAX = 8;

/** Nombre de candidates proposées à la confirmation sur une fiche ancienne. */
const SUGGESTIONS_MAX = 4;

/** « Orange · 84100 » — le code postal lève l'ambiguïté entre homonymes. */
export function communeLabel(commune: CommuneLivrable): string {
  return `${commune.nom} · ${commune.codesPostaux.join(", ")}`;
}

/**
 * Code postal à retenir pour une commune. Celui déjà saisi est conservé quand
 * il appartient à la commune : Avignon en porte deux (84000 et 84140), et
 * écraser le choix du client par le premier de la liste lui ferait perdre le
 * bon à chaque ré-ouverture de l'écran.
 */
export function postalCodeForCommune(commune: CommuneLivrable, souhaite?: string | null): string {
  const actuel = (souhaite ?? "").trim();
  if (actuel && commune.codesPostaux.includes(actuel)) return actuel;
  return commune.codesPostaux[0] ?? "";
}

export interface CommuneSearchState {
  /** Communes à afficher — bornées à `limite`. */
  results: readonly CommuneLivrable[];
  /** Vrai quand d'autres communes correspondent mais ne sont pas affichées. */
  tronque: boolean;
  /** Vrai quand la saisie ne correspond à AUCUNE commune du Vaucluse. */
  horsListe: boolean;
  /** Message sous le champ ; `null` quand il n'y a rien à dire. */
  notice: string | null;
}

/**
 * Message d'une saisie sans correspondance.
 *
 * Il énonce une limite de service, pas une faute du client : personne ne peut
 * deviner le périmètre d'une entreprise avant de taper. D'où « nous livrons
 * uniquement dans le Vaucluse » plutôt qu'une erreur de validation sèche.
 */
export function horsVaucluseMessage(saisie: string): string {
  const q = saisie.trim();
  return (
    `Nous livrons uniquement dans le Vaucluse, et aucune commune du département ne correspond à « ${q} ». ` +
    `Vérifiez l'orthographe, ou contactez-nous pour en parler.`
  );
}

/** Résultats et message pour la saisie en cours. */
export function communeSearchState(
  saisie: string,
  limite: number = COMMUNE_RESULTS_MAX,
): CommuneSearchState {
  const q = saisie.trim();
  if (!q) {
    return { results: [], tronque: false, horsListe: false, notice: null };
  }

  // On demande UNE de plus que ce qu'on affiche : c'est le seul moyen de savoir
  // qu'il en reste sans parcourir les 151 communes à chaque frappe.
  const trouvees = chercherCommunes(q, limite + 1);
  if (trouvees.length === 0) {
    return { results: [], tronque: false, horsListe: true, notice: horsVaucluseMessage(q) };
  }

  const tronque = trouvees.length > limite;
  return {
    results: trouvees.slice(0, limite),
    tronque,
    horsListe: false,
    notice: tronque ? "Précisez votre saisie pour voir les autres communes." : null,
  };
}

/** Coordonnées d'un client, telles que l'API les renvoie. */
export interface ClientLocation {
  /** Code INSEE choisi dans la liste fermée — identifiant qui fait foi. */
  communeInsee?: string | null;
  city?: string | null;
  postalCode?: string | null;
}

/**
 * Communes à faire confirmer sur une fiche sans `communeInsee`.
 *
 * On part du code postal (colonne contrainte) et on écarte, quand c'est
 * possible, les communes dont le nom ne ressemble pas à la ville saisie. Le
 * résultat n'est JAMAIS appliqué d'office : c'est une proposition, le client
 * tranche.
 */
export function suggestCommunes(client: ClientLocation): readonly CommuneLivrable[] {
  const parCp = communesParCodePostal(client.postalCode ?? "");
  if (parCp.length > 0) {
    if (parCp.length === 1) return parCp;
    const ville = (client.city ?? "").trim();
    if (ville) {
      // `chercherCommunes` normalise (accents, casse, tirets) : on s'en sert
      // pour recouper la ville saisie avec les candidates du code postal.
      const noms = new Set(chercherCommunes(ville, SUGGESTIONS_MAX).map((c) => c.codeInsee));
      const recoupees = parCp.filter((c) => noms.has(c.codeInsee));
      if (recoupees.length > 0) return recoupees;
    }
    return parCp.slice(0, SUGGESTIONS_MAX);
  }

  const ville = (client.city ?? "").trim();
  return ville ? chercherCommunes(ville, SUGGESTIONS_MAX) : [];
}

/** D'où vient le palier tarifaire retenu — et donc ce qu'on peut en promettre. */
export type ZoneSource =
  /** Commune choisie dans la liste fermée : le palier est certain. */
  | "COMMUNE"
  /** Déduit du code postal d'une fiche ancienne : estimation à confirmer. */
  | "CODE_POSTAL"
  /** Rien d'exploitable : aucun montant ne peut être annoncé. */
  | "INCONNUE";

export interface ZoneResolution {
  zone: DeliveryZone;
  source: ZoneSource;
  /** Commune retenue quand elle est identifiée sans ambiguïté. */
  commune: CommuneLivrable | null;
  /** Vrai quand le code postal recouvre des paliers de prix DIFFÉRENTS. */
  ambigu: boolean;
}

const ZONE_INCONNUE: ZoneResolution = {
  zone: "HORS_ZONE",
  source: "INCONNUE",
  commune: null,
  ambigu: false,
};

/**
 * Palier tarifaire d'un client, et le degré de confiance qui va avec.
 *
 * Un `communeInsee` présent tranche seul : s'il ne figure pas dans la liste
 * fermée, on ne retombe PAS sur le code postal — une commune explicitement
 * enregistrée mais non livrable est un cas d'exception, pas une occasion de
 * chercher un tarif ailleurs.
 *
 * Sans commune, le code postal sert de repli, mais uniquement quand il désigne
 * un seul palier : `84100` (Orange à 0 €, Uchaux à 12 €) ne permet d'annoncer
 * aucun prix, et un prix annoncé puis démenti coûte plus cher qu'un « à
 * confirmer » assumé.
 */
export function resolveZone(client: ClientLocation | null | undefined): ZoneResolution {
  if (!client) return ZONE_INCONNUE;

  const insee = (client.communeInsee ?? "").trim();
  if (insee) {
    const commune = communeParInsee(insee);
    if (!commune) return ZONE_INCONNUE;
    return { zone: commune.zone, source: "COMMUNE", commune, ambigu: false };
  }

  const deduite = zoneParCodePostal(client.postalCode);
  if (deduite.candidates.length === 0 || deduite.ambigu) {
    return { ...ZONE_INCONNUE, ambigu: deduite.ambigu };
  }
  return {
    zone: deduite.zone,
    source: "CODE_POSTAL",
    commune: deduite.candidates.length === 1 ? deduite.candidates[0] : null,
    ambigu: false,
  };
}
