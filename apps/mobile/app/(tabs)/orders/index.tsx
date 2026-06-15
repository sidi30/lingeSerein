import { useState } from "react";
import { View, Text, Pressable, FlatList, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Card } from "@/components/Card";
import { StatusBadge, statusMeta } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useOrders, useIsClient, formatCents, formatDateShort } from "@/lib/api";
import type { Order } from "@/lib/api";
import { colors, font, spacing, radius, shadow, TAB_BAR_BASE_HEIGHT } from "@/lib/theme";

const FILTERS = [
  { key: undefined, label: "Toutes" },
  { key: "PENDING", label: "En attente" },
  { key: "CONFIRMED", label: "Confirmees" },
  { key: "IN_DELIVERY", label: "En livraison" },
  { key: "DELIVERED", label: "Livrees" },
] as const;

export default function OrdersListScreen() {
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const { data, isLoading, refetch, isRefetching } = useOrders(filter);
  const isClient = useIsClient();
  const insets = useSafeAreaInsets();

  const renderOrder = ({ item, index }: { item: Order; index: number }) => {
    const meta = statusMeta("order", item.status);
    const itemCount = item.items.reduce((n, i) => n + i.quantity, 0);
    return (
      <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 50).springify()}>
        <Pressable
          onPress={() => router.push(`/(tabs)/orders/${item.id}`)}
          accessibilityRole="button"
          accessibilityLabel={`Commande ${item.orderNumber}, ${meta.label}`}
          accessibilityHint="Voir le detail"
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Card padded={false} style={[styles.card, { borderLeftColor: meta.accent }]}>
            <View style={styles.cardRow}>
              <View style={[styles.iconChip, { backgroundColor: meta.accentBg }]}>
                <Ionicons name={meta.icon} size={22} color={meta.accent} />
              </View>

              <View style={styles.cardMain}>
                <View style={styles.cardTop}>
                  <Text style={styles.orderNum} numberOfLines={1}>
                    {item.orderNumber}
                  </Text>
                  <StatusBadge type="order" status={item.status} />
                </View>

                <View style={styles.metaRow}>
                  <Ionicons name="calendar-outline" size={13} color={colors.textTertiary} />
                  <Text style={styles.date}>
                    {formatDateShort(item.deliveryDate)}
                    {item.timeSlot ? ` · ${item.timeSlot}` : ""}
                  </Text>
                </View>

                {itemCount > 0 && (
                  <Text style={styles.items} numberOfLines={1}>
                    {itemCount} article{itemCount > 1 ? "s" : ""} ·{" "}
                    {item.items.map((i) => i.product?.name ?? "?").join(", ")}
                  </Text>
                )}

                <View style={styles.priceRow}>
                  <Text style={styles.price}>{formatCents(item.totalCents)}</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                </View>
              </View>
            </View>
          </Card>
        </Pressable>
      </Animated.View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Filters — compact horizontal pills, color-dotted per status */}
      <FlatList
        horizontal
        data={FILTERS}
        keyExtractor={(f) => f.label}
        showsHorizontalScrollIndicator={false}
        style={styles.filtersBar}
        contentContainerStyle={styles.filters}
        renderItem={({ item: f }) => {
          const active = filter === f.key;
          const dot = f.key ? statusMeta("order", f.key).accent : colors.textTertiary;
          return (
            <Pressable
              onPress={() => setFilter(f.key)}
              hitSlop={6}
              style={[styles.filterChip, active && styles.filterActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <View
                style={[styles.filterDot, { backgroundColor: active ? colors.textInverse : dot }]}
              />
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{f.label}</Text>
            </Pressable>
          );
        }}
      />

      {isLoading ? (
        <LoadingScreen />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(o) => o.id}
          renderItem={renderOrder}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: TAB_BAR_BASE_HEIGHT + insets.bottom + 88 },
          ]}
          refreshing={isRefetching}
          onRefresh={refetch}
          ListEmptyComponent={
            <EmptyState
              icon="cube-outline"
              title="Aucune commande"
              description="Vos commandes apparaitront ici"
            />
          }
        />
      )}

      {/* FAB - client only */}
      {isClient && (
        <Pressable
          style={[styles.fab, { bottom: TAB_BAR_BASE_HEIGHT + insets.bottom + spacing.lg }]}
          onPress={() => router.push("/(tabs)/orders/new")}
          accessibilityRole="button"
          accessibilityLabel="Nouvelle commande"
        >
          <Ionicons name="add" size={28} color={colors.textInverse} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  // flexGrow:0 stops the horizontal list from filling vertical space (which
  // stretched the radius.full chips into giant ovals).
  filtersBar: {
    flexGrow: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    backgroundColor: colors.surface,
  },
  filters: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    alignItems: "center",
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    ...shadow.sm,
  },
  filterDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  filterText: {
    fontSize: font.sizes.sm,
    color: colors.textSecondary,
    fontWeight: font.weights.semibold,
  },
  filterTextActive: {
    color: colors.textInverse,
  },
  list: {
    padding: spacing.lg,
  },
  pressed: {
    opacity: 0.7,
  },
  card: {
    marginBottom: spacing.md,
    borderLeftWidth: 4,
    padding: spacing.lg,
  },
  cardRow: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "flex-start",
  },
  iconChip: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  cardMain: {
    flex: 1,
    minWidth: 0,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  orderNum: {
    flexShrink: 1,
    fontSize: font.sizes.md,
    fontWeight: font.weights.bold,
    color: colors.textPrimary,
  },
  date: {
    fontSize: font.sizes.sm,
    color: colors.textSecondary,
  },
  items: {
    fontSize: font.sizes.xs,
    color: colors.textTertiary,
    marginTop: 6,
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
  },
  price: {
    fontSize: font.sizes.lg,
    fontWeight: font.weights.bold,
    color: colors.textPrimary,
  },
  fab: {
    position: "absolute",
    right: spacing.xxl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    elevation: 6,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  fabIcon: {
    fontSize: 22,
    color: colors.textInverse,
  },
});
