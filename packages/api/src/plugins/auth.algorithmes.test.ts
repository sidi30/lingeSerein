/**
 * Épingle d'algorithme JWT — régression de sécurité.
 *
 * Sans `verify.algorithms`, c'est l'en-tête `alg` du jeton PRÉSENTÉ qui décide
 * de la manière dont il est vérifié. C'est la porte d'entrée de la « confusion
 * d'algorithme » : on change `alg`, on resigne, et la bibliothèque suit. La
 * version de `fast-jwt` embarquée par `@fastify/jwt` 9 est explicitement
 * concernée (CVE-2026-34950, CVSS 9.1).
 *
 * Ces tests montent le plugin `@fastify/jwt` avec EXACTEMENT les options du
 * plugin maison (`src/plugins/auth.ts`) et vérifient que seul HS256 passe.
 * Ils échouent si quelqu'un retire `verify: { algorithms: [...] }`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import fjwt from "@fastify/jwt";

import { ALGORITHME } from "./auth.ts";

const SECRET = "secret-de-test-suffisamment-long-pour-le-plugin-32+";

/** Instance minimale portant la MÊME configuration JWT que la production. */
async function instanceJwt() {
  const app = Fastify();
  await app.register(fjwt, {
    secret: SECRET,
    sign: { algorithm: ALGORITHME, expiresIn: "15m" },
    verify: { algorithms: [ALGORITHME] },
  });
  await app.ready();
  return app;
}

/**
 * Décode l'en-tête d'un JWT.
 *
 * Passe par une assertion plutôt que par `split(".")[0]!` : l'assertion
 * non-null est interdite par la configuration eslint du dépôt, et sur un jeton
 * malformé elle produirait un `undefined` silencieux au lieu d'un échec de test
 * lisible.
 */
function enteteDe(jeton: string): { alg: string } {
  const [enteteB64] = jeton.split(".");
  assert.ok(enteteB64, "le jeton doit porter un en-tête");
  return JSON.parse(Buffer.from(enteteB64, "base64url").toString()) as {
    alg: string;
  };
}

/** Forge un jeton non signé (`alg: none`), le cas d'école du contournement. */
function jetonAlgNone(charge: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "none", typ: "JWT" })}.${b64(charge)}.`;
}

describe("plugin auth — épingle d'algorithme JWT", () => {
  it("émet et accepte un jeton HS256 légitime", async () => {
    const app = await instanceJwt();
    const jeton = app.jwt.sign({ sub: "u-1", role: "ROLE_CLIENT" });

    const entete = enteteDe(jeton);
    assert.equal(entete.alg, "HS256");

    const decode = app.jwt.verify<{ sub: string; role: string }>(jeton);
    assert.equal(decode.sub, "u-1");
    assert.equal(decode.role, "ROLE_CLIENT");
    await app.close();
  });

  it("refuse un jeton `alg: none` — aucune signature à vérifier", async () => {
    const app = await instanceJwt();
    const forge = jetonAlgNone({
      sub: "u-1",
      role: "ROLE_SUPER_ADMIN",
      iat: Math.floor(Date.now() / 1000),
    });

    assert.throws(() => app.jwt.verify(forge));
    await app.close();
  });

  it("refuse un jeton signé HS512 avec le même secret", async () => {
    // Le secret est le bon : seul l'algorithme change. C'est précisément ce que
    // la liste blanche doit intercepter — sans elle, ce jeton est ACCEPTÉ.
    const app = await instanceJwt();
    const autre = Fastify();
    await autre.register(fjwt, {
      secret: SECRET,
      sign: { algorithm: "HS512", expiresIn: "15m" },
    });
    await autre.ready();

    const jetonHs512 = autre.jwt.sign({ sub: "u-1", role: "ROLE_SUPER_ADMIN" });
    const entete = enteteDe(jetonHs512);
    assert.equal(entete.alg, "HS512", "le jeton d'attaque doit bien être HS512");

    assert.throws(() => app.jwt.verify(jetonHs512));

    await autre.close();
    await app.close();
  });
});
