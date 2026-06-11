"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api } from "@/lib/api";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/lib/toast";
import { centsToEuros, eurosToCents } from "@/lib/format";
import type { DeliveryZoneDTO, OperatorDTO, StockThresholdDTO } from "@/lib/types";
import { Plus, Edit, Trash2, MapPin, Building2, Package } from "lucide-react";

type Tab = "zones" | "operateur" | "stock";

const inputCls =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500";
const labelCls = "block text-xs font-medium text-gray-700 mb-1";
const errorCls = "mt-1 text-xs text-danger-600";

/* ─── Zones ─── */

const zoneSchema = z.object({
  name: z.string().min(1, "Le nom est obligatoire").max(200),
  postalCodesInput: z.string().min(1, "Au moins un code postal est requis"),
  deliveryFeeEuros: z.coerce.number().min(0, "Le tarif ne peut pas être négatif"),
});
type ZoneValues = z.infer<typeof zoneSchema>;

function parsePostalCodes(input: string): string[] {
  return [
    ...new Set(
      input
        .split(/[\s,;]+/)
        .map((c) => c.trim())
        .filter((c) => /^\d{5}$/.test(c)),
    ),
  ];
}

function ZonesTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [zoneModal, setZoneModal] = useState<{
    open: boolean;
    zone?: DeliveryZoneDTO;
  }>({ open: false });
  const [confirmDeleteZone, setConfirmDeleteZone] = useState<string | null>(null);

  const { data: zones, isLoading } = useQuery({
    queryKey: ["zones"],
    queryFn: () => api.get<DeliveryZoneDTO[]>("/settings/zones"),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ZoneValues>({
    resolver: zodResolver(zoneSchema),
    defaultValues: { name: "", postalCodesInput: "", deliveryFeeEuros: 0 },
  });

  const openCreate = () => {
    reset({ name: "", postalCodesInput: "", deliveryFeeEuros: 0 });
    setZoneModal({ open: true });
  };

  const openEdit = (zone: DeliveryZoneDTO) => {
    reset({
      name: zone.name,
      postalCodesInput: zone.postalCodes.join(", "),
      deliveryFeeEuros: centsToEuros(zone.deliveryFeeCents),
    });
    setZoneModal({ open: true, zone });
  };

  const saveMutation = useMutation({
    mutationFn: (values: ZoneValues) => {
      const postalCodes = parsePostalCodes(values.postalCodesInput);
      if (postalCodes.length === 0) throw new Error("Aucun code postal valide (5 chiffres)");
      const payload = {
        name: values.name,
        postalCodes,
        deliveryFeeCents: eurosToCents(values.deliveryFeeEuros),
      };
      if (zoneModal.zone) {
        return api.patch<DeliveryZoneDTO>(`/settings/zones/${zoneModal.zone.id}`, payload);
      }
      return api.post<DeliveryZoneDTO>("/settings/zones", payload);
    },
    onSuccess: () => {
      toast(zoneModal.zone ? "Zone mise à jour" : "Zone créée");
      setZoneModal({ open: false });
      queryClient.invalidateQueries({ queryKey: ["zones"] });
    },
    onError: (err: unknown) => {
      toast(err instanceof Error ? err.message : "Erreur lors de l'enregistrement", "error");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (zoneId: string) => api.delete(`/settings/zones/${zoneId}`),
    onSuccess: () => {
      toast("Zone supprimée");
      setConfirmDeleteZone(null);
      queryClient.invalidateQueries({ queryKey: ["zones"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Erreur lors de la suppression";
      toast(msg, "error");
      setConfirmDeleteZone(null);
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">
          {(zones ?? []).length} zone{(zones ?? []).length > 1 ? "s" : ""}
        </p>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nouvelle zone
        </Button>
      </div>

      {isLoading ? (
        <div className="animate-pulse space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : (zones ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
          <MapPin className="mx-auto mb-2 h-8 w-8 text-gray-300" aria-hidden="true" />
          <p className="text-sm text-gray-500">Aucune zone de livraison configurée</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(zones ?? []).map((zone) => (
            <div
              key={zone.id}
              className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-gray-900">{zone.name}</p>
                  <Badge variant="info">
                    {zone.userCount} utilisateur{zone.userCount > 1 ? "s" : ""}
                  </Badge>
                  {zone.deliveryFeeCents > 0 && (
                    <Badge variant="neutral">
                      {centsToEuros(zone.deliveryFeeCents).toFixed(2)} €
                    </Badge>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {zone.postalCodes.slice(0, 10).map((cp) => (
                    <span
                      key={cp}
                      className="inline-block rounded-md bg-gray-100 px-2 py-0.5 text-xs font-mono text-gray-700"
                    >
                      {cp}
                    </span>
                  ))}
                  {zone.postalCodes.length > 10 && (
                    <span className="text-xs text-gray-400">+{zone.postalCodes.length - 10}</span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="secondary" size="sm" onClick={() => openEdit(zone)}>
                  <Edit className="h-4 w-4" aria-hidden="true" />
                  Modifier
                </Button>
                <Button variant="danger" size="sm" onClick={() => setConfirmDeleteZone(zone.id)}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal zone */}
      <Modal
        open={zoneModal.open}
        onClose={() => setZoneModal({ open: false })}
        title={zoneModal.zone ? "Modifier la zone" : "Nouvelle zone de livraison"}
      >
        <form
          onSubmit={handleSubmit((v: ZoneValues) => saveMutation.mutate(v))}
          className="space-y-4"
        >
          <div>
            <label className={labelCls} htmlFor="zone-name">
              Nom de la zone *
            </label>
            <input
              id="zone-name"
              className={inputCls}
              placeholder="Zone Orange"
              {...register("name")}
            />
            {errors.name && <p className={errorCls}>{errors.name.message}</p>}
          </div>
          <div>
            <label className={labelCls} htmlFor="zone-cp">
              Codes postaux{" "}
              <span className="text-xs text-gray-400">(séparés par virgule ou espace)</span>
            </label>
            <input
              id="zone-cp"
              className={inputCls}
              placeholder="84100, 84290, 84150"
              {...register("postalCodesInput")}
            />
            {errors.postalCodesInput && (
              <p className={errorCls}>{errors.postalCodesInput.message}</p>
            )}
          </div>
          <div>
            <label className={labelCls} htmlFor="zone-fee">
              Tarif de livraison (€)
            </label>
            <input
              id="zone-fee"
              type="number"
              min={0}
              step={0.01}
              className={inputCls}
              {...register("deliveryFeeEuros")}
            />
            {errors.deliveryFeeEuros && (
              <p className={errorCls}>{errors.deliveryFeeEuros.message}</p>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => setZoneModal({ open: false })}>
              Annuler
            </Button>
            <Button type="submit" loading={isSubmitting || saveMutation.isPending}>
              {zoneModal.zone ? "Enregistrer" : "Créer la zone"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!confirmDeleteZone}
        onClose={() => setConfirmDeleteZone(null)}
        onConfirm={() => confirmDeleteZone && deleteMutation.mutate(confirmDeleteZone)}
        loading={deleteMutation.isPending}
        variant="danger"
        title="Supprimer cette zone ?"
        description="Cette action est irréversible. Les utilisateurs rattachés devront être réaffectés au préalable."
        confirmLabel="Supprimer"
      />
    </div>
  );
}

/* ─── Opérateur ─── */

const operatorSchema = z.object({
  name: z.string().min(1, "Le nom est obligatoire").max(200),
  email: z.string().email("Format d'email invalide").max(320),
  phone: z.string().max(20).optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  siret: z
    .string()
    .regex(/^\d{14}$/, "Le SIRET doit contenir 14 chiffres")
    .optional()
    .or(z.literal("")),
  legalMentions: z.string().optional().or(z.literal("")),
});
type OperatorValues = z.infer<typeof operatorSchema>;

function OperateurTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: operator, isLoading } = useQuery({
    queryKey: ["operator"],
    queryFn: () => api.get<OperatorDTO>("/settings/operator"),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OperatorValues>({
    resolver: zodResolver(operatorSchema),
    values: operator
      ? {
          name: operator.name,
          email: operator.email,
          phone: operator.phone ?? "",
          address: operator.address ?? "",
          siret: operator.siret ?? "",
          legalMentions: operator.legalMentions ?? "",
        }
      : undefined,
  });

  const updateMutation = useMutation({
    mutationFn: (values: OperatorValues) =>
      api.patch<OperatorDTO>("/settings/operator", {
        name: values.name,
        email: values.email,
        phone: values.phone || undefined,
        address: values.address || undefined,
        siret: values.siret || undefined,
        legalMentions: values.legalMentions || undefined,
      }),
    onSuccess: () => {
      toast("Informations enregistrées");
      queryClient.invalidateQueries({ queryKey: ["operator"] });
    },
    onError: (err: unknown) => {
      toast(err instanceof Error ? err.message : "Erreur lors de l'enregistrement", "error");
    },
  });

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-10 rounded-lg bg-gray-100" />
        ))}
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit((v: OperatorValues) => updateMutation.mutate(v))}
      className="space-y-4 max-w-xl"
    >
      <div>
        <label className={labelCls} htmlFor="op-name">
          Nom de l&apos;entreprise *
        </label>
        <input id="op-name" className={inputCls} {...register("name")} />
        {errors.name && <p className={errorCls}>{errors.name.message}</p>}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="op-email">
            Email de contact *
          </label>
          <input id="op-email" type="email" className={inputCls} {...register("email")} />
          {errors.email && <p className={errorCls}>{errors.email.message}</p>}
        </div>
        <div>
          <label className={labelCls} htmlFor="op-phone">
            Téléphone
          </label>
          <input id="op-phone" type="tel" className={inputCls} {...register("phone")} />
        </div>
      </div>
      <div>
        <label className={labelCls} htmlFor="op-address">
          Adresse
        </label>
        <input id="op-address" className={inputCls} {...register("address")} />
      </div>
      <div>
        <label className={labelCls} htmlFor="op-siret">
          SIRET (14 chiffres)
        </label>
        <input
          id="op-siret"
          className={inputCls}
          placeholder="12345678901234"
          maxLength={14}
          {...register("siret")}
        />
        {errors.siret && <p className={errorCls}>{errors.siret.message}</p>}
      </div>
      <div>
        <label className={labelCls} htmlFor="op-legal">
          Mentions légales
        </label>
        <textarea
          id="op-legal"
          rows={3}
          className={inputCls}
          placeholder="TVA non applicable, art. 293 B du CGI..."
          {...register("legalMentions")}
        />
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={isSubmitting || updateMutation.isPending}>
          Enregistrer
        </Button>
      </div>
    </form>
  );
}

/* ─── Seuils stock ─── */

function StockTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [thresholds, setThresholds] = useState<Record<string, number>>({});

  const { data: products, isLoading } = useQuery({
    queryKey: ["stock-thresholds"],
    queryFn: () => api.get<StockThresholdDTO[]>("/settings/stock-thresholds"),
  });

  // Sync server data → local editable state (TQ v5 removed onSuccess callback)
  useEffect(() => {
    if (!products) return;
    const t: Record<string, number> = {};
    products.forEach((p) => {
      t[p.productId] = p.stockAlertThreshold;
    });
    setThresholds(t);
  }, [products]);

  const updateMutation = useMutation({
    mutationFn: () => {
      const entries = Object.entries(thresholds);
      if (entries.length === 0) return Promise.resolve([]);
      return api.patch<StockThresholdDTO[]>("/settings/stock-thresholds", {
        thresholds: entries.map(([productId, stockAlertThreshold]) => ({
          productId,
          stockAlertThreshold,
        })),
      });
    },
    onSuccess: () => {
      toast("Seuils enregistrés");
      queryClient.invalidateQueries({ queryKey: ["stock-thresholds"] });
    },
    onError: (err: unknown) => {
      toast(err instanceof Error ? err.message : "Erreur lors de l'enregistrement", "error");
    },
  });

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 rounded-xl bg-gray-100" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-lg">
      <p className="text-sm text-gray-500">
        Définissez le nombre minimum d&apos;unités en stock avant déclenchement d&apos;une alerte.
        Défaut : 3 unités.
      </p>

      {(products ?? []).map((p) => (
        <div
          key={p.productId}
          className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4"
        >
          <div>
            <p className="text-sm font-medium text-gray-900">{p.name}</p>
            <p className="text-xs text-gray-500">
              {p.range} · {p.category}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              className="h-9 w-20 rounded-lg border border-gray-300 px-2 text-center text-sm font-semibold focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              value={thresholds[p.productId] ?? p.stockAlertThreshold}
              onChange={(e) =>
                setThresholds((prev) => ({
                  ...prev,
                  [p.productId]: Math.max(0, parseInt(e.target.value) || 0),
                }))
              }
              aria-label={`Seuil pour ${p.name}`}
            />
            <span className="text-xs text-gray-400">unités</span>
          </div>
        </div>
      ))}

      <div className="flex justify-end">
        <Button loading={updateMutation.isPending} onClick={() => updateMutation.mutate()}>
          Enregistrer les seuils
        </Button>
      </div>
    </div>
  );
}

/* ─── Page principale ─── */

const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "zones", label: "Zones de livraison", icon: <MapPin className="h-4 w-4" /> },
  { id: "operateur", label: "Informations opérateur", icon: <Building2 className="h-4 w-4" /> },
  { id: "stock", label: "Alertes stock", icon: <Package className="h-4 w-4" /> },
];

export default function ReglagesPage() {
  const [activeTab, setActiveTab] = useState<Tab>("zones");

  return (
    <>
      <Header title="Réglages" />

      <div className="p-6">
        {/* Onglets */}
        <div className="mb-6 border-b border-gray-200">
          <div
            className="flex gap-1 overflow-x-auto"
            role="tablist"
            aria-label="Sections des réglages"
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                  activeTab === tab.id
                    ? "border-primary-600 text-primary-700"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Contenu */}
        <div
          id={`tab-${activeTab}`}
          role="tabpanel"
          aria-label={tabs.find((t) => t.id === activeTab)?.label}
        >
          {activeTab === "zones" && <ZonesTab />}
          {activeTab === "operateur" && <OperateurTab />}
          {activeTab === "stock" && <StockTab />}
        </div>
      </div>
    </>
  );
}
