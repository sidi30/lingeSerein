"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PhoneCall, Truck } from "lucide-react";
import { PASSAGE_GROUPE } from "@lingengo/shared";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { addDays, dayKey } from "@/lib/calendar";

/**
 * Passages groupés — ce que les clients ont répondu.
 *
 * L'écran existe pour une raison simple : sans lui, les réponses des clients
 * n'existeraient nulle part pour le propriétaire. Le cron prévient les clients
 * la veille à 18 h 05 ; ce panneau est l'autre bout du fil, celui où l'on
 * décide d'ajouter un arrêt à la tournée.
 *
 * Le bouton « Réponse par téléphone » n'est pas un confort : la plupart des
 * hôteliers rappellent au lieu d'ouvrir l'application, et une réponse orale non
 * enregistrée ne remonte à personne.
 */

type PassageKind = "LIVRAISON" | "REPRISE" | "LIVRAISON_ET_REPRISE" | "AUCUN";

interface PassageReponse {
  id: string;
  userId: string;
  clientNom: string;
  kind: PassageKind;
  source: "MOBILE" | "TELEPHONE" | "ADMIN";
  message: string | null;
  createdAt: string;
}

interface PassageOpportunite {
  id: string;
  communeInsee: string;
  communeNom: string;
  date: string;
  expiresAt: string;
  reponses: PassageReponse[];
  interesses: number;
}

const KIND_LABELS: Record<PassageKind, string> = {
  LIVRAISON: "Veut du linge propre",
  REPRISE: "Rend son linge sale",
  LIVRAISON_ET_REPRISE: "Rend son sale + veut du propre",
  AUCUN: "Décline",
};

const KIND_VARIANT: Record<PassageKind, "success" | "warning" | "neutral"> = {
  LIVRAISON: "success",
  REPRISE: "warning",
  LIVRAISON_ET_REPRISE: "success",
  AUCUN: "neutral",
};

export function PassagesPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [saisie, setSaisie] = useState<PassageOpportunite | null>(null);

  // Fenêtre volontairement courte : une proposition ne vit que jusqu'au départ
  // du camion, en relire un mois n'apprendrait rien d'actionnable.
  const range = useMemo(() => {
    const today = new Date();
    return { from: dayKey(today), to: dayKey(addDays(today, 14)) };
  }, []);

  const { data, isLoading } = useQuery<PassageOpportunite[]>({
    queryKey: ["passages", range.from, range.to],
    queryFn: async () => {
      try {
        return await api.get<PassageOpportunite[]>(`/passages?from=${range.from}&to=${range.to}`);
      } catch {
        // Route absente (serveur en retard de déploiement) : le panneau se tait
        // au lieu de casser l'onglet Tournées, qui reste utilisable.
        return [];
      }
    },
  });

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (!data || data.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Truck className="h-4 w-4 text-gray-400" aria-hidden="true" />
          Passages groupés
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          Aucune proposition ouverte. Elles s&apos;ouvrent automatiquement la veille à{" "}
          {PASSAGE_GROUPE.NOTIFY_HOUR} h, pour chaque commune où une tournée est planifiée.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.map((passage) => (
        <div key={passage.id} className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-900">
              {passage.communeNom} — {new Date(passage.date).toLocaleDateString("fr-FR")}
            </h3>
            <div className="flex items-center gap-2">
              <Badge variant={passage.interesses > 0 ? "success" : "neutral"}>
                {passage.interesses} intéressé{passage.interesses > 1 ? "s" : ""}
              </Badge>
              <Button variant="secondary" size="sm" onClick={() => setSaisie(passage)}>
                <PhoneCall className="h-4 w-4" aria-hidden="true" />
                Réponse par téléphone
              </Button>
            </div>
          </div>

          <p className="mt-1 text-xs text-gray-500">
            Livraison à −{PASSAGE_GROUPE.DISCOUNT_PCT} % pour ces clients, reprise du linge sale
            gratuite. Valable jusqu&apos;au départ du camion.
          </p>

          {passage.reponses.length === 0 ? (
            <p className="mt-3 text-sm text-gray-400">Personne n&apos;a encore répondu.</p>
          ) : (
            <ul className="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-200">
              {passage.reponses.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-800">
                    {r.clientNom}
                    {r.message && <span className="text-gray-500"> — {r.message}</span>}
                  </span>
                  <Badge variant={KIND_VARIANT[r.kind]}>{KIND_LABELS[r.kind]}</Badge>
                  {r.source !== "MOBILE" && (
                    <span className="text-[11px] text-gray-400">par téléphone</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      {saisie && (
        <SaisieTelephone
          passage={saisie}
          onClose={() => setSaisie(null)}
          onSaved={() => {
            void queryClient.invalidateQueries({ queryKey: ["passages"] });
            toast("Réponse enregistrée");
            setSaisie(null);
          }}
        />
      )}
    </div>
  );
}

interface ClientOption {
  id: string;
  name: string;
}

function SaisieTelephone({
  passage,
  onClose,
  onSaved,
}: {
  passage: PassageOpportunite;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [userId, setUserId] = useState("");
  const [kind, setKind] = useState<PassageKind>("LIVRAISON_ET_REPRISE");
  const [message, setMessage] = useState("");

  // Les clients de la commune concernée : proposer tout le fichier client
  // obligerait à chercher, alors que l'appel dure trente secondes.
  const { data: clients } = useQuery<ClientOption[]>({
    queryKey: ["clients", "commune", passage.communeInsee],
    queryFn: async () => {
      const res = await api.get<{ data: ClientOption[] } | ClientOption[]>(
        `/clients?communeInsee=${passage.communeInsee}&limit=100`,
      );
      return Array.isArray(res) ? res : res.data;
    },
  });

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/passages/${passage.id}/reponse-client`, {
        userId,
        kind,
        message: message.trim() || null,
        source: "TELEPHONE",
      }),
    onSuccess: onSaved,
    onError: (err: unknown) => {
      toast(err instanceof Error ? err.message : "Erreur lors de l'enregistrement", "error");
    },
  });

  return (
    <Modal open onClose={onClose} title={`Réponse par téléphone — ${passage.communeNom}`}>
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700" htmlFor="passage-client">
            Client
          </label>
          <select
            id="passage-client"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          >
            <option value="">Choisir…</option>
            {(clients ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700" htmlFor="passage-kind">
            Ce qu&apos;il demande
          </label>
          <select
            id="passage-kind"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={kind}
            onChange={(e) => setKind(e.target.value as PassageKind)}
          >
            {(Object.keys(KIND_LABELS) as PassageKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700" htmlFor="passage-message">
            Précisions
          </label>
          <input
            id="passage-message"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="4 kits bain, après 14 h…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!userId} loading={mutation.isPending}>
            Enregistrer
          </Button>
        </div>
      </div>
    </Modal>
  );
}
