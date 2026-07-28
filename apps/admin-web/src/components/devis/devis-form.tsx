"use client";

import { useState, useCallback, useMemo } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/lib/toast";
import { formatPrice, eurosToCents, centsToEuros } from "@/lib/format";
import {
  CATALOG_PRODUCTS,
  computeDeliveryFee,
  computeDevisTotals,
  countKits,
  DELIVERY_ZONE_LABELS,
  URGENCY_TIERS,
  urgencyTier,
} from "@lingengo/shared";
import type { DeliveryZone, UrgencyLevel } from "@lingengo/shared";
import type { QuoteDTO, UserDTO } from "@/lib/types";
import { useStockBySlug } from "@/lib/rotations";
import { AlertTriangle, Plus, Trash2, ChevronUp, ChevronDown, Search } from "lucide-react";
import { invalidateAfter } from "@/lib/query";

/* ─── Catalogue quick-add ───
 * Dérivé du catalogue canonique (@lingengo/shared) : aucun prix n'est retapé ici,
 * une évolution tarifaire se propage automatiquement au formulaire. */

const CATALOG = CATALOG_PRODUCTS.map((p) => ({
  slug: p.slug,
  label: p.name,
  designation: `${p.name} — ${p.description}`,
  cents: p.priceCents,
}));

/**
 * Retrouve la référence catalogue d'une ligne à partir de sa désignation.
 *
 * Les lignes de devis restent du texte libre (l'admin doit pouvoir écrire ce
 * qu'il veut) : le rapprochement avec le stock se fait donc sur le préfixe du
 * nom, ce que produit l'ajout rapide. Les noms les plus longs sont testés en
 * premier, sinon « Kit Complet (Bain + Lit) » serait capté par « Kit Bain ».
 */
const CATALOG_BY_NAME_LENGTH = [...CATALOG_PRODUCTS].sort((a, b) => b.name.length - a.name.length);

function matchCatalogSlug(designation: string): string | null {
  const needle = designation.trim().toLowerCase();
  if (!needle) return null;
  return CATALOG_BY_NAME_LENGTH.find((p) => needle.startsWith(p.name.toLowerCase()))?.slug ?? null;
}

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
  const queryClient = useQueryClient();
  const [clientSearch, setClientSearch] = useState("");
  const [showClientSearch, setShowClientSearch] = useState(false);

  // Barème de livraison : urgence + zone → montant. En édition, on part du montant
  // déjà enregistré (ni l'urgence ni la zone ne sont persistées) et on ne l'écrase
  // pas tant que l'utilisateur ne touche pas au barème.
  const [urgency, setUrgency] = useState<UrgencyLevel>("STANDARD");
  const [zoneLivraison, setZoneLivraison] = useState<DeliveryZone>("PROCHE");

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

  // Tarif de livraison calculé par le barème : forfait d'urgence (Express 24 h /
  // Jour même), sinon barème de zone. Flash < 3 h et hors zone → sur devis.
  const deliveryFee = useMemo(() => {
    const lines = lignes.map((l) => ({
      designation: l.designation,
      qty: Number(l.qty) || 0,
      unitCents: eurosToCents(l.unitCentsEuros),
    }));
    const sousTotal = lines.reduce((s, l) => s + Math.round(l.qty * l.unitCents), 0);
    const remise = Math.round((sousTotal * ((Number(remisePct) || 0) * 100)) / 10000);
    return computeDeliveryFee({
      urgency,
      zone: zoneLivraison,
      montantApresRemiseCents: sousTotal - remise,
      nbKits: countKits(lines),
    });
  }, [lignes, remisePct, urgency, zoneLivraison]);

  const selectedTier = urgencyTier(urgency);

  /** Applique le tarif du barème au champ « frais de livraison ». */
  const applyDeliveryFee = useCallback(
    (fee: { cents: number }) => setValue("livraisonEuros", centsToEuros(fee.cents)),
    [setValue],
  );

  const feeApplied = eurosToCents(Number(livraisonEuros) || 0) === deliveryFee.cents;

  /* ─── Disponibilité du stock ───
   * Avertissement seulement : survendre est une décision légitime (l'admin sait
   * qu'il rachètera), mais il doit la prendre en connaissance de cause. */
  const { items: stockItems, available: stockAvailable } = useStockBySlug();

  const stockBySlug = useMemo(
    () => new Map(stockItems.map((item) => [item.productSlug, item])),
    [stockItems],
  );

  /** Quantité demandée par référence, CUMULÉE sur toutes les lignes du devis. */
  const demandBySlug = useMemo(() => {
    const map = new Map<string, number>();
    for (const ligne of lignes) {
      const slug = matchCatalogSlug(ligne.designation);
      if (!slug) continue;
      map.set(slug, (map.get(slug) ?? 0) + (Number(ligne.qty) || 0));
    }
    return map;
  }, [lignes]);

  /** Références dont la demande dépasse le disponible. */
  const overbooked = useMemo(() => {
    const out: { slug: string; name: string; demande: number; disponible: number }[] = [];
    for (const [slug, demande] of demandBySlug) {
      const item = stockBySlug.get(slug);
      if (item && demande > item.disponible) {
        out.push({ slug, name: item.name, demande, disponible: item.disponible });
      }
    }
    return out;
  }, [demandBySlug, stockBySlug]);

  const availableCatalog = useMemo(
    () =>
      CATALOG.map((entry) => ({ ...entry, stock: stockBySlug.get(entry.slug) }))
        .filter((entry) => (entry.stock?.disponible ?? 0) > 0)
        .sort((a, b) => (b.stock?.disponible ?? 0) - (a.stock?.disponible ?? 0)),
    [stockBySlug],
  );

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
    onSuccess: async (result) => {
      toast(mode === "create" ? "Devis créé" : "Devis mis à jour");
      // Avant `onSuccess`, qui navigue : sans cette attente, la liste des devis
      // restait sur son cache et le devis tout juste créé en était absent.
      await invalidateAfter(queryClient, "quote");
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
                key={c.designation}
                type="button"
                onClick={() => addCatalogItem(c.designation, c.cents)}
                className="inline-flex items-center gap-1 rounded-full border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-100"
              >
                <Plus className="h-3 w-3" aria-hidden="true" />
                {c.label} · {formatPrice(c.cents)}
              </button>
            ))}
          </div>
        </Card>

        {/* ─── Ajout depuis le stock réellement disponible ─── */}
        {stockAvailable && availableCatalog.length > 0 && (
          <Card title="Ajouter depuis le stock disponible">
            <p className="mb-3 text-xs text-gray-500">
              Seules les références qu&apos;il reste en parc, de la plus fournie à la plus tendue.
            </p>
            <div className="flex flex-wrap gap-2">
              {availableCatalog.map((entry) => (
                <button
                  key={entry.slug}
                  type="button"
                  onClick={() => addCatalogItem(entry.designation, entry.cents)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-success-500/40 bg-success-50 px-3 py-1.5 text-xs font-medium text-success-600 transition-colors hover:bg-success-50/70"
                >
                  <Plus className="h-3 w-3" aria-hidden="true" />
                  {entry.label}
                  <span className="rounded-full bg-white/70 px-1.5 py-0.5 tabular-nums">
                    {entry.stock?.disponible} dispo
                  </span>
                </button>
              ))}
            </div>
          </Card>
        )}

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

          {/* Avertissement NON bloquant : le devis reste enregistrable. */}
          {overbooked.length > 0 && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-warning-500/40 bg-warning-50 p-3 text-xs text-warning-600">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-medium">
                  {overbooked.length} référence{overbooked.length > 1 ? "s" : ""} au-delà du stock
                  disponible
                </p>
                <ul className="mt-1 space-y-0.5">
                  {overbooked.map((o) => (
                    <li key={o.slug}>
                      {o.name} : {o.demande} demandé{o.demande > 1 ? "s" : ""} pour {o.disponible}{" "}
                      en stock
                    </li>
                  ))}
                </ul>
                <p className="mt-1 opacity-80">
                  Le devis reste valide — prévoyez le rachat ou décalez la date de livraison.
                </p>
              </div>
            </div>
          )}

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
              const slug = matchCatalogSlug(lignes[i]?.designation ?? "");
              const stockItem = slug ? stockBySlug.get(slug) : undefined;
              // On compare au CUMUL du devis : deux lignes du même article
              // puisent dans le même parc.
              const demande = slug ? (demandBySlug.get(slug) ?? 0) : 0;
              const depasse = stockItem ? demande > stockItem.disponible : false;
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
                    {stockItem && (
                      <p
                        className={`mt-1 text-[11px] ${depasse ? "font-medium text-warning-600" : "text-gray-500"}`}
                      >
                        {depasse ? (
                          <>
                            Dépasse le stock : {demande} demandé{demande > 1 ? "s" : ""} pour{" "}
                            {stockItem.disponible} disponible
                            {stockItem.disponible > 1 ? "s" : ""}
                          </>
                        ) : (
                          <>
                            Disponible : {stockItem.disponible} en parc
                            {stockItem.inCirculation > 0
                              ? ` · ${stockItem.inCirculation} en circulation`
                              : ""}
                          </>
                        )}
                      </p>
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
                  {/* Mobile action bar (total + reorder + delete) — desktop uses dedicated cells below */}
                  <div className="flex items-center justify-between gap-2 sm:hidden">
                    <span className="text-sm font-medium text-gray-900 tabular-nums">
                      Total : {formatPrice(lineTotal)}
                    </span>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => i > 0 && move(i, i - 1)}
                        disabled={i === 0}
                        className="flex h-9 w-9 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
                        aria-label="Monter la ligne"
                      >
                        <ChevronUp className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => i < fields.length - 1 && move(i, i + 1)}
                        disabled={i === fields.length - 1}
                        className="flex h-9 w-9 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
                        aria-label="Descendre la ligne"
                      >
                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                      </button>
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

              {/* ── Barème de livraison : jauge d'urgence + zone ── */}
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p id="urgence-legend" className={labelCls}>
                  Urgence de la livraison
                </p>
                <div
                  role="group"
                  aria-labelledby="urgence-legend"
                  className="grid grid-cols-2 gap-1.5 sm:grid-cols-4"
                >
                  {URGENCY_TIERS.map((tier) => {
                    const active = urgency === tier.level;
                    return (
                      <button
                        key={tier.level}
                        type="button"
                        aria-pressed={active}
                        title={tier.description}
                        onClick={() => setUrgency(tier.level)}
                        className={`rounded-lg border px-2 py-1.5 text-left transition-colors ${
                          active
                            ? "border-primary-500 bg-primary-50 text-primary-800"
                            : "border-gray-300 bg-white text-gray-600 hover:border-gray-400"
                        }`}
                      >
                        <span className="block text-xs font-medium">{tier.label}</span>
                        <span className="block text-[10px] tabular-nums opacity-80">
                          {tier.feeCents === null
                            ? "sur devis"
                            : tier.feeCents === 0
                              ? "barème de zone"
                              : `forfait ${tier.feeCents / 100} €`}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[11px] text-gray-500">
                  {selectedTier.delaiText} — {selectedTier.description}
                </p>

                <div className="mt-3">
                  <label className={labelCls} htmlFor="zoneLivraison">
                    Zone
                  </label>
                  <select
                    id="zoneLivraison"
                    className={inputCls}
                    value={zoneLivraison}
                    onChange={(e) => setZoneLivraison(e.target.value as DeliveryZone)}
                  >
                    {(Object.keys(DELIVERY_ZONE_LABELS) as DeliveryZone[]).map((z) => (
                      <option key={z} value={z}>
                        {DELIVERY_ZONE_LABELS[z]}
                      </option>
                    ))}
                  </select>
                </div>

                {deliveryFee.surDevis ? (
                  <div className="mt-3 rounded-lg border border-warning-500 bg-warning-50 p-2.5 text-xs text-warning-600">
                    <p className="font-medium">Sur devis — aucun tarif public</p>
                    <p className="mt-1">
                      {deliveryFee.label}. Chiffrez la course vous-même et saisissez le montant
                      convenu dans « Frais de livraison » ci-dessous.
                    </p>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-gray-600">
                      Tarif du barème :{" "}
                      <strong className="text-gray-900">
                        {deliveryFee.cents === 0 ? "offerte" : formatPrice(deliveryFee.cents)}
                      </strong>{" "}
                      — {deliveryFee.label}
                    </span>
                    {deliveryFee.urgent && (
                      <span className="rounded-full bg-warning-50 px-2 py-0.5 font-medium text-warning-600">
                        Forfait d&apos;urgence — ni dégressif ni offert
                      </span>
                    )}
                    {!feeApplied && (
                      <button
                        type="button"
                        onClick={() => applyDeliveryFee(deliveryFee)}
                        className="rounded-full border border-primary-300 px-2.5 py-0.5 font-medium text-primary-700 hover:bg-primary-50"
                      >
                        Appliquer
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className={labelCls} htmlFor="livraisonEuros">
                  Frais de livraison (€){" "}
                  {deliveryFee.surDevis && (
                    <span className="font-normal text-warning-600">— à chiffrer</span>
                  )}
                </label>
                <input
                  id="livraisonEuros"
                  type="number"
                  min={0}
                  step={0.01}
                  className={inputCls}
                  {...register("livraisonEuros")}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Montant facturé, repris tel quel sur le devis puis sur le contrat.
                  {deliveryFee.surDevis
                    ? " Livraison sur devis : précisez les conditions dans les notes, elles ne sont pas déduites du barème."
                    : !feeApplied && " Diffère du tarif du barème ci-dessus."}
                </p>
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
