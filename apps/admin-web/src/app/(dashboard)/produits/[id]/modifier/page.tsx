"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter, useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SkeletonCard } from "@/components/ui/skeleton";
import { ArrowLeft, Package } from "lucide-react";
import Link from "next/link";
import { formatPrice } from "@/lib/format";
import type { ProductV2DTO } from "@/lib/types";

/* ─── Schéma Zod ─── */

const productEditSchema = z.object({
  name: z.string().min(2, "Le nom du produit est obligatoire").max(200),
  description: z.string().max(2000).optional().or(z.literal("")),
  kind: z.enum(["KIT", "ARTICLE"] as const),
  category: z.string().optional().or(z.literal("")),
  priceEuros: z.coerce
    .number({ invalid_type_error: "Le prix est requis" })
    .min(0, "Le prix doit être supérieur ou égal à 0"),
  slug: z.string().max(60).optional().or(z.literal("")),
});
type ProductEditValues = z.infer<typeof productEditSchema>;

/* ─── Styles ─── */

const inputCls =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500";
const labelCls = "block text-xs font-medium text-gray-700 mb-1";
const errorCls = "mt-1 text-xs text-danger-600";

const categoryOptions = [
  { value: "", label: "— Aucune catégorie —" },
  { value: "SERVIETTES", label: "Serviettes" },
  { value: "DRAPS", label: "Draps" },
  { value: "TAPIS_BAIN", label: "Tapis de bain" },
  { value: "LINGE_LIT", label: "Linge de lit" },
  { value: "KIT_CUISINE", label: "Kit cuisine" },
  { value: "ARTICLE_ACCUEIL", label: "Articles d'accueil" },
];

/* ─── Page ─── */

export default function ModifierProduitPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const productId = params.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    data: product,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["product", productId],
    queryFn: async () => {
      // GET /products liste + filtre côté client (l'API ne fournit pas de GET /products/:id public)
      const res = await api.getRaw<{ success: boolean; data: ProductV2DTO[] }>("/products", {
        limit: 100,
        page: 1,
      });
      const found = res.data.find((p) => p.id === productId);
      if (!found) throw new Error("Produit introuvable");
      return found;
    },
    enabled: !!productId,
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProductEditValues>({
    resolver: zodResolver(productEditSchema),
    values: product
      ? {
          name: product.name,
          description: product.description ?? "",
          kind: product.kind,
          category: product.category ?? "",
          priceEuros: product.priceCents / 100,
          slug: product.slug ?? "",
        }
      : undefined,
  });

  const updateMutation = useMutation({
    mutationFn: (values: ProductEditValues) =>
      api.put<ProductV2DTO>(`/products/${productId}`, {
        name: values.name,
        description: values.description || undefined,
        kind: values.kind,
        category: values.category || undefined,
        priceCents: Math.round(values.priceEuros * 100),
        slug: values.slug || undefined,
      }),
    onSuccess: (updated) => {
      toast("Produit mis à jour");
      queryClient.invalidateQueries({ queryKey: ["products-v2"] });
      queryClient.setQueryData(["product", productId], updated);
      router.push("/produits");
    },
    onError: (err: unknown) => {
      toast(err instanceof Error ? err.message : "Erreur lors de la mise à jour", "error");
    },
  });

  const priceMutation = useMutation({
    mutationFn: (priceEuros: number) =>
      api.patch<ProductV2DTO>(`/products/${productId}/price`, {
        priceCents: Math.round(priceEuros * 100),
      }),
    onSuccess: (updated) => {
      toast("Prix mis à jour");
      queryClient.invalidateQueries({ queryKey: ["products-v2"] });
      queryClient.setQueryData(["product", productId], updated);
      router.push("/produits");
    },
    onError: (err: unknown) => {
      toast(err instanceof Error ? err.message : "Erreur lors de la mise à jour du prix", "error");
    },
  });

  // ─── Rendu états ───

  if (isLoading) {
    return (
      <>
        <Header title="Modifier le produit" />
        <div className="p-6">
          <div className="max-w-xl space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </div>
      </>
    );
  }

  if (isError || !product) {
    return (
      <>
        <Header title="Modifier le produit" />
        <div className="p-6 space-y-4">
          <p className="text-sm text-danger-600">Produit introuvable ou erreur de chargement.</p>
          <Link href="/produits">
            <Button variant="secondary" size="sm">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Retour aux produits
            </Button>
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title={`Modifier — ${product.name}`} />

      <div className="p-6">
        {/* Fil d'Ariane */}
        <div className="mb-6 flex items-center gap-2 text-sm text-gray-500">
          <Link href="/produits" className="hover:text-primary-600 flex items-center gap-1">
            <Package className="h-4 w-4" aria-hidden="true" />
            Produits
          </Link>
          <span>/</span>
          <span className="text-gray-900">{product.name}</span>
        </div>

        {/* Info actuelle */}
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-700">Prix actuel</p>
            <p className="text-2xl font-bold text-gray-900">{formatPrice(product.priceCents)}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant={product.kind === "KIT" ? "info" : "neutral"}>
              {product.kind === "KIT" ? "Kit" : "Article"}
            </Badge>
            <Badge variant={product.isActive ? "success" : "neutral"}>
              {product.isActive ? "Actif" : "Inactif"}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Formulaire édition complète */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-base font-semibold text-gray-900">Informations du produit</h2>
            <form onSubmit={handleSubmit((v) => updateMutation.mutate(v))} className="space-y-4">
              <div>
                <label className={labelCls} htmlFor="edit-name">
                  Nom *
                </label>
                <input
                  id="edit-name"
                  className={inputCls}
                  placeholder="Kit Bain"
                  {...register("name")}
                />
                {errors.name && <p className={errorCls}>{errors.name.message}</p>}
              </div>

              <div>
                <label className={labelCls} htmlFor="edit-description">
                  Description
                </label>
                <textarea
                  id="edit-description"
                  rows={3}
                  className={inputCls}
                  placeholder="Drap de bain 70×150, serviette 50×90, tapis 50×70"
                  {...register("description")}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls} htmlFor="edit-kind">
                    Type *
                  </label>
                  <select id="edit-kind" className={inputCls} {...register("kind")}>
                    <option value="KIT">Kit</option>
                    <option value="ARTICLE">Article unitaire</option>
                  </select>
                  {errors.kind && <p className={errorCls}>{errors.kind.message}</p>}
                </div>

                <div>
                  <label className={labelCls} htmlFor="edit-category">
                    Catégorie
                  </label>
                  <select id="edit-category" className={inputCls} {...register("category")}>
                    {categoryOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls} htmlFor="edit-price">
                    Prix (€) *
                  </label>
                  <input
                    id="edit-price"
                    type="number"
                    step="0.01"
                    min="0"
                    className={inputCls}
                    placeholder="7.50"
                    {...register("priceEuros")}
                  />
                  {errors.priceEuros && <p className={errorCls}>{errors.priceEuros.message}</p>}
                </div>

                <div>
                  <label className={labelCls} htmlFor="edit-slug">
                    Slug
                  </label>
                  <input
                    id="edit-slug"
                    className={`${inputCls} font-mono`}
                    placeholder="kit-bain"
                    {...register("slug")}
                  />
                  {errors.slug && <p className={errorCls}>{errors.slug.message}</p>}
                </div>
              </div>

              <p className="text-xs text-gray-500">
                La modification du prix n&apos;affecte pas les commandes existantes (snapshot
                immuable).
              </p>

              <div className="flex justify-end gap-3 pt-1">
                <Link href="/produits">
                  <Button variant="secondary" type="button">
                    Annuler
                  </Button>
                </Link>
                <Button type="submit" loading={updateMutation.isPending}>
                  Enregistrer les modifications
                </Button>
              </div>
            </form>
          </div>

          {/* Raccourci modification prix uniquement */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="mb-1 text-base font-semibold text-gray-900">
              Modification rapide du prix
            </h2>
            <p className="mb-4 text-sm text-gray-500">
              Modifie uniquement le prix sans toucher aux autres champs.
            </p>
            <PriceQuickForm
              currentPriceCents={product.priceCents}
              loading={priceMutation.isPending}
              onSubmit={(euros) => priceMutation.mutate(euros)}
            />
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── Formulaire prix rapide ─── */

const quickPriceSchema = z.object({
  priceEuros: z.coerce
    .number({ invalid_type_error: "Le prix est requis" })
    .min(0, "Le prix doit être supérieur ou égal à 0"),
});
type QuickPriceValues = z.infer<typeof quickPriceSchema>;

function PriceQuickForm({
  currentPriceCents,
  loading,
  onSubmit,
}: {
  currentPriceCents: number;
  loading: boolean;
  onSubmit: (euros: number) => void;
}) {
  const inputCls =
    "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500";
  const labelCls = "block text-xs font-medium text-gray-700 mb-1";
  const errorCls = "mt-1 text-xs text-danger-600";

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<QuickPriceValues>({
    resolver: zodResolver(quickPriceSchema),
    defaultValues: { priceEuros: currentPriceCents / 100 },
  });

  return (
    <form onSubmit={handleSubmit((v) => onSubmit(v.priceEuros))} className="space-y-4">
      <div>
        <label className={labelCls} htmlFor="quick-price">
          Nouveau prix (€)
        </label>
        <input
          id="quick-price"
          type="number"
          step="0.01"
          min="0"
          className={inputCls}
          placeholder={(currentPriceCents / 100).toFixed(2)}
          {...register("priceEuros")}
        />
        {errors.priceEuros && <p className={errorCls}>{errors.priceEuros.message}</p>}
      </div>
      <Button type="submit" loading={loading} className="w-full">
        Mettre à jour le prix
      </Button>
    </form>
  );
}
