"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCard } from "@/components/ui/skeleton";
import { useState, useMemo } from "react";
import { Package } from "lucide-react";

interface ProductAttributes {
  matiere?: string;
  grammage?: number;
  dimensions?: string;
}

interface Product {
  id: string;
  category: string;
  range: string;
  name: string;
  description: string;
  priceCents: number;
  attributes: ProductAttributes;
  isActive: boolean;
}

interface ProductsResponse {
  data: Product[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const rangeBadgeVariant: Record<string, "info" | "default" | "warning"> = {
  CONFORT: "info",
  HOTEL: "default",
  PRESTIGE: "warning",
};

const categoryOptions = [
  { value: "SERVIETTES", label: "Serviettes" },
  { value: "DRAPS", label: "Draps" },
  { value: "TAPIS_BAIN", label: "Tapis de bain" },
  { value: "LINGE_LIT", label: "Linge de lit" },
  { value: "KIT_CUISINE", label: "Kit cuisine" },
  { value: "ARTICLE_ACCUEIL", label: "Articles d'accueil" },
];

const rangeOptions = [
  { value: "CONFORT", label: "Confort" },
  { value: "HOTEL", label: "H\u00f4tel" },
  { value: "PRESTIGE", label: "Prestige" },
];

const categoryLabels: Record<string, string> = Object.fromEntries(
  categoryOptions.map((o) => [o.value, o.label]),
);

function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

const emptyForm = {
  name: "",
  description: "",
  category: "SERVIETTES",
  range: "CONFORT",
  priceEuros: "",
  matiere: "",
  grammage: "",
  dimensions: "",
};

export default function ProduitsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: productsData, isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: () => api.get<ProductsResponse | Product[]>("/products"),
  });

  const products: Product[] = useMemo(() => {
    if (!productsData) return [];
    if (Array.isArray(productsData)) return productsData;
    if ("data" in productsData && Array.isArray(productsData.data)) return productsData.data;
    return [];
  }, [productsData]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [toggleTarget, setToggleTarget] = useState<Product | null>(null);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name,
      description: p.description,
      category: p.category,
      range: p.range,
      priceEuros: (p.priceCents / 100).toFixed(2),
      matiere: p.attributes.matiere ?? "",
      grammage: p.attributes.grammage ? String(p.attributes.grammage) : "",
      dimensions: p.attributes.dimensions ?? "",
    });
    setModalOpen(true);
  };

  const priceCents = Math.round(parseFloat(form.priceEuros || "0") * 100);

  const createMutation = useMutation({
    mutationFn: () =>
      api.post("/products", {
        name: form.name,
        description: form.description,
        category: form.category,
        range: form.range,
        priceCents,
        attributes: {
          matiere: form.matiere || undefined,
          grammage: form.grammage ? parseInt(form.grammage) : undefined,
          dimensions: form.dimensions || undefined,
        },
      }),
    onSuccess: () => {
      toast("Produit créé");
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setModalOpen(false);
    },
    onError: () => toast("Erreur lors de la création", "error"),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      api.put(`/products/${editing?.id ?? ""}`, {
        name: form.name,
        description: form.description,
        category: form.category,
        range: form.range,
        priceCents,
        attributes: {
          matiere: form.matiere || undefined,
          grammage: form.grammage ? parseInt(form.grammage) : undefined,
          dimensions: form.dimensions || undefined,
        },
      }),
    onSuccess: () => {
      toast("Produit mis à jour");
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setModalOpen(false);
    },
    onError: () => toast("Erreur lors de la mise à jour", "error"),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/products/${id}`, { isActive }),
    onSuccess: () => {
      toast("Statut mis à jour");
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setToggleTarget(null);
    },
    onError: () => {
      toast("Erreur", "error");
      setToggleTarget(null);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  };

  const groupedByCategory = useMemo(() => {
    const map: Record<string, Product[]> = {};
    products.forEach((p) => {
      if (!map[p.category]) map[p.category] = [];
      (map[p.category] as Product[]).push(p);
    });
    return map;
  }, [products]);

  return (
    <>
      <Header title="Produits" />

      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">{products.length} produit{products.length > 1 ? "s" : ""}</p>
          <Button onClick={openCreate}>+ Nouveau produit</Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : products.length === 0 ? (
          <EmptyState
            icon={<Package className="h-12 w-12" />}
            title="Aucun produit"
            description="Créez votre premier produit pour commencer."
            action={<Button onClick={openCreate}>+ Nouveau produit</Button>}
          />
        ) : (
          Object.entries(groupedByCategory).map(([category, categoryProducts]) => (
            <div key={category}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
                {categoryLabels[category] ?? category}
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {categoryProducts.map((product) => (
                  <Card key={product.id}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900">{product.name}</h3>
                        <p className="mt-1 text-sm text-gray-500 line-clamp-2">{product.description}</p>
                      </div>
                      <div className="ml-2 flex flex-col items-end gap-1">
                        <Badge variant={rangeBadgeVariant[product.range] ?? "neutral"}>
                          {product.range}
                        </Badge>
                        <Badge variant={product.isActive ? "success" : "neutral"}>
                          {product.isActive ? "Actif" : "Inactif"}
                        </Badge>
                      </div>
                    </div>

                    {/* Attributs */}
                    {(product.attributes.matiere || product.attributes.grammage || product.attributes.dimensions) && (
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                        {product.attributes.matiere && <span>Matière : {product.attributes.matiere}</span>}
                        {product.attributes.grammage ? <span>{product.attributes.grammage}g</span> : null}
                        {product.attributes.dimensions && <span>{product.attributes.dimensions}</span>}
                      </div>
                    )}

                    <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
                      <span className="text-lg font-bold text-gray-900">
                        {formatPrice(product.priceCents)}
                      </span>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setToggleTarget(product)}
                        >
                          {product.isActive ? "Désactiver" : "Activer"}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(product)}>
                          Modifier
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal création/édition */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Modifier le produit" : "Nouveau produit"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Nom"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Input
            label="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Catégorie"
              options={categoryOptions}
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
            <Select
              label="Gamme"
              options={rangeOptions}
              value={form.range}
              onChange={(e) => setForm({ ...form, range: e.target.value })}
            />
          </div>
          <Input
            label="Prix (EUR)"
            type="number"
            step="0.01"
            min="0"
            value={form.priceEuros}
            onChange={(e) => setForm({ ...form, priceEuros: e.target.value })}
            placeholder="6.00"
            required
          />
          <div className="grid grid-cols-3 gap-4">
            <Input
              label="Matière"
              value={form.matiere}
              onChange={(e) => setForm({ ...form, matiere: e.target.value })}
              placeholder="Coton"
            />
            <Input
              label="Grammage (g)"
              type="number"
              value={form.grammage}
              onChange={(e) => setForm({ ...form, grammage: e.target.value })}
              placeholder="500"
            />
            <Input
              label="Dimensions"
              value={form.dimensions}
              onChange={(e) => setForm({ ...form, dimensions: e.target.value })}
              placeholder="50x100cm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" loading={createMutation.isPending || updateMutation.isPending}>
              {editing ? "Enregistrer" : "Créer"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Confirmation de toggle */}
      <ConfirmDialog
        open={!!toggleTarget}
        onClose={() => setToggleTarget(null)}
        onConfirm={() => {
          if (toggleTarget) {
            toggleMutation.mutate({ id: toggleTarget.id, isActive: !toggleTarget.isActive });
          }
        }}
        title={toggleTarget?.isActive ? "Désactiver ce produit ?" : "Activer ce produit ?"}
        description={
          toggleTarget?.isActive
            ? `Le produit « ${toggleTarget?.name} » ne sera plus disponible à la commande.`
            : `Le produit « ${toggleTarget?.name} » sera à nouveau disponible.`
        }
        confirmLabel={toggleTarget?.isActive ? "Désactiver" : "Activer"}
        variant={toggleTarget?.isActive ? "danger" : "primary"}
        loading={toggleMutation.isPending}
      />
    </>
  );
}
