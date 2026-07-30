/**
 * Garde CSRF sur les routes qui acceptent le cookie de session.
 *
 * Deux erreurs opposées sont possibles et coûtent aussi cher l'une que l'autre :
 * laisser passer une page tierce qui déclenche une rotation de jeton, ou casser
 * le mobile — qui n'utilise pas le cookie du tout et n'envoie ni `Origin` ni
 * `Sec-Fetch-Site`. Ces tests fixent la frontière entre les deux.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { FastifyRequest, FastifyReply } from "fastify";
import { requireTrustedOrigin } from "./csrf.ts";
import { ForbiddenError } from "../utils/errors.ts";

const ADMIN = "https://admin.lingeserein.fr";
const ORIGINES = [ADMIN, "http://localhost:3000"];

const reply = {} as FastifyReply;

function requete(options: {
  cookie?: string;
  secFetchSite?: string;
  origin?: string;
  referer?: string;
}): FastifyRequest {
  const headers: Record<string, string> = {};
  if (options.secFetchSite) headers["sec-fetch-site"] = options.secFetchSite;
  if (options.origin) headers["origin"] = options.origin;
  if (options.referer) headers["referer"] = options.referer;

  return {
    cookies: options.cookie === undefined ? {} : { refreshToken: options.cookie },
    headers,
  } as unknown as FastifyRequest;
}

async function passe(request: FastifyRequest): Promise<boolean> {
  try {
    await requireTrustedOrigin(ORIGINES)(request, reply);
    return true;
  } catch (err) {
    assert.ok(err instanceof ForbiddenError, "le refus doit être un 403, pas un 500");
    return false;
  }
}

describe("requireTrustedOrigin", () => {
  it("laisse passer une requête sans cookie de session", async () => {
    // Le cas du mobile : jeton dans le corps, aucun cookie. Rien à détourner,
    // et aucun en-tête d'origine à attendre d'un appel natif.
    assert.equal(await passe(requete({})), true);
    assert.equal(await passe(requete({ origin: "https://attaquant.example" })), true);
  });

  it("laisse passer quand le navigateur déclare same-origin ou none", async () => {
    assert.equal(await passe(requete({ cookie: "jeton", secFetchSite: "same-origin" })), true);
    assert.equal(await passe(requete({ cookie: "jeton", secFetchSite: "none" })), true);
  });

  it("laisse passer un sous-domaine de confiance (admin → api)", async () => {
    // `same-site` et non `same-origin` : admin.lingeserein.fr et
    // api.lingeserein.fr partagent le domaine sans partager l'origine.
    assert.equal(
      await passe(requete({ cookie: "jeton", secFetchSite: "same-site", origin: ADMIN })),
      true,
    );
  });

  it("refuse un sous-domaine NON listé, bien qu'il soit same-site", async () => {
    // Le point qui justifie de ne pas accepter `same-site` en bloc : un
    // sous-domaine compromis reste same-site.
    assert.equal(
      await passe(
        requete({
          cookie: "jeton",
          secFetchSite: "same-site",
          origin: "https://blog.lingeserein.fr",
        }),
      ),
      false,
    );
  });

  it("refuse une origine tierce", async () => {
    assert.equal(
      await passe(
        requete({
          cookie: "jeton",
          secFetchSite: "cross-site",
          origin: "https://attaquant.example",
        }),
      ),
      false,
    );
  });

  it("refuse un cookie de session sans aucune origine exploitable", async () => {
    // Un formulaire cross-site historique peut n'envoyer ni Origin ni
    // Sec-Fetch-Site. En l'absence de preuve, on refuse.
    assert.equal(await passe(requete({ cookie: "jeton" })), false);
  });

  it("se rabat sur le Referer quand Origin manque", async () => {
    assert.equal(
      await passe(requete({ cookie: "jeton", referer: `${ADMIN}/devis/42?onglet=lignes` })),
      true,
    );
    assert.equal(
      await passe(requete({ cookie: "jeton", referer: "https://attaquant.example/piege" })),
      false,
    );
  });

  it("refuse un Referer illisible au lieu de le contourner", async () => {
    assert.equal(await passe(requete({ cookie: "jeton", referer: "pas-une-url" })), false);
  });
});
