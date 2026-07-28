import type { PrismaClient, Prisma, StockItem } from "@prisma/client";
import { CATALOG_PRODUCTS, productNameFromSlug } from "@lingengo/shared";
import { NotFoundError, UnprocessableEntityError } from "../utils/errors.js";
import { createAuditLog } from "../utils/audit.js";

/** Vue exposée par l'API : le disponible est calculé, jamais stocké. */
export interface StockItemView {
  productSlug: string;
  name: string;
  totalOwned: number;
  inCirculation: number;
  dirtyPending: number;
  retired: number;
  /** totalOwned − inCirculation − dirtyPending − retired. Peut être négatif : voir `disponible`. */
  disponible: number;
}

/**
 * Quantité prêtable à l'instant t.
 *
 * Volontairement NON bornée à zéro : un disponible négatif signale un parc
 * sous-déclaré (plus de linge dehors que de linge possédé), c'est-à-dire un
 * inventaire à corriger. Le masquer par un `Math.max(0, …)` rendrait le défaut
 * invisible exactement là où il compte.
 */
export function computeDisponible(item: {
  totalOwned: number;
  inCirculation: number;
  dirtyPending: number;
  retired: number;
}): number {
  return item.totalOwned - item.inCirculation - item.dirtyPending - item.retired;
}

export function toStockItemView(item: StockItem): StockItemView {
  return {
    productSlug: item.productSlug,
    name: productNameFromSlug(item.productSlug) ?? item.productSlug,
    totalOwned: item.totalOwned,
    inCirculation: item.inCirculation,
    dirtyPending: item.dirtyPending,
    retired: item.retired,
    disponible: computeDisponible(item),
  };
}

/** Champs de `StockItem` qu'un mouvement peut incrémenter. */
type StockField = "totalOwned" | "inCirculation" | "dirtyPending" | "retired";

export class StockItemsService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Parc complet de l'opérateur, une entrée par produit du catalogue.
   *
   * Les slugs jamais saisis sont renvoyés à zéro plutôt qu'omis : l'exploitant
   * doit voir les 9 lignes de son catalogue pour savoir lesquelles il n'a pas
   * encore inventoriées. Une liste courte se lit comme « tout est renseigné ».
   */
  async list(operatorId: string): Promise<StockItemView[]> {
    const items = await this.prisma.stockItem.findMany({
      where: { operatorId },
    });

    const bySlug = new Map(items.map((i) => [i.productSlug, i]));

    const catalogue = CATALOG_PRODUCTS.map((p) => {
      const existing = bySlug.get(p.slug);
      return existing
        ? toStockItemView(existing)
        : {
            productSlug: p.slug,
            name: p.name,
            totalOwned: 0,
            inCirculation: 0,
            dirtyPending: 0,
            retired: 0,
            disponible: 0,
          };
    });

    // Slugs présents en base mais absents du catalogue (produit retiré depuis) :
    // on les conserve en fin de liste, du linge réel peut encore être dehors.
    const horsCatalogue = items
      .filter((i) => !CATALOG_PRODUCTS.some((p) => p.slug === i.productSlug))
      .map(toStockItemView);

    return [...catalogue, ...horsCatalogue];
  }

  async getBySlug(operatorId: string, productSlug: string): Promise<StockItemView> {
    const item = await this.prisma.stockItem.findUnique({
      where: { operatorId_productSlug: { operatorId, productSlug } },
    });

    if (!item) {
      throw new NotFoundError("Stock", productSlug);
    }

    return toStockItemView(item);
  }

  /**
   * Saisie du parc possédé (inventaire).
   *
   * Ne touche QUE `totalOwned` : les trois autres compteurs sont le reflet des
   * mouvements réels (livraisons, reprises, réformes) et n'ont pas à être
   * réécrits à la main depuis cet écran, sous peine de désaccorder le stock des
   * rotations en cours.
   */
  async setTotalOwned(
    operatorId: string,
    productSlug: string,
    totalOwned: number,
    adminId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<StockItemView> {
    if (!Number.isInteger(totalOwned) || totalOwned < 0) {
      throw new UnprocessableEntityError(
        "Le parc possédé doit être un entier positif",
        "INVALID_STOCK_QUANTITY",
      );
    }

    const previous = await this.prisma.stockItem.findUnique({
      where: { operatorId_productSlug: { operatorId, productSlug } },
    });

    const item = await this.prisma.stockItem.upsert({
      where: { operatorId_productSlug: { operatorId, productSlug } },
      create: { operatorId, productSlug, totalOwned },
      update: { totalOwned },
    });

    await createAuditLog({
      prisma: this.prisma,
      userId: adminId,
      action: "UPDATE",
      entity: "StockItem",
      entityId: item.id,
      changes: {
        productSlug,
        previousTotalOwned: previous?.totalOwned ?? 0,
        newTotalOwned: totalOwned,
      },
      ipAddress,
      userAgent,
    });

    return toStockItemView(item);
  }

  /**
   * Applique un delta sur un compteur, en créant la ligne de stock si besoin.
   *
   * Passe par `increment` (et non par une lecture suivie d'une écriture) pour que
   * deux reprises saisies en même temps ne s'écrasent pas — l'opération est
   * résolue par la base. À appeler dans la transaction de l'appelant : le
   * mouvement de stock et la rotation qui le motive doivent réussir ou échouer
   * ensemble.
   */
  static async applyDelta(
    tx: Prisma.TransactionClient,
    operatorId: string,
    productSlug: string,
    deltas: Partial<Record<StockField, number>>,
  ): Promise<void> {
    const nonZero = Object.entries(deltas).filter(([, v]) => v !== 0);
    if (nonZero.length === 0) return;

    const increments = Object.fromEntries(nonZero.map(([k, v]) => [k, { increment: v }]));
    // À la création, un delta négatif produirait une quantité négative refusée
    // par le CHECK en base : on plancher à 0, la ligne n'existait pas.
    const creates = Object.fromEntries(nonZero.map(([k, v]) => [k, Math.max(0, v as number)]));

    await tx.stockItem.upsert({
      where: { operatorId_productSlug: { operatorId, productSlug } },
      create: { operatorId, productSlug, ...creates },
      update: increments,
    });
  }

  /**
   * Sortie de linge : ce qui part chez le client entre en circulation.
   * Appelé à la création d'une rotation.
   */
  static async recordSortie(
    tx: Prisma.TransactionClient,
    operatorId: string,
    lignes: { productSlug: string | null; qtyLivree: number }[],
  ): Promise<void> {
    for (const ligne of lignes) {
      // Ligne non rapprochée du catalogue : elle ne bouge aucun stock. Mieux
      // vaut un stock incomplet qu'un stock faux (cf. resolveProductSlug).
      if (!ligne.productSlug) continue;
      await StockItemsService.applyDelta(tx, operatorId, ligne.productSlug, {
        inCirculation: ligne.qtyLivree,
      });
    }
  }

  /**
   * Reprise du linge : il quitte la circulation et rejoint la pile de sale.
   *
   * Le linge NON revenu (qtyReprise < qtyLivree) sort quand même de
   * `inCirculation` — il n'est plus chez ce client au sens du suivi — mais
   * n'entre pas dans `dirtyPending` : il est porté en `retired` (perdu). Sans
   * cela, `inCirculation` gonflerait indéfiniment au fil des pertes et le
   * disponible finirait par ne plus rien vouloir dire.
   */
  static async recordReprise(
    tx: Prisma.TransactionClient,
    operatorId: string,
    lignes: { productSlug: string | null; qtyLivree: number; qtyReprise: number }[],
  ): Promise<void> {
    for (const ligne of lignes) {
      if (!ligne.productSlug) continue;
      const manquant = Math.max(0, ligne.qtyLivree - ligne.qtyReprise);
      await StockItemsService.applyDelta(tx, operatorId, ligne.productSlug, {
        inCirculation: -ligne.qtyLivree,
        dirtyPending: ligne.qtyReprise,
        retired: manquant,
      });
    }
  }

  /**
   * Annulation d'une rotation : le linge n'est jamais parti.
   *
   * Distinct de `recordReprise` avec 0 repris — qui, lui, signifie « rien n'est
   * revenu » et porte donc tout en perte. Ici le linge redevient simplement
   * disponible : il sort de la circulation sans rejoindre ni le sale ni la
   * réforme. Confondre les deux transformerait chaque saisie corrigée en perte
   * sèche de parc.
   */
  static async recordAnnulation(
    tx: Prisma.TransactionClient,
    operatorId: string,
    lignes: { productSlug: string | null; qtyLivree: number }[],
  ): Promise<void> {
    for (const ligne of lignes) {
      if (!ligne.productSlug) continue;
      await StockItemsService.applyDelta(tx, operatorId, ligne.productSlug, {
        inCirculation: -ligne.qtyLivree,
      });
    }
  }
}
