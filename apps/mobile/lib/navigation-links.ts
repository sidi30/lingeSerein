/**
 * Adresse d'un arrêt et liens d'itinéraire — logique pure, sans React Native.
 *
 * Le piège central, et la raison d'être de ce module : `User.address` est un
 * champ texte LIBRE, tandis que `city` et `postalCode` sont des colonnes
 * SÉPARÉES. Un client qui saisit correctement met « 12 rue des Lilas » dans
 * `address` et la commune ailleurs. Construire une URL de navigation sur
 * `address` seule envoie donc le livreur vers une rue sans ville — ambigu au
 * mieux, à l'autre bout du pays au pire. La destination se compose des trois
 * champs, dans l'ordre postal français.
 *
 * Conséquence assumée : **sans rue, aucun bouton d'itinéraire.** Une destination
 * réduite à une commune ouvre un GPS sur un centre-ville et donne au livreur
 * l'illusion d'être guidé — c'est pire qu'un bouton absent, qui l'invite à
 * appeler. Il n'existe par ailleurs ni latitude ni longitude sur `User` : le lien
 * par adresse textuelle est la seule voie possible.
 */

/** Portion cliente d'un arrêt — tous les champs sont potentiellement absents. */
export interface StopClientLike {
  name?: string | null;
  /** Nom de l'établissement (hôtel, gîte) : ce que le livreur cherche des yeux. */
  companyName?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  phone?: string | null;
}

function clean(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Titre de l'arrêt : l'établissement s'il est connu, la personne sinon.
 * Ne renvoie jamais "" — un arrêt sans aucun nom reste identifiable.
 */
export function stopTitle(client: StopClientLike): string {
  return clean(client.companyName) || clean(client.name) || "Client";
}

/**
 * Sous-titre : le nom de la personne, seulement s'il n'est pas déjà le titre.
 * `null` = rien à afficher, plutôt qu'une ligne vide ou dupliquée.
 */
export function stopSubtitle(client: StopClientLike): string | null {
  const company = clean(client.companyName);
  const name = clean(client.name);
  if (!company || !name || company === name) return null;
  return name;
}

/**
 * Adresse sur ses lignes naturelles : rue, puis « code postal ville ».
 * Les lignes vides sont écartées — jamais de « 76000 » orphelin ni de virgule
 * pendante à l'écran.
 */
export function addressLines(client: StopClientLike): string[] {
  const lines: string[] = [];
  const street = clean(client.address);
  if (street) lines.push(street);
  const locality = [clean(client.postalCode), clean(client.city)].filter(Boolean).join(" ");
  if (locality) lines.push(locality);
  return lines;
}

/**
 * Destination exploitable par un GPS, ou `null` s'il n'y a pas de rue.
 *
 * Les parties non vides sont jointes par ", " : c'est la forme qu'attendent
 * Waze, Google Maps et Plans pour une recherche textuelle.
 */
export function destinationQuery(client: StopClientLike): string | null {
  const street = clean(client.address);
  if (!street) return null;
  return [street, clean(client.postalCode), clean(client.city)].filter(Boolean).join(", ");
}

export interface NavigationTarget {
  key: "waze" | "google" | "apple";
  label: string;
  url: string;
}

/**
 * Liens d'itinéraire pour une destination donnée.
 *
 * Waze et Google Maps sont exposés en **https** et non via leur schéma
 * applicatif : l'URL web ouvre l'application si elle est installée, et retombe
 * sur le site sinon. Un `waze://` sur un téléphone sans Waze, lui, ne mène nulle
 * part. « Plans » n'est proposé que sur iOS, seule plateforme où il existe.
 */
export function navigationTargets(destination: string, platform: string): NavigationTarget[] {
  const q = encodeURIComponent(destination);
  const targets: NavigationTarget[] = [
    { key: "waze", label: "Waze", url: `https://waze.com/ul?q=${q}&navigate=yes` },
    {
      key: "google",
      label: "Google Maps",
      url: `https://www.google.com/maps/dir/?api=1&destination=${q}`,
    },
  ];
  if (platform === "ios") {
    targets.push({ key: "apple", label: "Plans", url: `http://maps.apple.com/?daddr=${q}` });
  }
  return targets;
}
