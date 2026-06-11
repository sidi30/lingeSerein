export const ADMIN_EMAIL = "sirtecnologie@gmail.com";
export const ADMIN_PASSWORD = "@Rayana2";
export const API_BASE = "http://localhost:3001/api/v1";

export function uniqueEmail(): string {
  return `qa.test.${Date.now()}@example.com`;
}

export function uniqueName(): string {
  return `QA User ${Date.now()}`;
}
