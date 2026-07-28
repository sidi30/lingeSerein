"use client";

/**
 * Modale de création d'un client (établissement).
 *
 * Contrat API : POST /clients → { success, data: { client, temporaryPassword? } }.
 * L'API répond 409 CLIENT_DUPLICATE_PHONE si un client porte déjà ce téléphone ;
 * on laisse alors l'artisan choisir : ouvrir la fiche existante, ou forcer la
 * création (`force: true`) — deux établissements peuvent légitimement partager
 * un numéro (même propriétaire, deux gîtes).
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { AlertTriangle, Copy } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { RatingStars } from "@/components/clients/rating-stars";
import {
  CLIENT_SOURCE_LABELS,
  type ClientSource,
  type CreateClientInput,
  type CreateClientResult,
  type DeliveryZoneDTO,
} from "@/lib/types";
import { invalidateAfter } from "@/lib/query";

const inputCls =
  "w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base sm:py-2 sm:text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500";
const labelCls = "mb-1 block text-xs font-medium text-gray-700";

const ACCOMMODATION_TYPES = [
  { value: "HOTEL", label: "Hôtel" },
  { value: "GITE", label: "Gîte" },
  { value: "AIRBNB", label: "Airbnb" },
  { value: "AUBERGE", label: "Auberge" },
  { value: "AUTRE", label: "Autre" },
];

interface FormState {
  name: string;
  companyName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  postalCode: string;
  accommodationType: string;
  zoneId: string;
  preferredTimeSlot: string;
  rating: number | null;
  requirements: string;
  notes: string;
  source: ClientSource;
  grantAppAccess: boolean;
}

const EMPTY_FORM: FormState = {
  name: "",
  companyName: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  postalCode: "",
  accommodationType: "",
  zoneId: "",
  preferredTimeSlot: "",
  rating: null,
  requirements: "",
  notes: "",
  source: "ADMIN",
  grantAppAccess: false,
};

/**
 * L'id du doublon peut arriver sous plusieurs clés selon la façon dont le
 * service formate l'erreur ; on tolère les variantes plutôt que de perdre
 * l'action « voir la fiche existante ».
 */
function extractDuplicateId(err: ApiError): string | null {
  const payload = err.data as
    | {
        error?: {
          code?: string;
          details?: Record<string, unknown>;
          data?: Record<string, unknown>;
        };
      }
    | undefined;
  const bag = { ...(payload?.error?.details ?? {}), ...(payload?.error?.data ?? {}) };
  for (const key of ["clientId", "existingClientId", "id", "userId"]) {
    const value = bag[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

interface ClientCreateModalProps {
  open: boolean;
  onClose: () => void;
  /** Valeurs pré-remplies (ex. création depuis un devis). */
  initialValues?: Partial<FormState>;
  /** Appelé après création réussie. Par défaut : navigation vers la fiche. */
  onCreated?: (client: CreateClientResult["client"]) => void;
  title?: string;
}

export function ClientCreateModal({
  open,
  onClose,
  initialValues,
  onCreated,
  title = "Nouveau client",
}: ClientCreateModalProps) {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM, ...initialValues });
  const [duplicate, setDuplicate] = useState<{ message: string; clientId: string | null } | null>(
    null,
  );
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const { data: zones } = useQuery({
    queryKey: ["settings", "zones"],
    queryFn: () => api.get<DeliveryZoneDTO[]>("/settings/zones"),
    enabled: open,
  });

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const reset = () => {
    setForm({ ...EMPTY_FORM, ...initialValues });
    setDuplicate(null);
    setTempPassword(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const buildPayload = (force: boolean): CreateClientInput => {
    const trimmed = (v: string) => {
      const t = v.trim();
      return t.length > 0 ? t : undefined;
    };
    return {
      name: form.name.trim(),
      companyName: trimmed(form.companyName),
      email: trimmed(form.email),
      phone: trimmed(form.phone),
      address: trimmed(form.address),
      city: trimmed(form.city),
      postalCode: trimmed(form.postalCode),
      accommodationType: trimmed(form.accommodationType),
      zoneId: trimmed(form.zoneId),
      preferredTimeSlot: trimmed(form.preferredTimeSlot),
      rating: form.rating ?? undefined,
      requirements: trimmed(form.requirements),
      notes: trimmed(form.notes),
      source: form.source,
      grantAppAccess: form.grantAppAccess || undefined,
      force: force || undefined,
    };
  };

  const createMutation = useMutation({
    mutationFn: (force: boolean) => api.post<CreateClientResult>("/clients", buildPayload(force)),
    onSuccess: (result) => {
      void invalidateAfter(queryClient, "client");
      setDuplicate(null);

      // Un mot de passe temporaire ne se réaffiche jamais : on le garde à
      // l'écran tant que l'artisan n'a pas fermé lui-même la modale.
      if (result.temporaryPassword) {
        setTempPassword(result.temporaryPassword);
        toast("Client créé");
        return;
      }

      toast("Client créé");
      reset();
      onClose();
      if (onCreated) onCreated(result.client);
      else router.push(`/clients/${result.client.id}`);
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError && err.status === 409) {
        const code = (err as ApiError & { code?: string }).code;
        if (code === "CLIENT_DUPLICATE_PHONE") {
          setDuplicate({ message: err.message, clientId: extractDuplicateId(err) });
          return;
        }
      }
      toast(err instanceof Error ? err.message : "Erreur lors de la création", "error");
    },
  });

  const canSubmit = form.name.trim().length > 0;

  // ─── Écran « mot de passe temporaire » ───
  if (tempPassword) {
    return (
      <Modal open={open} onClose={handleClose} title="Accès application créé">
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            Transmettez ces identifiants au client. Le mot de passe ne sera plus affiché.
          </p>
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Mot de passe temporaire</p>
            <div className="mt-1 flex items-center justify-between gap-2">
              <code className="break-all text-sm font-semibold text-gray-900">{tempPassword}</code>
              <button
                type="button"
                aria-label="Copier le mot de passe"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-gray-200 sm:h-9 sm:w-9"
                onClick={() => {
                  void navigator.clipboard?.writeText(tempPassword);
                  toast("Mot de passe copié");
                }}
              >
                <Copy className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
          <Button className="w-full" onClick={handleClose}>
            J&apos;ai noté
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={handleClose} title={title} className="max-w-2xl">
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) createMutation.mutate(false);
        }}
      >
        {duplicate && (
          <div className="rounded-lg border border-warning-200 bg-warning-50 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-warning-600"
                aria-hidden="true"
              />
              <p className="text-sm text-warning-800">
                {duplicate.message || "Un client existe déjà avec ce numéro de téléphone."}
              </p>
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              {duplicate.clientId && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="w-full sm:w-auto"
                  onClick={() => {
                    const target = duplicate.clientId;
                    handleClose();
                    router.push(`/clients/${target}`);
                  }}
                >
                  Voir la fiche existante
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                className="w-full sm:w-auto"
                loading={createMutation.isPending}
                onClick={() => createMutation.mutate(true)}
              >
                Créer quand même
              </Button>
            </div>
          </div>
        )}

        {/* ─── Identité ─── */}
        <fieldset className="space-y-4">
          <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Identité
          </legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="client-name">
                Nom du contact <span className="text-danger-600">*</span>
              </label>
              <input
                id="client-name"
                className={inputCls}
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Marie Dupont"
                required
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="client-company">
                Établissement
              </label>
              <input
                id="client-company"
                className={inputCls}
                value={form.companyName}
                onChange={(e) => set("companyName", e.target.value)}
                placeholder="Gîte des Lilas"
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="client-email">
                Email
              </label>
              <input
                id="client-email"
                type="email"
                className={inputCls}
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="Facultatif"
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="client-phone">
                Téléphone
              </label>
              <input
                id="client-phone"
                type="tel"
                inputMode="tel"
                className={inputCls}
                value={form.phone}
                onChange={(e) => {
                  set("phone", e.target.value);
                  setDuplicate(null);
                }}
                placeholder="06 12 34 56 78"
              />
            </div>
          </div>
        </fieldset>

        {/* ─── Adresse ─── */}
        <fieldset className="space-y-4">
          <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Adresse
          </legend>
          <div>
            <label className={labelCls} htmlFor="client-address">
              Adresse
            </label>
            <input
              id="client-address"
              className={inputCls}
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder="12 rue des Fleurs"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={labelCls} htmlFor="client-postal">
                Code postal
              </label>
              <input
                id="client-postal"
                inputMode="numeric"
                className={inputCls}
                value={form.postalCode}
                onChange={(e) => set("postalCode", e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="client-city">
                Ville
              </label>
              <input
                id="client-city"
                className={inputCls}
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="client-zone">
                Zone
              </label>
              <select
                id="client-zone"
                className={inputCls}
                value={form.zoneId}
                onChange={(e) => set("zoneId", e.target.value)}
              >
                <option value="">Aucune</option>
                {(zones ?? []).map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </fieldset>

        {/* ─── Exploitation ─── */}
        <fieldset className="space-y-4">
          <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Exploitation
          </legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={labelCls} htmlFor="client-accommodation">
                Type d&apos;hébergement
              </label>
              <select
                id="client-accommodation"
                className={inputCls}
                value={form.accommodationType}
                onChange={(e) => set("accommodationType", e.target.value)}
              >
                <option value="">Non précisé</option>
                {ACCOMMODATION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="client-slot">
                Créneau préféré
              </label>
              <input
                id="client-slot"
                className={inputCls}
                value={form.preferredTimeSlot}
                onChange={(e) => set("preferredTimeSlot", e.target.value)}
                placeholder="08:00-10:00"
                maxLength={20}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="client-source">
                Origine
              </label>
              <select
                id="client-source"
                className={inputCls}
                value={form.source}
                onChange={(e) => set("source", e.target.value as ClientSource)}
              >
                {(Object.keys(CLIENT_SOURCE_LABELS) as ClientSource[]).map((s) => (
                  <option key={s} value={s}>
                    {CLIENT_SOURCE_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <span className={labelCls}>Appréciation</span>
            <RatingStars value={form.rating} onChange={(v) => set("rating", v)} />
          </div>

          <div>
            <label className={labelCls} htmlFor="client-requirements">
              Exigences particulières
            </label>
            <textarea
              id="client-requirements"
              rows={2}
              className={inputCls}
              value={form.requirements}
              onChange={(e) => set("requirements", e.target.value)}
              placeholder="Livraison par l'arrière, chien dans la cour..."
            />
          </div>

          <div>
            <label className={labelCls} htmlFor="client-notes">
              Notes internes
            </label>
            <textarea
              id="client-notes"
              rows={2}
              className={inputCls}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>
        </fieldset>

        {/* ─── Accès application ─── */}
        <div className="rounded-lg border border-gray-200 p-3">
          <label
            htmlFor="client-app-access"
            className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium text-gray-900"
          >
            <input
              id="client-app-access"
              type="checkbox"
              className="h-5 w-5 shrink-0 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              checked={form.grantAppAccess}
              onChange={(e) => set("grantAppAccess", e.target.checked)}
            />
            Donner accès à l&apos;application
          </label>
          <p className="mt-1 text-xs text-gray-500">
            Un mot de passe temporaire sera généré. Nécessite un email.
          </p>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            className="w-full sm:w-auto"
          >
            Annuler
          </Button>
          <Button
            type="submit"
            loading={createMutation.isPending}
            disabled={!canSubmit}
            className="w-full sm:w-auto"
          >
            Créer le client
          </Button>
        </div>
      </form>
    </Modal>
  );
}
