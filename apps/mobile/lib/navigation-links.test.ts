/**
 * Le piège couvert ici a un coût terrain : une URL construite sur `address`
 * seule (champ texte libre, sans la commune, qui vit dans `city`/`postalCode`)
 * envoie le livreur vers une rue homonyme à l'autre bout du pays.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  addressLines,
  destinationQuery,
  navigationTargets,
  stopSubtitle,
  stopTitle,
} from "./navigation-links.ts";

describe("stopTitle / stopSubtitle", () => {
  it("met l'établissement en avant, la personne en second", () => {
    const client = { name: "Marie Dupont", companyName: "Hôtel du Port" };
    assert.equal(stopTitle(client), "Hôtel du Port");
    assert.equal(stopSubtitle(client), "Marie Dupont");
  });

  it("retombe sur le nom de la personne sans établissement", () => {
    const client = { name: "Marie Dupont", companyName: null };
    assert.equal(stopTitle(client), "Marie Dupont");
    // Pas de sous-titre : répéter le titre en plus petit n'apprend rien.
    assert.equal(stopSubtitle(client), null);
  });

  it("ne duplique pas un établissement identique au nom", () => {
    const client = { name: "Gîte Bel Air", companyName: "Gîte Bel Air" };
    assert.equal(stopSubtitle(client), null);
  });

  it("reste identifiable sans aucun nom", () => {
    assert.equal(stopTitle({}), "Client");
  });

  it("ignore les champs réduits à des espaces", () => {
    assert.equal(stopTitle({ companyName: "   ", name: "Marie" }), "Marie");
  });
});

describe("addressLines", () => {
  it("sépare la rue de la ligne « code postal ville »", () => {
    assert.deepEqual(
      addressLines({ address: "12 rue des Lilas", postalCode: "76000", city: "Rouen" }),
      ["12 rue des Lilas", "76000 Rouen"],
    );
  });

  it("n'affiche pas de ligne vide quand la commune manque", () => {
    assert.deepEqual(addressLines({ address: "12 rue des Lilas" }), ["12 rue des Lilas"]);
  });

  it("affiche la commune seule si c'est tout ce qu'on a", () => {
    assert.deepEqual(addressLines({ city: "Rouen" }), ["Rouen"]);
  });

  it("ne laisse pas un code postal orphelin sans ville", () => {
    assert.deepEqual(addressLines({ postalCode: "76000" }), ["76000"]);
  });

  it("renvoie une liste vide sans aucune adresse", () => {
    assert.deepEqual(addressLines({}), []);
  });
});

describe("destinationQuery", () => {
  it("concatène rue, code postal et ville", () => {
    // Les trois parties sont jointes par ", " — forme attendue par les moteurs
    // de recherche d'adresse de Waze, Google Maps et Plans.
    assert.equal(
      destinationQuery({ address: "12 rue des Lilas", postalCode: "76000", city: "Rouen" }),
      "12 rue des Lilas, 76000, Rouen",
    );
  });

  it("saute les parties manquantes sans virgule pendante", () => {
    assert.equal(
      destinationQuery({ address: "12 rue des Lilas", city: "Rouen" }),
      "12 rue des Lilas, Rouen",
    );
    assert.equal(destinationQuery({ address: "12 rue des Lilas" }), "12 rue des Lilas");
  });

  it("REFUSE une destination sans rue, même ville connue", () => {
    // Un GPS lancé sur un centre-ville n'amène le livreur nulle part d'utile :
    // mieux vaut aucun bouton, qui l'invite à appeler.
    assert.equal(destinationQuery({ city: "Rouen", postalCode: "76000" }), null);
    assert.equal(destinationQuery({ address: "   ", city: "Rouen" }), null);
    assert.equal(destinationQuery({}), null);
  });
});

describe("navigationTargets", () => {
  const destination = "12 rue des Lilas, 76000 Rouen";

  it("encode l'adresse dans chaque URL", () => {
    for (const target of navigationTargets(destination, "ios")) {
      assert.ok(
        target.url.includes(encodeURIComponent(destination)),
        `${target.key} n'encode pas l'adresse`,
      );
      assert.ok(!target.url.includes(" "), `${target.key} laisse un espace brut`);
    }
  });

  it("utilise les URL https, qui retombent sur le web sans l'app", () => {
    const byKey = Object.fromEntries(
      navigationTargets(destination, "android").map((t) => [t.key, t.url]),
    );
    assert.ok(byKey.waze?.startsWith("https://waze.com/ul?q="));
    assert.ok(byKey.waze?.endsWith("&navigate=yes"));
    assert.ok(byKey.google?.startsWith("https://www.google.com/maps/dir/?api=1&destination="));
  });

  it("ne propose Plans que sur iOS", () => {
    assert.ok(navigationTargets(destination, "ios").some((t) => t.key === "apple"));
    assert.ok(!navigationTargets(destination, "android").some((t) => t.key === "apple"));
    assert.ok(!navigationTargets(destination, "web").some((t) => t.key === "apple"));
  });
});
