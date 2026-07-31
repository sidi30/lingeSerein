import { z } from "zod";
import { estLivrable } from "@lingengo/shared";

const MESSAGE_HORS_PERIMETRE =
  "Commune non desservie — la livraison est limitée aux communes du Vaucluse (84)";

/**
 * Commune de livraison — code INSEE, choisi dans la liste FERMÉE des communes du
 * Vaucluse (`@lingengo/shared`). Validé À CHAQUE ENTRÉE d'adresse : inscription,
 * profil du client, création et modification de client par l'admin.
 *
 * Deux raisons de le vérifier ici plutôt que de faire confiance à l'écran :
 *
 *  1. C'est une frontière TARIFAIRE. Le palier de livraison se déduisait du
 *     `postalCode`, une chaîne libre que le client écrit lui-même depuis son
 *     profil : taper « 84100 » suffisait à s'attribuer la gratuité d'Orange.
 *     Le prix ne dépend plus que d'une entrée de liste, revalidée serveur.
 *  2. C'est une frontière de SERVICE. L'entreprise ne livre pas hors du
 *     Vaucluse : une commune hors périmètre est REFUSÉE en 400, jamais
 *     enregistrée en silence — sans quoi le client croirait être livrable.
 */
export const communeInseeSchema = z.string().trim().refine(estLivrable, MESSAGE_HORS_PERIMETRE);
