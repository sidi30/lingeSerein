/**
 * Décomposition du montant d'une commande — logique pure, sans React Native.
 *
 * Le contrat d'API sépare deux montants qui se ressemblaient jusqu'ici :
 * `totalCents` est le SOUS-TOTAL des articles, `deliveryFeeCents` les frais de
 * livraison. Le total réellement dû est leur somme. Afficher `totalCents` sous
 * le libellé « Total » revient donc à annoncer au client un montant inférieur à
 * ce qu'il paiera.
 *
 * QUATRE situations, quatre affichages distincts — et c'est tout l'objet de ce
 * module :
 *
 * 1. **Frais inconnus** (l'API ne renvoie pas encore le champ, ou la commande
 *    est antérieure à sa mise en service) → on n'invente rien : une seule ligne
 *    « Total ». Afficher « Frais de livraison : 0,00 € » laisserait croire à une
 *    livraison offerte qui n'a jamais été décidée.
 * 2. **Frais nuls** → la livraison est offerte, et on le DIT. Un zéro muet se
 *    lit comme un bug d'affichage ; « Livraison offerte » se lit comme un
 *    avantage.
 * 3. **Frais « sur devis »** (`deliveryFeeSurDevis`) → le barème ne publie AUCUN
 *    tarif (hors zone, urgence Flash) et la colonne vaut 0 SANS gratuité. C'est
 *    le piège que ce module referme : `0` seul ne distingue pas « offerte » de
 *    « à chiffrer », et le mobile est le seul écran que le client final voit.
 *    On affiche « à confirmer » et on marque le total « hors livraison », comme
 *    le font déjà l'admin (`formatDeliveryFee`, apps/admin-web) et les e-mails
 *    (`orderTotauxTable`, apps/mailer).
 * 4. **Frais positifs** → sous-total, frais, total, en trois lignes.
 */

/** Libellé de la ligne de frais quand le montant reste à chiffrer. */
export const DELIVERY_FEE_A_CONFIRMER = "À confirmer";
/** Libellé du total quand la livraison n'y est pas comprise. */
export const TOTAL_HORS_LIVRAISON_LABEL = "Total (hors livraison)";
const TOTAL_LABEL = "Total";

/**
 * Résumé des frais que la fiche (`GET /orders/:id`) et la création
 * (`POST /orders`) ajoutent aux colonnes brutes — `resumeFrais`,
 * packages/api/src/services/orders.service.ts. La liste, elle, ne renvoie que
 * les colonnes : on lit donc le résumé en priorité et on retombe dessus.
 */
export interface DeliveryFeeResume {
  cents?: number | null;
  label?: string | null;
  surDevis?: boolean | null;
}

export interface OrderAmounts {
  /** Sous-total des articles (centimes) — `Order.totalCents`. */
  totalCents: number;
  /** Frais de livraison (centimes). Absent tant que l'API ne les renvoie pas. */
  deliveryFeeCents?: number | null;
  /** Aucun tarif public : la course sera chiffrée à la main. 0 ≠ gratuité. */
  deliveryFeeSurDevis?: boolean | null;
  /** Résumé serveur, prioritaire sur les colonnes quand la route l'expose. */
  deliveryFee?: DeliveryFeeResume | null;
}

export interface OrderTotals {
  /** Montant des articles seuls. */
  subtotalCents: number;
  /** `null` = frais inconnus : ne rien afficher plutôt qu'un « 0 € » trompeur. */
  deliveryFeeCents: number | null;
  /** true = montant à chiffrer : ni offert, ni compris dans le total. */
  deliveryFeeSurDevis: boolean;
  /** true uniquement si les frais sont CONNUS, nuls et DUS → « Livraison offerte ». */
  deliveryOffered: boolean;
  /** Montant réellement dû : sous-total + frais connus (0 quand sur devis). */
  totalCents: number;
  /** true quand la ventilation (sous-total / frais / total) a du sens. */
  showBreakdown: boolean;
  /** « Total », ou « Total (hors livraison) » tant que les frais sont à chiffrer. */
  totalLabel: string;
}

/** Un montant en centimes exploitable : entier fini et non négatif. */
function isUsableCents(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function orderTotals(order: OrderAmounts): OrderTotals {
  const subtotalCents = isUsableCents(order.totalCents) ? order.totalCents : 0;
  // Une valeur aberrante (négative, NaN, absente) est traitée comme « inconnue »
  // et non comme zéro : mieux vaut taire les frais que d'annoncer une gratuité.
  const resume = order.deliveryFee;
  const fee = isUsableCents(resume?.cents)
    ? resume.cents
    : isUsableCents(order.deliveryFeeCents)
      ? order.deliveryFeeCents
      : null;
  const surDevis = Boolean(resume?.surDevis ?? order.deliveryFeeSurDevis ?? false);

  return {
    subtotalCents,
    deliveryFeeCents: fee,
    deliveryFeeSurDevis: surDevis,
    deliveryOffered: fee === 0 && !surDevis,
    totalCents: subtotalCents + (fee ?? 0),
    // Le drapeau suffit à avoir quelque chose à dire, même sans montant : la
    // ligne « À confirmer » vaut mieux qu'un silence sur des frais qui viendront.
    showBreakdown: fee !== null || surDevis,
    totalLabel: surDevis ? TOTAL_HORS_LIVRAISON_LABEL : TOTAL_LABEL,
  };
}

/**
 * Ligne de frais des alertes (confirmation d'envoi) — même vocabulaire que la
 * fiche, sans dupliquer les trois cas dans un composant.
 *
 * `formatCents` est injecté : il vit dans `lib/api.ts`, qui tire React Native et
 * rendrait ce module intestable en `node --test`.
 */
export function deliveryFeeLine(
  totals: OrderTotals,
  formatCents: (cents: number) => string,
): string {
  if (totals.deliveryFeeSurDevis) {
    return "Frais de livraison à confirmer : nous vous communiquons le montant avant la livraison.";
  }
  if (!totals.showBreakdown) return "";
  if (totals.deliveryOffered) return "Livraison offerte";
  return `Dont ${formatCents(totals.deliveryFeeCents ?? 0)} de frais de livraison`;
}

/** Cumul de dépense sur une période, et ce qu'il ne comprend pas encore. */
export interface ConsumedTotals {
  /** Somme des totaux connus — hors livraisons restées à chiffrer. */
  totalCents: number;
  /** Nombre de commandes dont les frais de livraison sont à confirmer. */
  surDevisCount: number;
}

/**
 * « Total consommé » d'un client.
 *
 * Une commande sur devis porte 0 € de livraison : la sommer telle quelle donne
 * un total EXACT sur les articles mais INCOMPLET sur la livraison. On le compte
 * donc à part, pour que l'écran puisse le dire au lieu de présenter un
 * sous-total avec l'aplomb d'un montant définitif.
 */
export function consumedTotals(orders: readonly OrderAmounts[]): ConsumedTotals {
  let totalCents = 0;
  let surDevisCount = 0;

  for (const order of orders) {
    const totals = orderTotals(order);
    totalCents += totals.totalCents;
    if (totals.deliveryFeeSurDevis) surDevisCount += 1;
  }

  return { totalCents, surDevisCount };
}
