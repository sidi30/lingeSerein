/**
 * Les deux règles qui portent la correction du bug « la page ne se rafraîchit
 * pas / affiche introuvable après une action ».
 *
 * Elles se testent sans navigateur ni serveur : `detailState` est une fonction
 * pure, et `invalidateAfter` se vérifie avec un faux `QueryClient` qui note les
 * clés reçues. Ce sont précisément les cas qu'une relecture laisse passer —
 * l'ancien code confondait « erreur de rafraîchissement » et « n'existe pas »,
 * et personne ne l'avait vu à l'œil.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  AFFECTED,
  affectedFamilies,
  detailState,
  errorStatus,
  invalidateAfter,
  KEY,
  type DetailQuery,
  type MutationScope,
} from "./cache.ts";

/** Requête au repos : rien reçu, rien en cours, aucune erreur. */
const IDLE: DetailQuery = {
  data: undefined,
  isPending: false,
  isFetching: false,
  isError: false,
  error: null,
};

function httpError(status: number): { status: number } {
  return { status };
}

describe("detailState", () => {
  it("affiche la donnée en cache même si le rafraîchissement échoue", () => {
    // Le cœur du bug : après une mutation, plusieurs requêtes repartent en même
    // temps ; si l'une échoue alors que la donnée est là, l'écran annonçait une
    // suppression qui n'a pas eu lieu.
    const q: DetailQuery = {
      data: { id: "abc" },
      isPending: false,
      isFetching: false,
      isError: true,
      error: httpError(500),
    };
    assert.equal(detailState(q, true), "ready");
  });

  it("affiche la donnée en cache même sur un 404 de rafraîchissement", () => {
    const q: DetailQuery = { ...IDLE, data: { id: "abc" }, isError: true, error: httpError(404) };
    assert.equal(detailState(q, true), "ready");
  });

  it("traite une requête désactivée comme un chargement, pas comme une absence", () => {
    // `enabled: false` le temps que le token soit rechargé : la requête est
    // `isPending` sans être `isFetching`, donc `isLoading === false`. C'est
    // exactement ce qui affichait « introuvable » au premier rendu.
    const q: DetailQuery = { ...IDLE, isPending: true, isFetching: false };
    assert.equal(detailState(q, true), "loading");
  });

  it("traite un chargement en cours comme un chargement", () => {
    assert.equal(detailState({ ...IDLE, isPending: true, isFetching: true }, true), "loading");
  });

  it("ne dit « introuvable » que sur 404 et 403", () => {
    for (const status of [404, 403]) {
      const q: DetailQuery = { ...IDLE, isError: true, error: httpError(status) };
      assert.equal(detailState(q, true), "missing", `statut ${status}`);
    }
  });

  it("dit « injoignable » sur une panne serveur ou réseau", () => {
    for (const error of [httpError(500), httpError(502), new Error("Network request failed")]) {
      const q: DetailQuery = { ...IDLE, isError: true, error };
      assert.equal(detailState(q, true), "unavailable");
    }
  });

  it("dit « introuvable » quand l'URL ne porte aucun identifiant", () => {
    assert.equal(detailState({ ...IDLE, isPending: true, isFetching: true }, false), "missing");
  });

  it("dit « introuvable » quand la requête a répondu sans donnée", () => {
    assert.equal(detailState(IDLE, true), "missing");
  });

  it("ne confond pas `null` avec une donnée reçue", () => {
    // `data != null` et non `!== undefined` : une réponse `null` est une absence.
    assert.equal(detailState({ ...IDLE, data: null }, true), "missing");
  });

  it("accepte une donnée « vide » mais présente (0, chaîne vide, tableau vide)", () => {
    for (const data of [0, "", [], false]) {
      assert.equal(detailState({ ...IDLE, data }, true), "ready", JSON.stringify(data));
    }
  });
});

describe("errorStatus", () => {
  it("renvoie 0 quand l'erreur ne porte pas de statut HTTP", () => {
    assert.equal(errorStatus(new Error("boom")), 0);
    assert.equal(errorStatus(null), 0);
    assert.equal(errorStatus(undefined), 0);
    assert.equal(errorStatus({ status: "404" }), 0);
  });

  it("lit le statut d'une ApiError", () => {
    assert.equal(errorStatus({ status: 422 }), 422);
  });
});

describe("familles invalidées", () => {
  it("dédoublonne les familles communes à plusieurs domaines", () => {
    const families = affectedFamilies(["order", "invoice"]);
    assert.equal(new Set(families).size, families.length);
  });

  it("rafraîchit le tableau de bord après toute écriture métier", () => {
    // Les KPI sont recalculés côté serveur à chaque écriture : les oublier
    // laissait le tableau de bord afficher les chiffres d'avant l'action.
    const metier: MutationScope[] = [
      "quote",
      "order",
      "invoice",
      "client",
      "user",
      "subscription",
      "product",
      "stock",
      "delivery",
      "rotation",
    ];
    for (const scope of metier) {
      assert.ok(
        AFFECTED[scope].includes(KEY.dashboard),
        `${scope} n'invalide pas le tableau de bord`,
      );
    }
  });

  it("rafraîchit les trois caches de zones et les deux caches d'opérateur", () => {
    // Même ressource `/settings/zones` sous trois clés selon l'écran : n'en
    // invalider qu'une laissait les formulaires client et utilisateur proposer
    // une zone supprimée.
    const families = affectedFamilies(["settings"]);
    for (const key of [KEY.zones, KEY.settings, KEY.zonesSelect, KEY.operator, KEY.operatorBl]) {
      assert.ok(families.includes(key), `${key} absent du domaine settings`);
    }
  });

  it("rafraîchit la commande ET le devis après une conversion", () => {
    const families = affectedFamilies(["quote", "order"]);
    for (const key of [KEY.quotes, KEY.quote, KEY.orders, KEY.order, KEY.ordersBadge]) {
      assert.ok(families.includes(key), `${key} manquant`);
    }
  });

  it("ne déclare aucune famille inconnue du référentiel KEY", () => {
    const known = new Set<string>(Object.values(KEY));
    for (const [scope, families] of Object.entries(AFFECTED)) {
      for (const family of families) {
        assert.ok(known.has(family), `${scope} référence la famille inconnue « ${family} »`);
      }
    }
  });
});

describe("invalidateAfter", () => {
  it("invalide chaque famille une seule fois et attend la fin", async () => {
    const seen: string[] = [];
    let resolved = false;
    const qc = {
      invalidateQueries: ({ queryKey }: { queryKey: unknown[] }) => {
        seen.push(String(queryKey[0]));
        return Promise.resolve().then(() => {
          resolved = true;
        });
      },
    };

    await invalidateAfter(qc as never, "order", "invoice");

    assert.ok(resolved, "invalidateAfter doit attendre les rafraîchissements");
    assert.deepEqual(seen, affectedFamilies(["order", "invoice"]));
    assert.equal(new Set(seen).size, seen.length);
  });

  it("n'invalide rien quand aucun domaine n'est passé", async () => {
    const seen: string[] = [];
    const qc = {
      invalidateQueries: ({ queryKey }: { queryKey: unknown[] }) => {
        seen.push(String(queryKey[0]));
        return Promise.resolve();
      },
    };
    await invalidateAfter(qc as never);
    assert.deepEqual(seen, []);
  });
});
