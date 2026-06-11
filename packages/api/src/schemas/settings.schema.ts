import { z } from "zod";

// ---- Zones de livraison ----

const postalCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{5}$/, "Code postal invalide : format attendu 5 chiffres");

export const createZoneSchema = z.object({
  name: z.string().min(1, "Le nom est obligatoire").max(200),
  postalCodes: z.array(postalCodeSchema).min(1, "Au moins un code postal est requis"),
  deliveryFeeCents: z.number().int().min(0, "Le tarif ne peut pas être négatif"),
});

export const updateZoneSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  postalCodes: z.array(postalCodeSchema).min(1).optional(),
  deliveryFeeCents: z.number().int().min(0, "Le tarif ne peut pas être négatif").optional(),
});

// ---- Opérateur ----

export const updateOperatorSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().max(320).optional(),
  phone: z.string().max(20).nullable().optional(),
  address: z.string().nullable().optional(),
  siret: z
    .string()
    .regex(/^\d{14}$/, "Le SIRET doit comporter 14 chiffres")
    .nullable()
    .optional(),
  legalMentions: z.string().nullable().optional(),
});

// ---- Seuils d'alerte stock ----

export const updateStockThresholdsSchema = z.object({
  thresholds: z
    .array(
      z.object({
        productId: z.string().uuid("ID produit invalide"),
        stockAlertThreshold: z
          .number()
          .int()
          .min(0, "Le seuil d'alerte doit être supérieur ou égal à 0"),
      }),
    )
    .min(1),
});

// ---- Types inférés ----

export type CreateZoneInput = z.infer<typeof createZoneSchema>;
export type UpdateZoneInput = z.infer<typeof updateZoneSchema>;
export type UpdateOperatorInput = z.infer<typeof updateOperatorSchema>;
export type UpdateStockThresholdsInput = z.infer<typeof updateStockThresholdsSchema>;
