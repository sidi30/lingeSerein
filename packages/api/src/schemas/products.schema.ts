import { z } from "zod";

export const createProductSchema = z.object({
  serviceTypeId: z.string().uuid("ID type de service invalide"),
  category: z.enum(["SERVIETTES", "DRAPS", "TAPIS_BAIN", "LINGE_LIT", "KIT_CUISINE", "ARTICLE_ACCUEIL"]),
  range: z.enum(["CONFORT", "HOTEL", "PRESTIGE"]),
  name: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  priceCents: z.number().int().min(0),
  attributes: z.record(z.unknown()).optional(),
  imageUrl: z.string().url().max(500).optional(),
});

export const updateProductSchema = createProductSchema.partial();

export const listProductsQuerySchema = z.object({
  category: z.enum(["SERVIETTES", "DRAPS", "TAPIS_BAIN", "LINGE_LIT", "KIT_CUISINE", "ARTICLE_ACCUEIL"]).optional(),
  range: z.enum(["CONFORT", "HOTEL", "PRESTIGE"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
