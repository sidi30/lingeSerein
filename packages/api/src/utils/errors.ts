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

export class AccountLockedError extends AppError {
  constructor() {
    super(423, "ACCOUNT_LOCKED", "Compte verrouillé suite à trop de tentatives. Vérifiez votre email pour le débloquer.");
  }
}
