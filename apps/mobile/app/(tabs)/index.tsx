import { View, Text, Pressable, StyleSheet } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { PieChart } from "react-native-gifted-charts";
import { ScreenWrapper } from "@/components/ScreenWrapper";
import { Card } from "@/components/Card";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { SectionHeader } from "@/components/SectionHeader";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useAuthStore } from "@/lib/store";
import {
  useProfile,
  useMyStock,
  useMySubscription,
  useOrders,
  useDashboardKpis,
  useTodayRound,
  formatCents,
  formatDateShort,
  formatDate,
} from "@/lib/api";
import { colors, font, spacing, radius } from "@/lib/theme";

// ─── Client home ─────────────────────────────────────────────────

function ClientHome() {
  const profile = useProfile();
  const stock = useMyStock();
  const sub = useMySubscription();
  const orders = useOrders();

  const isLoading = profile.isLoading || stock.isLoading || sub.isLoading || orders.isLoading;
  const refetch = () => {
    profile.refetch();
    stock.refetch();
    sub.refetch();
    orders.refetch();
  };

  if (isLoading && !profile.data) return <LoadingScreen />;

  const nextOrder = orders.data?.find((o) => o.status !== "DELIVERED" && o.status !== "CANCELLED");
  const totalClean = stock.data?.stocks.reduce((s, st) => s + st.cleanSets, 0) ?? 0;
  const totalDirty = stock.data?.stocks.reduce((s, st) => s + st.dirtySets, 0) ?? 0;
  const totalCirc = stock.data?.stocks.reduce((s, st) => s + st.totalInCirculation, 0) ?? 0;

  return (
    <ScreenWrapper refreshing={isLoading} onRefresh={refetch}>
      {/* Hero greeting */}
      <LinearGradient
        colors={[colors.primary, colors.primaryDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <Text style={styles.heroGreeting}>Bonjour, {profile.data?.name?.split(" ")[0] ?? ""}</Text>
        {sub.data && (
          <View style={styles.heroPill}>
            <Text style={styles.heroPillText}>
              {sub.data.plan} · {sub.data.status === "ACTIVE" ? "Actif" : sub.data.status}
            </Text>
          </View>
        )}
      </LinearGradient>

      {/* Mini stock donut */}
      <Pressable
        onPress={() => router.push("/(tabs)/stock")}
        accessibilityRole="button"
        accessibilityLabel="Mon stock"
      >
        <Card style={styles.stockCard}>
          <View style={styles.stockRow}>
            <PieChart
              data={[
                { value: totalClean || 0.1, color: colors.clean },
                { value: totalDirty || 0.1, color: colors.dirty },
                {
                  value: Math.max(totalCirc - totalClean - totalDirty, 0) || 0.1,
                  color: colors.circulation,
                },
              ]}
              donut
              radius={44}
              innerRadius={30}
              innerCircleColor={colors.surface}
              centerLabelComponent={() => <Text style={styles.miniDonutCenter}>{totalCirc}</Text>}
            />
            <View style={styles.stockLegend}>
              <Text style={styles.stockTitle}>Mon stock</Text>
              <View style={styles.stockLegendRow}>
                <View style={[styles.dot, { backgroundColor: colors.clean }]} />
                <Text style={styles.stockLegendText}>{totalClean} propres</Text>
              </View>
              <View style={styles.stockLegendRow}>
                <View style={[styles.dot, { backgroundColor: colors.dirty }]} />
                <Text style={styles.stockLegendText}>{totalDirty} sales</Text>
              </View>
              <View style={styles.stockLegendRow}>
                <View style={[styles.dot, { backgroundColor: colors.circulation }]} />
                <Text style={styles.stockLegendText}>
                  {Math.max(totalCirc - totalClean - totalDirty, 0)} en transit
                </Text>
              </View>
            </View>
            <Text style={styles.chevron}>{"\u203a"}</Text>
          </View>
        </Card>
      </Pressable>

      {/* Next delivery */}
      {nextOrder && (
        <>
          <SectionHeader title="Prochaine livraison" />
          <Pressable
            onPress={() => router.push(`/(tabs)/orders/${nextOrder.id}`)}
            accessibilityRole="button"
          >
            <Card>
              <View style={styles.deliveryRow}>
                <View style={styles.deliveryDateBox}>
                  <Text style={styles.deliveryDay}>
                    {new Date(nextOrder.deliveryDate).getDate()}
                  </Text>
                  <Text style={styles.deliveryMonth}>
                    {new Date(nextOrder.deliveryDate).toLocaleDateString("fr-FR", {
                      month: "short",
                    })}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.deliveryNum}>{nextOrder.orderNumber}</Text>
                  <Text style={styles.deliverySlot}>
                    {nextOrder.timeSlot ?? "Creneau a confirmer"}
                  </Text>
                  <Text style={styles.deliveryItems}>
                    {nextOrder.items.map((i) => `${i.quantity}x ${i.product.range}`).join(", ")}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <StatusBadge type="order" status={nextOrder.status} />
                  <Text style={styles.deliveryPrice}>{formatCents(nextOrder.totalCents)}</Text>
                </View>
              </View>
            </Card>
          </Pressable>
        </>
      )}

      {/* Quick actions */}
      <SectionHeader title="Actions rapides" />
      <View style={styles.actionsGrid}>
        <Pressable
          style={[styles.actionCard, { backgroundColor: colors.primaryLight }]}
          onPress={() => router.push("/(tabs)/orders/new")}
          accessibilityRole="button"
          accessibilityLabel="Nouvelle commande"
        >
          <Text style={styles.actionIcon}>{"\ud83d\udce6"}</Text>
          <Text style={[styles.actionLabel, { color: colors.primary }]}>Commander</Text>
        </Pressable>
        <Pressable
          style={[styles.actionCard, { backgroundColor: colors.successLight }]}
          onPress={() => router.push("/(tabs)/orders")}
          accessibilityRole="button"
          accessibilityLabel="Mes commandes"
        >
          <Text style={styles.actionIcon}>{"\ud83d\udcdd"}</Text>
          <Text style={[styles.actionLabel, { color: colors.success }]}>Commandes</Text>
        </Pressable>
        <Pressable
          style={[styles.actionCard, { backgroundColor: colors.warningLight }]}
          onPress={() => router.push("/(tabs)/notifications")}
          accessibilityRole="button"
          accessibilityLabel="Notifications"
        >
          <Text style={styles.actionIcon}>{"\ud83d\udd14"}</Text>
          <Text style={[styles.actionLabel, { color: colors.warning }]}>Alertes</Text>
        </Pressable>
        <Pressable
          style={[styles.actionCard, { backgroundColor: colors.infoLight }]}
          onPress={() => router.push("/(tabs)/profile")}
          accessibilityRole="button"
          accessibilityLabel="Mon profil"
        >
          <Text style={styles.actionIcon}>{"\ud83d\udc64"}</Text>
          <Text style={[styles.actionLabel, { color: colors.info }]}>Profil</Text>
        </Pressable>
      </View>
    </ScreenWrapper>
  );
}

// ─── Admin home ──────────────────────────────────────────────────

function AdminHome() {
  const profile = useProfile();
  const kpis = useDashboardKpis();
  const orders = useOrders();

  const isLoading = profile.isLoading || kpis.isLoading;
  const refetch = () => {
    profile.refetch();
    kpis.refetch();
    orders.refetch();
  };

  if (isLoading && !profile.data) return <LoadingScreen />;

  const k = kpis.data;

  return (
    <ScreenWrapper refreshing={isLoading} onRefresh={refetch}>
      <LinearGradient
        colors={["#0f172a", "#1e293b"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <Text style={styles.heroGreeting}>Admin · {profile.data?.name?.split(" ")[0] ?? ""}</Text>
      </LinearGradient>

      {k && (
        <>
          <View style={styles.statsRow}>
            <StatCard
              icon={"\ud83d\udcb0"}
              label="CA semaine"
              value={formatCents(k.revenueCents)}
              sub={`vs ${formatCents(k.revenuePrevWeekCents)}`}
              color={colors.success}
            />
            <StatCard
              icon={"\ud83d\ude9a"}
              label="Livraisons"
              value={k.deliveriesCompleted}
              color={colors.info}
            />
          </View>
          <View style={[styles.statsRow, { marginTop: spacing.sm }]}>
            <StatCard
              icon={"\ud83d\udc65"}
              label="Nouveaux"
              value={k.newClients}
              color={colors.primary}
            />
            <StatCard
              icon={"\ud83d\udd04"}
              label="Abos actifs"
              value={k.activeSubscriptions}
              color={colors.accent}
            />
          </View>
          {k.lowStockAlerts > 0 && (
            <Card style={styles.alertCard}>
              <Text style={styles.alertText}>
                {"\u26a0\ufe0f"} {k.lowStockAlerts} alerte{k.lowStockAlerts > 1 ? "s" : ""} stock
                bas
              </Text>
            </Card>
          )}
        </>
      )}

      <SectionHeader
        title="Commandes en attente"
        action={{ label: "Tout voir", onPress: () => router.push("/(tabs)/orders") }}
      />
      {orders.data
        ?.filter((o) => o.status === "PENDING")
        .slice(0, 5)
        .map((order) => (
          <Pressable key={order.id} onPress={() => router.push(`/(tabs)/orders/${order.id}`)}>
            <Card style={{ marginBottom: spacing.sm }}>
              <View style={styles.deliveryRow}>
                <View style={styles.deliveryDateBox}>
                  <Text style={styles.deliveryDay}>{new Date(order.deliveryDate).getDate()}</Text>
                  <Text style={styles.deliveryMonth}>
                    {new Date(order.deliveryDate).toLocaleDateString("fr-FR", { month: "short" })}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.deliveryNum}>{order.orderNumber}</Text>
                  <Text style={styles.deliverySlot}>{order.user?.name ?? "Client"}</Text>
                </View>
                <Text style={styles.deliveryPrice}>{formatCents(order.totalCents)}</Text>
              </View>
            </Card>
          </Pressable>
        ))}
    </ScreenWrapper>
  );
}

// ─── Driver home ─────────────────────────────────────────────────

function DriverHome() {
  const profile = useProfile();
  const round = useTodayRound();

  const isLoading = profile.isLoading || round.isLoading;
  const refetch = () => {
    profile.refetch();
    round.refetch();
  };

  if (isLoading && !profile.data) return <LoadingScreen />;

  const todayRound = round.data;
  const completed = todayRound?.stops.filter((s) => s.status === "COMPLETED").length ?? 0;
  const total = todayRound?.stops.length ?? 0;
  const pending = todayRound?.stops.filter((s) => s.status === "PENDING") ?? [];

  return (
    <ScreenWrapper refreshing={isLoading} onRefresh={refetch}>
      <LinearGradient
        colors={[colors.success, "#059669"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <Text style={styles.heroGreeting}>{profile.data?.name?.split(" ")[0] ?? "Livreur"}</Text>
        <Text style={[styles.heroPillText, { color: "rgba(255,255,255,0.8)" }]}>
          {todayRound ? `${completed}/${total} arrets` : "Pas de tournee"}
        </Text>
      </LinearGradient>

      {!todayRound ? (
        <Card
          style={{ marginTop: spacing.lg, alignItems: "center", paddingVertical: spacing.xxxl }}
        >
          <Text style={{ fontSize: 48 }}>{"\ud83d\ude9a"}</Text>
          <Text
            style={{
              fontSize: font.sizes.lg,
              fontWeight: font.weights.semibold,
              color: colors.textPrimary,
              marginTop: spacing.md,
            }}
          >
            Pas de tournee aujourd'hui
          </Text>
          <Text
            style={{ fontSize: font.sizes.sm, color: colors.textTertiary, marginTop: spacing.xs }}
          >
            Revenez demain !
          </Text>
        </Card>
      ) : (
        <>
          {total > 0 && (
            <Card
              style={{ marginTop: spacing.md, alignItems: "center", paddingVertical: spacing.xl }}
            >
              <PieChart
                data={[
                  { value: completed || 0.1, color: colors.success },
                  { value: total - completed || 0.1, color: colors.border },
                ]}
                donut
                radius={50}
                innerRadius={36}
                innerCircleColor={colors.surface}
                centerLabelComponent={() => (
                  <Text
                    style={{
                      fontSize: font.sizes.lg,
                      fontWeight: font.weights.heavy,
                      color: colors.textPrimary,
                    }}
                  >
                    {Math.round((completed / total) * 100)}%
                  </Text>
                )}
              />
              <Text
                style={{
                  fontSize: font.sizes.sm,
                  color: colors.textTertiary,
                  marginTop: spacing.md,
                }}
              >
                Progression de la tournee
              </Text>
            </Card>
          )}

          <SectionHeader title={`Arrets restants (${pending.length})`} />
          {pending.map((stop, i) => (
            <Card key={stop.id} style={{ marginBottom: spacing.sm }}>
              <View style={styles.deliveryRow}>
                <View style={[styles.deliveryDateBox, { backgroundColor: colors.successLight }]}>
                  <Text style={[styles.deliveryDay, { color: colors.success }]}>
                    #{stop.stopOrder}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.deliveryNum}>{stop.client.name}</Text>
                  <Text style={styles.deliverySlot}>{stop.setsToDeliver} sets a livrer</Text>
                  {stop.specialInstructions && (
                    <Text style={styles.deliveryItems}>{stop.specialInstructions}</Text>
                  )}
                </View>
              </View>
            </Card>
          ))}
        </>
      )}
    </ScreenWrapper>
  );
}

// ─── Router ──────────────────────────────────────────────────────

export default function HomeScreen() {
  const role = useAuthStore((s) => s.user?.role);
  if (role === "ROLE_ADMIN" || role === "ROLE_SUPER_ADMIN") return <AdminHome />;
  if (role === "ROLE_LIVREUR") return <DriverHome />;
  return <ClientHome />;
}

// ─── Styles ──────────────────────────────────────────────────────

const styles = StyleSheet.create({
  hero: {
    borderRadius: radius.xl,
    padding: spacing.xxl,
    marginBottom: spacing.lg,
  },
  heroGreeting: {
    fontSize: font.sizes.xxl,
    fontWeight: font.weights.heavy,
    color: colors.textInverse,
  },
  heroPill: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    alignSelf: "flex-start",
    marginTop: spacing.sm,
  },
  heroPillText: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.semibold,
    color: colors.textInverse,
  },
  // Stock mini
  stockCard: {},
  stockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  stockLegend: { flex: 1 },
  stockTitle: {
    fontSize: font.sizes.lg,
    fontWeight: font.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  stockLegendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: 4,
  },
  stockLegendText: {
    fontSize: font.sizes.sm,
    color: colors.textSecondary,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  miniDonutCenter: {
    fontSize: font.sizes.lg,
    fontWeight: font.weights.heavy,
    color: colors.textPrimary,
  },
  chevron: {
    fontSize: 28,
    color: colors.textTertiary,
    fontWeight: font.weights.bold,
  },
  // Delivery
  deliveryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  deliveryDateBox: {
    width: 50,
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  deliveryDay: {
    fontSize: font.sizes.xl,
    fontWeight: font.weights.heavy,
    color: colors.primary,
    lineHeight: 24,
  },
  deliveryMonth: {
    fontSize: font.sizes.xs,
    color: colors.primary,
    textTransform: "uppercase",
  },
  deliveryNum: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.semibold,
    color: colors.textPrimary,
  },
  deliverySlot: {
    fontSize: font.sizes.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  deliveryItems: {
    fontSize: font.sizes.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  deliveryPrice: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.bold,
    color: colors.textPrimary,
  },
  // Quick actions
  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  actionCard: {
    width: "48%",
    flexGrow: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 90,
  },
  actionIcon: {
    fontSize: 28,
    marginBottom: spacing.xs,
  },
  actionLabel: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.semibold,
  },
  // Stats
  statsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  // Alert
  alertCard: {
    marginTop: spacing.md,
    borderColor: colors.warning,
    backgroundColor: colors.warningLight,
  },
  alertText: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.semibold,
    color: colors.warning,
  },
});
