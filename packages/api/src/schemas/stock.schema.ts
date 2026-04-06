import { z } from "zod";

export const stockAdjustmentSchema = z.object({
  userId: z.string().uuid("ID client invalide"),
  productRange: z.enum(["CONFORT", "HOTEL", "PRESTIGE"]),
  type: z.enum(["DELIVERY", "PICKUP_DIRTY", "WASH_COMPLETE", "ADJUSTMENT", "RETIREMENT"]),
  quantity: z.number().int().refine((val) => val !== 0, "La quantité ne peut pas être zéro"),
  reason: z.string().max(500).optional(),
});

export const listClientStocksQuerySchema = z.object({
  zoneId: z.string().uuid().optional(),
  productRange: z.enum(["CONFORT", "HOTEL", "PRESTIGE"]).optional(),
  lowStock: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;
export type ListClientStocksQuery = z.infer<typeof listClientStocksQuerySchema>;
