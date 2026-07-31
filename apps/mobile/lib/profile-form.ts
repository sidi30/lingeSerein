/**
 * Formulaire « mes informations » — logique pure, sans React Native.
 *
 * Miroir strict de `updateMyProfileSchema` (PATCH /auth/me) côté serveur. Les
 * règles sont dupliquées ici pour une seule raison : dire au client CE QUI ne va
 * pas avant l'aller-retour réseau, en français, sous le champ fautif. Le serveur
 * reste l'autorité — cette validation ne fait qu'éviter des 400 prévisibles.
 *
 * Deux pièges portés par ce module :
 *
 * 1. **Champ vidé ≠ champ absent.** Le serveur accepte `null` pour effacer un
 *    contact devenu faux, mais refuse `""` (le code postal a une regex, le
 *    créneau aussi). Un champ laissé vide part donc en `null`, jamais en `""`.
 * 2. **Corps vide refusé.** `updateMyProfileSchema` rejette `{}` (« Aucun champ
 *    à modifier »). On n'envoie que les champs RÉELLEMENT modifiés, et l'écran
 *    n'appelle pas l'API quand il n'y en a aucun.
 *
 * L'e-mail est hors périmètre : le serveur le refuse (`.strict()`, c'est un
 * vecteur de reprise de compte). L'écran l'affiche en lecture seule avec le
 * motif, plutôt que d'offrir un champ voué à l'échec.
 *
 * LA COMMUNE N'EST PAS UNE SAISIE. `communeInsee` est choisi dans une liste
 * fermée (`VAUCLUSE_COMMUNES`, packages/shared) et `city` / `postalCode` en
 * DÉCOULENT — d'où `selectCommune`, seul chemin autorisé pour les écrire. La
 * raison est tarifaire : le palier de livraison se déduisait du `postalCode`,
 * que le client tape lui-même, et « 84100 » suffisait à s'attribuer le tarif
 * d'Orange. Le code INSEE est le seul identifiant stable — un code postal ne
 * désigne même pas une commune (84100 = Orange ET Uchaux).
 */

import { communeParInsee, estLivrable, type CommuneLivrable } from "@lingengo/shared";
import { postalCodeForCommune } from "./communes";

export interface ProfileFormValues {
  name: string;
  phone: string;
  address: string;
  /** Dérivé de la commune choisie — jamais saisi à la main. */
  city: string;
  /** Dérivé de la commune choisie — jamais saisi à la main. */
  postalCode: string;
  /** Code INSEE de la commune choisie ; "" tant qu'aucune ne l'est. */
  communeInsee: string;
  preferredTimeSlot: string;
}

export type ProfileField = keyof ProfileFormValues;

/** Longueurs maximales — mêmes valeurs que le schéma Zod du serveur. */
export const PROFILE_MAX = {
  name: 200,
  phone: 20,
  address: 500,
  city: 120,
} as const;

const POSTAL_CODE_RE = /^\d{5}$/;
/**
 * Commune enregistrée hors périmètre. Le texte énonce une limite de service,
 * pas une faute de saisie : le client n'a aucun moyen de connaître le périmètre
 * de l'entreprise avant de choisir.
 */
export const COMMUNE_HORS_ZONE_ERROR =
  "Nous livrons uniquement dans le Vaucluse : choisissez votre commune dans la liste.";
/** Format imposé par le reste du système (seed, planning) : « 08:00-10:00 ». */
const TIME_SLOT_RE = /^\d{2}:\d{2}-\d{2}:\d{2}$/;

export const EMPTY_PROFILE_FORM: ProfileFormValues = {
  name: "",
  phone: "",
  address: "",
  city: "",
  postalCode: "",
  communeInsee: "",
  preferredTimeSlot: "",
};

/** Profil tel que renvoyé par `GET /auth/me` — champs de contact facultatifs. */
export interface ProfileLike {
  name?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  communeInsee?: string | null;
  preferredTimeSlot?: string | null;
}

/** Pré-remplissage : `null` (champ jamais renseigné) devient une chaîne vide. */
export function toFormValues(profile: ProfileLike | null | undefined): ProfileFormValues {
  return {
    name: profile?.name ?? "",
    phone: profile?.phone ?? "",
    address: profile?.address ?? "",
    city: profile?.city ?? "",
    postalCode: profile?.postalCode ?? "",
    communeInsee: profile?.communeInsee ?? "",
    preferredTimeSlot: profile?.preferredTimeSlot ?? "",
  };
}

/** Commune actuellement retenue par le formulaire, si elle est reconnue. */
export function selectedCommune(values: ProfileFormValues): CommuneLivrable | null {
  const insee = values.communeInsee.trim();
  return insee ? (communeParInsee(insee) ?? null) : null;
}

/**
 * Applique une commune choisie dans la liste : elle porte à la fois le nom et
 * le code postal, qui ne sont plus saisis séparément. Le code postal déjà
 * présent est conservé s'il appartient à la commune (Avignon en a deux).
 */
export function selectCommune(
  values: ProfileFormValues,
  commune: CommuneLivrable,
): ProfileFormValues {
  return {
    ...values,
    communeInsee: commune.codeInsee,
    city: commune.nom,
    postalCode: postalCodeForCommune(commune, values.postalCode),
  };
}

/**
 * Choix d'un code postal parmi ceux de la commune retenue. Ignoré si le code
 * n'appartient pas à la commune : la cohérence commune ↔ code postal est ce que
 * ce module garantit.
 */
export function selectPostalCode(values: ProfileFormValues, codePostal: string): ProfileFormValues {
  const commune = selectedCommune(values);
  if (!commune || !commune.codesPostaux.includes(codePostal)) return values;
  return { ...values, postalCode: codePostal };
}

/**
 * Retire la commune. `city` et `postalCode` en découlent : les laisser en place
 * ferait subsister une adresse que plus rien ne rattache à une commune connue,
 * et le serveur en déduirait un palier tarifaire au code postal — exactement ce
 * que la liste fermée sert à empêcher.
 */
export function clearCommune(values: ProfileFormValues): ProfileFormValues {
  return { ...values, communeInsee: "", city: "", postalCode: "" };
}

export type ProfileErrors = Partial<Record<ProfileField, string>>;

/**
 * Erreurs bloquantes, champ par champ. Un champ vide facultatif est valide :
 * c'est un effacement, pas une faute.
 */
export function validateProfileForm(values: ProfileFormValues): ProfileErrors {
  const errors: ProfileErrors = {};
  const name = values.name.trim();

  if (!name) {
    errors.name = "Le nom est obligatoire.";
  } else if (name.length > PROFILE_MAX.name) {
    errors.name = `Le nom ne doit pas dépasser ${PROFILE_MAX.name} caractères.`;
  }

  if (values.phone.trim().length > PROFILE_MAX.phone) {
    errors.phone = `Le téléphone ne doit pas dépasser ${PROFILE_MAX.phone} caractères.`;
  }
  if (values.address.trim().length > PROFILE_MAX.address) {
    errors.address = `L'adresse ne doit pas dépasser ${PROFILE_MAX.address} caractères.`;
  }
  if (values.city.trim().length > PROFILE_MAX.city) {
    errors.city = `La ville ne doit pas dépasser ${PROFILE_MAX.city} caractères.`;
  }

  const postalCode = values.postalCode.trim();
  if (postalCode && !POSTAL_CODE_RE.test(postalCode)) {
    errors.postalCode = "Le code postal doit comporter 5 chiffres.";
  }

  // Filet de sécurité : l'écran ne PROPOSE que des communes du Vaucluse, donc
  // ce cas ne devrait pas se produire. Il reste possible sur une valeur héritée
  // d'une fiche ancienne, et mieux vaut le dire ici que de faire refuser tout
  // l'enregistrement par le serveur sans expliquer pourquoi.
  const communeInsee = values.communeInsee.trim();
  if (communeInsee && !estLivrable(communeInsee)) {
    errors.communeInsee = COMMUNE_HORS_ZONE_ERROR;
  }

  const slot = values.preferredTimeSlot.trim();
  if (slot && !TIME_SLOT_RE.test(slot)) {
    errors.preferredTimeSlot = "Le créneau doit être au format 08:00-10:00.";
  }

  return errors;
}

export function isProfileFormValid(values: ProfileFormValues): boolean {
  return Object.keys(validateProfileForm(values)).length === 0;
}

/**
 * Corps de `PATCH /auth/me` : uniquement les champs modifiés.
 *
 * Le nom ne peut PAS valoir `null` — le serveur l'exige non vide — d'où un type
 * distinct des champs de contact, effaçables eux.
 */
export interface ProfilePatch {
  name?: string;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  /** Code INSEE (5 caractères) de la commune choisie ; `null` pour l'effacer. */
  communeInsee?: string | null;
  preferredTimeSlot?: string | null;
}

/**
 * Différence entre l'état initial et l'état saisi.
 *
 * Le nom ne peut pas partir en `null` (le serveur l'exige non vide) : un nom
 * effacé est une erreur de saisie, déjà signalée par `validateProfileForm`, et
 * il est ici simplement omis du corps.
 */
export function buildProfilePatch(
  initial: ProfileFormValues,
  current: ProfileFormValues,
): ProfilePatch {
  const patch: ProfilePatch = {};

  const name = current.name.trim();
  if (name && name !== initial.name.trim()) patch.name = name;

  // `city` et `postalCode` partent avec `communeInsee` : le serveur garde ses
  // colonnes (le livreur navigue dessus), mais leurs valeurs viennent toutes de
  // la même commune choisie — cf. `selectCommune`.
  const contactFields = [
    "phone",
    "address",
    "city",
    "postalCode",
    "communeInsee",
    "preferredTimeSlot",
  ] as const;

  for (const field of contactFields) {
    const value = current[field].trim();
    if (value === initial[field].trim()) continue;
    patch[field] = value === "" ? null : value;
  }

  return patch;
}

export function hasProfileChanges(initial: ProfileFormValues, current: ProfileFormValues): boolean {
  return Object.keys(buildProfilePatch(initial, current)).length > 0;
}
