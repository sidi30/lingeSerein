/**
 * Origines de confiance : les seules interfaces autorisées à parler à l'API
 * depuis un navigateur.
 *
 * Une seule et même liste sert à CORS (qui décide si le navigateur laisse lire
 * la réponse) et à la garde CSRF (qui décide si la requête part). Les deux
 * répondent à la même question — « cette page a-t-elle le droit ? » — et deux
 * listes qui divergent finissent toujours par ouvrir un trou d'un côté sans
 * qu'on s'en aperçoive de l'autre.
 */
export function trustedOrigins(): string[] {
  return [
    process.env["ADMIN_WEB_URL"] ?? "http://localhost:3000",
    process.env["MOBILE_WEB_URL"] ?? "http://localhost:8081",
  ];
}
