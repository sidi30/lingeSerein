/**
 * Ce que le client a réellement chez lui — logique pure, sans React Native.
 *
 * DIAGNOSTIC (pourquoi ce module existe) : `GET /stock/me` renvoie
 * `{ stocks, recentMovements }`. `stocks` est la table d'agrégats
 * `client_stocks`, la seule à porter la ventilation propre / sale. Or côté
 * serveur cette table n'est écrite QUE par l'ajustement manuel d'un admin
 * (`stock.service.createAdjustment`) : la validation d'un arrêt de tournée, elle,
 * n'écrit que des lignes de `stock_movements`. Pour un client livré normalement,
 * `stocks` est donc VIDE — et l'écran, qui testait `!data.stocks.length`,
 * affichait « Pas de stock » en jetant les mouvements qu'il venait de recevoir.
 *
 * On répare l'AFFICHAGE, sans inventer de règle métier ni toucher au serveur :
 *
 * - agrégats serveur présents → ils font foi, ventilation comprise ;
 * - sinon, on retombe sur les ROTATIONS (`GET /rotations?mine=1`), qui modélisent
 *   déjà « livré au client, pas encore repris » : quantité chez le client
 *   = `qtyLivree − qtyReprise` sur les rotations non clôturées. C'est la même
 *   règle que la carte « Mon linge » de l'accueil, pas une invention locale ;
 * - la ventilation propre / sale reste alors INCONNUE (`null`) plutôt que
 *   fabriquée : une rotation ne dit pas ce qui est encore propre.
 *
 * Le journal des mouvements n'est volontairement PAS sommé pour en déduire un
 * total : le serveur n'en renvoie que les 20 derniers, et un cumul sur une
 * fenêtre tronquée produirait un chiffre faux — parfois négatif — présenté avec
 * l'aplomb d'un chiffre juste.
 */

// ─── Formes minimales attendues ──────────────────────────────────
// Structurelles et locales : importer les types de `api.ts` tirerait React
// Native dans ce module et le rendrait intestable en `node --test`.

export interface StockRangeLine {
  productRange: string;
  cleanSets: number;
  dirtySets: number;
  totalInCirculation: number;
}

export interface RotationLineLike {
  designation: string;
  qtyLivree: number;
  /** null = reprise pas encore saisie ; 0 = rien n'est revenu. */
  qtyReprise?: number | null;
}

export interface RotationLike {
  status: string;
  lignes?: RotationLineLike[];
}

/** Statuts qui clôturent une rotation (miroir de `ROTATION_TERMINAL`). */
const TERMINAL_STATUSES = ["REPRISE", "ANNULEE"];

/** Provenance du chiffre affiché — l'écran l'explique à l'utilisateur. */
export type StockSource =
  /** Agrégats `client_stocks` : ventilation propre / sale disponible. */
  | "server"
  /** Rotations en cours : quantité chez le client, sans ventilation. */
  | "rotations"
  /** Rien d'exploitable. */
  | "none";

export interface StockTotals {
  inCirculation: number;
  /** `null` quand la donnée n'existe pas — à ne pas afficher comme un zéro. */
  clean: number | null;
  dirty: number | null;
  inTransit: number | null;
}

export interface StockItemLine {
  designation: string;
  quantity: number;
}

export interface ClientStockView {
  source: StockSource;
  totals: StockTotals;
  /** Détail par gamme (source « server » uniquement). */
  ranges: StockRangeLine[];
  /** Détail par article encore chez le client (source « rotations »). */
  items: StockItemLine[];
}

const EMPTY_TOTALS: StockTotals = { inCirculation: 0, clean: null, dirty: null, inTransit: null };

function safeInt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Somme les agrégats serveur.
 *
 * « En transit » se calcule ligne à ligne : globalement, une gamme excédentaire
 * compenserait une gamme déficitaire et masquerait du linge en route.
 */
export function summarizeRanges(stocks: readonly StockRangeLine[]): StockTotals {
  let clean = 0;
  let dirty = 0;
  let inCirculation = 0;
  let inTransit = 0;

  for (const s of stocks) {
    const c = safeInt(s.cleanSets);
    const d = safeInt(s.dirtySets);
    const total = safeInt(s.totalInCirculation);
    clean += c;
    dirty += d;
    inCirculation += total;
    inTransit += Math.max(total - c - d, 0);
  }

  return { inCirculation, clean, dirty, inTransit };
}

/** Une rotation compte tant qu'elle n'est pas clôturée. */
export function isOpenRotation(r: RotationLike): boolean {
  return !TERMINAL_STATUSES.includes(r.status);
}

/**
 * Ce qui est parti chez le client et n'est pas revenu, agrégé par désignation.
 *
 * Les lignes soldées (tout repris) disparaissent ; une reprise supérieure à la
 * livraison — saisie erronée d'un livreur — est bornée à zéro plutôt que de
 * venir en déduction d'un autre article.
 */
export function openRotationItems(rotations: readonly RotationLike[]): StockItemLine[] {
  const byDesignation = new Map<string, number>();

  for (const rotation of rotations) {
    if (!isOpenRotation(rotation)) continue;
    for (const ligne of rotation.lignes ?? []) {
      const remaining = Math.max(safeInt(ligne.qtyLivree) - safeInt(ligne.qtyReprise), 0);
      if (remaining === 0) continue;
      const key = ligne.designation || "Article";
      byDesignation.set(key, (byDesignation.get(key) ?? 0) + remaining);
    }
  }

  return [...byDesignation.entries()]
    .map(([designation, quantity]) => ({ designation, quantity }))
    .sort((a, b) => b.quantity - a.quantity || a.designation.localeCompare(b.designation, "fr"));
}

/**
 * Vue unifiée du stock client, agrégats serveur prioritaires.
 *
 * `stocks` / `rotations` acceptent `null` ou `undefined` : requête désactivée,
 * en cours, ou route renvoyant `null` pour un rôle non concerné.
 */
export function buildClientStockView(input: {
  stocks?: readonly StockRangeLine[] | null;
  rotations?: readonly RotationLike[] | null;
}): ClientStockView {
  const stocks = input.stocks ?? [];
  if (stocks.length > 0) {
    return { source: "server", totals: summarizeRanges(stocks), ranges: [...stocks], items: [] };
  }

  const items = openRotationItems(input.rotations ?? []);
  const inCirculation = items.reduce((sum, i) => sum + i.quantity, 0);
  if (inCirculation > 0) {
    return {
      source: "rotations",
      // clean / dirty / inTransit restent `null` : la rotation ne les connaît pas.
      totals: { ...EMPTY_TOTALS, inCirculation },
      ranges: [],
      items,
    };
  }

  return { source: "none", totals: EMPTY_TOTALS, ranges: [], items: [] };
}
