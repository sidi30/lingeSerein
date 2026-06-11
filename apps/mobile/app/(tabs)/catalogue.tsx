import { useState, useCallback, memo } from "react";
import { View, Text, FlatList, Pressable, Image, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { ScreenWrapper } from "@/components/ScreenWrapper";
import { Card } from "@/components/Card";
import { SkeletonBox } from "@/components/SkeletonBox";
import { EmptyState } from "@/components/EmptyState";
import { useProducts, formatCents } from "@/lib/api";
import type { Product, ProductKind } from "@/lib/api";
import { colors, font, spacing, radius } from "@/lib/theme";

// ─── Filtres ──────────────────────────────────────────────────────

type FilterValue = "__all__" | ProductKind;

const FILTERS: { value: FilterValue; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "__all__", label: "Tout", icon: "grid-outline" },
  { value: "KIT", label: "Kits", icon: "layers-outline" },
  { value: "ARTICLE", label: "À l'unité", icon: "shirt-outline" },
];

// ─── Mappings icônes / labels ─────────────────────────────────────

const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  SERVIETTES: "water-outline",
  DRAPS: "bed-outline",
  TAPIS_BAIN: "grid-outline",
  LINGE_LIT: "moon-outline",
  KIT_CUISINE: "restaurant-outline",
  ARTICLE_ACCUEIL: "home-outline",
};

const CATEGORY_LABELS: Record<string, string> = {
  SERVIETTES: "Serviettes",
  DRAPS: "Draps",
  TAPIS_BAIN: "Tapis de bain",
  LINGE_LIT: "Linge de lit",
};

const KIND_COLORS: Record<ProductKind, string> = {
  KIT: colors.primary,
  ARTICLE: colors.accent,
};

function productIcon(product: Product): keyof typeof Ionicons.glyphMap {
  if (product.kind === "KIT") {
    if (product.slug === "kit-bain") return "water-outline";
    if (product.slug === "kit-lit") return "bed-outline";
    if (product.slug === "kit-complet") return "layers-outline";
    return "cube-outline";
  }
  return CATEGORY_ICONS[product.category ?? ""] ?? "shirt-outline";
}

// ─── Tuile produit ────────────────────────────────────────────────

interface ProductTileProps {
  product: Product;
  index: number;
}

const ProductTile = memo(function ProductTile({ product, index }: ProductTileProps) {
  const kindColor = KIND_COLORS[product.kind];
  const icon = productIcon(product);
  const isKit = product.kind === "KIT";

  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 12) * 40).springify()}
      style={styles.tileWrapper}
    >
      <Card style={styles.tile} padded={false}>
        {/* Illustration */}
        {product.imageUrl ? (
          <Image
            source={{ uri: product.imageUrl }}
            style={styles.tileImage}
            accessibilityLabel={product.name}
          />
        ) : (
          <View style={[styles.tileImagePlaceholder, { backgroundColor: kindColor + "15" }]}>
            <Ionicons name={icon} size={40} color={kindColor} />
          </View>
        )}

        {/* Badge Kit / Unité */}
        <View style={[styles.kindBadge, { backgroundColor: kindColor }]}>
          <Text style={styles.kindBadgeText}>{isKit ? "Kit" : "Unité"}</Text>
        </View>

        {/* Infos */}
        <View style={styles.tileInfo}>
          <Text style={styles.tileName} numberOfLines={2}>
            {product.name}
          </Text>
          {product.description && (
            <Text style={styles.tileDesc} numberOfLines={3}>
              {product.description}
            </Text>
          )}
          {/* Catégorie — articles uniquement */}
          {!isKit && product.category ? (
            <Text style={styles.tileCat}>
              {CATEGORY_LABELS[product.category] ?? product.category}
            </Text>
          ) : null}
          {/* Prix depuis l'API — zéro valeur en dur (AC-F5-01) */}
          <View style={styles.tilePriceRow}>
            <Ionicons name="pricetag-outline" size={14} color={kindColor} />
            <Text style={[styles.tilePrice, { color: kindColor }]}>
              {formatCents(product.priceCents)}
            </Text>
            <Text style={styles.tilePriceUnit}>{isKit ? "/kit" : "/pièce"}</Text>
          </View>
        </View>
      </Card>
    </Animated.View>
  );
});

// ─── Skeleton ────────────────────────────────────────────────────

function CatalogueSkeleton() {
  return (
    <ScreenWrapper>
      <View style={styles.filterRow}>
        {[1, 2, 3].map((i) => (
          <SkeletonBox key={i} width={80} height={36} borderRadius={radius.full} />
        ))}
      </View>
      <View style={styles.grid}>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={styles.tileWrapper}>
            <SkeletonBox height={220} borderRadius={radius.lg} />
          </View>
        ))}
      </View>
    </ScreenWrapper>
  );
}

// ─── Main screen ─────────────────────────────────────────────────

export default function CatalogueScreen() {
  const { data: products, isLoading, refetch, isRefetching } = useProducts();
  const [activeFilter, setActiveFilter] = useState<FilterValue>("__all__");

  const filteredProducts: Product[] =
    activeFilter === "__all__"
      ? (products ?? [])
      : (products?.filter((p) => p.kind === activeFilter) ?? []);

  const renderProduct = useCallback(
    ({ item, index }: { item: Product; index: number }) => (
      <ProductTile product={item} index={index} />
    ),
    [],
  );

  if (isLoading) return <CatalogueSkeleton />;

  return (
    <View style={styles.container}>
      {/* Filtres : Tout / Kits / À l'unité */}
      <View style={styles.filterRow}>
        {FILTERS.map((f) => {
          const isActive = activeFilter === f.value;
          return (
            <Pressable
              key={f.value}
              onPress={() => setActiveFilter(f.value)}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={f.label}
            >
              <Ionicons
                name={f.icon}
                size={14}
                color={isActive ? colors.textInverse : colors.textSecondary}
              />
              <Text style={[styles.filterText, isActive && styles.filterTextActive]}>
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Compteur */}
      <Text style={styles.countText}>
        {filteredProducts.length} produit{filteredProducts.length > 1 ? "s" : ""}
      </Text>

      {/* Grille */}
      {filteredProducts.length === 0 ? (
        <EmptyState
          icon="shirt-outline"
          title="Aucun produit"
          description="Aucun produit dans cette catégorie pour le moment."
        />
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={(p) => p.id}
          numColumns={2}
          renderItem={renderProduct}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.gridRow}
          refreshing={isRefetching}
          onRefresh={refetch}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  filterRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    flexDirection: "row",
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 36,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.medium,
    color: colors.textSecondary,
  },
  filterTextActive: { color: colors.textInverse },
  countText: {
    fontSize: font.sizes.xs,
    color: colors.textTertiary,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  grid: {
    padding: spacing.lg,
    paddingTop: 0,
    paddingBottom: 100,
  },
  gridRow: { gap: spacing.md, marginBottom: spacing.md },
  tileWrapper: { flex: 1 },
  tile: { overflow: "hidden" },
  tileImage: {
    width: "100%",
    height: 140,
    resizeMode: "cover",
  },
  tileImagePlaceholder: {
    height: 140,
    alignItems: "center",
    justifyContent: "center",
  },
  kindBadge: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  kindBadgeText: {
    fontSize: 10,
    fontWeight: font.weights.bold,
    color: colors.textInverse,
    textTransform: "uppercase",
  },
  tileInfo: { padding: spacing.md },
  tileName: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  tileDesc: {
    fontSize: font.sizes.xs,
    color: colors.textTertiary,
    lineHeight: 16,
    marginBottom: spacing.sm,
  },
  tileCat: {
    fontSize: font.sizes.xs,
    color: colors.accent,
    fontWeight: font.weights.medium,
    marginBottom: spacing.xs,
  },
  tilePriceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  tilePrice: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.heavy,
  },
  tilePriceUnit: {
    fontSize: font.sizes.xs,
    color: colors.textTertiary,
  },
});
