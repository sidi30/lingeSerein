import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detentionLanes, repriseUrgence, urgenceLabel } from "./planning-bands.ts";
import type { RotationDTO } from "./rotations.ts";

const BASE: RotationDTO = {
  id: "r1",
  clientNom: "Hôtel du Parc",
  clientAdresse: null,
  userId: null,
  formule: "PONCTUEL",
  status: "PLANIFIEE",
  dateLivraison: "2026-08-03",
  dateReprisePrevue: "2026-08-05",
  dateRepriseReelle: null,
  passage: null,
  lignes: [],
  joursDeRetard: 0,
};

function rotation(over: Partial<RotationDTO>): RotationDTO {
  return { ...BASE, ...over };
}

describe("repriseUrgence", () => {
  const today = "2026-08-03";

  it("classe par distance à l'échéance, du jour même au lointain", () => {
    const cas = (dayKey: string) => repriseUrgence({ dayKey, done: false, lateDays: 0 }, today);
    assert.equal(cas("2026-08-03").urgence, "aujourdhui");
    assert.equal(cas("2026-08-04").urgence, "imminent");
    assert.equal(cas("2026-08-05").urgence, "imminent");
    assert.equal(cas("2026-08-06").urgence, "proche");
    assert.equal(cas("2026-08-10").urgence, "proche");
    assert.equal(cas("2026-08-11").urgence, "planifie");
  });

  it("traite une échéance passée comme un retard, même sans compteur serveur", () => {
    // L'API n'a pas encore basculé le statut (le cron ne passe qu'une fois par
    // jour) : la date suffit à dire que c'est en retard.
    const info = repriseUrgence({ dayKey: "2026-08-01", done: false, lateDays: 0 }, today);
    assert.equal(info.urgence, "retard");
    assert.equal(info.joursRestants, -2);
  });

  it("une reprise FAITE n'est jamais en retard, même rentrée après l'échéance", () => {
    const info = repriseUrgence({ dayKey: "2026-07-20", done: true, lateDays: 9 }, today);
    assert.equal(info.urgence, "faite");
    assert.equal(urgenceLabel(info), "Reprise faite");
  });

  it("dit l'échéance en toutes lettres — la couleur ne porte jamais seule", () => {
    assert.equal(
      urgenceLabel(repriseUrgence({ dayKey: "2026-08-04", done: false, lateDays: 0 }, today)),
      "Reprise à venir · demain",
    );
    assert.equal(
      urgenceLabel(repriseUrgence({ dayKey: "2026-08-06", done: false, lateDays: 0 }, today)),
      "Reprise à venir · dans 3 j",
    );
    assert.equal(
      urgenceLabel(repriseUrgence({ dayKey: "2026-08-01", done: false, lateDays: 2 }, today)),
      "En retard de 2 j",
    );
  });
});

describe("detentionLanes", () => {
  it("peint tous les jours de la livraison à la reprise, bornes comprises", () => {
    const { byDay, laneCount } = detentionLanes([rotation({})]);
    assert.equal(laneCount, 1);
    assert.deepEqual([...byDay.keys()].sort(), ["2026-08-03", "2026-08-04", "2026-08-05"]);
    assert.equal(byDay.get("2026-08-03")?.[0]?.start, true);
    assert.equal(byDay.get("2026-08-04")?.[0]?.start, false);
    assert.equal(byDay.get("2026-08-04")?.[0]?.end, false);
    assert.equal(byDay.get("2026-08-05")?.[0]?.end, true);
  });

  it("garde le MÊME rail sur toute la durée d'une rotation", () => {
    const { byDay } = detentionLanes([
      rotation({ id: "a", dateLivraison: "2026-08-03", dateReprisePrevue: "2026-08-07" }),
      rotation({ id: "b", dateLivraison: "2026-08-04", dateReprisePrevue: "2026-08-06" }),
    ]);
    const railsDeB = ["2026-08-04", "2026-08-05", "2026-08-06"].map(
      (jour) => byDay.get(jour)?.find((b) => b.rotationId === "b")?.lane,
    );
    assert.deepEqual(railsDeB, [1, 1, 1]);
  });

  it("réutilise un rail libéré plutôt que d'empiler à l'infini", () => {
    // Deux séjours qui ne se chevauchent pas : la case du calendrier doit rester
    // basse, sinon un mois chargé devient illisible.
    const { laneCount } = detentionLanes([
      rotation({ id: "a", dateLivraison: "2026-08-01", dateReprisePrevue: "2026-08-03" }),
      rotation({ id: "b", dateLivraison: "2026-08-05", dateReprisePrevue: "2026-08-07" }),
    ]);
    assert.equal(laneCount, 1);
  });

  it("suit la reprise RÉELLE quand elle diffère du prévisionnel", () => {
    const { byDay } = detentionLanes([
      rotation({ dateReprisePrevue: "2026-08-05", dateRepriseReelle: "2026-08-08" }),
    ]);
    assert.ok(byDay.has("2026-08-08"));
    assert.equal(byDay.get("2026-08-08")?.[0]?.end, true);
    assert.equal(byDay.get("2026-08-08")?.[0]?.done, true);
  });

  it("réduit la bande au jour de livraison si la reprise manque ou précède", () => {
    const sansReprise = detentionLanes([rotation({ dateReprisePrevue: null })]);
    assert.deepEqual([...sansReprise.byDay.keys()], ["2026-08-03"]);

    const incoherente = detentionLanes([rotation({ dateReprisePrevue: "2026-07-30" })]);
    assert.deepEqual([...incoherente.byDay.keys()], ["2026-08-03"]);
  });

  it("donne la même couleur aux rotations d'un même client, quel que soit son compte", () => {
    const { byDay } = detentionLanes([
      rotation({ id: "a", userId: "u-1" }),
      rotation({
        id: "b",
        userId: "u-1",
        dateLivraison: "2026-08-20",
        dateReprisePrevue: "2026-08-22",
      }),
    ]);
    const cleA = byDay.get("2026-08-03")?.[0]?.clientKey;
    const cleB = byDay.get("2026-08-20")?.[0]?.clientKey;
    assert.equal(cleA, cleB);
  });

  it("ignore une rotation sans date de livraison au lieu de planter", () => {
    const { byDay, laneCount } = detentionLanes([rotation({ dateLivraison: "" })]);
    assert.equal(laneCount, 0);
    assert.equal(byDay.size, 0);
  });

  it("borne une donnée aberrante au lieu de peindre un an", () => {
    const { byDay } = detentionLanes([
      rotation({ dateLivraison: "2026-01-01", dateReprisePrevue: "2027-01-01" }),
    ]);
    assert.ok(byDay.size <= 61, `bande bornée, ${byDay.size} jours peints`);
  });
});
