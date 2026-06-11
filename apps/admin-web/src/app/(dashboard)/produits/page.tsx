"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCard } from "@/components/ui/skeleton";
import { useState, useMemo } from "react";
import { Package, Pencil, PowerOff, Power, Plus } from "lucide-react";
import { formatPrice } from "@/lib/format";
import type { ProductV2DTO, ProductKind, PaginatedResponse } from "@/lib/types";

/* ─── Schémas Zod ─── */

const priceSchema = z.object({
  priceEuros: z.coerce
    .number({ invalid_type_error: "Le prix est requis" })
    .min(0, "Le prix doit être supérieur ou égal à 0"),
});
type PriceValues = z.infer<typeof priceSchema>;

const productSchema = z.object({
  name: z.string().min(2, "Le nom du produit est obligatoire").max(200),
  description: z.string().max(2000).optional().or(z.literal("")),
  kind: z.enum(["KIT", "ARTICLE"] as const),
  category: z.string().optional().or(z.literal("")),
  priceEuros: z.coerce
    .number({ invalid_type_error: "Le prix est requis" })
    .min(0, "Le prix doit être supérieur ou égal à 0"),
  slug: z.string().max(60).optional().or(z.literal("")),
});
type ProductValues = z.infer<typeof productSchema>;

/* ─── Constantes d'affichage ─── */

const kindLabel: Record<ProductKind, string> = {
  KIT: "Kit",
  ARTICLE: "Article",
};

const kindBadgeVariant: Record<ProductKind, "info" | "neutral"> = {
  KIT: "info",
  ARTICLE: "neutral",
};

const categoryOptions = [
  { value: "", label: "— Aucune catégorie —" },
  { value: "SERVIETTES", label: "Serviettes" },
  { value: "DRAPS", label: "Draps" },
  { value: "TAPIS_BAIN", label: "Tapis de bain" },
  { value: "LINGE_LIT", label: "Linge de lit" },
  { value: "KIT_CUISINE", label: "Kit cuisine" },
  { value: "ARTICLE_ACCUEIL", label: "Articles d'accueil" },
];

const inputCls =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500";
const labelCls = "block text-xs font-medium text-gray-700 mb-1";
const errorCls = "mt-1 text-xs text-danger-600";

/* ─── Modal modification rapide du prix ─── */

interface PriceModalProps {
  product: ProductV2DTO | null;
  onClose: () => void;
}

function PriceModal({ product, onClose }: PriceModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PriceValues>({
    resolver: zodResolver(priceSchema),
    values: product ? { priceEuros: product.priceCents / 100 } : undefined,
  });

  const priceMutation = useMutation({
    mutationFn: (values: PriceValues) => {
      if (!product) return Promise.reject(new Error("Produit manquant"));
      return api.patch<ProductV2DTO>(`/products/${product.id}/price`, {
        priceCents: Math.round(values.priceEuros * 100),
      });
    },
    onSuccess: () => {
      toast("Prix mis à jour");
      queryClient.invalidateQueries({ queryKey: ["products-v2"] });
      onClose();
    },
    onError: (err: unknown) => {
      toast(err instanceof Error ? err.message : "Erreur lors de la mise à jour", "error");
    },
  });

  return (
    <Modal
      open={product !== null}
      onClose={onClose}
      title={`Modifier le prix — ${product?.name ?? ""}`}
    >
      <form onSubmit={handleSubmit((v) => priceMutation.mutate(v))} className="space-y-4">
        <div>
          <label className={labelCls} htmlFor="price-euros">
            Nouveau prix (€)
          </label>
          <input
            id="price-euros"
            type="number"
            step="0.01"
            min="0"
            className={inputCls}
            placeholder="7.50"
            {...register("priceEuros")}
          />
          {errors.priceEuros && <p className={errorCls}>{errors.priceEuros.message}</p>}
          <p className="mt-1.5 text-xs text-gray-500">
            Les commandes existantes conservent leur prix d&apos;origine (snapshot immuable).
          </p>
        </div>
        <div className="flex justify-end gap-3 pt-1">
          <Button variant="secondary" type="button" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={priceMutation.isPending}>
            Enregistrer
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* ─── Modal création / édition complète ─── */

interface ProductModalProps {
  open: boolean;
  product: ProductV2DTO | null;
  onClose: () => void;
}

function ProductModal({ open, product, onClose }: ProductModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProductValues>({
    resolver: zodResolver(productSchema),
    values: product
      ? {
          name: product.name,
          description: product.description ?? "",
          kind: product.kind,
          category: product.category ?? "",
          priceEuros: product.priceCents / 100,
          slug: product.slug ?? "",
        }
      : { name: "", description: "", kind: "ARTICLE", category: "", priceEuros: 0, slug: "" },
  });

  const createMutation = useMutation({
    mutationFn: (values: ProductValues) =>
      api.post<ProductV2DTO>("/products", {
        name: values.name,
        description: values.description || undefined,
        kind: values.kind,
        category: values.category || undefined,
        priceCents: Math.round(values.priceEuros * 100),
        slug: values.slug || undefined,
        // serviceTypeId omis : résolu côté API (ServiceType LOCATION par défaut)
      }),
    onSuccess: () => {
      toast("Produit créé");
      queryClient.invalidateQueries({ queryKey: ["products-v2"] });
      reset();
      onClose();
    },
    onError: (err: unknown) => {
      toast(err instanceof Error ? err.message : "Erreur lors de la création", "error");
    },
  });

  const updateMutation = useMutation({
    mutationFn: (values: ProductValues) => {
      if (!product) return Promise.reject(new Error("Produit manquant"));
      return api.put<ProductV2DTO>(`/products/${product.id}`, {
        name: values.name,
        description: values.description || undefined,
        kind: values.kind,
        category: values.category || undefined,
        priceCents: Math.round(values.priceEuros * 100),
        slug: values.slug || undefined,
      });
    },
    onSuccess: () => {
      toast("Produit mis à jour");
      queryClient.invalidateQueries({ queryKey: ["products-v2"] });
      onClose();
    },
    onError: (err: unknown) => {
      toast(err instanceof Error ? err.message : "Erreur lors de la mise à jour", "error");
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={product ? "Modifier le produit" : "Nouveau produit"}
    >
      <form
        onSubmit={handleSubmit((v) =>
          product ? updateMutation.mutate(v) : createMutation.mutate(v),
        )}
        className="space-y-4"
      >
        <div>
          <label className={labelCls} htmlFor="prod-name">
            Nom *
          </label>
          <input id="prod-name" className={inputCls} placeholder="Kit Bain" {...register("name")} />
          {errors.name && <p className={errorCls}>{errors.name.message}</p>}
        </div>

        <div>
          <label className={labelCls} htmlFor="prod-description">
            Description
          </label>
          <textarea
            id="prod-description"
            rows={2}
            className={inputCls}
            placeholder="Drap de bain 70×150, serviette 50×90, tapis 50×70"
            {...register("description")}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls} htmlFor="prod-kind">
              Type *
            </label>
            <select id="prod-kind" className={inputCls} {...register("kind")}>
              <option value="KIT">Kit</option>
              <option value="ARTICLE">Article unitaire</option>
            </select>
            {errors.kind && <p className={errorCls}>{errors.kind.message}</p>}
          </div>

          <div>
            <label className={labelCls} htmlFor="prod-category">
              Catégorie
            </label>
            <select id="prod-category" className={inputCls} {...register("category")}>
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
            <label className={labelCls} htmlFor="prod-price">
              Prix (€) *
            </label>
            <input
              id="prod-price"
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
            <label className={labelCls} htmlFor="prod-slug">
              Slug (identifiant)
            </label>
            <input
              id="prod-slug"
              className={inputCls}
              placeholder="kit-bain"
              {...register("slug")}
            />
            {errors.slug && <p className={errorCls}>{errors.slug.message}</p>}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-1">
          <Button variant="secondary" type="button" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={isPending}>
            {product ? "Enregistrer" : "Créer le produit"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* ─── Carte produit ─── */

interface ProductCardProps {
  product: ProductV2DTO;
  onEditPrice: (p: ProductV2DTO) => void;
  onEdit: (p: ProductV2DTO) => void;
  onToggle: (p: ProductV2DTO) => void;
}

function ProductCard({ product, onEditPrice, onEdit, onToggle }: ProductCardProps) {
  const categoryLabel = categoryOptions.find((o) => o.value === product.category)?.label;

  return (
    <div
      className={`flex flex-col rounded-xl border bg-white p-4 transition-opacity ${
        product.isActive ? "border-gray-200" : "border-gray-100 opacity-60"
      }`}
    >
      {/* En-tête */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-gray-900">{product.name}</h3>
          {product.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{product.description}</p>
          )}
        </div>
        <div className="ml-2 flex shrink-0 flex-col items-end gap-1">
          <Badge variant={kindBadgeVariant[product.kind]}>{kindLabel[product.kind]}</Badge>
          <Badge variant={product.isActive ? "success" : "neutral"}>
            {product.isActive ? "Actif" : "Inactif"}
          </Badge>
        </div>
      </div>

      {/* Métadonnées */}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
        {categoryLabel && <span>{categoryLabel}</span>}
        {product.slug && <span className="font-mono text-gray-400">{product.slug}</span>}
      </div>

      {/* Pied */}
      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
        <span className="text-lg font-bold text-gray-900">{formatPrice(product.priceCents)}</span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            title={product.isActive ? "Désactiver" : "Activer"}
            onClick={() => onToggle(product)}
            aria-label={product.isActive ? `Désactiver ${product.name}` : `Activer ${product.name}`}
          >
            {product.isActive ? (
              <PowerOff className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Power className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEditPrice(product)}
            aria-label={`Modifier le prix de ${product.name}`}
          >
            Prix
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(product)}
            aria-label={`Modifier ${product.name}`}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Page principale ─── */

export default function ProduitsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["products-v2"],
    queryFn: () =>
      api.getRaw<PaginatedResponse<ProductV2DTO>>("/products", {
        limit: 100,
        page: 1,
        includeInactive: true,
      }),
  });

  const products: ProductV2DTO[] = useMemo(() => data?.data ?? [], [data]);

  const [priceTarget, setPriceTarget] = useState<ProductV2DTO | null>(null);
  const [productModal, setProductModal] = useState<{ open: boolean; product: ProductV2DTO | null }>(
    {
      open: false,
      product: null,
    },
  );
  const [toggleTarget, setToggleTarget] = useState<ProductV2DTO | null>(null);

  const kits = useMemo(() => products.filter((p) => p.kind === "KIT"), [products]);
  const articles = useMemo(() => products.filter((p) => p.kind === "ARTICLE"), [products]);

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }): Promise<unknown> => {
      if (isActive) {
        // Désactiver = DELETE (soft-delete côté API)
        return api.delete<{ message: string }>(`/products/${id}`);
      }
      // Réactiver = PUT partiel
      return api.put<ProductV2DTO>(`/products/${id}`, { isActive: true });
    },
    onSuccess: () => {
      toast("Statut du produit mis à jour");
      queryClient.invalidateQueries({ queryKey: ["products-v2"] });
      setToggleTarget(null);
    },
    onError: (err: unknown) => {
      toast(err instanceof Error ? err.message : "Erreur", "error");
      setToggleTarget(null);
    },
  });

  if (isError) {
    return (
      <>
        <Header title="Produits" />
        <div className="p-6">
          <p className="text-sm text-danger-600">
            Impossible de charger les produits. Vérifiez que l&apos;API est disponible.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Produits" />

      <div className="space-y-6 p-6">
        {/* Barre d'actions */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {products.length} produit{products.length !== 1 ? "s" : ""} ({kits.length} kit
            {kits.length !== 1 ? "s" : ""}, {articles.length} article
            {articles.length !== 1 ? "s" : ""})
          </p>
          <Button size="sm" onClick={() => setProductModal({ open: true, product: null })}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nouveau produit
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-6">
            {[0, 1].map((g) => (
              <div key={g}>
                <div className="mb-3 h-4 w-32 animate-pulse rounded bg-gray-200" />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <SkeletonCard key={i} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <EmptyState
            icon={<Package className="h-12 w-12" />}
            title="Aucun produit"
            description="Le catalogue est vide. Créez votre premier produit ou lancez le seed."
            action={
              <Button onClick={() => setProductModal({ open: true, product: null })}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Nouveau produit
              </Button>
            }
          />
        ) : (
          <>
            {kits.length > 0 && (
              <section aria-labelledby="kits-heading">
                <h2
                  id="kits-heading"
                  className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500"
                >
                  Kits
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {kits.map((p) => (
                    <ProductCard
                      key={p.id}
                      product={p}
                      onEditPrice={setPriceTarget}
                      onEdit={(prod) => setProductModal({ open: true, product: prod })}
                      onToggle={setToggleTarget}
                    />
                  ))}
                </div>
              </section>
            )}

            {articles.length > 0 && (
              <section aria-labelledby="articles-heading">
                <h2
                  id="articles-heading"
                  className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500"
                >
                  Articles unitaires
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {articles.map((p) => (
                    <ProductCard
                      key={p.id}
                      product={p}
                      onEditPrice={setPriceTarget}
                      onEdit={(prod) => setProductModal({ open: true, product: prod })}
                      onToggle={setToggleTarget}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {/* Modal modification prix rapide */}
      <PriceModal product={priceTarget} onClose={() => setPriceTarget(null)} />

      {/* Modal création / édition complète */}
      <ProductModal
        open={productModal.open}
        product={productModal.product}
        onClose={() => setProductModal({ open: false, product: null })}
      />

      {/* Confirmation toggle actif/inactif */}
      <ConfirmDialog
        open={toggleTarget !== null}
        onClose={() => setToggleTarget(null)}
        onConfirm={() => {
          if (toggleTarget) {
            toggleMutation.mutate({ id: toggleTarget.id, isActive: toggleTarget.isActive });
          }
        }}
        title={toggleTarget?.isActive ? "Désactiver ce produit ?" : "Réactiver ce produit ?"}
        description={
          toggleTarget?.isActive
            ? `Le produit « ${toggleTarget.name} » ne sera plus disponible à la commande ni sur l'app mobile.`
            : `Le produit « ${toggleTarget?.name} » sera à nouveau disponible.`
        }
        confirmLabel={toggleTarget?.isActive ? "Désactiver" : "Réactiver"}
        variant={toggleTarget?.isActive ? "danger" : "primary"}
        loading={toggleMutation.isPending}
      />
    </>
  );
}
