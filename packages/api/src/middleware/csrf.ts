import type { FastifyRequest, FastifyReply } from "fastify";
import { ForbiddenError } from "../utils/errors.js";

/**
 * Nom du cookie qui porte une identité à lui seul. C'est le SEUL vecteur CSRF
 * de l'API : partout ailleurs la preuve est un en-tête `Authorization`, qu'une
 * page tierce ne peut pas faire ajouter par le navigateur.
 */
const SESSION_COOKIE = "refreshToken";

/**
 * Extrait l'origine d'un `Referer`, qui est une URL complète là où `Origin` est
 * déjà une origine. Un Referer illisible vaut absence de Referer : on ne devine
 * pas, la garde tranchera en refusant.
 */
function refererOrigin(referer: string | undefined): string | undefined {
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

/**
 * Garde CSRF pour les routes qui acceptent le cookie de session comme preuve.
 *
 * Le cookie est déjà posé en `SameSite=Strict` (cf. routes/auth/index.ts), ce
 * qui bloque le vecteur chez tous les navigateurs à jour : c'est la protection
 * principale, celle-ci vient par-dessus. Elle couvre ce que `SameSite` ne
 * couvre pas — un navigateur ancien qui ignore l'attribut, un futur passage à
 * `SameSite=Lax` (où une soumission de formulaire POST cross-site redevient
 * possible), ou un sous-domaine compromis.
 *
 * On ne pose PAS de jeton anti-CSRF (double-submit) : il faudrait le distribuer
 * puis le renvoyer depuis chaque client, alors que le mobile n'utilise même pas
 * le cookie — il envoie son jeton dans le corps de la requête. Vérifier
 * l'origine donne la même garantie sans rien casser côté client.
 *
 * La garde s'efface quand aucun cookie de session n'accompagne la requête :
 * un appel natif (mobile) n'a pas de bocal à cookies, il n'y a donc rien à
 * détourner, et l'exiger ferait échouer un flux parfaitement sûr.
 *
 * @param allowedOrigins Origines de confiance — la même liste que CORS.
 */
export function requireTrustedOrigin(allowedOrigins: string[]) {
  const trusted = new Set(allowedOrigins.filter(Boolean));

  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const cookies = request.cookies as Record<string, string | undefined> | undefined;
    if (!cookies?.[SESSION_COOKIE]) return;

    // `Sec-Fetch-Site` est renseigné par le navigateur lui-même et figure parmi
    // les en-têtes interdits : une page tierce ne peut pas le forger. C'est donc
    // le verdict le plus fiable quand il est présent.
    //   same-origin → la page appelante EST l'API
    //   none        → navigation initiée par l'utilisateur (URL tapée, favori)
    const secFetchSite = request.headers["sec-fetch-site"];
    if (secFetchSite === "same-origin" || secFetchSite === "none") return;

    // Reste `same-site` et `cross-site`. Attention : `same-site` n'est PAS
    // anodin et ne peut pas être accepté en bloc — admin.lingeserein.fr appelant
    // api.lingeserein.fr est `same-site`, mais n'importe quel autre sous-domaine
    // du même domaine l'est tout autant. Seule la liste d'origines tranche.
    const origin = request.headers.origin ?? refererOrigin(request.headers.referer);

    if (origin && trusted.has(origin)) return;

    // Aucune origine exploitable et un cookie de session présent : on refuse.
    // Le client légitime qui ne peut pas fournir d'origine (script serveur,
    // outil en ligne de commande) a une voie qui reste ouverte — envoyer le
    // jeton dans le corps de la requête plutôt que par cookie.
    throw new ForbiddenError("Origine non fiable : requête refusée (protection CSRF)");
  };
}
