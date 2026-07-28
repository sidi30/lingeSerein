import { z } from "zod";

const deliveryStopInputSchema = z.object({
  orderId: z.string().uuid().optional(),
  clientId: z.string().uuid("ID client invalide"),
  stopOrder: z.number().int().min(1),
  setsToDeliver: z.number().int().min(0),
  specialInstructions: z.string().max(1000).optional(),
});

export const createRoundSchema = z.object({
  zoneId: z.string().uuid().optional(),
  driverId: z.string().uuid("ID livreur invalide"),
  date: z.string().refine((val) => !isNaN(Date.parse(val)), "Date invalide"),
  notes: z.string().max(1000).optional(),
  stops: z.array(deliveryStopInputSchema).min(1, "Au moins un arrêt requis"),
});

export const listRoundsQuerySchema = z.object({
  status: z.enum(["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
  driverId: z.string().uuid().optional(),
  from: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), "Date invalide")
    .optional(),
  to: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), "Date invalide")
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * Taille maximale d'une signature capturée sur mobile.
 *
 * Une signature manuscrite exportée en data-URL SVG pèse ~6,4 Ko ; 256 Ko laisse
 * une marge confortable pour un tracé dense ou un export PNG, tout en fermant la
 * porte à un corps de requête arbitrairement gros.
 */
const SIGNATURE_MAX_BYTES = 256 * 1024;

export const completeStopSchema = z.object({
  setsDelivered: z.number().int().min(0),
  dirtyPickedUp: z.number().int().min(0).default(0),
  qrCodeScanned: z.boolean().default(false),
  photoUrl: z.string().url().max(500).optional(),
  /** @deprecated URL d'image hébergée. Pour la signature capturée, voir `signatureDataUrl`. */
  signatureUrl: z.string().url().max(500).optional(),
  /**
   * Signature manuscrite en data-URL. Validée comme data-URL et NON comme URL
   * (`z.string().url()` la rejetterait), et stockée en TEXT : la contrainte
   * VarChar(500) de `signatureUrl` garantissait un 400 sur toute vraie signature.
   */
  signatureDataUrl: z
    .string()
    .max(SIGNATURE_MAX_BYTES, "Signature trop volumineuse")
    .regex(/^data:image\/(svg\+xml|png|jpeg);/, "Signature attendue en data-URL image")
    .optional(),
  signataireNom: z.string().max(200).optional(),
  conforme: z.boolean().optional(),
  reserves: z.string().max(5000).optional(),
});

export type CreateRoundInput = z.infer<typeof createRoundSchema>;
export type ListRoundsQuery = z.infer<typeof listRoundsQuerySchema>;
export type CompleteStopInput = z.infer<typeof completeStopSchema>;
