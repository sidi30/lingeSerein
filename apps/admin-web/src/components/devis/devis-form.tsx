"use client";

import { useState, useCallback, useMemo } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/lib/toast";
import { formatPrice, eurosToCents, centsToEuros } from "@/lib/format";
import { computeDevisTotals } from "@lingengo/shared";
import type { QuoteDTO, UserDTO } from "@/lib/types";
import { Plus, Trash2, ChevronUp, ChevronDown, Search } from "lucide-react";

/* ─── Catalogue quick-add ─── */

const CATALOG = [
  { name: "Kit Bain (drap de bain + serviette + tapis)", cents: 750 },
  { name: "Kit Lit (housse de couette + drap housse + taies)", cents: 1650 },
  { name: "Kit Complet (Bain + Lit groupés)", cents: 2200 },
  { name: "Serviette 50×90", cents: 450 },
  { name: "Drap de bain 70×150", cents: 650 },
  { name: "Tapis de bain 50×70", cents: 400 },
  { name: "Petite serviette 30×50", cents: 250 },
  { name: "Drap housse", cents: 750 },
  { name: "Housse de couette", cents: 900 },
];

/* ─── Schéma de validation ─── */

const lineSchema = z.object({
  designation: z.string().min(1, "La désignation est obligatoire").max(300),
  qty: z.coerce.number().int().min(1, "La quantité doit être supérieure à 0"),
  unitCentsEuros: z.coerce.number().min(0, "Le prix unitaire ne peut pas être négatif"),
  position: z.number().default(0),
});

const formSchema = z.object({
  clientNom: z.string().min(1, "Le nom du client est obligatoire").max(200),
  clientEmail: z.string().email("Format d'email invalide").max(320).optional().or(z.literal("")),
  clientTel: z.string().max(20).optional().or(z.literal("")),
  clientAdresse: z.string().max(500).optional().or(z.literal("")),
  userId: z.string().uuid("ID invalide").optional().or(z.literal("")),
  lignes: z.array(lineSchema).min(1, "Le devis doit contenir au moins une ligne"),
  remisePct: z.coerce.number().int().min(0).max(100).default(0),
  livraisonEuros: z.coerce.number().min(0).default(0),
  tvaApplicable: z.boolean().default(false),
  notes: z.string().max(5000).optional().or(z.literal("")),
  validiteJours: z.coerce.number().int().min(1).max(365).default(30),
});

type FormValues = z.infer<typeof formSchema>;

interface DevisFormProps {
  mode: "create" | "edit";
  initialData?: QuoteDTO;
  onSuccess: (id: string) => void;
  onCancel: () => void;
}

const inputCls =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500";
const labelCls = "block text-xs font-medium text-gray-700 mb-1";
const errorCls = "mt-1 text-xs text-danger-600";

export function DevisForm({ mode, initialData, onSuccess, onCancel }: DevisFormProps) {
  const { toast } = useToast();
  const [clientSearch, setClientSearch] = useState("");
  const [showClientSearch, setShowClientSearch] = useState(false);

  const defaultValues: Partial<FormValues> = initialData
    ? {
        clientNom: initialData.clientNom,
        clientEmail: initialData.clientEmail ?? "",
        clientTel: initialData.clientTel ?? "",
        clientAdresse: initialData.clientAdresse ?? "",
        userId: initialData.userId ?? "",
        lignes: initialData.lignes.map((l) => ({
          designation: l.designation,
          qty: l.qty,
          unitCentsEuros: centsToEuros(l.unitCents),
          position: l.position,
        })),
        remisePct: Math.round(initialData.remisePct / 100),
        livraisonEuros: centsToEuros(initialData.livraisonCents),
        tvaApplicable: initialData.tvaApplicable,
        notes: initialData.notes ?? "",
        validiteJours: initialData.validiteJours,
      }
    : {
        clientNom: "",
        clientEmail: "",
        clientTel: "",
        clientAdresse: "",
        userId: "",
        lignes: [{ designation: "", qty: 1, unitCentsEuros: 0, position: 0 }],
        remisePct: 0,
        livraisonEuros: 0,
        tvaApplicable: false,
        notes: "",
        validiteJours: 30,
      };

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultValues as FormValues,
  });

  const { fields, append, remove, move } = useFieldArray({ control, name: "lignes" });

  // Recherche client
  const { data: clientsData } = useQuery({
    queryKey: ["users-search", clientSearch],
    queryFn: () =>
      api.getRaw<{ success: boolean; data: UserDTO[] }>("/users", {
        search: clientSearch,
        role: "ROLE_CLIENT",
        limit: 10,
      }),
    enabled: clientSearch.length >= 2 && showClientSearch,
  });
  const clientSuggestions = clientsData?.data ?? [];

  // Calcul en temps réel
  const lignes = watch("lignes");
  const remisePct = watch("remisePct");
  const livraisonEuros = watch("livraisonEuros");
  const tvaApplicable = watch("tvaApplicable");

  const totals = useMemo(() => {
    const lines = lignes.map((l) => ({
      designation: l.designation,
      qty: l.qty,
      unitCents: eurosToCents(l.unitCentsEuros),
    }));
    return computeDevisTotals({
      numero: "",
      date: "",
      validiteJours: 30,
      client: { nom: "", etablissement: "", adresse: "", email: "", tel: "" },
      lines,
      remisePct: remisePct * 100, // en centièmes pour computeDevisTotals
      livraisonCents: eurosToCents(livraisonEuros),
      tvaApplicable,
      notes: "",
    });
  }, [lignes, remisePct, livraisonEuros, tvaApplicable]);

  // Mutation création / édition
  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = {
        clientNom: values.clientNom,
        clientEmail: values.clientEmail || undefined,
        clientTel: values.clientTel || undefined,
        clientAdresse: values.clientAdresse || undefined,
        userId: values.userId || undefined,
        lignes: values.lignes.map((l, i) => ({
          designation: l.designation,
          qty: l.qty,
          unitCents: eurosToCents(l.unitCentsEuros),
          position: i,
        })),
        remisePct: (values.remisePct ?? 0) * 100, // centièmes de %
        livraisonCents: eurosToCents(values.livraisonEuros),
        tvaApplicable: values.tvaApplicable,
        notes: values.notes || undefined,
        validiteJours: values.validiteJours,
      };
      if (mode === "create") {
        return api.post<QuoteDTO>("/quotes", payload);
      }
      if (!initialData?.id) return Promise.reject(new Error("ID devis manquant"));
      return api.patch<QuoteDTO>(`/quotes/${initialData.id}`, payload);
    },
    onSuccess: (result) => {
      toast(mode === "create" ? "Devis créé" : "Devis mis à jour");
      onSuccess(result.id);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Erreur lors de l'enregistrement";
      toast(msg, "error");
    },
  });

  const addCatalogItem = useCallback(
    (name: string, cents: number) => {
      append({
        designation: name,
        qty: 1,
        unitCentsEuros: centsToEuros(cents),
        position: fields.length,
      });
    },
    [append, fields.length],
  );

  const onSubmit = (values: FormValues) => {
    mutation.mutate(values);
  };

  const title =
    mode === "create" ? "Nouveau devis" : `Modifier le devis ${initialData?.numero ?? ""}`;

  return (
    <>
      <Header
        title={title}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onCancel}>
              Annuler
            </Button>
            <Button
              size="sm"
              loading={isSubmitting || mutation.isPending}
              onClick={handleSubmit(onSubmit)}
            >
              {mode === "create" ? "Créer le devis" : "Enregistrer"}
            </Button>
          </div>
        }
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 p-6">
        {/* ─── Client ─── */}
        <Card title="Client">
          {/* Recherche client existant */}
          <div className="mb-4">
            <label className={labelCls} htmlFor="client-search">
              Rechercher un client existant (optionnel)
            </label>
            <div className="relative">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                  aria-hidden="true"
                />
                <input
                  id="client-search"
                  type="text"
                  className={`${inputCls} pl-9`}
                  placeholder="Nom ou email du client..."
                  value={clientSearch}
                  onChange={(e) => {
                    setClientSearch(e.target.value);
                    setShowClientSearch(true);
                  }}
                  onFocus={() => setShowClientSearch(true)}
                  onBlur={() => setTimeout(() => setShowClientSearch(false), 200)}
                />
              </div>
              {showClientSearch && clientSuggestions.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
                  {clientSuggestions.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50"
                        onClick={() => {
                          setValue("userId", c.id);
                          setValue("clientNom", c.name);
                          setValue("clientEmail", c.email ?? "");
                          setValue("clientTel", c.phone ?? "");
                          setClientSearch(c.name);
                          setShowClientSearch(false);
                        }}
                      >
                        <span className="font-medium text-gray-900">{c.name}</span>
                        <span className="ml-2 text-gray-500">{c.email}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="clientNom">
                Nom du client <span className="text-danger-600">*</span>
              </label>
              <input
                id="clientNom"
                className={inputCls}
                placeholder="Marie-Claire Dupont"
                {...register("clientNom")}
                aria-describedby={errors.clientNom ? "clientNom-error" : undefined}
              />
              {errors.clientNom && (
                <p id="clientNom-error" className={errorCls}>
                  {errors.clientNom.message}
                </p>
              )}
            </div>

            <div>
              <label className={labelCls} htmlFor="clientEmail">
                Email
              </label>
              <input
                id="clientEmail"
                type="email"
                className={inputCls}
                placeholder="contact@hotel.fr"
                {...register("clientEmail")}
                aria-describedby={errors.clientEmail ? "clientEmail-error" : undefined}
              />
              {errors.clientEmail && (
                <p id="clientEmail-error" className={errorCls}>
                  {errors.clientEmail.message}
                </p>
              )}
            </div>

            <div>
              <label className={labelCls} htmlFor="clientTel">
                Téléphone
              </label>
              <input
                id="clientTel"
                type="tel"
                className={inputCls}
                placeholder="06 12 34 56 78"
                {...register("clientTel")}
              />
            </div>

            <div>
              <label className={labelCls} htmlFor="validiteJours">
                Validité (jours)
              </label>
              <input
                id="validiteJours"
                type="number"
                min={1}
                max={365}
                className={inputCls}
                {...register("validiteJours")}
              />
            </div>

            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="clientAdresse">
                Adresse
              </label>
              <input
                id="clientAdresse"
                className={inputCls}
                placeholder="12 rue de la Paix, 84100 Orange"
                {...register("clientAdresse")}
              />
            </div>
          </div>
        </Card>

        {/* ─── Ajout rapide catalogue ─── */}
        <Card title="Ajout rapide depuis le catalogue">
          <div className="flex flex-wrap gap-2">
            {CATALOG.map((c) => (
              <button
                key={c.name}
                type="button"
                onClick={() => addCatalogItem(c.name, c.cents)}
                className="inline-flex items-center gap-1 rounded-full border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-100"
              >
                <Plus className="h-3 w-3" aria-hidden="true" />
                {c.name.split(" (")[0]} · {formatPrice(c.cents)}
              </button>
            ))}
          </div>
        </Card>

        {/* ─── Lignes ─── */}
        <Card
          title="Lignes du devis"
          actions={
            <button
              type="button"
              onClick={() =>
                append({ designation: "", qty: 1, unitCentsEuros: 0, position: fields.length })
              }
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Ligne libre
            </button>
          }
        >
          {errors.lignes?.root && (
            <p className={`${errorCls} mb-3`}>{errors.lignes.root.message}</p>
          )}
          {errors.lignes?.message && <p className={`${errorCls} mb-3`}>{errors.lignes.message}</p>}

          {/* En-têtes */}
          <div className="mb-2 hidden grid-cols-[1fr_80px_100px_100px_80px_44px] gap-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 sm:grid">
            <span>Désignation</span>
            <span className="text-right">Qté</span>
            <span className="text-right">P.U. HT (€)</span>
            <span className="text-right">Total HT</span>
            <span className="text-center">Ordre</span>
            <span />
          </div>

          <div className="space-y-2">
            {fields.map((field, i) => {
              const qty = lignes[i]?.qty ?? 0;
              const unitCents = eurosToCents(lignes[i]?.unitCentsEuros ?? 0);
              const lineTotal = Math.round(qty * unitCents);
              return (
                <div
                  key={field.id}
                  className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_80px_100px_100px_80px_44px] items-start"
                >
                  <div>
                    <input
                      className={inputCls}
                      placeholder="Désignation"
                      {...register(`lignes.${i}.designation`)}
                      aria-label="Désignation"
                    />
                    {errors.lignes?.[i]?.designation && (
                      <p className={errorCls}>{errors.lignes[i]?.designation?.message}</p>
                    )}
                  </div>
                  <div>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      className={`${inputCls} text-right`}
                      {...register(`lignes.${i}.qty`)}
                      aria-label="Quantité"
                    />
                    {errors.lignes?.[i]?.qty && (
                      <p className={errorCls}>{errors.lignes[i]?.qty?.message}</p>
                    )}
                  </div>
                  <div>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      className={`${inputCls} text-right`}
                      {...register(`lignes.${i}.unitCentsEuros`)}
                      aria-label="Prix unitaire HT en euros"
                    />
                    {errors.lignes?.[i]?.unitCentsEuros && (
                      <p className={errorCls}>{errors.lignes[i]?.unitCentsEuros?.message}</p>
                    )}
                  </div>
                  <div className="hidden sm:flex items-center justify-end">
                    <span className="text-sm font-medium text-gray-900 tabular-nums">
                      {formatPrice(lineTotal)}
                    </span>
                  </div>
                  <div className="hidden sm:flex items-center justify-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => i > 0 && move(i, i - 1)}
                      disabled={i === 0}
                      className="flex h-8 w-8 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
                      aria-label="Monter la ligne"
                    >
                      <ChevronUp className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => i < fields.length - 1 && move(i, i + 1)}
                      disabled={i === fields.length - 1}
                      className="flex h-8 w-8 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
                      aria-label="Descendre la ligne"
                    >
                      <ChevronDown className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="hidden sm:flex items-center justify-center">
                    <button
                      type="button"
                      onClick={() => fields.length > 1 && remove(i)}
                      disabled={fields.length === 1}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-danger-50 hover:text-danger-600 disabled:opacity-30 transition-colors"
                      aria-label="Supprimer la ligne"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* ─── Conditions financières ─── */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card title="Conditions financières">
            <div className="space-y-4">
              <div>
                <label className={labelCls} htmlFor="remisePct">
                  Remise (%)
                </label>
                <input
                  id="remisePct"
                  type="number"
                  min={0}
                  max={100}
                  className={inputCls}
                  {...register("remisePct")}
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[0, 5, 10, 15].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setValue("remisePct", p)}
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                        Number(remisePct) === p
                          ? "border-primary-500 bg-primary-50 text-primary-700"
                          : "border-gray-300 text-gray-600 hover:border-gray-400"
                      }`}
                    >
                      {p === 0 ? "Aucune" : `-${p}%`}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className={labelCls} htmlFor="livraisonEuros">
                  Frais de livraison (€)
                </label>
                <input
                  id="livraisonEuros"
                  type="number"
                  min={0}
                  step={0.01}
                  className={inputCls}
                  {...register("livraisonEuros")}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="tvaApplicable"
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  {...register("tvaApplicable")}
                />
                <label htmlFor="tvaApplicable" className="text-sm text-gray-700">
                  Appliquer la TVA 20% (décoché = art. 293 B CGI)
                </label>
              </div>
            </div>
          </Card>

          {/* ─── Récapitulatif ─── */}
          <Card title="Récapitulatif">
            <dl className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-gray-500">Sous-total</dt>
                <dd className="font-medium text-gray-900 tabular-nums">
                  {formatPrice(totals.sousTotal)}
                </dd>
              </div>
              {totals.remise > 0 && (
                <div className="flex items-center justify-between">
                  <dt className="text-gray-500">Remise</dt>
                  <dd className="font-medium text-danger-600 tabular-nums">
                    -{formatPrice(totals.remise)}
                  </dd>
                </div>
              )}
              <div className="flex items-center justify-between">
                <dt className="text-gray-500">Livraison</dt>
                <dd className="font-medium text-gray-900 tabular-nums">
                  {totals.totalHT - (totals.sousTotal - totals.remise) === 0
                    ? "Offerte"
                    : formatPrice(totals.totalHT - (totals.sousTotal - totals.remise))}
                </dd>
              </div>
              <div className="flex items-center justify-between border-t border-gray-200 pt-2">
                <dt className="text-gray-500">Total HT</dt>
                <dd className="font-medium text-gray-900 tabular-nums">
                  {formatPrice(totals.totalHT)}
                </dd>
              </div>
              {tvaApplicable && (
                <div className="flex items-center justify-between">
                  <dt className="text-gray-500">TVA 20%</dt>
                  <dd className="font-medium text-gray-900 tabular-nums">
                    {formatPrice(totals.tva)}
                  </dd>
                </div>
              )}
              <div className="flex items-center justify-between rounded-lg bg-primary-50 px-3 py-2">
                <dt className="font-semibold text-primary-900">
                  {tvaApplicable ? "Total TTC" : "Total net"}
                </dt>
                <dd className="text-lg font-bold text-primary-700 tabular-nums">
                  {formatPrice(totals.totalTTC)}
                </dd>
              </div>
              {!tvaApplicable && (
                <p className="text-[10px] text-gray-400">TVA non applicable, art. 293 B du CGI</p>
              )}
            </dl>
          </Card>
        </div>

        {/* ─── Notes ─── */}
        <Card title="Notes et observations">
          <div>
            <label className={labelCls} htmlFor="notes">
              Notes internes / conditions particulières
            </label>
            <textarea
              id="notes"
              rows={3}
              className={inputCls}
              placeholder="Ex : tarif dégressif dès 4 kits, fréquence de rotation convenue..."
              {...register("notes")}
            />
          </div>
        </Card>

        {/* Boutons actions répétés en bas */}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={onCancel}>
            Annuler
          </Button>
          <Button type="submit" loading={isSubmitting || mutation.isPending}>
            {mode === "create" ? "Créer le devis" : "Enregistrer les modifications"}
          </Button>
        </div>
      </form>
    </>
  );
}
