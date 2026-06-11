import { z } from "zod";

const ALLOWED_ROLES = [
  "CLIENT",
  "LIVREUR",
  "ADMIN",
  "ROLE_CLIENT",
  "ROLE_LIVREUR",
  "ROLE_ADMIN",
] as const;
const ROLE_ERROR = "Rôle invalide. Valeurs acceptées : CLIENT, LIVREUR, ADMIN";

// ---- Création d'un utilisateur ----

export const createUserSchema = z.object({
  name: z.string().min(1, "Le nom est obligatoire").max(200),
  email: z.string().email("Format d'email invalide").max(320),
  role: z.enum(ALLOWED_ROLES, { message: ROLE_ERROR }),
  phone: z.string().max(20).nullable().optional(),
  zoneId: z.string().uuid("ID zone invalide").nullable().optional(),
});

// ---- Modification d'un utilisateur ----

export const updateUserSchema = z.object({
  name: z.string().min(1, "Le nom est obligatoire").max(200).optional(),
  email: z.string().email("Format d'email invalide").max(320).optional(),
  phone: z.string().max(20).nullable().optional(),
  zoneId: z.string().uuid("ID zone invalide").nullable().optional(),
  role: z.enum(ALLOWED_ROLES, { message: ROLE_ERROR }).optional(),
});

// ---- Liste / filtres ----

export const listUsersQuerySchema = z.object({
  role: z
    .enum([
      "CLIENT",
      "LIVREUR",
      "ADMIN",
      "SUPER_ADMIN",
      "ROLE_CLIENT",
      "ROLE_LIVREUR",
      "ROLE_ADMIN",
      "ROLE_SUPER_ADMIN",
    ])
    .optional(),
  status: z.enum(["active", "inactive"]).optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ---- Changement de mot de passe (utilisateur courant) ----

/**
 * La politique newPassword est EXACTEMENT celle du registerSchema :
 * min 8, une majuscule, une minuscule, un chiffre, un caractère spécial.
 * max 72 : limite interne de bcrypt (au-delà les octets sont ignorés).
 */
const passwordPolicySchema = z
  .string()
  .min(8, "Le mot de passe doit contenir au moins 8 caractères")
  .max(72, "Le mot de passe ne doit pas dépasser 72 caractères")
  .regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,}$/,
    "Le mot de passe doit contenir une majuscule, une minuscule, un chiffre et un caractère spécial",
  );

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Le mot de passe actuel est requis"),
  newPassword: passwordPolicySchema,
});

// ---- Types inférés ----

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
