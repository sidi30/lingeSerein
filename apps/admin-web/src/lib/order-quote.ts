/**
 * Règles pures de la passerelle **commande → devis**, et lecture des montants
 * d'une commande (sous-total / frais de livraison / total).
 *
 * Elles vivent ici, sans React, pour trois raisons :
 *
 * 1. la fiche et la liste des commandes doivent afficher le MÊME total — deux
 *    calculs recopiés finissent toujours par diverger, et un total faux sur un
 *    écran de gestion se paie en facturation ;
 * 2. le lien vers le devis déjà généré se déduit d'un contrat serveur qui peut
 *    prendre deux formes (voir `quoteLink`) : la déduction mérite un test, pas
 *    une relecture ;
 * 3. le bouton « Générer le devis » ne doit jamais partir pour se prendre un
 *    refus : `quoteGenerationBlockedReason` est la traduction UI des états où
 *    l'API refusera, et sert de texte d'explication au survol.
 */

import { deliveryLabelFromCents, type OrderStatus } from "@lingengo/shared";
import { formatPrice } from "./format";

/** Référence minimale d'un devis, telle que la porte une commande. */
export interface QuoteRef {
  id: string;
  numero: string;
}

/**
 * Ce que ce module lit d'une commande. Volontairement plus étroit que
 * `OrderDetailDTO` : la liste n'expose pas les mêmes champs que la fiche, et
 * les deux doivent pouvoir appeler les mêmes fonctions.
 *
 * Tous les champs nouveaux sont OPTIONNELS : l'API peut être plus ancienne que
 * cet écran (même règle que `DeletionPreviewDTO`). Un champ absent se lit
 * « inconnu », jamais « zéro » — afficher « livraison offerte » parce que le
 * serveur ne renvoie pas encore le champ serait un mensonge sur un prix.
 */
export interface OrderQuoteView {
  convertedFromQuote?: QuoteRef | null;
  generatedQuote?: QuoteRef | null;
}

/**
 * Les DEUX liens possibles entre une commande et un devis. Ils portent des
 * relations distinctes en base et peuvent coexister sur la même commande :
 * un devis accepté produit la commande, puis un second devis est émis depuis
 * elle (avenant, ajustement de frais).
 */
export interface QuoteLinks {
  /** Devis à l'ORIGINE de la commande — `Quote.convertedToOrderId`. */
  converted: QuoteRef | null;
  /** Devis ÉMIS DEPUIS la commande — `Quote.fromOrderId`. */
  generated: QuoteRef | null;
}

/**
 * Lit les deux liens sans les confondre.
 *
 * Le piège que cette fonction ferme : les deux sens se ressemblent à l'écran,
 * et un seul champ affiché « le devis de cette commande » finirait par annoncer
 * « commande issue du devis » sur un devis que la commande vient d'engendrer.
 * Le serveur les sépare (`convertedFromQuote` / `generatedQuote`), l'UI aussi.
 *
 * Champs absents ⇒ deux `null` : une API plus ancienne ne fait pas planter
 * l'écran, elle le rend seulement muet sur les liens.
 */
export function quoteLinks(order: OrderQuoteView): QuoteLinks {
  return {
    converted: order.convertedFromQuote ?? null,
    generated: order.generatedQuote ?? null,
  };
}

/**
 * Raisons de refus de la génération, par statut. Non nulle ⇒ bouton désactivé
 * AVEC son explication au survol (même motif que `DELETE_BLOCKED`).
 *
 * MIROIR de `QuotesService.createFromOrder` (packages/api), qui reste
 * l'autorité : **seule** une commande annulée est refusée (`ORDER_CANCELLED`).
 * `PENDING` est explicitement autorisé côté serveur — chiffrer AVANT de
 * confirmer est l'usage le plus courant, et le bloquer ici interdirait le
 * parcours principal au lieu de protéger quoi que ce soit.
 */
export const QUOTE_GENERATION_BLOCKED: Partial<Record<OrderStatus, string>> = {
  CANCELLED:
    "Une commande annulée ne peut pas donner lieu à un devis : le document contredirait l'annulation. La trace du refus est conservée.",
};

/** Raison du refus, ou `null` si la génération est possible dans cet état. */
export function quoteGenerationBlockedReason(status: OrderStatus): string | null {
  return QUOTE_GENERATION_BLOCKED[status] ?? null;
}

/**
 * Message de retour après un appel à `POST /quotes/from-order/:orderId`.
 *
 * La route est idempotente : elle crée le devis (**201**) ou renvoie celui déjà
 * émis (**200**), avec le même corps dans les deux cas. Annoncer « créé » sur un
 * devis qui existait déjà ferait croire à un doublon dans la section devis —
 * exactement l'inquiétude que l'idempotence est censée dissiper.
 *
 * Le code HTTP est la SEULE façon de distinguer les deux : d'où `postWithStatus`.
 */
export function quoteFromOrderMessage(status: number, numero: string): string {
  return status === 201
    ? `Devis ${numero} créé`
    : `Devis ${numero} déjà généré pour cette commande — le voici`;
}

/** Montants d'une commande, prêts à afficher. */
export interface OrderAmounts {
  /** Somme des articles — c'est ce que porte `totalCents` côté API. */
  subtotalCents: number;
  /** `null` quand l'API ne renvoie pas le champ : frais inconnus, pas nuls. */
  deliveryFeeCents: number | null;
  /**
   * Aucun tarif public sur cette zone : la course sera chiffrée à la main.
   * Les frais valent alors 0 en base SANS être offerts (`resumeFrais`,
   * packages/api/src/services/orders.service.ts).
   */
  deliveryFeeSurDevis: boolean;
  /**
   * Ce que le client paie. **N'inclut pas** la livraison quand elle est « sur
   * devis » : son montant n'existe pas encore.
   */
  totalCents: number;
}

/**
 * Ce que ce module lit des frais d'une commande.
 *
 * L'API les expose sous DEUX formes selon la route : la fiche ajoute un résumé
 * `deliveryFee: { cents, label, surDevis }`, la liste renvoie les colonnes
 * brutes. On lit le résumé en priorité et on retombe sur les colonnes, pour que
 * la fiche et la liste calculent le même total sans code dupliqué.
 */
export interface OrderFeeView {
  totalCents: number;
  deliveryFeeCents?: number | null;
  deliveryFeeSurDevis?: boolean | null;
  deliveryFee?: { cents?: number | null; surDevis?: boolean | null } | null;
}

/**
 * Décompose les montants d'une commande.
 *
 * Deux pièges refermés ici :
 *
 * 1. `totalCents` porte le SOUS-TOTAL des articles, pas le total à payer :
 *    l'afficher tel quel sous le libellé « Total » sous-facture la livraison ;
 * 2. « sur devis » vaut 0 en base. Additionner ce 0 est juste, mais le présenter
 *    comme un total définitif ne l'est pas — d'où le drapeau remonté à l'écran.
 */
export function orderAmounts(order: OrderFeeView): OrderAmounts {
  const resume = order.deliveryFee;
  const fee =
    typeof resume?.cents === "number"
      ? resume.cents
      : typeof order.deliveryFeeCents === "number"
        ? order.deliveryFeeCents
        : null;
  const surDevis = resume?.surDevis ?? order.deliveryFeeSurDevis ?? false;

  return {
    subtotalCents: order.totalCents,
    deliveryFeeCents: fee,
    deliveryFeeSurDevis: Boolean(surDevis),
    totalCents: order.totalCents + (fee ?? 0),
  };
}

/**
 * Libellé des frais de livraison.
 *
 * Deux zéros qui ne disent pas la même chose :
 * - « sur devis » ⇒ la course reste à chiffrer, annoncer « Offerte » promettrait
 *   au client une gratuité que personne n'a décidée ;
 * - 0 € réel ⇒ gratuité commerciale, à écrire en toutes lettres : « 0,00 € »
 *   ressemble à un oubli de saisie.
 */
export function formatDeliveryFee(cents: number, surDevis = false): string {
  if (surDevis) return "Sur devis";
  return cents === 0 ? "Offerte" : formatPrice(cents);
}

/**
 * Ce que les écrans DEVIS lisent des frais de livraison.
 *
 * Les deux derniers champs sont optionnels : ils n'existent que sur une API qui
 * étiquette déjà les devis « sur devis ». Absents, on ne suppose rien.
 */
export interface QuoteFeeView {
  livraisonCents: number;
  livraisonSurDevis?: boolean | null;
  livraisonLabel?: string | null;
}

/**
 * Intitulé de la ligne « livraison » d'un devis.
 *
 * Ordre de préséance, et il compte :
 *
 * 1. le libellé du SERVEUR, mot pour mot — c'est lui qui est imprimé sur le
 *    devis envoyé au client ; le réécrire ferait diverger l'écran du document ;
 * 2. à défaut, le drapeau « sur devis » ;
 * 3. seulement en dernier recours, la déduction par le montant.
 *
 * Le piège que cette préséance ferme : `deliveryLabelFromCents` lit tout zéro
 * comme une gratuité (« Livraison offerte »). Or une course encore à chiffrer
 * vaut AUSSI 0 en base. Déduire du seul montant, c'est promettre au client une
 * livraison gratuite que personne n'a décidée — même erreur que
 * {@link formatDeliveryFee} referme sur les commandes.
 */
export function quoteDeliveryLabel(quote: QuoteFeeView): string {
  const duServeur = quote.livraisonLabel?.trim();
  if (duServeur) return duServeur;
  if (quote.livraisonSurDevis) return "Livraison sur devis";
  return deliveryLabelFromCents(quote.livraisonCents);
}

/**
 * La ligne « livraison » a-t-elle quelque chose à dire ?
 *
 * Un devis à 0 € de livraison sans autre indication reste muet (c'est le cas
 * ordinaire, la gratuité se lit sur le total). Mais une course « sur devis »
 * vaut aussi 0 : la taire ferait disparaître de l'écran le seul montant que le
 * propriétaire doit encore chiffrer à la main.
 */
export function quoteDeliveryVisible(quote: QuoteFeeView): boolean {
  return quote.livraisonCents > 0 || Boolean(quote.livraisonSurDevis);
}
