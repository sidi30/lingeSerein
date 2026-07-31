/**
 * Couleur d'identité d'un client sur le planning.
 *
 * Trois partis pris, tous liés à la lecture du planning par le propriétaire :
 *
 * 1. **La teinte est DÉRIVÉE de l'identifiant, jamais stockée.** Un même client
 *    garde donc sa couleur d'un rechargement à l'autre, d'un écran à l'autre,
 *    sans colonne en base ni réglage à maintenir. Le prix à payer est qu'on ne
 *    choisit pas la couleur d'un client : c'est le bon compromis tant que
 *    personne ne l'a demandé.
 * 2. **La palette tourne.** Au-delà d'une dizaine de teintes, l'œil ne distingue
 *    plus rien : inutile d'en générer 360. Deux clients peuvent donc partager
 *    une couleur — c'est assumé, ce qui impose le point 3.
 * 3. **La couleur ne porte JAMAIS l'information seule.** Elle accompagne
 *    toujours le nom du client, et le monogramme posé dans la pastille donne un
 *    second repère non coloré (accessibilité WCAG, daltonisme, impression N&B).
 *
 * Les couleurs sont des chaînes CSS (`oklch`) appliquées en style en ligne et
 * non des classes Tailwind : une classe construite dynamiquement
 * (`bg-${hue}-500`) n'est pas générée par le compilateur et sortirait sans
 * couleur en production. La CSP du back-office autorise `style-src 'unsafe-inline'`,
 * ce chemin est donc sûr ici.
 */

export interface ClientColor {
  /** Teinte OKLCH, sert de clé stable dans les tests. */
  hue: number;
  /** Aplat soutenu — pastille, liseré, jalon. Contrasté sur fond blanc. */
  solid: string;
  /** Fond très clair — bande de contrat. Le texte `text` reste lisible dessus. */
  soft: string;
  /** Texte foncé de la même famille — AA sur blanc ET sur `soft`. */
  text: string;
  /** Bordure discrète d'une bande posée sur `soft`. */
  border: string;
}

/**
 * Dix teintes réparties sur le cercle chromatique.
 *
 * La luminosité est FIXE d'une teinte à l'autre (0.55 / 0.94 / 0.36) : c'est ce
 * qui garantit un contraste homogène quel que soit le client tiré, là où des
 * couleurs choisies à l'œil donnent un jaune illisible à côté d'un bleu marine.
 */
export const CLIENT_PALETTE: readonly ClientColor[] = [
  264, // indigo
  292, // lavande (teinte de marque)
  330, // rose
  10, // brique
  45, // orange
  85, // ambre
  130, // vert
  168, // émeraude
  205, // cyan
  235, // bleu
].map((hue) => ({
  hue,
  solid: `oklch(0.55 0.15 ${hue})`,
  soft: `oklch(0.94 0.045 ${hue})`,
  text: `oklch(0.36 0.11 ${hue})`,
  border: `oklch(0.78 0.09 ${hue})`,
}));

/**
 * Hash FNV-1a 32 bits.
 *
 * Choisi pour être court, sans dépendance et surtout DÉTERMINISTE : c'est la
 * seule propriété qui compte ici (aucun usage cryptographique). `Math.imul`
 * force la multiplication 32 bits, sans quoi JavaScript perd les bits de poids
 * fort au-delà de 2^53 et le hash cesse d'être reproductible.
 */
export function hashClientKey(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Teinte stable d'un client. Clé vide ⇒ première teinte, jamais d'exception. */
export function clientColor(key: string): ClientColor {
  const palette = CLIENT_PALETTE;
  return palette[hashClientKey(key) % palette.length] as ClientColor;
}

/**
 * Monogramme du client : le repère NON coloré qui double la pastille.
 *
 * Deux initiales quand le nom en offre deux (« Hôtel du Parc » → « HP »), sinon
 * les deux premières lettres. Les mots vides ne sont pas filtrés : « Le Mas »
 * donne « LM », ce qui reste distinctif, alors qu'ignorer « Le » ferait
 * fusionner tous les établissements commençant par un article.
 */
export function clientInitials(nom: string): string {
  const mots = nom
    .trim()
    .split(/[\s'’-]+/)
    .filter(Boolean);
  if (mots.length === 0) return "?";
  if (mots.length === 1) return (mots[0] as string).slice(0, 2).toUpperCase();
  return `${(mots[0] as string)[0]}${(mots[1] as string)[0]}`.toUpperCase();
}

/**
 * Clé d'identité d'un client à partir de ce que renvoie l'API.
 *
 * `userId` d'abord : c'est le seul identifiant qui ne bouge pas quand le nom est
 * corrigé. À défaut — une rotation saisie à la main n'est pas toujours rattachée
 * à un compte — on retombe sur le nom normalisé, ce qui recolle au moins les
 * rotations d'un même établissement entre elles.
 */
export function clientKey(userId: string | null | undefined, nom: string): string {
  if (userId) return userId;
  return normalizeClientName(nom);
}

/** Nom réduit à sa forme comparable : sans accents, sans casse, sans espaces doubles. */
export function normalizeClientName(nom: string): string {
  return (
    nom
      .normalize("NFD")
      // Plage des diacritiques combinants, notée en points de code : les écrire en
      // clair dans la source rendrait la regex illisible et fragile aux copier-coller.
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim()
  );
}
