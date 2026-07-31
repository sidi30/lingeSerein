"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { CATALOG_PRODUCTS, DETENTION_DAYS } from "@lingengo/shared";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { invalidateAfter } from "@/lib/query";
import { dayKey } from "@/lib/calendar";

/**
 * Créer une rotation à la main.
 *
 * Ce formulaire manquait, et son absence expliquait à elle seule un planning
 * définitivement vide : une rotation ne pouvait naître que d'un appel d'API ou
 * d'une facture, alors que le geste réel du propriétaire est « j'ai déposé du
 * linge chez ce client aujourd'hui ». L'écran affichait donc « Aucune rotation »
 * sans jamais offrir le moyen d'en avoir une.
 *
 * Le client est saisi en TEXTE et non choisi dans une liste : le modèle Rotation
 * est un instantané, et la moitié des clients réels (rencontrés sur un marché,
 * devis au téléphone) n'ont pas de compte. Exiger un compte fermerait la porte à
 * ceux-là.
 */

interface LigneSaisie {
  designation: string;
  productSlug: string;
  qtyLivree: number;
}

const FORMULES = [
  { value: "PONCTUEL", label: "Location ponctuelle" },
  { value: "ABONNEMENT", label: "Pack Sérénité" },
] as const;

const inputCls =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500";
const labelCls = "mb-1 block text-xs font-medium text-gray-700";

export function RotationCreateModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [clientNom, setClientNom] = useState("");
  const [clientAdresse, setClientAdresse] = useState("");
  const [dateLivraison, setDateLivraison] = useState(dayKey(new Date()));
  const [formule, setFormule] = useState<"PONCTUEL" | "ABONNEMENT">("PONCTUEL");
  const [lignes, setLignes] = useState<LigneSaisie[]>([]);

  const ajouter = (slug: string, nom: string) =>
    setLignes((l) => {
      const existante = l.find((x) => x.productSlug === slug);
      if (existante) {
        return l.map((x) => (x.productSlug === slug ? { ...x, qtyLivree: x.qtyLivree + 1 } : x));
      }
      return [...l, { designation: nom, productSlug: slug, qtyLivree: 1 }];
    });

  const mutation = useMutation({
    mutationFn: () =>
      api.post("/rotations", {
        clientNom: clientNom.trim(),
        clientAdresse: clientAdresse.trim() || undefined,
        dateLivraison,
        formule,
        lignes: lignes.map((l) => ({
          designation: l.designation,
          productSlug: l.productSlug,
          qtyLivree: l.qtyLivree,
        })),
      }),
    onSuccess: async () => {
      await invalidateAfter(queryClient, "rotation");
      toast("Rotation créée");
      onClose();
    },
    onError: (err: unknown) => {
      toast(err instanceof Error ? err.message : "Erreur lors de la création", "error");
    },
  });

  const pret = clientNom.trim().length > 0 && lignes.length > 0;

  return (
    <Modal open onClose={onClose} title="Nouvelle rotation" className="max-w-xl">
      <div className="space-y-4">
        <div>
          <label className={labelCls} htmlFor="rot-client">
            Client *
          </label>
          <input
            id="rot-client"
            className={inputCls}
            placeholder="Hôtel du Parc"
            value={clientNom}
            onChange={(e) => setClientNom(e.target.value)}
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="rot-adresse">
            Adresse
          </label>
          <input
            id="rot-adresse"
            className={inputCls}
            placeholder="12 avenue de l'Arc, 84100 Orange"
            value={clientAdresse}
            onChange={(e) => setClientAdresse(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="rot-date">
              Livré le *
            </label>
            <input
              id="rot-date"
              type="date"
              className={inputCls}
              value={dateLivraison}
              onChange={(e) => setDateLivraison(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="rot-formule">
              Formule
            </label>
            <select
              id="rot-formule"
              className={inputCls}
              value={formule}
              onChange={(e) => setFormule(e.target.value as "PONCTUEL" | "ABONNEMENT")}
            >
              {FORMULES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* La date de reprise n'est PAS saisie : elle se déduit de la formule
            (7 j en ponctuel, 14 j en Pack), et la laisser libre ouvrirait la
            porte à des détentions qui contredisent le contrat. */}
        <p className="text-xs text-gray-500">
          Reprise prévue automatiquement {DETENTION_DAYS[formule]} jours après la livraison, selon
          la formule.
        </p>

        <div>
          <p className={labelCls}>Linge déposé *</p>
          <div className="flex flex-wrap gap-1.5">
            {CATALOG_PRODUCTS.map((p) => (
              <button
                key={p.slug}
                type="button"
                onClick={() => ajouter(p.slug, p.name)}
                className="inline-flex items-center gap-1 rounded-full border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:border-primary-400 hover:bg-primary-50"
              >
                <Plus className="h-3 w-3" aria-hidden="true" />
                {p.name}
              </button>
            ))}
          </div>

          {lignes.length > 0 && (
            <ul className="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-200">
              {lignes.map((l) => (
                <li key={l.productSlug} className="flex items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-800">
                    {l.designation}
                  </span>
                  <input
                    type="number"
                    min={1}
                    aria-label={`Quantité ${l.designation}`}
                    className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-right text-sm"
                    value={l.qtyLivree}
                    onChange={(e) =>
                      setLignes((prev) =>
                        prev.map((x) =>
                          x.productSlug === l.productSlug
                            ? { ...x, qtyLivree: Math.max(1, Number(e.target.value) || 1) }
                            : x,
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    aria-label={`Retirer ${l.designation}`}
                    onClick={() =>
                      setLignes((prev) => prev.filter((x) => x.productSlug !== l.productSlug))
                    }
                    className="text-danger-600 hover:opacity-70"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!pret} loading={mutation.isPending}>
            Créer la rotation
          </Button>
        </div>
      </div>
    </Modal>
  );
}
