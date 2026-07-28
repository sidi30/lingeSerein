/**
 * Les deux règles qui portent la correction du bug « l'écran affiche
 * introuvable / ne se met pas à jour après une action ».
 *
 * En mobile, l'échec de rafraîchissement n'est pas un cas rare : c'est le cas
 * NORMAL (tunnel, ascenseur, 3G du sous-sol d'un hôtel). Confondre « le réseau
 * a lâché » et « cet objet n'existe plus » annonce au livreur une suppression
 * qui n'a pas eu lieu, en pleine tournée. D'où ces tests.
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
  READ_ONLY_KEYS,
  type MutationScope,
} from "./cache.ts";

const IDLE = {
  data: undefined,
  isPending: false,
  isFetching: false,
  isError: false,
  error: null,
};

const httpError = (status: number) => ({ status });

describe("detailState", () => {
  it("garde la donnée en cache quand le rafraîchissement échoue", () => {
    const q = { ...IDLE, data: { id: "abc" }, isError: true, error: httpError(500) };
    assert.equal(detailState(q, true), "ready");
  });

  it("garde la donnée en cache même si le rafraîchissement renvoie 404", () => {
    const q = { ...IDLE, data: { id: "abc" }, isError: true, error: httpError(404) };
    assert.equal(detailState(q, true), "ready");
  });

  it("traite une requête désactivée comme un chargement", () => {
    // `enabled: false` le temps que le token soit rehydraté depuis le stockage
    // sécurisé : `isPending` sans `isFetching`, donc `isLoading === false`.
    assert.equal(detailState({ ...IDLE, isPending: true, isFetching: false }, true), "loading");
  });

  it("ne dit « introuvable » que sur 404 et 403", () => {
    assert.equal(detailState({ ...IDLE, isError: true, error: httpError(404) }, true), "missing");
    assert.equal(detailState({ ...IDLE, isError: true, error: httpError(403) }, true), "missing");
  });

  it("dit « injoignable » sur une coupure réseau", () => {
    const q = { ...IDLE, isError: true, error: new Error("Network request failed") };
    assert.equal(detailState(q, true), "unavailable");
  });

  it("dit « introuvable » sans identifiant dans la route", () => {
    assert.equal(detailState({ ...IDLE, isPending: true, isFetching: true }, false), "missing");
  });

  it("ne confond pas `null` avec une donnée reçue", () => {
    assert.equal(detailState({ ...IDLE, data: null }, true), "missing");
  });

  it("accepte une donnée présente mais vide", () => {
    for (const data of [0, "", [], false]) {
      assert.equal(detailState({ ...IDLE, data }, true), "ready", JSON.stringify(data));
    }
  });
});

describe("errorStatus", () => {
  it("renvoie 0 quand l'erreur ne porte pas de statut", () => {
    assert.equal(errorStatus(new Error("boom")), 0);
    assert.equal(errorStatus(null), 0);
    assert.equal(errorStatus({ status: "404" }), 0);
  });

  it("lit le statut d'une ApiError", () => {
    assert.equal(errorStatus({ status: 409 }), 409);
  });
});

describe("familles invalidées", () => {
  it("rafraîchit les notifications après chaque écriture", () => {
    // Le badge d'onglet est alimenté par le serveur : sans invalidation, il ne
    // bouge qu'au cycle de polling suivant (60 s).
    const scopes: MutationScope[] = ["order", "delivery", "client", "subscription", "notification"];
    for (const scope of scopes) {
      assert.ok(AFFECTED[scope].includes(KEY.notifications), `${scope} n'invalide pas le badge`);
    }
  });

  it("rafraîchit la tournée et le stock après une livraison", () => {
    const families = affectedFamilies(["delivery"]);
    for (const key of [KEY.todayRound, KEY.stockMe, KEY.stockOperator, KEY.stockClients]) {
      assert.ok(families.includes(key), `${key} manquant`);
    }
  });

  it("ne laisse aucune famille du référentiel KEY hors de tout domaine", () => {
    // Une clé déclarée mais rattachée à aucun scope ne sera jamais invalidée :
    // l'écran correspondant garderait ses données jusqu'au redémarrage.
    const used = new Set([...Object.values(AFFECTED).flat(), ...READ_ONLY_KEYS]);
    for (const key of Object.values(KEY)) {
      assert.ok(used.has(key), `${key} n'appartient à aucun domaine d'AFFECTED`);
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

  it("dédoublonne les familles partagées par deux domaines", () => {
    const families = affectedFamilies(["order", "delivery"]);
    assert.equal(new Set(families).size, families.length);
  });
});

describe("invalidateAfter", () => {
  it("invalide chaque famille une fois et reste attendable", async () => {
    const seen: string[] = [];
    let settled = false;
    const qc = {
      invalidateQueries: ({ queryKey }: { queryKey: unknown[] }) => {
        seen.push(String(queryKey[0]));
        return Promise.resolve().then(() => {
          settled = true;
        });
      },
    };

    await invalidateAfter(qc as never, "order");

    assert.ok(settled);
    assert.deepEqual(seen, affectedFamilies(["order"]));
    assert.equal(new Set(seen).size, seen.length);
  });
});
