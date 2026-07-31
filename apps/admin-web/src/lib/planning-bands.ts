/**
 * Lecture « organisation » du planning : la période de détention et l'urgence.
 *
 * Le calendrier répond à deux questions qui n'ont rien à voir, et qui doivent
 * donc utiliser DEUX canaux visuels distincts :
 *
 * 1. « Chez qui est mon linge, et depuis quand ? » → une BANDE continue du jour
 *    de livraison au jour de reprise, teintée à la couleur du client. C'est de
 *    l'identité : la couleur ne dit rien de l'état, seulement « c'est ce
 *    client-là ». Deux contrats simultanés se lisent alors comme deux rails.
 * 2. « Qu'est-ce que je dois faire, et quand ? » → l'URGENCE de la reprise,
 *    du rouge (dépassé) au gris (lointain). C'est de l'état : elle vit sur la
 *    puce de l'événement, jamais sur la bande.
 *
 * Mélanger les deux — teinter la bande selon le retard — rendrait le planning
 * illisible dès qu'un client a deux rotations dans le mois.
 */

import { clientKey } from "./client-colors";
import { addDays, dayKey, dateFromKey, daysBetweenKeys } from "./calendar";
import type { RotationDTO } from "./rotations";

/** Garde-fou : une donnée aberrante ne doit pas peindre un an de calendrier. */
const MAX_JOURS_BANDE = 60;

// ─── Urgence de la reprise ───────────────────────────────────────

export type RepriseUrgence =
  /** Reprise enregistrée : le linge est rentré. */
  | "faite"
  /** Échéance dépassée, rien n'est rentré. */
  | "retard"
  /** À reprendre aujourd'hui. */
  | "aujourdhui"
  /** Demain ou après-demain : à caler dans la tournée. */
  | "imminent"
  /** Dans 3 à 7 jours : la semaine est engagée. */
  | "proche"
  /** Au-delà d'une semaine : repère de fond. */
  | "planifie";

export interface UrgenceInfo {
  urgence: RepriseUrgence;
  /** Jours restants avant l'échéance (négatif = retard). `null` si reprise faite. */
  joursRestants: number | null;
}

/**
 * Urgence d'une reprise à la date du jour.
 *
 * `done` prime sur tout : une rotation rentrée en retard n'est plus une action,
 * c'est de l'historique — l'afficher en rouge enverrait le propriétaire sur une
 * course déjà faite.
 */
export function repriseUrgence(
  params: { dayKey: string; done: boolean; lateDays: number },
  today: string,
): UrgenceInfo {
  if (params.done) return { urgence: "faite", joursRestants: null };
  if (params.lateDays > 0) return { urgence: "retard", joursRestants: -params.lateDays };

  const restants = daysBetweenKeys(today, params.dayKey);
  if (restants < 0) return { urgence: "retard", joursRestants: restants };
  if (restants === 0) return { urgence: "aujourdhui", joursRestants: 0 };
  if (restants <= 2) return { urgence: "imminent", joursRestants: restants };
  if (restants <= 7) return { urgence: "proche", joursRestants: restants };
  return { urgence: "planifie", joursRestants: restants };
}

/** Échéance dite en clair. Le texte double la couleur, jamais l'inverse. */
export function urgenceLabel(info: UrgenceInfo): string {
  switch (info.urgence) {
    case "faite":
      return "Reprise faite";
    case "retard": {
      const jours = Math.abs(info.joursRestants ?? 0);
      return `En retard de ${jours} j`;
    }
    case "aujourdhui":
      return "Reprise aujourd'hui";
    default: {
      const jours = info.joursRestants ?? 0;
      if (jours === 1) return "Reprise à venir · demain";
      return `Reprise à venir · dans ${jours} j`;
    }
  }
}

// ─── Bandes de détention ─────────────────────────────────────────

export interface DetentionBand {
  rotationId: string;
  clientNom: string;
  /** Clé d'identité du client — sert à en dériver la couleur. */
  clientKey: string;
  /** Rail horizontal : une bande garde le MÊME rail sur toute sa durée. */
  lane: number;
  /** Jour de livraison : extrémité gauche de la bande. */
  start: boolean;
  /** Jour de reprise (réelle ou prévue) : extrémité droite. */
  end: boolean;
  /** Reprise déjà enregistrée : la bande est de l'historique. */
  done: boolean;
  /** Reprise dépassée : la bande s'étire au-delà de ce qui était prévu. */
  late: boolean;
}

export interface DetentionLanes {
  byDay: Map<string, DetentionBand[]>;
  /** Nombre de rails occupés — la case doit en réserver la hauteur. */
  laneCount: number;
}

interface Intervalle {
  rotation: RotationDTO;
  debut: string;
  fin: string;
}

function intervalleDe(rotation: RotationDTO): Intervalle | null {
  const debut = (rotation.dateLivraison ?? "").slice(0, 10);
  const finBrute = (rotation.dateRepriseReelle ?? rotation.dateReprisePrevue ?? "").slice(0, 10);
  if (!debut) return null;

  // Sans date de reprise exploitable, la bande se réduit au jour de livraison :
  // mieux vaut un jalon qu'une bande arbitraire qui laisserait croire à une
  // durée de détention qui n'a jamais été décidée.
  const fin = finBrute && finBrute >= debut ? finBrute : debut;
  return { rotation, debut, fin };
}

/**
 * Attribue un rail à chaque rotation et distribue les segments jour par jour.
 *
 * Rails attribués au plus tôt (algorithme glouton sur intervalles triés) : deux
 * rotations qui ne se chevauchent pas partagent le même rail, ce qui garde la
 * case du calendrier basse. L'ordre de tri est déterministe (début, puis id),
 * sinon la même donnée produirait deux rendus différents et le planning
 * « sauterait » d'un rafraîchissement à l'autre.
 */
export function detentionLanes(rotations: RotationDTO[]): DetentionLanes {
  const intervalles = rotations
    .map(intervalleDe)
    .filter((i): i is Intervalle => i !== null)
    .sort((a, b) => a.debut.localeCompare(b.debut) || a.rotation.id.localeCompare(b.rotation.id));

  /** Dernier jour occupé par rail. */
  const finsParLane: string[] = [];
  const byDay = new Map<string, DetentionBand[]>();

  for (const { rotation, debut, fin } of intervalles) {
    let lane = finsParLane.findIndex((finLane) => finLane < debut);
    if (lane === -1) {
      lane = finsParLane.length;
      finsParLane.push(fin);
    } else {
      finsParLane[lane] = fin;
    }

    const done = Boolean(rotation.dateRepriseReelle) || rotation.status === "REPRISE";
    const late = !done && rotation.joursDeRetard > 0;
    const cle = clientKey(rotation.userId, rotation.clientNom);

    let jour = dateFromKey(debut);
    for (let i = 0; i <= MAX_JOURS_BANDE; i++) {
      const key = dayKey(jour);
      const bande: DetentionBand = {
        rotationId: rotation.id,
        clientNom: rotation.clientNom,
        clientKey: cle,
        lane,
        start: key === debut,
        end: key === fin,
        done,
        late,
      };
      const liste = byDay.get(key);
      if (liste) liste.push(bande);
      else byDay.set(key, [bande]);

      if (key === fin) break;
      jour = addDays(jour, 1);
    }
  }

  return { byDay, laneCount: finsParLane.length };
}
