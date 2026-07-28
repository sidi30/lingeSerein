import type { Page } from "@playwright/test";

export interface PageErrors {
  /** Exceptions non rattrapées — un crash de rendu React atterrit ici. */
  readonly pageErrors: string[];
  /** Messages `console.error` (React y écrit ses avertissements de rendu). */
  readonly consoleErrors: string[];
}

/**
 * Branche la collecte des erreurs AVANT toute navigation.
 *
 * Sans ça, un écran blanc passe pour un test vert : les assertions de visibilité
 * échouent avec un message peu parlant, alors que la cause (« Objects are not
 * valid as a React child ») n'est visible que dans la console.
 */
export function collectPageErrors(page: Page): PageErrors {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];

  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  return { pageErrors, consoleErrors };
}
