import { useState } from "react";
import { View, Text, Pressable, FlatList, StyleSheet } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Card } from "@/components/Card";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useOrders, useIsClient, formatCents, formatDateShort } from "@/lib/api";
import type { Order } from "@/lib/api";
import { colors, font, spacing, radius, MIN_HIT_TARGET } from "@/lib/theme";

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

  const renderOrder = ({ item, index }: { item: Order; index: number }) => (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 50).springify()}>
      <Pressable
        onPress={() => router.push(`/(tabs)/orders/${item.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`Commande ${item.orderNumber}, ${item.status}`}
        accessibilityHint="Voir le detail"
      >
        <Card style={styles.card}>
          <View style={styles.cardTop}>
            <Text style={styles.orderNum}>{item.orderNumber}</Text>
            <StatusBadge type="order" status={item.status} />
          </View>
          <View style={styles.cardBottom}>
            <Text style={styles.date}>
              {formatDateShort(item.deliveryDate)}
              {item.timeSlot ? ` · ${item.timeSlot}` : ""}
            </Text>
            <Text style={styles.price}>{formatCents(item.totalCents)}</Text>
          </View>
          {item.items.length > 0 && (
            <Text style={styles.items} numberOfLines={1}>
              {item.items.map((i) => `${i.quantity}x ${i.product?.name ?? "?"}`).join(", ")}
            </Text>
          )}
        </Card>
      </Pressable>
    </Animated.View>
  );

  return (
    <View style={styles.container}>
      {/* Filters */}
      <FlatList
        horizontal
        data={FILTERS}
        keyExtractor={(f) => f.label}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
        renderItem={({ item: f }) => (
          <Pressable
            onPress={() => setFilter(f.key)}
            style={[styles.filterChip, filter === f.key && styles.filterActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: filter === f.key }}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
              {f.label}
            </Text>
          </Pressable>
        )}
      />

      {isLoading ? (
        <LoadingScreen />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(o) => o.id}
          renderItem={renderOrder}
          contentContainerStyle={styles.list}
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
          style={styles.fab}
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
  filters: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: MIN_HIT_TARGET,
    justifyContent: "center",
  },
  filterActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    fontSize: font.sizes.sm,
    color: colors.textSecondary,
    fontWeight: font.weights.medium,
  },
  filterTextActive: {
    color: colors.textInverse,
  },
  list: {
    padding: spacing.lg,
    paddingBottom: 100,
  },
  card: {
    marginBottom: spacing.md,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  cardBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  orderNum: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.semibold,
    color: colors.textPrimary,
  },
  date: {
    fontSize: font.sizes.sm,
    color: colors.textSecondary,
  },
  price: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.bold,
    color: colors.textPrimary,
  },
  items: {
    fontSize: font.sizes.xs,
    color: colors.textTertiary,
    marginTop: spacing.sm,
  },
  fab: {
    position: "absolute",
    bottom: spacing.xxl,
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
