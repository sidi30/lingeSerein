import { z } from "zod";

/**
 * Validation des variables d'environnement au démarrage du serveur.
 * Le serveur refuse de démarrer si une variable requise est manquante.
 */
const envSchema = z.object({
  // Base de données
  DATABASE_URL: z.string().url("DATABASE_URL invalide"),

  // Redis
  REDIS_URL: z.string().url("REDIS_URL invalide"),

  // API
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  API_HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET doit contenir au moins 32 caractères"),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, "JWT_REFRESH_SECRET doit contenir au moins 32 caractères"),

  // Chiffrement
  ENCRYPTION_KEY: z.string().length(32, "ENCRYPTION_KEY doit contenir exactement 32 caractères"),

  // Stripe
  STRIPE_SECRET_KEY: z.string().startsWith("sk_", "STRIPE_SECRET_KEY invalide"),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_", "STRIPE_WEBHOOK_SECRET invalide"),
  STRIPE_PUBLISHABLE_KEY: z.string().startsWith("pk_", "STRIPE_PUBLISHABLE_KEY invalide"),

  // Resend
  RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY requis"),
  EMAIL_FROM: z.string().email("EMAIL_FROM invalide"),

  // Google Maps
  GOOGLE_MAPS_API_KEY: z.string().min(1, "GOOGLE_MAPS_API_KEY requis"),

  // S3
  S3_ENDPOINT: z.string().url("S3_ENDPOINT invalide"),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_REGION: z.string().min(1),

  // URLs
  ADMIN_WEB_URL: z.string().url("ADMIN_WEB_URL invalide"),
  API_URL: z.string().url("API_URL invalide"),

  // Optionnels
  EXPO_ACCESS_TOKEN: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  DPO_EMAIL: z.string().email().default("dpo@lingengo.fr"),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Valide et retourne les variables d'environnement.
 * Lance une erreur explicite si la validation échoue.
 */
export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const formatted = Object.entries(errors)
      .map(([key, msgs]) => `  ${key}: ${(msgs ?? []).join(", ")}`)
      .join("\n");

    throw new Error(`Variables d'environnement invalides :\n${formatted}`);
  }

  return result.data;
}
