export const ADMIN_EMAIL = "sirtecnologie@gmail.com";

const password = process.env.SEED_USERS_PASSWORD;
if (!password) {
  throw new Error("SEED_USERS_PASSWORD manquant — export la variable avant de lancer les e2e.");
}
export const ADMIN_PASSWORD = password;
export const API_BASE = "http://localhost:3001/api/v1";

export function uniqueEmail(): string {
  return `qa.test.${Date.now()}@example.com`;
}

export function uniqueName(): string {
  return `QA User ${Date.now()}`;
}
