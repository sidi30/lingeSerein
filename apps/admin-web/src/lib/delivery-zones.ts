/**
 * Barème de livraison, côté écran : les options du sélecteur de zone et la
 * déduction du palier d'un client.
 *
 * Rien n'est retapé ici. Les libellés viennent de `DELIVERY_ZONE_LABELS`, les
 * tarifs de `DELIVERY_ZONE_CENTS`, le palier d'une commune de la table
 * `VAUCLUSE_COMMUNES` — toutes dans `@lingengo/shared`, seule autorité. Une
 * évolution tarifaire ne se répercute donc pas « aussi » dans l'admin : elle s'y
 * répercute parce qu'il n'y a rien d'autre à mettre à jour.
 *
 * Deux règles portées par ce module :
 *
 * 1. l'ordre des paliers est celui de la DISTANCE. Il est dérivé du tarif, qui
 *    croît avec elle (0 / 12 / 15 / 25 €) : un palier ajouté à shared se range
 *    tout seul, sans liste à maintenir en double ;
 * 2. le palier d'un client se lit sur son CODE INSEE. Le code postal n'est qu'un
 *    repli pour les fiches antérieures à la liste fermée — 84100 couvre Orange
 *    ET Uchaux, et sept codes postaux du Vaucluse chevauchent deux paliers.
 *    Quand il ne tranche pas, ce module le dit (`ambigu`) au lieu de choisir.
 */

import {
  DELIVERY_ZONE_CENTS,
  DELIVERY_ZONE_LABELS,
  communeParInsee,
  zoneParCodePostal,
  type CommuneLivrable,
  type DeliveryZone,
} from "@lingengo/shared";
import { formatPrice } from "./format";

/** Palier desservi — tout le Vaucluse, `HORS_ZONE` excepté. */
export type ServedZone = Exclude<DeliveryZone, "HORS_ZONE">;

/**
 * Paliers desservis, du plus proche au plus lointain.
 *
 * L'ordre est celui du tarif, monotone avec la distance depuis Orange : c'est ce
 * qui permet de le DÉRIVER de shared plutôt que de recopier une énumération que
 * la prochaine refonte tarifaire laisserait désordonnée.
 */
export const SERVED_ZONES: readonly ServedZone[] = (
  Object.keys(DELIVERY_ZONE_CENTS) as ServedZone[]
).sort((a, b) => DELIVERY_ZONE_CENTS[a] - DELIVERY_ZONE_CENTS[b]);

export interface DeliveryZoneOption {
  zone: DeliveryZone;
  /** Libellé du palier, mot pour mot depuis shared. */
  label: string;
  /** Tarif standard en centimes ; `null` quand il n'existe pas (sur devis). */
  cents: number | null;
}

/**
 * Options du sélecteur de zone : les quatre paliers desservis, puis `HORS_ZONE`.
 *
 * `HORS_ZONE` reste proposé alors qu'il n'est pas desservi : c'est le seul moyen
 * de chiffrer à la main une course exceptionnelle hors Vaucluse. Il n'a pas de
 * tarif — `cents: null`, et non 0, qui se lirait « offerte ».
 */
export const DELIVERY_ZONE_OPTIONS: readonly DeliveryZoneOption[] = [
  ...SERVED_ZONES.map((zone) => ({
    zone: zone as DeliveryZone,
    label: DELIVERY_ZONE_LABELS[zone],
    cents: DELIVERY_ZONE_CENTS[zone],
  })),
  { zone: "HORS_ZONE", label: DELIVERY_ZONE_LABELS.HORS_ZONE, cents: null },
];

/**
 * Tarif d'un palier en toutes lettres.
 *
 * Trois cas, et les trois se disent différemment : « incluse » (Orange, la
 * commune du siège — rien à payer), « sur devis » (aucun tarif public), et le
 * montant. Écrire « 0,00 € » sur Orange ressemblerait à un oubli de saisie.
 */
export function zoneTarifText(cents: number | null): string {
  if (cents === null) return "sur devis";
  return cents === 0 ? "incluse" : formatPrice(cents);
}

/** Intitulé complet d'une option : libellé du palier + tarif. */
export function zoneOptionText(option: DeliveryZoneOption): string {
  return `${option.label} — ${zoneTarifText(option.cents)}`;
}

/** D'où vient le palier retenu — ce qui dit à l'écran s'il est sûr. */
export type ZoneSource =
  /** Code INSEE : la commune est identifiée, le palier est certain. */
  | "commune"
  /** Repli sur le code postal d'une fiche antérieure à la liste fermée. */
  | "codePostal"
  /** Ni commune ni code postal : rien à déduire. */
  | "inconnu";

export interface ClientZone {
  zone: DeliveryZone;
  source: ZoneSource;
  /** Commune retenue, `null` tant qu'elle n'est pas identifiée sans doute possible. */
  commune: CommuneLivrable | null;
  /** Le code postal désigne des communes de paliers DIFFÉRENTS : à faire trancher. */
  ambigu: boolean;
  /** Communes candidates, à proposer au choix quand `ambigu`. */
  candidates: readonly CommuneLivrable[];
}

/** Ce que ce module lit d'un client — un fragment, la fiche complète ne l'intéresse pas. */
export interface ClientLocation {
  communeInsee?: string | null;
  postalCode?: string | null;
}

/**
 * Palier de livraison d'un client.
 *
 * Le code INSEE fait foi et court-circuite tout le reste : il est choisi dans
 * une liste fermée, contrairement au code postal que le client édite lui-même
 * depuis son profil. Un INSEE inconnu de la table n'est pas « douteux » mais
 * hors Vaucluse : `HORS_ZONE`, sans deviner.
 *
 * Sans INSEE, on retombe sur le code postal — et on remonte tel quel le doute
 * qu'il laisse. Trancher en silence, ce serait facturer un client sur une
 * incertitude qui n'est pas la sienne.
 */
export function clientZone(client: ClientLocation): ClientZone {
  const insee = client.communeInsee?.trim();
  if (insee) {
    const commune = communeParInsee(insee);
    return commune
      ? { zone: commune.zone, source: "commune", commune, ambigu: false, candidates: [commune] }
      : { zone: "HORS_ZONE", source: "commune", commune: null, ambigu: false, candidates: [] };
  }

  const cp = client.postalCode?.trim();
  if (!cp) {
    return { zone: "HORS_ZONE", source: "inconnu", commune: null, ambigu: false, candidates: [] };
  }

  const deduite = zoneParCodePostal(cp);
  return {
    zone: deduite.zone,
    source: "codePostal",
    // Une seule candidate ⇒ le code postal désigne bien une commune : on la
    // retient, mais la source dit qu'elle n'a pas été confirmée par l'admin.
    commune: deduite.candidates.length === 1 ? (deduite.candidates[0] ?? null) : null,
    ambigu: deduite.ambigu,
    candidates: deduite.candidates,
  };
}
