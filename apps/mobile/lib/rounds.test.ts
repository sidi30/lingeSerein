import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  daysBetweenYmd,
  findRoundStop,
  isRoundActionable,
  localYmd,
  roundWhenLabel,
  roundYmd,
  roundsWindow,
  upcomingRounds,
  ROUNDS_WINDOW_DAYS,
  type RoundLike,
} from "./rounds.ts";

const TODAY = "2026-07-30";

const round = (over: Partial<RoundLike> = {}): RoundLike => ({
  id: "r1",
  date: "2026-07-31T00:00:00.000Z",
  status: "PLANNED",
  ...over,
});

describe("roundYmd", () => {
  it("extrait la date civile d'un instant ISO", () => {
    assert.equal(roundYmd({ date: "2026-07-31T00:00:00.000Z" }), "2026-07-31");
    assert.equal(roundYmd({ date: "2026-07-31" }), "2026-07-31");
  });

  it("rejette une valeur inexploitable plutôt que d'inventer une date", () => {
    assert.equal(roundYmd({ date: null }), "");
    assert.equal(roundYmd({ date: "bientôt" }), "");
    assert.equal(roundYmd({}), "");
  });
});

describe("daysBetweenYmd", () => {
  it("compte les jours civils", () => {
    assert.equal(daysBetweenYmd("2026-07-30", "2026-07-31"), 1);
    assert.equal(daysBetweenYmd("2026-07-30", "2026-08-06"), 7);
    assert.equal(daysBetweenYmd("2026-07-30", "2026-07-30"), 0);
    assert.equal(daysBetweenYmd("2026-07-30", "2026-07-29"), -1);
  });

  it("ne saute pas de jour au changement d'heure", () => {
    // Passage à l'heure d'hiver en France : la nuit du 25 octobre 2026 dure
    // 25 h. Un calcul en heure locale renverrait 0 jour ici.
    assert.equal(daysBetweenYmd("2026-10-24", "2026-10-25"), 1);
    assert.equal(daysBetweenYmd("2026-10-25", "2026-10-26"), 1);
  });

  it("renvoie null sur une date illisible", () => {
    assert.equal(daysBetweenYmd("2026-07-30", ""), null);
  });
});

describe("upcomingRounds", () => {
  it("ne garde que ce qui vient APRÈS aujourd'hui", () => {
    const result = upcomingRounds(
      [
        round({ id: "hier", date: "2026-07-29" }),
        round({ id: "aujourdhui", date: "2026-07-30" }),
        round({ id: "demain", date: "2026-07-31" }),
      ],
      TODAY,
    );
    assert.deepEqual(
      result.map((r) => r.id),
      ["demain"],
    );
  });

  it("trie du plus proche au plus lointain", () => {
    const result = upcomingRounds(
      [
        round({ id: "loin", date: "2026-08-15" }),
        round({ id: "proche", date: "2026-07-31" }),
        round({ id: "milieu", date: "2026-08-03" }),
      ],
      TODAY,
    );
    assert.deepEqual(
      result.map((r) => r.id),
      ["proche", "milieu", "loin"],
    );
  });

  it("écarte les tournées terminées ou annulées", () => {
    // Une annulée affichée dans « à venir » enverrait le livreur sur une
    // tournée qui n'aura pas lieu.
    const result = upcomingRounds(
      [
        round({ id: "annulee", date: "2026-07-31", status: "CANCELLED" }),
        round({ id: "terminee", date: "2026-08-01", status: "COMPLETED" }),
        round({ id: "prevue", date: "2026-08-02", status: "PLANNED" }),
      ],
      TODAY,
    );
    assert.deepEqual(
      result.map((r) => r.id),
      ["prevue"],
    );
  });

  it("exclut la tournée déjà affichée en haut de l'écran", () => {
    const result = upcomingRounds(
      [round({ id: "dejaVue", date: "2026-07-31" }), round({ id: "autre", date: "2026-08-01" })],
      TODAY,
      "dejaVue",
    );
    assert.deepEqual(
      result.map((r) => r.id),
      ["autre"],
    );
  });

  it("ignore une tournée à la date illisible plutôt que de la dater à tort", () => {
    assert.deepEqual(upcomingRounds([round({ date: "" })], TODAY), []);
  });

  it("traite l'absence de route comme une absence de tournée", () => {
    // La route peut répondre 404 tant qu'elle n'est pas déployée : le hook
    // renvoie alors `null`, et l'écran ne doit pas se comporter autrement.
    assert.deepEqual(upcomingRounds(null, TODAY), []);
    assert.deepEqual(upcomingRounds(undefined, TODAY), []);
  });
});

describe("roundWhenLabel", () => {
  it("dit « Demain » et « Dans N jours »", () => {
    assert.equal(roundWhenLabel("2026-07-31", TODAY), "Demain");
    assert.equal(roundWhenLabel("2026-08-02", TODAY), "Dans 3 jours");
  });

  it("se tait au-delà d'une semaine — la date complète parle mieux", () => {
    assert.equal(roundWhenLabel("2026-08-06", TODAY), "Dans 7 jours");
    assert.equal(roundWhenLabel("2026-08-07", TODAY), null);
  });

  it("se tait sur une date passée ou du jour", () => {
    assert.equal(roundWhenLabel("2026-07-30", TODAY), null);
    assert.equal(roundWhenLabel("2026-07-29", TODAY), null);
  });
});

describe("localYmd", () => {
  it("ne bascule pas de jour comme le ferait toISOString", () => {
    // 23 h locales en France = le lendemain en UTC une partie de l'année.
    const d = new Date(2026, 6, 30, 23, 30);
    assert.equal(localYmd(d), "2026-07-30");
  });
});

describe("roundsWindow", () => {
  it("part d'AUJOURD'HUI et couvre l'horizon de planification", () => {
    // La borne basse inclut le jour même : c'est ce qui permet de retrouver un
    // arrêt du jour dans la liste quand `/today` n'a rien renvoyé.
    const w = roundsWindow(new Date(2026, 6, 30, 23, 30));
    assert.equal(w.fromYmd, "2026-07-30");
    assert.equal(daysBetweenYmd(w.fromYmd, w.toYmd), ROUNDS_WINDOW_DAYS);
  });

  it("franchit le changement de mois sans dériver", () => {
    const w = roundsWindow(new Date(2026, 11, 20));
    assert.equal(w.fromYmd, "2026-12-20");
    assert.equal(w.toYmd, "2027-01-19");
  });
});

describe("findRoundStop", () => {
  const rounds = [
    { id: "r1", date: "2026-07-31", status: "PLANNED", stops: [{ id: "s1" }, { id: "s2" }] },
    { id: "r2", date: "2026-08-02", status: "PLANNED", stops: [{ id: "s3" }] },
  ];

  it("renvoie l'arrêt ET la tournée qui le porte", () => {
    const found = findRoundStop(rounds, "s3");
    assert.equal(found?.round.id, "r2");
    assert.equal(found?.stop.id, "s3");
  });

  it("renvoie null sans inventer de contexte", () => {
    assert.equal(findRoundStop(rounds, "inconnu"), null);
    assert.equal(findRoundStop(rounds, undefined), null);
    assert.equal(findRoundStop(null, "s1"), null);
  });

  it("tolère une tournée sans arrêts", () => {
    // `/deliveries/mine` peut aplatir la liste (stopsCount seul) selon la route.
    assert.equal(findRoundStop([{ id: "r3", date: "2026-08-05", status: "PLANNED" }], "s1"), null);
  });
});

describe("isRoundActionable", () => {
  it("autorise la validation le jour même", () => {
    assert.equal(isRoundActionable("2026-07-30", TODAY), true);
  });

  it("autorise encore une tournée en retard — le livreur finit ce qu'il a commencé", () => {
    assert.equal(isRoundActionable("2026-07-29", TODAY), true);
  });

  it("refuse une tournée future : signer la veille documente un passage qui n'a pas eu lieu", () => {
    assert.equal(isRoundActionable("2026-07-31", TODAY), false);
  });

  it("refuse une date illisible plutôt que de supposer", () => {
    assert.equal(isRoundActionable("", TODAY), false);
  });
});
