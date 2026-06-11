import { useCallback, memo } from "react";
import { View, Text, FlatList, Pressable, StyleSheet } from "react-native";
import { Redirect, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { ScreenWrapper } from "@/components/ScreenWrapper";
import { Card } from "@/components/Card";
import { SectionHeader } from "@/components/SectionHeader";
import { SkeletonBox } from "@/components/SkeletonBox";
import { EmptyState } from "@/components/EmptyState";
import { useOperatorStock, useClientStocks } from "@/lib/api";
import type { OperatorStock, ClientStockRow } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { colors, font, spacing, radius } from "@/lib/theme";

const RANGE_LABELS: Record<string, string> = {
  CONFORT: "Confort",
  HOTEL: "Hotel",
  PRESTIGE: "Prestige",
};

const RANGE_COLORS: Record<string, string> = {
  CONFORT: "#06b6d4",
  HOTEL: "#6366f1",
  PRESTIGE: "#f59e0b",
};

// ─── Per-range summary card ───────────────────────────────────────

const RangeCard = memo(function RangeCard({ item, index }: { item: OperatorStock; index: number }) {
  const color = RANGE_COLORS[item.productRange] ?? colors.primary;
  const label = RANGE_LABELS[item.productRange] ?? item.productRange;
  const pctClean =
    item.inCirculation > 0 ? Math.round((item.cleanAvailable / item.inCirculation) * 100) : 0;

  return (
    <Animated.View entering={FadeInDown.delay(index * 50).springify()}>
      <Card style={styles.rangeCard}>
        <View style={styles.rangeHeader}>
          <View style={[styles.rangeDot, { backgroundColor: color }]} />
          <Text style={styles.rangeLabel}>{label}</Text>
          <View style={[styles.pctBadge, { backgroundColor: color + "22" }]}>
            <Text style={[styles.pctText, { color }]}>{pctClean}% propres</Text>
          </View>
        </View>
        <View style={styles.rangeCols}>
          <View style={styles.rangeCol}>
            <Text style={[styles.rangeNum, { color: colors.success }]}>{item.cleanAvailable}</Text>
            <Text style={styles.rangeNumLabel}>Propres</Text>
          </View>
          <View style={styles.rangeCol}>
            <Text style={[styles.rangeNum, { color: colors.warning }]}>{item.dirtyPending}</Text>
            <Text style={styles.rangeNumLabel}>Sales</Text>
          </View>
          <View style={styles.rangeCol}>
            <Text style={[styles.rangeNum, { color: colors.primary }]}>{item.inCirculation}</Text>
            <Text style={styles.rangeNumLabel}>Circulation</Text>
          </View>
          <View style={styles.rangeCol}>
            <Text style={[styles.rangeNum, { color: colors.textTertiary }]}>{item.retired}</Text>
            <Text style={styles.rangeNumLabel}>Retires</Text>
          </View>
        </View>
      </Card>
    </Animated.View>
  );
});

// ─── Client row (per-user stock from /stock/clients) ─────────────

const ClientRow = memo(function ClientRow({
  item,
  index,
}: {
  item: ClientStockRow;
  index: number;
}) {
  const isLowStock = item.stocks.some((s) => s.totalInCirculation > 0 && s.cleanSets < 3);
  const initials = item.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const totalCirc = item.stocks.reduce((acc, s) => acc + s.totalInCirculation, 0);

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 12) * 40).springify()}>
      <Pressable
        onPress={() => router.push(`/(tabs)/clients/${item.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`Stock de ${item.name}`}
      >
        <Card style={styles.clientRow}>
          {/* Avatar */}
          <View style={[styles.avatar, isLowStock && styles.avatarWarning]}>
            <Text style={[styles.avatarText, isLowStock && styles.avatarTextWarning]}>
              {initials}
            </Text>
          </View>

          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text style={styles.clientName} numberOfLines={1}>
                {item.name}
              </Text>
              {isLowStock && (
                <View style={styles.lowBadge}>
                  <Ionicons name="warning" size={10} color={colors.warning} />
                  <Text style={styles.lowBadgeText}>Stock bas</Text>
                </View>
              )}
            </View>
            <Text style={styles.totalCirc}>{totalCirc} sets en circulation</Text>

            {/* Per-range breakdown */}
            <View style={styles.rangeRow}>
              {item.stocks.map((s) => {
                const c = RANGE_COLORS[s.productRange] ?? colors.primary;
                return (
                  <View key={s.productRange} style={styles.rangePill}>
                    <View style={[styles.pillDot, { backgroundColor: c }]} />
                    <Text style={styles.pillText}>
                      {RANGE_LABELS[s.productRange] ?? s.productRange}: {s.cleanSets}/
                      {s.totalInCirculation}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </Card>
      </Pressable>
    </Animated.View>
  );
});

// ─── Header: global totals across all ranges ─────────────────────

function GlobalSummary({ ranges }: { ranges: OperatorStock[] }) {
  const totals = ranges.reduce(
    (acc, r) => {
      acc.clean += r.cleanAvailable;
      acc.dirty += r.dirtyPending;
      acc.circ += r.inCirculation;
      acc.retired += r.retired;
      return acc;
    },
    { clean: 0, dirty: 0, circ: 0, retired: 0 },
  );

  return (
    <Card style={styles.summaryCard}>
      <Text style={styles.summaryTitle} accessibilityRole="header">
        Stock operateur global
      </Text>
      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: colors.success }]}>{totals.clean}</Text>
          <Text style={styles.summaryLabel}>Propres</Text>
        </View>
        <View style={[styles.summaryItem, styles.summaryItemCenter]}>
          <Text style={[styles.summaryValue, { fontSize: font.sizes.xxxl }]}>{totals.circ}</Text>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Circulation</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: colors.warning }]}>{totals.dirty}</Text>
          <Text style={styles.summaryLabel}>Sales</Text>
        </View>
      </View>
    </Card>
  );
}

// ─── Screen ──────────────────────────────────────────────────────

type ListItem =
  | { _type: "summary"; key: string }
  | { _type: "rangeHeader"; key: string }
  | { _type: "range"; key: string; item: OperatorStock; index: number }
  | { _type: "clientHeader"; key: string; count: number }
  | { _type: "client"; key: string; item: ClientStockRow; index: number };

export default function StockGlobalScreen() {
  // Écran admin uniquement : accessible par deep-link, on garde le rôle ici
  // (les hooks de données sont déjà gardés côté `enabled`, mais l'UI doit
  // rediriger un non-admin plutôt qu'afficher une page vide).
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === "ROLE_ADMIN" || role === "ROLE_SUPER_ADMIN";

  const {
    data: ranges,
    isLoading: loadingRanges,
    refetch: refetchRanges,
    isRefetching: refRanges,
  } = useOperatorStock();
  const {
    data: clients,
    isLoading: loadingClients,
    refetch: refetchClients,
    isRefetching: refClients,
  } = useClientStocks();

  const isLoading = loadingRanges || loadingClients;
  const isRefetching = refRanges || refClients;

  const refetch = useCallback(() => {
    void refetchRanges();
    void refetchClients();
  }, [refetchRanges, refetchClients]);

  const listData: ListItem[] = [];

  if (ranges && ranges.length > 0) {
    listData.push({ _type: "summary", key: "summary" });
    listData.push({ _type: "rangeHeader", key: "rangeHeader" });
    ranges.forEach((r, i) => listData.push({ _type: "range", key: r.id, item: r, index: i }));
  }

  if (clients && clients.length > 0) {
    listData.push({ _type: "clientHeader", key: "clientHeader", count: clients.length });
    clients.forEach((c, i) => listData.push({ _type: "client", key: c.id, item: c, index: i }));
  }

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item._type === "summary") {
        return <GlobalSummary ranges={ranges ?? []} />;
      }
      if (item._type === "rangeHeader") {
        return (
          <View style={{ paddingBottom: spacing.xs }}>
            <SectionHeader title="Par gamme" />
          </View>
        );
      }
      if (item._type === "range") {
        return <RangeCard item={item.item} index={item.index} />;
      }
      if (item._type === "clientHeader") {
        return (
          <View style={{ paddingTop: spacing.md, paddingBottom: spacing.xs }}>
            <SectionHeader title={`Clients (${item.count})`} />
          </View>
        );
      }
      if (item._type === "client") {
        return <ClientRow item={item.item} index={item.index} />;
      }
      return null;
    },
    [ranges],
  );

  // Garde de rôle après tous les hooks (Rules of Hooks).
  if (!isAdmin) {
    return <Redirect href="/(tabs)" />;
  }

  if (isLoading) {
    return (
      <ScreenWrapper>
        <SkeletonBox height={120} style={{ marginBottom: spacing.md }} />
        {[1, 2, 3].map((i) => (
          <SkeletonBox key={i} height={88} style={{ marginBottom: spacing.sm }} />
        ))}
      </ScreenWrapper>
    );
  }

  if (!ranges?.length && !clients?.length) {
    return (
      <ScreenWrapper>
        <EmptyState
          icon="cube-outline"
          title="Aucune donnee stock"
          description="Le stock operateur apparaitra ici des que des livraisons auront ete effectuees."
        />
      </ScreenWrapper>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={listData}
        keyExtractor={(i) => i.key}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshing={isRefetching}
        onRefresh={refetch}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { paddingHorizontal: spacing.lg, paddingBottom: 100, gap: spacing.sm },

  // Global summary
  summaryCard: { marginBottom: spacing.xs },
  summaryTitle: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.bold,
    color: colors.textPrimary,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  summaryItem: { alignItems: "center" },
  summaryItemCenter: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.xl,
  },
  summaryValue: {
    fontSize: font.sizes.xxl,
    fontWeight: font.weights.heavy,
    color: colors.textPrimary,
  },
  summaryLabel: {
    fontSize: font.sizes.xs,
    color: colors.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginTop: 2,
  },

  // Range card
  rangeCard: { marginBottom: spacing.xs },
  rangeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  rangeDot: { width: 10, height: 10, borderRadius: 5 },
  rangeLabel: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.semibold,
    color: colors.textPrimary,
    flex: 1,
  },
  pctBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  pctText: { fontSize: font.sizes.xs, fontWeight: font.weights.semibold },
  rangeCols: { flexDirection: "row", justifyContent: "space-between" },
  rangeCol: { alignItems: "center", flex: 1 },
  rangeNum: {
    fontSize: font.sizes.xl,
    fontWeight: font.weights.heavy,
  },
  rangeNumLabel: {
    fontSize: font.sizes.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },

  // Client row
  clientRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarWarning: { backgroundColor: colors.warningLight },
  avatarText: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.bold,
    color: colors.primary,
  },
  avatarTextWarning: { color: colors.warning },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  clientName: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.semibold,
    color: colors.textPrimary,
    flex: 1,
  },
  lowBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.warningLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  lowBadgeText: {
    fontSize: 10,
    fontWeight: font.weights.semibold,
    color: colors.warning,
  },
  totalCirc: { fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: 2 },
  rangeRow: {
    flexDirection: "row",
    gap: spacing.xs,
    flexWrap: "wrap",
    marginTop: spacing.xs,
  },
  rangePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.borderLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 10, color: colors.textSecondary, fontWeight: font.weights.medium },
});
