/**
 * Erreurs applicatives typées.
 * Chaque erreur porte un code HTTP, un code machine et un message humain.
 */

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "AppError";
  }

  toJSON() {
    return {
      success: false as const,
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Non autorisé") {
    super(401, "UNAUTHORIZED", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Accès interdit") {
    super(403, "FORBIDDEN", message);
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id?: string) {
    const msg = id ? `${entity} (${id}) introuvable` : `${entity} introuvable`;
    super(404, "NOT_FOUND", msg);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, "CONFLICT", message);
  }
}

/**
 * 409 sur création d'un client dont le téléphone est déjà porté par un autre
 * client du même opérateur. Le corps expose l'existant pour que l'UI propose
 * « ouvrir la fiche » ou « créer quand même » (force: true).
 */
export class DuplicateClientError extends AppError {
  constructor(
    public readonly existingClientId: string,
    public readonly existingClientName: string,
  ) {
    super(
      409,
      "CLIENT_DUPLICATE_PHONE",
      `Un client avec ce téléphone existe déjà : ${existingClientName}`,
    );
  }

  override toJSON() {
    return {
      success: false as const,
      error: {
        code: this.code,
        message: this.message,
        // `details` est OBLIGATOIRE ici : les clients HTTP (admin-web et mobile)
        // ne lisent que `body.error.details`. Sans lui, l'id du doublon n'arrive
        // jamais jusqu'à l'interface et le bouton « Ouvrir la fiche existante »
        // ne peut pas exister — l'admin n'a plus que « créer quand même », ce
        // qui produit exactement le doublon qu'on cherchait à éviter.
        details: {
          clientId: [this.existingClientId],
          clientName: [this.existingClientName],
        },
        // Conservés à la racine pour les appelants qui les liraient déjà.
        existingClientId: this.existingClientId,
        name: this.existingClientName,
      },
    };
  }
}

export class ValidationError extends AppError {
  constructor(details: Record<string, string[]>) {
    super(400, "VALIDATION_ERROR", "Données invalides", details);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = "Trop de requêtes, veuillez réessayer plus tard") {
    super(429, "TOO_MANY_REQUESTS", message);
  }
}

/**
 * 422 Unprocessable Entity — règle métier / état interdit.
 * Distinct de ValidationError (400) qui est réservé aux erreurs de format Zod.
 */
export class UnprocessableEntityError extends AppError {
  constructor(message: string, code = "UNPROCESSABLE_ENTITY") {
    super(422, code, message);
  }
}

export class AccountLockedError extends AppError {
  constructor() {
    super(
      423,
      "ACCOUNT_LOCKED",
      "Compte verrouillé suite à trop de tentatives. Vérifiez votre email pour le débloquer.",
    );
  }
}
