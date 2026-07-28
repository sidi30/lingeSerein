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
  /**
   * Coordonnées bancaires imprimées sur les factures.
   *
   * Normalisées AVANT validation (espaces retirés, majuscules) : un IBAN se
   * saisit naturellement par groupes de 4 (« FR76 3000 … ») et refuser cette
   * forme ferait échouer un copier-coller parfaitement valide. Une chaîne vide
   * est convertie en `null` pour que le champ soit vidable depuis l'admin.
   *
   * Contrôle de FORME seulement, pas de clé de contrôle mod-97 : le but est
   * d'attraper la faute de frappe grossière, pas de certifier le compte.
   */
  iban: z
    .string()
    .transform((v) => v.replace(/\s+/g, "").toUpperCase())
    .refine(
      (v) => v === "" || /^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(v),
      "Format d'IBAN invalide (ex. FR76 3000 6000 0112 3456 7890 189)",
    )
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  bic: z
    .string()
    .transform((v) => v.replace(/\s+/g, "").toUpperCase())
    .refine(
      (v) => v === "" || /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(v),
      "Format de BIC invalide (8 ou 11 caractères, ex. AGRIFRPP)",
    )
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
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
