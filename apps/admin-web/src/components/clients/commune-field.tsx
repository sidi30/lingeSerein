"use client";

/**
 * Commune livrée — choisie dans la liste FERMÉE des 151 communes du Vaucluse.
 *
 * Ce champ remplace la ville en texte libre parce que le prix en dépend. Le
 * palier se déduisait du seul code postal, que le client édite lui-même depuis
 * son profil : saisir « 84100 » suffisait à s'offrir le tarif d'Orange. Et un
 * code postal ne désigne pas une commune — 84100 couvre Orange ET Uchaux, sept
 * codes postaux du Vaucluse chevauchent deux paliers. Le code INSEE est le seul
 * identifiant stable, c'est lui que ce champ renseigne.
 *
 * Une commune hors Vaucluse n'est pas proposée : ce n'est pas un oubli de la
 * liste, c'est le périmètre de livraison.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, MapPin, Search, X } from "lucide-react";
import { DELIVERY_ZONE_LABELS, chercherCommunes, type CommuneLivrable } from "@lingengo/shared";
import { DELIVERY_ZONE_OPTIONS, clientZone, zoneTarifText } from "@/lib/delivery-zones";

const inputCls =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 sm:py-2 sm:text-sm";
const labelCls = "mb-1 block text-xs font-medium text-gray-700";

/** Valeurs portées par le champ — la commune décide des trois. */
export interface CommuneValue {
  communeInsee: string;
  city: string;
  postalCode: string;
}

interface CommuneFieldProps {
  /** Préfixe des `id` : deux instances peuvent cohabiter (fiche + modale). */
  idPrefix: string;
  value: CommuneValue;
  onChange: (next: CommuneValue) => void;
}

/** Tarif du palier d'une commune, en toutes lettres (« incluse », « 12,00 € »). */
function tarifDe(commune: CommuneLivrable): string {
  const option = DELIVERY_ZONE_OPTIONS.find((o) => o.zone === commune.zone);
  return zoneTarifText(option?.cents ?? null);
}

/**
 * Code postal à retenir pour une commune. Celui déjà saisi est conservé s'il
 * appartient bien à la commune — Avignon en porte deux (84000 et 84140), et
 * écraser le bon par le premier de la liste ferait perdre une adresse exacte.
 */
function codePostalPour(commune: CommuneLivrable, actuel: string): string {
  const cp = actuel.trim();
  if (cp && commune.codesPostaux.includes(cp)) return cp;
  return commune.codesPostaux[0] ?? "";
}

export function CommuneField({ idPrefix, value, onChange }: CommuneFieldProps) {
  const [saisie, setSaisie] = useState("");
  const [ouvert, setOuvert] = useState(false);

  const deduite = useMemo(
    () => clientZone({ communeInsee: value.communeInsee, postalCode: value.postalCode }),
    [value.communeInsee, value.postalCode],
  );
  const confirmee = deduite.source === "commune" ? deduite.commune : null;

  const suggestions = useMemo(() => chercherCommunes(saisie), [saisie]);

  const choisir = (commune: CommuneLivrable) => {
    onChange({
      communeInsee: commune.codeInsee,
      city: commune.nom,
      postalCode: codePostalPour(commune, value.postalCode),
    });
    setSaisie("");
    setOuvert(false);
  };

  const effacer = () => {
    onChange({ ...value, communeInsee: "" });
    setSaisie("");
  };

  // ─── Commune confirmée : plus rien à choisir, le palier est certain ───
  if (confirmee) {
    return (
      <div>
        <span className={labelCls}>Commune livrée</span>
        <div className="flex items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2">
          <span className="flex min-w-0 items-center gap-2 text-sm text-gray-900">
            <MapPin className="h-4 w-4 shrink-0 text-primary-600" aria-hidden="true" />
            <span className="truncate font-medium">{confirmee.nom}</span>
            <span className="shrink-0 text-gray-500">{confirmee.codesPostaux.join(" · ")}</span>
          </span>
          <button
            type="button"
            onClick={effacer}
            className="flex h-9 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Changer
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Livraison {tarifDe(confirmee)} — {DELIVERY_ZONE_LABELS[confirmee.zone]}
        </p>
      </div>
    );
  }

  // ─── Aucune commune confirmée : recherche, et arbitrage du code postal ───
  return (
    <div>
      <label className={labelCls} htmlFor={`${idPrefix}-commune`}>
        Commune livrée
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
          aria-hidden="true"
        />
        <input
          id={`${idPrefix}-commune`}
          type="text"
          autoComplete="off"
          className={`${inputCls} pl-9`}
          placeholder="Orange, Avignon, Cavaillon..."
          value={saisie}
          onChange={(e) => {
            setSaisie(e.target.value);
            setOuvert(true);
          }}
          onFocus={() => setOuvert(true)}
          onBlur={() => setTimeout(() => setOuvert(false), 200)}
        />
        {ouvert && saisie.trim().length > 0 && (
          <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
            {suggestions.length === 0 ? (
              <li className="px-4 py-2.5 text-sm text-gray-500">
                Aucune commune du Vaucluse ne porte ce nom — hors périmètre livré.
              </li>
            ) : (
              suggestions.map((commune) => (
                <li key={commune.codeInsee}>
                  <button
                    type="button"
                    className="flex w-full items-baseline justify-between gap-2 px-4 py-2.5 text-left text-sm hover:bg-gray-50"
                    onClick={() => choisir(commune)}
                  >
                    <span className="truncate font-medium text-gray-900">{commune.nom}</span>
                    <span className="shrink-0 text-xs text-gray-500">
                      {commune.codesPostaux.join(" · ")} · {tarifDe(commune)}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      {/* Fiche antérieure à la liste fermée : on propose de confirmer, on ne
          choisit pas. Un code postal à cheval sur deux paliers (84100 : Orange
          à 0 €, Uchaux à 12 €) se tranche par l'admin, jamais en silence. */}
      {deduite.candidates.length > 0 && (
        <div
          className={`mt-2 rounded-lg border p-2.5 text-xs ${
            deduite.ambigu
              ? "border-warning-500/40 bg-warning-50 text-warning-600"
              : "border-gray-200 bg-gray-50 text-gray-600"
          }`}
        >
          <p className="flex items-start gap-1.5 font-medium">
            {deduite.ambigu && (
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            )}
            {deduite.ambigu
              ? `Le code postal ${value.postalCode} couvre des communes de paliers différents — confirmez laquelle :`
              : "Commune déduite du code postal, à confirmer :"}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {deduite.candidates.map((commune) => (
              <button
                key={commune.codeInsee}
                type="button"
                onClick={() => choisir(commune)}
                className="rounded-full border border-gray-300 bg-white px-2.5 py-1 font-medium text-gray-700 hover:border-primary-400 hover:bg-primary-50"
              >
                {commune.nom} · {tarifDe(commune)}
              </button>
            ))}
          </div>
        </div>
      )}

      {deduite.source === "codePostal" && deduite.candidates.length === 0 && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-warning-600">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {value.postalCode} n&apos;est pas un code postal du Vaucluse : cette adresse n&apos;est
          pas desservie, la course sera à chiffrer sur devis.
        </p>
      )}

      {value.city.trim() && (
        <p className="mt-1 text-xs text-gray-500">
          Ville enregistrée : {value.city} — sans commune confirmée, le palier de livraison reste
          déduit du code postal.
        </p>
      )}
    </div>
  );
}
