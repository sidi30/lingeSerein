/**
 * Communes du Vaucluse (84) — PÉRIMÈTRE DE LIVRAISON, source de vérité unique.
 *
 * Linge Serein ne quitte pas le Vaucluse : cette liste est FERMÉE. Une adresse
 * dont la commune n'y figure pas n'est pas livrable, et le serveur revalide le
 * choix du client contre cette même table.
 *
 * ⚠️ C'est une frontière TARIFAIRE autant que géographique. Avant ce fichier, la
 * zone se déduisait du seul `postalCode`, un champ que le client écrit lui-même
 * depuis son profil : saisir « 84100 » suffisait à s'offrir le tarif d'Orange.
 * Le prix dépend désormais d'une entrée choisie dans une liste close, jamais
 * d'une chaîne libre.
 *
 * Paliers, calculés depuis Orange (siège) :
 *   ORANGE        0 €   — la commune du siège
 *   PROCHE       12 €   — jusqu'à 15 km
 *   INTERMEDIAIRE 15 €  — de 15 à 35 km
 *   ELOIGNE      25 €   — au-delà, jusqu'aux limites du département
 *
 * GÉNÉRÉ le 2026-07-30 à partir de geo.api.gouv.fr
 * (découpage communal officiel, 151 communes). `kmDepuisOrange` est une
 * distance routière APPROCHÉE : orthodromie entre les chefs-lieux × 1,25, le
 * facteur de sinuosité usuel. Elle sert à classer, pas à facturer — le prix ne
 * dépend que du palier. Une commune mal classée se corrige à la main ici, la
 * ligne fait autorité sur le calcul.
 */

import type { DeliveryZone } from "./constants";

export interface CommuneLivrable {
  nom: string;
  /** Code INSEE — identifiant stable, contrairement au nom et au code postal. */
  codeInsee: string;
  /** Une commune peut en porter plusieurs (Avignon : 84000 et 84140). */
  codesPostaux: readonly string[];
  kmDepuisOrange: number;
  zone: Exclude<DeliveryZone, "HORS_ZONE">;
}

export const VAUCLUSE_COMMUNES: readonly CommuneLivrable[] = [
  {
    nom: "Althen-des-Paluds",
    codeInsee: "84001",
    codesPostaux: ["84210"],
    kmDepuisOrange: 22.9,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Ansouis",
    codeInsee: "84002",
    codesPostaux: ["84240"],
    kmDepuisOrange: 86.1,
    zone: "ELOIGNE",
  },
  {
    nom: "Apt",
    codeInsee: "84003",
    codesPostaux: ["84400"],
    kmDepuisOrange: 67.1,
    zone: "ELOIGNE",
  },
  {
    nom: "Aubignan",
    codeInsee: "84004",
    codesPostaux: ["84810"],
    kmDepuisOrange: 23.3,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Aurel",
    codeInsee: "84005",
    codesPostaux: ["84390"],
    kmDepuisOrange: 58.6,
    zone: "ELOIGNE",
  },
  {
    nom: "Auribeau",
    codeInsee: "84006",
    codesPostaux: ["84400"],
    kmDepuisOrange: 76.4,
    zone: "ELOIGNE",
  },
  {
    nom: "Avignon",
    codeInsee: "84007",
    codesPostaux: ["84000", "84140"],
    kmDepuisOrange: 25.9,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Beaumes-de-Venise",
    codeInsee: "84012",
    codesPostaux: ["84190"],
    kmDepuisOrange: 22.4,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Beaumettes",
    codeInsee: "84013",
    codesPostaux: ["84220"],
    kmDepuisOrange: 54.1,
    zone: "ELOIGNE",
  },
  {
    nom: "Beaumont-de-Pertuis",
    codeInsee: "84014",
    codesPostaux: ["84120"],
    kmDepuisOrange: 104.6,
    zone: "ELOIGNE",
  },
  {
    nom: "Beaumont-du-Ventoux",
    codeInsee: "84015",
    codesPostaux: ["84340"],
    kmDepuisOrange: 42.3,
    zone: "ELOIGNE",
  },
  {
    nom: "Bédarrides",
    codeInsee: "84016",
    codesPostaux: ["84370"],
    kmDepuisOrange: 14.8,
    zone: "PROCHE",
  },
  {
    nom: "Bédoin",
    codeInsee: "84017",
    codesPostaux: ["84410"],
    kmDepuisOrange: 43,
    zone: "ELOIGNE",
  },
  {
    nom: "Blauvac",
    codeInsee: "84018",
    codesPostaux: ["84570"],
    kmDepuisOrange: 45.6,
    zone: "ELOIGNE",
  },
  {
    nom: "Bollène",
    codeInsee: "84019",
    codesPostaux: ["84500"],
    kmDepuisOrange: 23.1,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Bonnieux",
    codeInsee: "84020",
    codesPostaux: ["84480"],
    kmDepuisOrange: 65.7,
    zone: "ELOIGNE",
  },
  {
    nom: "Brantes",
    codeInsee: "84021",
    codesPostaux: ["84390"],
    kmDepuisOrange: 53.3,
    zone: "ELOIGNE",
  },
  {
    nom: "Buisson",
    codeInsee: "84022",
    codesPostaux: ["84110"],
    kmDepuisOrange: 28.5,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Buoux",
    codeInsee: "84023",
    codesPostaux: ["84480"],
    kmDepuisOrange: 71.2,
    zone: "ELOIGNE",
  },
  {
    nom: "Cabrières-d'Aigues",
    codeInsee: "84024",
    codesPostaux: ["84240"],
    kmDepuisOrange: 83.2,
    zone: "ELOIGNE",
  },
  {
    nom: "Cabrières-d'Avignon",
    codeInsee: "84025",
    codesPostaux: ["84220"],
    kmDepuisOrange: 46.5,
    zone: "ELOIGNE",
  },
  {
    nom: "Cadenet",
    codeInsee: "84026",
    codesPostaux: ["84160"],
    kmDepuisOrange: 80.3,
    zone: "ELOIGNE",
  },
  {
    nom: "Caderousse",
    codeInsee: "84027",
    codesPostaux: ["84860"],
    kmDepuisOrange: 5.9,
    zone: "PROCHE",
  },
  {
    nom: "Cairanne",
    codeInsee: "84028",
    codesPostaux: ["84290"],
    kmDepuisOrange: 19.2,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Camaret-sur-Aigues",
    codeInsee: "84029",
    codesPostaux: ["84850"],
    kmDepuisOrange: 9.6,
    zone: "PROCHE",
  },
  {
    nom: "Caromb",
    codeInsee: "84030",
    codesPostaux: ["84330"],
    kmDepuisOrange: 30.5,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Carpentras",
    codeInsee: "84031",
    codesPostaux: ["84200"],
    kmDepuisOrange: 27,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Caseneuve",
    codeInsee: "84032",
    codesPostaux: ["84750"],
    kmDepuisOrange: 75.8,
    zone: "ELOIGNE",
  },
  {
    nom: "Castellet-en-Luberon",
    codeInsee: "84033",
    codesPostaux: ["84400"],
    kmDepuisOrange: 79.6,
    zone: "ELOIGNE",
  },
  {
    nom: "Caumont-sur-Durance",
    codeInsee: "84034",
    codesPostaux: ["84510"],
    kmDepuisOrange: 37.3,
    zone: "ELOIGNE",
  },
  {
    nom: "Cavaillon",
    codeInsee: "84035",
    codesPostaux: ["84300"],
    kmDepuisOrange: 45,
    zone: "ELOIGNE",
  },
  {
    nom: "Châteauneuf-de-Gadagne",
    codeInsee: "84036",
    codesPostaux: ["84470"],
    kmDepuisOrange: 30.6,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Châteauneuf-du-Pape",
    codeInsee: "84037",
    codesPostaux: ["84230"],
    kmDepuisOrange: 9.5,
    zone: "PROCHE",
  },
  {
    nom: "Cheval-Blanc",
    codeInsee: "84038",
    codesPostaux: ["84460"],
    kmDepuisOrange: 56.8,
    zone: "ELOIGNE",
  },
  {
    nom: "Courthézon",
    codeInsee: "84039",
    codesPostaux: ["84350"],
    kmDepuisOrange: 9.9,
    zone: "PROCHE",
  },
  {
    nom: "Crestet",
    codeInsee: "84040",
    codesPostaux: ["84110"],
    kmDepuisOrange: 30.6,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Crillon-le-Brave",
    codeInsee: "84041",
    codesPostaux: ["84410"],
    kmDepuisOrange: 34.8,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Cucuron",
    codeInsee: "84042",
    codesPostaux: ["84160"],
    kmDepuisOrange: 79.9,
    zone: "ELOIGNE",
  },
  {
    nom: "Entraigues-sur-la-Sorgue",
    codeInsee: "84043",
    codesPostaux: ["84320"],
    kmDepuisOrange: 22.4,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Entrechaux",
    codeInsee: "84044",
    codesPostaux: ["84340"],
    kmDepuisOrange: 35.9,
    zone: "ELOIGNE",
  },
  {
    nom: "Faucon",
    codeInsee: "84045",
    codesPostaux: ["84110"],
    kmDepuisOrange: 37.9,
    zone: "ELOIGNE",
  },
  {
    nom: "Flassan",
    codeInsee: "84046",
    codesPostaux: ["84410"],
    kmDepuisOrange: 45.9,
    zone: "ELOIGNE",
  },
  {
    nom: "Fontaine-de-Vaucluse",
    codeInsee: "84139",
    codesPostaux: ["84800"],
    kmDepuisOrange: 43.1,
    zone: "ELOIGNE",
  },
  {
    nom: "Gargas",
    codeInsee: "84047",
    codesPostaux: ["84400"],
    kmDepuisOrange: 62.9,
    zone: "ELOIGNE",
  },
  {
    nom: "Gignac",
    codeInsee: "84048",
    codesPostaux: ["84400"],
    kmDepuisOrange: 77.3,
    zone: "ELOIGNE",
  },
  {
    nom: "Gigondas",
    codeInsee: "84049",
    codesPostaux: ["84190"],
    kmDepuisOrange: 21.8,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Gordes",
    codeInsee: "84050",
    codesPostaux: ["84220"],
    kmDepuisOrange: 50.3,
    zone: "ELOIGNE",
  },
  {
    nom: "Goult",
    codeInsee: "84051",
    codesPostaux: ["84220"],
    kmDepuisOrange: 57,
    zone: "ELOIGNE",
  },
  {
    nom: "Grambois",
    codeInsee: "84052",
    codesPostaux: ["84240"],
    kmDepuisOrange: 95,
    zone: "ELOIGNE",
  },
  {
    nom: "Grillon",
    codeInsee: "84053",
    codesPostaux: ["84600"],
    kmDepuisOrange: 39.5,
    zone: "ELOIGNE",
  },
  {
    nom: "Jonquerettes",
    codeInsee: "84055",
    codesPostaux: ["84450"],
    kmDepuisOrange: 28.3,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Jonquières",
    codeInsee: "84056",
    codesPostaux: ["84150"],
    kmDepuisOrange: 11.1,
    zone: "PROCHE",
  },
  {
    nom: "Joucas",
    codeInsee: "84057",
    codesPostaux: ["84220"],
    kmDepuisOrange: 53.1,
    zone: "ELOIGNE",
  },
  {
    nom: "L'Isle-sur-la-Sorgue",
    codeInsee: "84054",
    codesPostaux: ["84800"],
    kmDepuisOrange: 38.5,
    zone: "ELOIGNE",
  },
  {
    nom: "La Bastide-des-Jourdans",
    codeInsee: "84009",
    codesPostaux: ["84240"],
    kmDepuisOrange: 95.9,
    zone: "ELOIGNE",
  },
  {
    nom: "La Bastidonne",
    codeInsee: "84010",
    codesPostaux: ["84120"],
    kmDepuisOrange: 98.3,
    zone: "ELOIGNE",
  },
  {
    nom: "La Motte-d'Aigues",
    codeInsee: "84084",
    codesPostaux: ["84240"],
    kmDepuisOrange: 86.6,
    zone: "ELOIGNE",
  },
  {
    nom: "La Roque-Alric",
    codeInsee: "84100",
    codesPostaux: ["84190"],
    kmDepuisOrange: 26.6,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "La Roque-sur-Pernes",
    codeInsee: "84101",
    codesPostaux: ["84210"],
    kmDepuisOrange: 36.4,
    zone: "ELOIGNE",
  },
  {
    nom: "La Tour-d'Aigues",
    codeInsee: "84133",
    codesPostaux: ["84240"],
    kmDepuisOrange: 95.8,
    zone: "ELOIGNE",
  },
  {
    nom: "Lacoste",
    codeInsee: "84058",
    codesPostaux: ["84480"],
    kmDepuisOrange: 62.5,
    zone: "ELOIGNE",
  },
  {
    nom: "Lafare",
    codeInsee: "84059",
    codesPostaux: ["84190"],
    kmDepuisOrange: 24.9,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Lagarde-d'Apt",
    codeInsee: "84060",
    codesPostaux: ["84400"],
    kmDepuisOrange: 70.1,
    zone: "ELOIGNE",
  },
  {
    nom: "Lagarde-Paréol",
    codeInsee: "84061",
    codesPostaux: ["84290"],
    kmDepuisOrange: 14.9,
    zone: "PROCHE",
  },
  {
    nom: "Lagnes",
    codeInsee: "84062",
    codesPostaux: ["84800"],
    kmDepuisOrange: 44.1,
    zone: "ELOIGNE",
  },
  {
    nom: "Lamotte-du-Rhône",
    codeInsee: "84063",
    codesPostaux: ["84840"],
    kmDepuisOrange: 24.6,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Lapalud",
    codeInsee: "84064",
    codesPostaux: ["84840"],
    kmDepuisOrange: 27.9,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Lauris",
    codeInsee: "84065",
    codesPostaux: ["84360"],
    kmDepuisOrange: 71.2,
    zone: "ELOIGNE",
  },
  {
    nom: "Le Barroux",
    codeInsee: "84008",
    codesPostaux: ["84330"],
    kmDepuisOrange: 30.4,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Le Beaucet",
    codeInsee: "84011",
    codesPostaux: ["84210"],
    kmDepuisOrange: 39.1,
    zone: "ELOIGNE",
  },
  {
    nom: "Le Pontet",
    codeInsee: "84092",
    codesPostaux: ["84130"],
    kmDepuisOrange: 22.4,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Le Thor",
    codeInsee: "84132",
    codesPostaux: ["84250"],
    kmDepuisOrange: 34,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Lioux",
    codeInsee: "84066",
    codesPostaux: ["84220"],
    kmDepuisOrange: 54.9,
    zone: "ELOIGNE",
  },
  {
    nom: "Loriol-du-Comtat",
    codeInsee: "84067",
    codesPostaux: ["84870"],
    kmDepuisOrange: 21.3,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Lourmarin",
    codeInsee: "84068",
    codesPostaux: ["84160"],
    kmDepuisOrange: 74,
    zone: "ELOIGNE",
  },
  {
    nom: "Malaucène",
    codeInsee: "84069",
    codesPostaux: ["84340"],
    kmDepuisOrange: 36,
    zone: "ELOIGNE",
  },
  {
    nom: "Malemort-du-Comtat",
    codeInsee: "84070",
    codesPostaux: ["84570"],
    kmDepuisOrange: 39.2,
    zone: "ELOIGNE",
  },
  {
    nom: "Maubec",
    codeInsee: "84071",
    codesPostaux: ["84660"],
    kmDepuisOrange: 52,
    zone: "ELOIGNE",
  },
  {
    nom: "Mazan",
    codeInsee: "84072",
    codesPostaux: ["84380"],
    kmDepuisOrange: 34.5,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Ménerbes",
    codeInsee: "84073",
    codesPostaux: ["84560"],
    kmDepuisOrange: 58.7,
    zone: "ELOIGNE",
  },
  {
    nom: "Mérindol",
    codeInsee: "84074",
    codesPostaux: ["84360"],
    kmDepuisOrange: 63.3,
    zone: "ELOIGNE",
  },
  {
    nom: "Méthamis",
    codeInsee: "84075",
    codesPostaux: ["84570"],
    kmDepuisOrange: 47.1,
    zone: "ELOIGNE",
  },
  {
    nom: "Mirabeau",
    codeInsee: "84076",
    codesPostaux: ["84120"],
    kmDepuisOrange: 103,
    zone: "ELOIGNE",
  },
  {
    nom: "Modène",
    codeInsee: "84077",
    codesPostaux: ["84330"],
    kmDepuisOrange: 32.6,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Mondragon",
    codeInsee: "84078",
    codesPostaux: ["84430"],
    kmDepuisOrange: 17.4,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Monieux",
    codeInsee: "84079",
    codesPostaux: ["84390"],
    kmDepuisOrange: 55.1,
    zone: "ELOIGNE",
  },
  {
    nom: "Monteux",
    codeInsee: "84080",
    codesPostaux: ["84170"],
    kmDepuisOrange: 22.4,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Morières-lès-Avignon",
    codeInsee: "84081",
    codesPostaux: ["84310"],
    kmDepuisOrange: 29.3,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Mormoiron",
    codeInsee: "84082",
    codesPostaux: ["84570"],
    kmDepuisOrange: 39.6,
    zone: "ELOIGNE",
  },
  {
    nom: "Mornas",
    codeInsee: "84083",
    codesPostaux: ["84550"],
    kmDepuisOrange: 11.8,
    zone: "PROCHE",
  },
  {
    nom: "Murs",
    codeInsee: "84085",
    codesPostaux: ["84220"],
    kmDepuisOrange: 49.4,
    zone: "ELOIGNE",
  },
  {
    nom: "Oppède",
    codeInsee: "84086",
    codesPostaux: ["84580"],
    kmDepuisOrange: 54.9,
    zone: "ELOIGNE",
  },
  { nom: "Orange", codeInsee: "84087", codesPostaux: ["84100"], kmDepuisOrange: 0, zone: "ORANGE" },
  {
    nom: "Pernes-les-Fontaines",
    codeInsee: "84088",
    codesPostaux: ["84210"],
    kmDepuisOrange: 28.9,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Pertuis",
    codeInsee: "84089",
    codesPostaux: ["84120"],
    kmDepuisOrange: 94.8,
    zone: "ELOIGNE",
  },
  {
    nom: "Peypin-d'Aigues",
    codeInsee: "84090",
    codesPostaux: ["84240"],
    kmDepuisOrange: 88.7,
    zone: "ELOIGNE",
  },
  {
    nom: "Piolenc",
    codeInsee: "84091",
    codesPostaux: ["84420"],
    kmDepuisOrange: 8.5,
    zone: "PROCHE",
  },
  {
    nom: "Puget",
    codeInsee: "84093",
    codesPostaux: ["84360"],
    kmDepuisOrange: 67.2,
    zone: "ELOIGNE",
  },
  {
    nom: "Puyméras",
    codeInsee: "84094",
    codesPostaux: ["84110"],
    kmDepuisOrange: 39.1,
    zone: "ELOIGNE",
  },
  {
    nom: "Puyvert",
    codeInsee: "84095",
    codesPostaux: ["84160"],
    kmDepuisOrange: 74.7,
    zone: "ELOIGNE",
  },
  {
    nom: "Rasteau",
    codeInsee: "84096",
    codesPostaux: ["84110"],
    kmDepuisOrange: 23,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Richerenches",
    codeInsee: "84097",
    codesPostaux: ["84600"],
    kmDepuisOrange: 33.4,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Roaix",
    codeInsee: "84098",
    codesPostaux: ["84110"],
    kmDepuisOrange: 27.4,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Robion",
    codeInsee: "84099",
    codesPostaux: ["84440"],
    kmDepuisOrange: 49.7,
    zone: "ELOIGNE",
  },
  {
    nom: "Roussillon",
    codeInsee: "84102",
    codesPostaux: ["84220"],
    kmDepuisOrange: 58.3,
    zone: "ELOIGNE",
  },
  {
    nom: "Rustrel",
    codeInsee: "84103",
    codesPostaux: ["84400"],
    kmDepuisOrange: 72.5,
    zone: "ELOIGNE",
  },
  {
    nom: "Sablet",
    codeInsee: "84104",
    codesPostaux: ["84110"],
    kmDepuisOrange: 21.3,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Saignon",
    codeInsee: "84105",
    codesPostaux: ["84400"],
    kmDepuisOrange: 73.2,
    zone: "ELOIGNE",
  },
  {
    nom: "Saint-Christol",
    codeInsee: "84107",
    codesPostaux: ["84390"],
    kmDepuisOrange: 70.3,
    zone: "ELOIGNE",
  },
  {
    nom: "Saint-Didier",
    codeInsee: "84108",
    codesPostaux: ["84210"],
    kmDepuisOrange: 34.5,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Saint-Hippolyte-le-Graveyron",
    codeInsee: "84109",
    codesPostaux: ["84330"],
    kmDepuisOrange: 27.4,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Saint-Léger-du-Ventoux",
    codeInsee: "84110",
    codesPostaux: ["84390"],
    kmDepuisOrange: 48.2,
    zone: "ELOIGNE",
  },
  {
    nom: "Saint-Marcellin-lès-Vaison",
    codeInsee: "84111",
    codesPostaux: ["84110"],
    kmDepuisOrange: 33.5,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Saint-Martin-de-Castillon",
    codeInsee: "84112",
    codesPostaux: ["84750"],
    kmDepuisOrange: 80.4,
    zone: "ELOIGNE",
  },
  {
    nom: "Saint-Martin-de-la-Brasque",
    codeInsee: "84113",
    codesPostaux: ["84760"],
    kmDepuisOrange: 89.2,
    zone: "ELOIGNE",
  },
  {
    nom: "Saint-Pantaléon",
    codeInsee: "84114",
    codesPostaux: ["84220"],
    kmDepuisOrange: 53.7,
    zone: "ELOIGNE",
  },
  {
    nom: "Saint-Pierre-de-Vassols",
    codeInsee: "84115",
    codesPostaux: ["84330"],
    kmDepuisOrange: 34.5,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Saint-Romain-en-Viennois",
    codeInsee: "84116",
    codesPostaux: ["84110"],
    kmDepuisOrange: 35.1,
    zone: "ELOIGNE",
  },
  {
    nom: "Saint-Roman-de-Malegarde",
    codeInsee: "84117",
    codesPostaux: ["84290"],
    kmDepuisOrange: 24.7,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Saint-Saturnin-lès-Apt",
    codeInsee: "84118",
    codesPostaux: ["84490"],
    kmDepuisOrange: 59.9,
    zone: "ELOIGNE",
  },
  {
    nom: "Saint-Saturnin-lès-Avignon",
    codeInsee: "84119",
    codesPostaux: ["84450"],
    kmDepuisOrange: 26.8,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Saint-Trinit",
    codeInsee: "84120",
    codesPostaux: ["84390"],
    kmDepuisOrange: 67.2,
    zone: "ELOIGNE",
  },
  {
    nom: "Sainte-Cécile-les-Vignes",
    codeInsee: "84106",
    codesPostaux: ["84290"],
    kmDepuisOrange: 17.6,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Sannes",
    codeInsee: "84121",
    codesPostaux: ["84240"],
    kmDepuisOrange: 85.8,
    zone: "ELOIGNE",
  },
  {
    nom: "Sarrians",
    codeInsee: "84122",
    codesPostaux: ["84260"],
    kmDepuisOrange: 15.5,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Sault",
    codeInsee: "84123",
    codesPostaux: ["84390"],
    kmDepuisOrange: 58.9,
    zone: "ELOIGNE",
  },
  {
    nom: "Saumane-de-Vaucluse",
    codeInsee: "84124",
    codesPostaux: ["84800"],
    kmDepuisOrange: 41.5,
    zone: "ELOIGNE",
  },
  {
    nom: "Savoillan",
    codeInsee: "84125",
    codesPostaux: ["84390"],
    kmDepuisOrange: 57.1,
    zone: "ELOIGNE",
  },
  {
    nom: "Séguret",
    codeInsee: "84126",
    codesPostaux: ["84110"],
    kmDepuisOrange: 25.5,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Sérignan-du-Comtat",
    codeInsee: "84127",
    codesPostaux: ["84830"],
    kmDepuisOrange: 10.4,
    zone: "PROCHE",
  },
  {
    nom: "Sivergues",
    codeInsee: "84128",
    codesPostaux: ["84400"],
    kmDepuisOrange: 74.6,
    zone: "ELOIGNE",
  },
  {
    nom: "Sorgues",
    codeInsee: "84129",
    codesPostaux: ["84700"],
    kmDepuisOrange: 16.2,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Suzette",
    codeInsee: "84130",
    codesPostaux: ["84190"],
    kmDepuisOrange: 26.1,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Taillades",
    codeInsee: "84131",
    codesPostaux: ["84300"],
    kmDepuisOrange: 50.4,
    zone: "ELOIGNE",
  },
  {
    nom: "Travaillan",
    codeInsee: "84134",
    codesPostaux: ["84850"],
    kmDepuisOrange: 13.6,
    zone: "PROCHE",
  },
  {
    nom: "Uchaux",
    codeInsee: "84135",
    codesPostaux: ["84100"],
    kmDepuisOrange: 11.6,
    zone: "PROCHE",
  },
  {
    nom: "Vacqueyras",
    codeInsee: "84136",
    codesPostaux: ["84190"],
    kmDepuisOrange: 17.5,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Vaison-la-Romaine",
    codeInsee: "84137",
    codesPostaux: ["84110"],
    kmDepuisOrange: 29.9,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Valréas",
    codeInsee: "84138",
    codesPostaux: ["84600"],
    kmDepuisOrange: 40.1,
    zone: "ELOIGNE",
  },
  {
    nom: "Vaugines",
    codeInsee: "84140",
    codesPostaux: ["84160"],
    kmDepuisOrange: 77.9,
    zone: "ELOIGNE",
  },
  {
    nom: "Vedène",
    codeInsee: "84141",
    codesPostaux: ["84270"],
    kmDepuisOrange: 23.6,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Velleron",
    codeInsee: "84142",
    codesPostaux: ["84740"],
    kmDepuisOrange: 31.3,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Venasque",
    codeInsee: "84143",
    codesPostaux: ["84210"],
    kmDepuisOrange: 41.3,
    zone: "ELOIGNE",
  },
  {
    nom: "Viens",
    codeInsee: "84144",
    codesPostaux: ["84750"],
    kmDepuisOrange: 81.9,
    zone: "ELOIGNE",
  },
  {
    nom: "Villars",
    codeInsee: "84145",
    codesPostaux: ["84400"],
    kmDepuisOrange: 67.3,
    zone: "ELOIGNE",
  },
  {
    nom: "Villedieu",
    codeInsee: "84146",
    codesPostaux: ["84110"],
    kmDepuisOrange: 33.3,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Villelaure",
    codeInsee: "84147",
    codesPostaux: ["84530"],
    kmDepuisOrange: 85.5,
    zone: "ELOIGNE",
  },
  {
    nom: "Villes-sur-Auzon",
    codeInsee: "84148",
    codesPostaux: ["84570"],
    kmDepuisOrange: 46.1,
    zone: "ELOIGNE",
  },
  {
    nom: "Violès",
    codeInsee: "84149",
    codesPostaux: ["84150"],
    kmDepuisOrange: 16.3,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Visan",
    codeInsee: "84150",
    codesPostaux: ["84820"],
    kmDepuisOrange: 31.6,
    zone: "INTERMEDIAIRE",
  },
  {
    nom: "Vitrolles-en-Lubéron",
    codeInsee: "84151",
    codesPostaux: ["84240"],
    kmDepuisOrange: 91.1,
    zone: "ELOIGNE",
  },
] as const;

/** Index par code INSEE — construit une fois, la table ne change pas à l'exécution. */
const PAR_INSEE = new Map<string, CommuneLivrable>(VAUCLUSE_COMMUNES.map((c) => [c.codeInsee, c]));

/** Index par code postal. La valeur est une LISTE : 25 codes postaux du Vaucluse
 * en désignent plusieurs, et 84100 couvre Orange comme Uchaux. */
const PAR_CODE_POSTAL = new Map<string, CommuneLivrable[]>();
for (const commune of VAUCLUSE_COMMUNES) {
  for (const cp of commune.codesPostaux) {
    const liste = PAR_CODE_POSTAL.get(cp);
    if (liste) liste.push(commune);
    else PAR_CODE_POSTAL.set(cp, [commune]);
  }
}

/**
 * Forme comparable d'un nom de commune : sans accent, sans casse, tirets et
 * apostrophes réduits à des espaces. « Châteauneuf-du-Pape » se trouve donc en
 * tapant « chateauneuf du pape », « SAINT-SATURNIN » en tapant « st » non — la
 * recherche reste littérale, elle ne devine pas les abréviations.
 */
function normaliser(valeur: string): string {
  return valeur
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const RECHERCHE = VAUCLUSE_COMMUNES.map((commune) => ({
  commune,
  cle: normaliser(commune.nom),
}));

export function communeParInsee(codeInsee: string): CommuneLivrable | undefined {
  return PAR_INSEE.get(codeInsee.trim());
}

/** Communes portant ce code postal, dans l'ordre de la table (alphabétique). */
export function communesParCodePostal(codePostal: string): readonly CommuneLivrable[] {
  return PAR_CODE_POSTAL.get(codePostal.trim()) ?? [];
}

/**
 * Recherche pour l'auto-complétion. Les communes dont le nom COMMENCE par la
 * saisie passent devant celles qui la contiennent : quelqu'un qui tape « ora »
 * cherche Orange, pas Camaret-sur-Aigues.
 */
export function chercherCommunes(saisie: string, limite = 8): readonly CommuneLivrable[] {
  const q = normaliser(saisie);
  if (!q) return [];
  const debut: CommuneLivrable[] = [];
  const milieu: CommuneLivrable[] = [];
  for (const { commune, cle } of RECHERCHE) {
    if (cle.startsWith(q)) debut.push(commune);
    else if (cle.includes(q)) milieu.push(commune);
    if (debut.length >= limite) break;
  }
  return [...debut, ...milieu].slice(0, limite);
}

/** Ordre du moins cher au plus cher — sert à trancher un code postal ambigu. */
const ORDRE_TARIFAIRE: readonly CommuneLivrable["zone"][] = [
  "ORANGE",
  "PROCHE",
  "INTERMEDIAIRE",
  "ELOIGNE",
];

export interface ZoneDeduite {
  zone: DeliveryZone;
  /** Vrai quand le code postal désigne des communes de paliers DIFFÉRENTS. */
  ambigu: boolean;
  /** Communes candidates — à faire trancher par l'utilisateur quand `ambigu`. */
  candidates: readonly CommuneLivrable[];
}

/**
 * Palier déduit d'un code postal seul — chemin de REPLI, pour les fiches créées
 * avant que la commune ne soit choisie dans une liste fermée.
 *
 * Quand le code postal est à cheval sur deux paliers (7 cas dans le Vaucluse,
 * dont 84100 = Orange + Uchaux), on retient le MOINS CHER et on lève `ambigu`.
 * Deviner en faveur de l'entreprise reviendrait à facturer un client sur une
 * incertitude qui n'est pas la sienne ; l'application lui demande de confirmer
 * sa commune, et c'est ce choix-là qui fait ensuite foi.
 */
export function zoneParCodePostal(codePostal: string | null | undefined): ZoneDeduite {
  const candidates = communesParCodePostal(codePostal ?? "");
  if (candidates.length === 0) {
    return { zone: "HORS_ZONE", ambigu: false, candidates: [] };
  }
  const zones = new Set(candidates.map((c) => c.zone));
  const moinsChere = ORDRE_TARIFAIRE.find((z) => zones.has(z)) ?? "HORS_ZONE";
  return { zone: moinsChere, ambigu: zones.size > 1, candidates };
}

/** Vrai si la commune fait partie du périmètre livré (Vaucluse). */
export function estLivrable(codeInsee: string | null | undefined): boolean {
  return codeInsee ? PAR_INSEE.has(codeInsee.trim()) : false;
}
