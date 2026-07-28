import { z } from "zod";

export const stockAdjustmentSchema = z.object({
  userId: z.string().uuid("ID client invalide"),
  productRange: z.enum(["CONFORT", "HOTEL", "PRESTIGE"]),
  type: z.enum(["DELIVERY", "PICKUP_DIRTY", "WASH_COMPLETE", "ADJUSTMENT", "RETIREMENT"]),
  quantity: z
    .number()
    .int()
    .refine((val) => val !== 0, "La quantité ne peut pas être zéro"),
  reason: z.string().max(500).optional(),
});

export const listClientStocksQuerySchema = z.object({
  zoneId: z.string().uuid().optional(),
  productRange: z.enum(["CONFORT", "HOTEL", "PRESTIGE"]).optional(),
  lowStock: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ---- Stock PAR SLUG catalogue (StockItem) ----
// Distinct des schémas ci-dessus, qui portent sur les tables historiques clés
// par ProductRange (CONFORT/HOTEL/PRESTIGE). Les deux cohabitent : le mobile lit
// encore les premières, l'admin pilote le parc réel avec celles-ci.

export const productSlugParamSchema = z.object({
  productSlug: z
    .string()
    .min(1)
    .max(60)
    // Slug métier : minuscules, chiffres et tirets. Borné ici pour qu'une valeur
    // aberrante ne crée pas une ligne de stock fantôme via l'upsert.
    .regex(/^[a-z0-9-]+$/, "Slug produit invalide"),
});

export const updateStockItemSchema = z.object({
  /** Parc total possédé. Seul champ saisissable : les autres reflètent les mouvements. */
  totalOwned: z.number().int().min(0).max(1_000_000),
});

export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;
export type ListClientStocksQuery = z.infer<typeof listClientStocksQuerySchema>;
export type ProductSlugParam = z.infer<typeof productSlugParamSchema>;
export type UpdateStockItemInput = z.infer<typeof updateStockItemSchema>;
