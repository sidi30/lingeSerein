/**
 * Tournées à venir d'un livreur — logique pure, sans React Native.
 *
 * Le bug d'origine est côté données, pas côté écran : le livreur n'avait que
 * `GET /deliveries/today`, qui ne renvoie QUE la journée en cours. Une tournée
 * planifiée pour demain lui était totalement invisible — « j'ai créé une
 * tournée, le livreur n'a rien vu ». `GET /deliveries/mine` ouvre la fenêtre
 * (J-7 → J+30 par défaut) ; ce module trie ce qui l'ATTEND de ce qui est déjà
 * derrière lui.
 *
 * Toutes les comparaisons portent sur des dates CIVILES « YYYY-MM-DD ».
 * `round.date` est une colonne Prisma `@db.Date`, sérialisée à minuit UTC :
 * la passer par `new Date()` puis comparer des instants ferait basculer la
 * journée d'un fuseau à l'autre. On compare des chaînes, jamais des instants.
 */

export interface RoundLike {
  id: string;
  /** ISO ou « YYYY-MM-DD » — seule la partie date est lue. */
  date: string;
  status: string;
}

/** Une tournée et ses arrêts, tels que les renvoie `GET /deliveries/mine`. */
export interface RoundWithStops<S> extends RoundLike {
  stops?: readonly S[] | null;
}

/**
 * Une tournée terminée ou annulée n'attend plus le livreur.
 *
 * L'annulée est écartée volontairement : la faire figurer dans « à venir »
 * enverrait quelqu'un sur une tournée qui n'aura pas lieu. L'annulation lui
 * parvient par notification, pas par une ligne de planning qui la contredit.
 */
const CLOSED_STATUSES = ["COMPLETED", "CANCELLED"];

/** Date civile locale au format « YYYY-MM-DD ». */
export function localYmd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Partie date d'un champ tournée ; "" si la valeur est inexploitable. */
export function roundYmd(round: { date?: string | null }): string {
  const raw = typeof round.date === "string" ? round.date.slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

/** Nombre de jours de `fromYmd` à `toYmd` (négatif si `toYmd` est passé). */
export function daysBetweenYmd(fromYmd: string, toYmd: string): number | null {
  const parse = (ymd: string): number | null => {
    const [y, m, d] = ymd.split("-").map(Number);
    if (!y || !m || !d) return null;
    // Date.UTC : comparer deux minuits UTC élimine tout effet de fuseau et
    // d'heure d'été sur la différence.
    return Date.UTC(y, m - 1, d);
  };
  const a = parse(fromYmd);
  const b = parse(toYmd);
  if (a === null || b === null) return null;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Ce qui attend le livreur APRÈS aujourd'hui, du plus proche au plus lointain.
 *
 * La tournée du jour est exclue : elle occupe déjà le haut de l'écran, avec sa
 * progression et ses arrêts. `excludeId` couvre le cas où `/today` et `/mine`
 * renvoient la même tournée sous deux dates limites (fuseau du serveur).
 */
export function upcomingRounds<T extends RoundLike>(
  rounds: readonly T[] | null | undefined,
  todayYmd: string,
  excludeId?: string | null,
): T[] {
  return (rounds ?? [])
    .filter((r) => {
      if (excludeId && r.id === excludeId) return false;
      if (CLOSED_STATUSES.includes(r.status)) return false;
      const ymd = roundYmd(r);
      return ymd !== "" && ymd > todayYmd;
    })
    .sort((a, b) => roundYmd(a).localeCompare(roundYmd(b)));
}

/** Horizon de planification demandé au serveur ; au-delà, rien n'est planifié. */
export const ROUNDS_WINDOW_DAYS = 30;

/**
 * Fenêtre demandée à `GET /deliveries/mine` : d'aujourd'hui à J+30.
 *
 * Volontairement UNIQUE et partagée par tous les écrans tournée. La clé de cache
 * react-query contient ces deux dates : deux écrans qui calculeraient leur
 * fenêtre séparément (l'un « demain → J+30 », l'autre « aujourd'hui → J+30 »)
 * feraient deux requêtes et entretiendraient deux listes divergentes — un arrêt
 * ouvert depuis une notification pouvait alors être « introuvable » alors que
 * l'écran précédent venait de l'afficher.
 *
 * La borne basse inclut AUJOURD'HUI, alors que la section « à venir » n'affiche
 * que l'après : `upcomingRounds` filtre à l'affichage, et garder la journée en
 * cours dans la liste permet de retrouver un arrêt du jour même quand `/today`
 * n'a rien renvoyé.
 */
export function roundsWindow(now: Date = new Date()): { fromYmd: string; toYmd: string } {
  const end = new Date(now);
  end.setDate(end.getDate() + ROUNDS_WINDOW_DAYS);
  return { fromYmd: localYmd(now), toYmd: localYmd(end) };
}

/**
 * Retrouve un arrêt dans un lot de tournées, avec la tournée qui le porte.
 *
 * Le contexte compte autant que l'arrêt : l'écran de détail doit savoir si
 * l'arrêt appartient à la journée en cours (validation possible) ou à une
 * tournée future (consultation seule) — cf. `isRoundActionable`.
 */
export function findRoundStop<S extends { id: string }, R extends RoundWithStops<S>>(
  rounds: readonly R[] | null | undefined,
  stopId: string | null | undefined,
): { round: R; stop: S } | null {
  if (!stopId) return null;
  for (const round of rounds ?? []) {
    const stop = (round.stops ?? []).find((s) => s.id === stopId);
    if (stop) return { round, stop };
  }
  return null;
}

/**
 * La tournée peut-elle être validée aujourd'hui ?
 *
 * Vrai pour le jour même ET pour une tournée en retard (hier non clôturée) : le
 * livreur doit pouvoir finir ce qu'il a commencé. Faux pour le futur — valider
 * la veille une livraison de demain écrit une signature pour un passage qui n'a
 * pas eu lieu, et c'est précisément le genre d'erreur que l'écran d'arrêt existe
 * pour empêcher.
 */
export function isRoundActionable(ymd: string, todayYmd: string): boolean {
  if (!ymd) return false;
  return ymd <= todayYmd;
}

/**
 * Échéance en clair : « Demain », « Dans 3 jours »…
 *
 * Renvoie `null` au-delà d'une semaine : passé ce délai, la date complète
 * (« lundi 17 août ») informe mieux qu'un décompte que personne ne convertit.
 */
export function roundWhenLabel(ymd: string, todayYmd: string): string | null {
  const days = daysBetweenYmd(todayYmd, ymd);
  if (days === null || days <= 0 || days > 7) return null;
  if (days === 1) return "Demain";
  return `Dans ${days} jours`;
}
