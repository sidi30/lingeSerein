import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères"),
});

export const registerSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z
    .string()
    .min(8, "Le mot de passe doit contenir au moins 8 caractères")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,}$/,
      "Le mot de passe doit contenir une majuscule, une minuscule, un chiffre et un caractère spécial",
    ),
  name: z.string().min(2, "Le nom doit contenir au moins 2 caractères").max(100),
  address: z.string().min(5, "Adresse requise").max(500),
  accommodationType: z.enum(["AIRBNB", "GITE", "AUBERGE", "HOTEL", "AUTRE"]),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
