/**
 * Modèle de prix du parcours devis public (wizard) ET du simulateur commercial (?admin=1).
 *
 * Une seule implémentation pour les deux vues : elles ne peuvent pas diverger sur un total.
 * Tous les prix viennent de @lingengo/shared (source de vérité de seed) — voir Option A,
 * ADR-V2-005 : si les prix sont modifiés via l'admin en production, la vitrine reste sur les
 * valeurs de départ, désynchro assumée en V1.
 */

import {
  CATALOG_DEFAULTS,
  DELIVERY_ZONE_CENTS,
  DELIVERY_ZONE_LABELS,
  SUBSCRIPTION_DEFAULTS,
  computeDeliveryFee,
  computePackSereniteComparison,
} from "@lingengo/shared";
import type { DeliveryZone, UrgencyLevel } from "@lingengo/shared";

export interface Item {
  id: string;
  name: string;
  desc?: string;
  priceCents: number;
}

// Les coûts de revient ne figurent PLUS dans ce fichier, et ne doivent jamais y
// revenir : la vitrine est un export statique, donc tout ce qui vit ici est
// téléchargé par le premier visiteur venu. Les prix de revient étaient lisibles
// en clair dans le bundle public, ce qui rendait les marges calculables par
// n'importe qui — un concurrent, un client en négociation. Le calcul de
// rentabilité appartient à l'admin (admin.lingeserein.fr), derrière
// authentification.

/** Kits vendus à l'unité, hors Kit Complet (qui est le groupage bain + lit). */
export const KITS: Item[] = [
  {
    id: "bain",
    name: "Kit Bain",
    desc: "Drap de bain 70×150 + serviette 50×90 + tapis 50×70",
    priceCents: CATALOG_DEFAULTS.KIT_BAIN_CENTS,
  },
  {
    id: "lit",
    name: "Kit Lit",
    desc: "Housse de couette + drap housse + taies",
    priceCents: CATALOG_DEFAULTS.KIT_LIT_CENTS,
  },
];

/** Articles à l'unité (les 6 produits ARTICLE du catalogue), hors livraison. */
export const EXTRAS: Item[] = [
  {
    id: "serviette",
    name: "Serviette 50×90",
    priceCents: CATALOG_DEFAULTS.SERVIETTE_CENTS,
  },
  {
    id: "drapbain",
    name: "Drap de bain 70×150",
    priceCents: CATALOG_DEFAULTS.DRAP_BAIN_CENTS,
  },
  {
    id: "tapis",
    name: "Tapis de bain 50×70",
    priceCents: CATALOG_DEFAULTS.TAPIS_BAIN_CENTS,
  },
  {
    id: "petite",
    name: "Petite serviette 30×50",
    priceCents: CATALOG_DEFAULTS.PETITE_SERVIETTE_CENTS,
  },
  {
    id: "draphousse",
    name: "Drap housse",
    priceCents: CATALOG_DEFAULTS.DRAP_HOUSSE_CENTS,
  },
  {
    id: "houssecouette",
    name: "Housse de couette",
    priceCents: CATALOG_DEFAULTS.HOUSSE_COUETTE_CENTS,
  },
];

/**
 * Quatre paliers desservis, calculés depuis Orange, qui couvrent TOUT le Vaucluse :
 * chacun a un tarif public. `HORS_ZONE` n'est pas un secteur mais l'extérieur du
 * département — non desservi, jamais proposé au choix du visiteur.
 */
export interface ZoneInfo {
  id: DeliveryZone;
  name: string;
  note: string;
  prix: string;
}

/** Prix affiché d'un palier — 0 € s'écrit « Incluse », jamais « 0 € ». */
function prixZone(zone: Exclude<DeliveryZone, "HORS_ZONE">): string {
  const cents = DELIVERY_ZONE_CENTS[zone];
  return cents === 0 ? "Incluse" : fmtShort(cents);
}

/**
 * Indexé par zone : garantit un libellé pour chaque valeur du type DeliveryZone.
 * `note` reprend tel quel le libellé de @lingengo/shared (bornes kilométriques et
 * communes repères) — un seul endroit à corriger le jour où le barème bouge.
 */
export const ZONE_BY_ID: Record<DeliveryZone, ZoneInfo> = {
  ORANGE: {
    id: "ORANGE",
    name: "Orange",
    note: "Orange, commune du siège",
    prix: prixZone("ORANGE"),
  },
  PROCHE: {
    id: "PROCHE",
    name: "Zone proche",
    note: DELIVERY_ZONE_LABELS.PROCHE,
    prix: prixZone("PROCHE"),
  },
  INTERMEDIAIRE: {
    id: "INTERMEDIAIRE",
    name: "Zone intermédiaire",
    note: DELIVERY_ZONE_LABELS.INTERMEDIAIRE,
    prix: prixZone("INTERMEDIAIRE"),
  },
  ELOIGNE: {
    id: "ELOIGNE",
    name: "Zone éloignée",
    note: DELIVERY_ZONE_LABELS.ELOIGNE,
    prix: prixZone("ELOIGNE"),
  },
  HORS_ZONE: {
    id: "HORS_ZONE",
    name: "Hors Vaucluse",
    note: DELIVERY_ZONE_LABELS.HORS_ZONE,
    prix: "Non desservi",
  },
};

/** Ordre d'affichage, du plus proche au plus lointain. Les 4 paliers desservis. */
export const ZONES: ZoneInfo[] = [
  ZONE_BY_ID.ORANGE,
  ZONE_BY_ID.PROCHE,
  ZONE_BY_ID.INTERMEDIAIRE,
  ZONE_BY_ID.ELOIGNE,
];

/** Kit Complet : bain + lit + 2 serviettes 50×90, 4 € de moins que le détail. */
export const GROUP_DISCOUNT = CATALOG_DEFAULTS.KIT_COMPLET_DISCOUNT_CENTS;
export const KIT_COMPLET_PRICE = CATALOG_DEFAULTS.KIT_COMPLET_CENTS;
export const KIT_COMPLET_SERVIETTES = CATALOG_DEFAULTS.KIT_COMPLET_SERVIETTES_INCLUSES;
export const KIT_COMPLET_LABEL = `Kit Complet (bain + lit + ${KIT_COMPLET_SERVIETTES} serviettes)`;
/** Valeur du Kit Complet acheté à l'unité — sert à afficher l'économie réelle. */
export const KIT_COMPLET_DETAIL_PRICE =
  CATALOG_DEFAULTS.KIT_BAIN_CENTS +
  CATALOG_DEFAULTS.KIT_LIT_CENTS +
  KIT_COMPLET_SERVIETTES * CATALOG_DEFAULTS.SERVIETTE_CENTS;
/** Pack Sérénité — prix depuis SUBSCRIPTION_DEFAULTS. */
export const ABO_PRICE = SUBSCRIPTION_DEFAULTS.PRICE_CENTS;

export function fmt(cents: number): string {
  return (
    (cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
    " €"
  );
}

/**
 * Prix compact : « 29 € » pour un montant rond, « 7,50 € » sinon.
 * Jamais « 7,5 € » — une seule décimale ne s'écrit pas dans un prix.
 */
export function fmtShort(cents: number): string {
  const digits = cents % 100 === 0 ? 0 : 2;
  return (
    (cents / 100).toLocaleString("fr-FR", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }) + " €"
  );
}

export interface CartInput {
  /** Kits Complets (paires bain + lit groupées). */
  complet: number;
  /** Kits Bain vendus seuls — hors ceux déjà comptés dans `complet`. */
  bain: number;
  /** Kits Lit vendus seuls — hors ceux déjà comptés dans `complet`. */
  lit: number;
  /** Quantités des articles à l'unité, indexées par `Item.id`. */
  extraQtys: Record<string, number>;
  zone: DeliveryZone;
  /** Niveau d'urgence de la livraison (le public choisit, l'admin reste en STANDARD). */
  urgency?: UrgencyLevel;
  /** Réduction commerciale en % appliquée aux marchandises (admin uniquement). */
  reductionPct?: number;
}

/**
 * Répartit des quantités bain/lit en paires groupées + reliquats.
 * Utilisé par le simulateur admin, où le groupage est une case à cocher et non
 * une ligne de commande explicite comme dans le wizard public.
 */
export function splitGrouped(
  bain: number,
  lit: number,
  grouper: boolean,
): { complet: number; bain: number; lit: number } {
  const complet = grouper ? Math.min(bain, lit) : 0;
  return { complet, bain: bain - complet, lit: lit - complet };
}

/**
 * Calcule le panier d'une rotation : lignes, remises, frais de livraison et
 * comparaison au Pack Sérénité. Fonction pure — aucun état, aucun effet.
 */
export function computeCart(input: CartInput) {
  const lignes: { name: string; qty: number; total: number }[] = [];
  let sumVente = 0;

  // Le prix du Kit Complet porte déjà la remise de groupage : elle n'est jamais
  // retranchée une seconde fois du sous-total.
  const complet = Math.max(0, input.complet);
  if (complet > 0) {
    sumVente += KIT_COMPLET_PRICE * complet;
    lignes.push({ name: KIT_COMPLET_LABEL, qty: complet, total: KIT_COMPLET_PRICE * complet });
  }

  const bainSeul = Math.max(0, input.bain);
  const litSeul = Math.max(0, input.lit);
  const seuls: Record<string, number> = { bain: bainSeul, lit: litSeul };
  for (const k of KITS) {
    const qty = seuls[k.id] ?? 0;
    if (qty <= 0) continue;
    sumVente += k.priceCents * qty;
    lignes.push({ name: k.name, qty, total: k.priceCents * qty });
  }
  for (const e of EXTRAS) {
    const qty = input.extraQtys[e.id] ?? 0;
    if (qty <= 0) continue;
    sumVente += e.priceCents * qty;
    lignes.push({ name: e.name, qty, total: e.priceCents * qty });
  }

  const groupDiscount = complet * GROUP_DISCOUNT;
  // Quantités TOTALES, kits complets inclus — c'est ce que le client reçoit.
  const qBain = complet + bainSeul;
  const qLit = complet + litSeul;
  const nbKits = qBain + qLit;
  const totalVente = sumVente;

  // Réduction commerciale appliquée sur les marchandises (avant livraison).
  const reductionMontant = Math.round((totalVente * (input.reductionPct ?? 0)) / 100);
  const venteGoods = totalVente - reductionMontant;

  // Livraison : barème unique partagé avec le devis, le contrat et l'admin.
  const livraison = computeDeliveryFee({
    urgency: input.urgency ?? "STANDARD",
    zone: input.zone,
    montantApresRemiseCents: venteGoods,
  });

  const venteApresReduc = venteGoods + livraison.cents;

  // Comparaison Pack Sérénité : forfait mensuel FIXE contre la valeur à-la-carte de
  // l'allotissement mensuel inclus. Si le volume dépasse l'allotissement, on ne
  // revendique aucune économie : les kits au-delà sont facturés au tarif normal.
  const pack = computePackSereniteComparison();
  const packCouvreVolume =
    qBain <= SUBSCRIPTION_DEFAULTS.KIT_BAIN_QTY && qLit <= SUBSCRIPTION_DEFAULTS.KIT_LIT_QTY;

  return {
    lignes,
    pairs: complet,
    groupDiscount,
    totalVente,
    reductionMontant,
    venteGoods,
    livraisonFrais: livraison.cents,
    livraisonSurDevis: livraison.surDevis,
    livraisonLabel: livraison.label,
    venteApresReduc,
    qBain,
    qLit,
    nbKits,
    packAlaCarte: pack.alaCarteCents,
    packCouvreVolume,
    ecoAbo: packCouvreVolume ? pack.economieCents : 0,
  };
}

export type Cart = ReturnType<typeof computeCart>;
