/**
 * Schémas Zod — Products V2
 * ADR-V2-001 : slug + kind, category/range optionnels, contrainte composite levée.
 * ADR-V2-008 : priceUpdateSchema pour PATCH /:id/price.
 */

import { z } from "zod";

// Valeurs des enums Prisma (reflétées ici pour éviter d'importer @prisma/client dans les schémas)
const PRODUCT_CATEGORIES = [
  "SERVIETTES",
  "DRAPS",
  "TAPIS_BAIN",
  "LINGE_LIT",
  "KIT_CUISINE",
  "ARTICLE_ACCUEIL",
] as const;

const PRODUCT_RANGES = [
  "CONFORT",
  "HOTEL",
  "PRESTIGE",
  "KIT_BAIN",
  "KIT_LIT",
  "KIT_COMPLET",
] as const;

const PRODUCT_KINDS = ["KIT", "ARTICLE"] as const;

// ---- Création d'un produit ---------------------------------------------------

export const createProductSchema = z.object({
  slug: z.string().max(60).optional(), // généré si absent
  kind: z.enum(PRODUCT_KINDS, {
    errorMap: () => ({ message: "kind doit être KIT ou ARTICLE" }),
  }),
  serviceTypeId: z.string().uuid("ID type de service invalide").optional(), // défaut: ServiceType LOCATION (résolu côté service)
  category: z.enum(PRODUCT_CATEGORIES).nullable().optional(), // null pour les kits
  range: z.enum(PRODUCT_RANGES).nullable().optional(), // null pour les articles V2
  name: z.string().min(2, "Le nom du produit est obligatoire").max(200),
  description: z.string().max(2000).optional(),
  priceCents: z.number().int().min(0, "Le prix doit être supérieur ou égal à 0"),
  attributes: z.record(z.unknown()).optional(),
  imageUrl: z.string().url().max(500).optional(),
});

// ---- Édition complète (PUT /:id) -----------------------------------------------

export const updateProductSchema = createProductSchema.partial().extend({
  isActive: z.boolean().optional(), // permet la réactivation d'un produit soft-deleted
});

// ---- Raccourci de mise à jour du prix (PATCH /:id/price) --------------------

export const priceUpdateSchema = z.object({
  priceCents: z.number().int().min(0, "Le prix doit être supérieur ou égal à 0"),
});

// ---- Liste (GET /products) ---------------------------------------------------

export const listProductsQuerySchema = z.object({
  kind: z.enum(PRODUCT_KINDS).optional(),
  category: z.enum(PRODUCT_CATEGORIES).optional(),
  // Inclut les produits inactifs/soft-deleted — réservé ADMIN (ignoré sinon, appliqué côté route).
  includeInactive: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .optional()
    .transform((v) => v === true || v === "true"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ---- Types inférés ----------------------------------------------------------

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type PriceUpdateInput = z.infer<typeof priceUpdateSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
