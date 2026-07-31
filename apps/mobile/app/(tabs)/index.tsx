import { View, Text, Pressable, StyleSheet } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { PieChart } from "react-native-gifted-charts";
import { ScreenWrapper } from "@/components/ScreenWrapper";
import { Card } from "@/components/Card";
import { StatCard } from "@/components/StatCard";
import { StatusBadge, statusMeta } from "@/components/StatusBadge";
import { SectionHeader } from "@/components/SectionHeader";
import { SkeletonBox } from "@/components/SkeletonBox";
import { ProgressRing } from "@/components/ProgressRing";
import { MonLingeCard } from "@/components/MonLingeCard";
import { useAuthStore } from "@/lib/store";
import {
  useProfile,
  useMyStock,
  useMySubscription,
  useSubscriptionConfig,
  useMyRotations,
  useOrders,
  useDashboardKpis,
  useDashboardAlerts,
  useTodayRound,
  usePassagesMine,
  useRepondrePassage,
  formatCents,
} from "@/lib/api";
import type { Order, DashboardAlert, DeliveryStop, PassageOpportunite } from "@/lib/api";
import { buildClientStockView } from "@/lib/stock-summary";
import { orderTotals } from "@/lib/order-total";
import { colors, font, spacing, radius } from "@/lib/theme";

/** Date civile locale au format YYYY-MM-DD, sans passer par toISOString() (UTC). */
function localYmd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Parse une date civile en heure locale (cf. localYmd). */
function parseYmd(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

// ─── Quick action button ─────────────────────────────────────────

function QuickAction({
  icon,
  label,
  color,
  bgColor,
  onPress,
  badge,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  bgColor: string;
  onPress: () => void;
  badge?: number;
}) {
  return (
    <Pressable
      style={[styles.actionCard, { backgroundColor: bgColor }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={{ position: "relative" }}>
        <Ionicons name={icon} size={28} color={color} />
        {badge != null && badge > 0 && (
          <View style={styles.actionBadge}>
            <Text style={styles.actionBadgeText}>{badge > 9 ? "9+" : badge}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

// ─── Client home ─────────────────────────────────────────────────

function ClientHome() {
  const profile = useProfile();
  const stock = useMyStock();
  const sub = useMySubscription();
  const subConfig = useSubscriptionConfig();
  const orders = useOrders();
  const rotations = useMyRotations();
  const passages = usePassagesMine();

  const isLoading = profile.isLoading || stock.isLoading || sub.isLoading || orders.isLoading;
  const refreshing =
    profile.isRefetching || stock.isRefetching || sub.isRefetching || orders.isRefetching;
  const refetch = () => {
    void profile.refetch();
    void stock.refetch();
    void sub.refetch();
    void subConfig.refetch();
    void orders.refetch();
    void rotations.refetch();
    void passages.refetch();
  };

  if (isLoading && !profile.data) {
    return (
      <ScreenWrapper>
        <SkeletonBox height={120} style={{ marginBottom: spacing.md }} />
        <SkeletonBox height={80} style={{ marginBottom: spacing.md }} />
        <SkeletonBox height={100} />
      </ScreenWrapper>
    );
  }

  // GET /orders trie par date de CRÉATION décroissante : prendre le premier
  // élément ouvert donnait la commande la plus récemment passée, pas la
  // prochaine livrée. On écarte aussi les dates dépassées, sinon une commande
  // jamais traitée reste affichée comme « prochaine » avec une date révolue.
  const todayYmd = localYmd(new Date());
  const nextOrder = orders.data
    ?.filter(
      (o) =>
        o.status !== "DELIVERED" &&
        o.status !== "CANCELLED" &&
        (o.deliveryDate ?? "").slice(0, 10) >= todayYmd,
    )
    .sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate))[0];
  // Même source unifiée que l'écran Stock : sans le repli sur les rotations, la
  // carte affichait 0 partout pour un client pourtant livré — la table
  // d'agrégats n'étant alimentée que par un ajustement manuel d'admin.
  const stockView = buildClientStockView({
    stocks: stock.data?.stocks,
    rotations: rotations.data,
  });
  const totalCirc = stockView.totals.inCirculation;
  const hasSplit = stockView.totals.clean !== null;
  const totalClean = stockView.totals.clean ?? 0;
  const totalDirty = stockView.totals.dirty ?? 0;
  const totalTransit = stockView.totals.inTransit ?? 0;

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={refetch}>
      {/* Hero greeting */}
      <LinearGradient
        colors={[colors.primary, colors.primaryDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <Text style={styles.heroGreeting}>
          Bonjour, {profile.data?.name?.split(" ")[0] ?? ""} 👋
        </Text>
        {sub.data && (
          <View style={styles.heroPill}>
            <Text style={styles.heroPillText}>
              {/* Nom du plan : depuis la config (Pack Sérénité) ou legacy */}
              {subConfig.data?.planName ?? sub.data.plan ?? "Abonnement"} ·{" "}
              {statusMeta("subscription", sub.data.status).label}
            </Text>
          </View>
        )}
      </LinearGradient>

      {/* Passage déjà prévu dans la commune — la seule remise de livraison */}
      {(passages.data ?? []).map((p) => (
        <PassageCard key={p.id} passage={p} />
      ))}

      {/* Mini stock donut */}
      <Pressable
        onPress={() => router.push("/(tabs)/stock")}
        accessibilityRole="button"
        accessibilityLabel="Voir mon stock de linge"
      >
        <Card style={styles.stockCard}>
          <View style={styles.stockRow}>
            <PieChart
              data={
                hasSplit
                  ? [
                      { value: totalClean || 0.1, color: colors.clean },
                      { value: totalDirty || 0.1, color: colors.dirty },
                      { value: totalTransit || 0.1, color: colors.circulation },
                    ]
                  : // Ventilation inconnue : un anneau d'une seule couleur, plutôt
                    // que trois parts inventées à parts égales.
                    [{ value: totalCirc || 0.1, color: colors.circulation }]
              }
              donut
              radius={44}
              innerRadius={30}
              innerCircleColor={colors.surface}
              centerLabelComponent={() => <Text style={styles.miniDonutCenter}>{totalCirc}</Text>}
            />
            <View style={styles.stockLegend}>
              <Text style={styles.stockTitle}>Mon stock</Text>
              {hasSplit ? (
                <>
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
                    <Text style={styles.stockLegendText}>{totalTransit} en transit</Text>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.stockLegendRow}>
                    <View style={[styles.dot, { backgroundColor: colors.circulation }]} />
                    <Text style={styles.stockLegendText}>
                      {totalCirc} article{totalCirc > 1 ? "s" : ""} chez vous
                    </Text>
                  </View>
                  <Text style={styles.stockLegendHint}>
                    {totalCirc > 0 ? "Détail dans Mon stock" : "Rien en circulation"}
                  </Text>
                </>
              )}
            </View>
            <Ionicons name="chevron-forward" size={24} color={colors.textTertiary} />
          </View>
        </Card>
      </Pressable>

      {/* Ce que le client détient et quand il doit être repris */}
      <MonLingeCard />

      {/* Next delivery */}
      {nextOrder && (
        <>
          <SectionHeader title="Prochaine livraison" />
          <Pressable
            onPress={() => router.push(`/(tabs)/orders/${nextOrder.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`Commande ${nextOrder.orderNumber}`}
          >
            <Card>
              <View style={styles.deliveryRow}>
                <View style={styles.deliveryDateBox}>
                  <Text style={styles.deliveryDay}>
                    {parseYmd(nextOrder.deliveryDate).getDate()}
                  </Text>
                  <Text style={styles.deliveryMonth}>
                    {parseYmd(nextOrder.deliveryDate).toLocaleDateString("fr-FR", {
                      month: "short",
                    })}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.deliveryNum}>{nextOrder.orderNumber}</Text>
                  <Text style={styles.deliverySlot}>
                    {nextOrder.timeSlot ?? "Créneau à confirmer"}
                  </Text>
                  <Text style={styles.deliveryItems} numberOfLines={1}>
                    {nextOrder.items
                      .map((i) => `${i.quantity}x ${i.product?.name ?? i.product?.range ?? "?"}`)
                      .join(", ")}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <StatusBadge type="order" status={nextOrder.status} />
                  <Text style={styles.deliveryPrice}>
                    {formatCents(orderTotals(nextOrder).totalCents)}
                  </Text>
                </View>
              </View>
            </Card>
          </Pressable>
        </>
      )}

      {/* Quick actions */}
      <SectionHeader title="Actions rapides" />
      <View style={styles.actionsGrid}>
        <QuickAction
          icon="add-circle"
          label="Commander"
          color={colors.primary}
          bgColor={colors.primaryLight}
          onPress={() => router.push("/(tabs)/orders/new")}
        />
        <QuickAction
          icon="receipt"
          label="Commandes"
          color={colors.success}
          bgColor={colors.successLight}
          onPress={() => router.push("/(tabs)/orders")}
        />
        <QuickAction
          icon="shirt-outline"
          label="Catalogue"
          color={colors.accent}
          bgColor={colors.accentLight}
          onPress={() => router.push("/(tabs)/catalogue")}
        />
        <QuickAction
          icon="notifications"
          label="Alertes"
          color={colors.warning}
          bgColor={colors.warningLight}
          onPress={() => router.push("/(tabs)/notifications")}
        />
      </View>
    </ScreenWrapper>
  );
}

// ─── Admin home ──────────────────────────────────────────────────

const PendingOrderCard = ({ order, index }: { order: Order; index: number }) => (
  <Animated.View entering={FadeInDown.delay(index * 50).springify()}>
    <Pressable
      onPress={() => router.push(`/(tabs)/orders/${order.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`Commande ${order.orderNumber} de ${order.user?.name ?? "client"}`}
    >
      <Card style={styles.pendingCard}>
        <View style={styles.deliveryRow}>
          <View style={styles.deliveryDateBox}>
            <Text style={styles.deliveryDay}>{parseYmd(order.deliveryDate).getDate()}</Text>
            <Text style={styles.deliveryMonth}>
              {parseYmd(order.deliveryDate).toLocaleDateString("fr-FR", { month: "short" })}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.deliveryNum}>{order.orderNumber}</Text>
            <Text style={styles.deliverySlot}>{order.user?.name ?? "Client"}</Text>
            {order.user?.zone && <Text style={styles.deliveryItems}>{order.user.zone.name}</Text>}
          </View>
          <View style={{ alignItems: "flex-end", gap: 4 }}>
            <Text style={styles.deliveryPrice}>{formatCents(order.totalCents)}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </View>
        </View>
      </Card>
    </Pressable>
  </Animated.View>
);

const AlertCard = ({ alert, alertKey }: { alert: DashboardAlert; alertKey: string }) => {
  const severityColor =
    alert.severity === "error"
      ? colors.error
      : alert.severity === "warning"
        ? colors.warning
        : colors.info;
  return (
    <Pressable
      key={alertKey}
      onPress={() => {
        // entityId is a client id ONLY for these alert types. For others
        // (e.g. DELIVERY_UNCONFIRMED) entityId = stop.id, not a client →
        // routing to /clients/${id} would 404 "Client introuvable".
        const isClientAlert =
          (alert.type === "STOCK_LOW" || alert.type === "PAYMENT_FAILED") && !!alert.entityId;
        if (isClientAlert) {
          router.push(`/(tabs)/clients/${alert.entityId}`);
        } else {
          router.push("/(tabs)/stock-global");
        }
      }}
      accessibilityRole="button"
      accessibilityLabel={alert.message}
    >
      <Card style={[styles.alertCard, { borderLeftColor: severityColor, borderLeftWidth: 4 }]}>
        <View style={styles.alertRow}>
          <Ionicons
            name={alert.severity === "error" ? "close-circle-outline" : "warning-outline"}
            size={18}
            color={severityColor}
          />
          <Text style={[styles.alertText, { color: severityColor }]} numberOfLines={2}>
            {alert.message}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        </View>
      </Card>
    </Pressable>
  );
};

function AdminHome() {
  const profile = useProfile();
  const kpis = useDashboardKpis();
  const alerts = useDashboardAlerts();
  const orders = useOrders("PENDING");

  const isLoading = profile.isLoading || kpis.isLoading;
  const refreshing =
    profile.isRefetching || kpis.isRefetching || orders.isRefetching || alerts.isRefetching;
  const refetch = () => {
    profile.refetch();
    kpis.refetch();
    orders.refetch();
    alerts.refetch();
  };

  if (isLoading && !profile.data) {
    return (
      <ScreenWrapper>
        <SkeletonBox height={110} style={{ marginBottom: spacing.md }} />
        <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm }}>
          <SkeletonBox height={90} style={{ flex: 1 }} />
          <SkeletonBox height={90} style={{ flex: 1 }} />
        </View>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <SkeletonBox height={90} style={{ flex: 1 }} />
          <SkeletonBox height={90} style={{ flex: 1 }} />
        </View>
      </ScreenWrapper>
    );
  }

  const k = kpis.data;
  const pendingOrders = orders.data ?? [];
  const visibleAlerts = alerts.data?.slice(0, 3) ?? [];

  const revenueDiff = k ? k.revenueCents - k.revenuePrevWeekCents : 0;
  const revenueTrend = revenueDiff >= 0 ? "up" : "down";

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={refetch}>
      <LinearGradient
        colors={["#0f172a", "#1e293b"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <Text style={styles.heroGreeting}>Admin · {profile.data?.name?.split(" ")[0] ?? ""}</Text>
        <Text style={styles.heroDate}>
          {new Date().toLocaleDateString("fr-FR", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </Text>
      </LinearGradient>

      {k && (
        <>
          {/* KPI row 1 */}
          <View style={styles.statsRow}>
            <Pressable style={{ flex: 1 }} onPress={() => {}} accessibilityRole="none">
              <Card style={styles.kpiCard}>
                <View style={[styles.kpiIcon, { backgroundColor: colors.successLight }]}>
                  <Ionicons name="cash-outline" size={18} color={colors.success} />
                </View>
                <Text style={[styles.kpiValue, { color: colors.success }]}>
                  {formatCents(k.revenueCents)}
                </Text>
                <Text style={styles.kpiLabel}>CA semaine</Text>
                <View style={styles.kpiTrend}>
                  <Ionicons
                    name={revenueTrend === "up" ? "trending-up" : "trending-down"}
                    size={14}
                    color={revenueTrend === "up" ? colors.success : colors.error}
                  />
                  <Text
                    style={[
                      styles.kpiTrendText,
                      { color: revenueTrend === "up" ? colors.success : colors.error },
                    ]}
                  >
                    vs {formatCents(k.revenuePrevWeekCents)}
                  </Text>
                </View>
              </Card>
            </Pressable>
            <StatCard
              icon="car-outline"
              label="Livraisons"
              value={k.deliveriesCompleted}
              color={colors.info}
            />
          </View>

          {/* KPI row 2 */}
          <View style={[styles.statsRow, { marginTop: spacing.sm }]}>
            <StatCard
              icon="people-outline"
              label="Nouveaux clients"
              value={k.newClients}
              color={colors.primary}
            />
            <StatCard
              icon="sync-outline"
              label="Abos actifs"
              value={k.activeSubscriptions}
              color={colors.accent}
            />
          </View>

          {/* Alerts */}
          {visibleAlerts.length > 0 && (
            <>
              <SectionHeader
                title={`Alertes stock (${k.lowStockAlerts})`}
                action={{ label: "Voir tout", onPress: () => router.push("/(tabs)/stock-global") }}
              />
              {visibleAlerts.map((alert, i) => {
                const k = `${alert.type}-${alert.entityId ?? "none"}-${i}`;
                return <AlertCard key={k} alertKey={k} alert={alert} />;
              })}
            </>
          )}
          {k.lowStockAlerts > 0 && visibleAlerts.length === 0 && (
            <Pressable onPress={() => router.push("/(tabs)/stock-global")}>
              <Card
                style={[styles.alertCard, { borderLeftColor: colors.warning, borderLeftWidth: 4 }]}
              >
                <View style={styles.alertRow}>
                  <Ionicons name="warning-outline" size={18} color={colors.warning} />
                  <Text style={[styles.alertText, { color: colors.warningText }]}>
                    {k.lowStockAlerts} alerte{k.lowStockAlerts > 1 ? "s" : ""} stock bas
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                </View>
              </Card>
            </Pressable>
          )}
        </>
      )}

      {/* Quick actions */}
      <SectionHeader title="Navigation rapide" />
      <View style={styles.actionsGrid}>
        <QuickAction
          icon="cube"
          label="Commandes"
          color={colors.primary}
          bgColor={colors.primaryLight}
          onPress={() => router.push("/(tabs)/orders")}
          badge={pendingOrders.length}
        />
        <QuickAction
          icon="people"
          label="Clients"
          color={colors.accent}
          bgColor={colors.accentLight}
          onPress={() => router.push("/(tabs)/clients")}
        />
        <QuickAction
          icon="stats-chart"
          label="Stock global"
          color={colors.info}
          bgColor={colors.infoLight}
          onPress={() => router.push("/(tabs)/stock-global")}
        />
        <QuickAction
          icon="notifications"
          label="Alertes"
          color={colors.warning}
          bgColor={colors.warningLight}
          onPress={() => router.push("/(tabs)/notifications")}
        />
      </View>

      {/* Pending orders */}
      <SectionHeader
        title={`Commandes en attente (${pendingOrders.length})`}
        action={{ label: "Tout voir", onPress: () => router.push("/(tabs)/orders") }}
      />
      {pendingOrders.length === 0 ? (
        <Card>
          <Text style={styles.noPending}>Aucune commande en attente</Text>
        </Card>
      ) : (
        pendingOrders
          .slice(0, 5)
          .map((order, i) => <PendingOrderCard key={order.id} order={order} index={i} />)
      )}
    </ScreenWrapper>
  );
}

// ─── Driver home ─────────────────────────────────────────────────

const DriverStopCard = ({
  stop,
  index,
  isCurrent,
}: {
  stop: DeliveryStop;
  index: number;
  isCurrent: boolean;
}) => (
  <Animated.View entering={FadeInDown.delay(index * 50).springify()}>
    <Pressable
      onPress={() => router.push(`/(tabs)/tournee/stop/${stop.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`Arrêt ${stop.stopOrder}: ${stop.client.name}`}
    >
      <Card
        style={[
          styles.stopCard,
          isCurrent && styles.stopCardCurrent,
          stop.status === "COMPLETED" && styles.stopCardDone,
        ]}
      >
        <View style={styles.deliveryRow}>
          <View
            style={[
              styles.stopNum,
              isCurrent && { backgroundColor: colors.accent },
              stop.status === "COMPLETED" && { backgroundColor: colors.success },
            ]}
          >
            {stop.status === "COMPLETED" ? (
              <Ionicons name="checkmark" size={16} color={colors.textInverse} />
            ) : (
              <Text style={styles.stopNumText}>#{stop.stopOrder}</Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.deliveryNum,
                stop.status === "COMPLETED" && { color: colors.textTertiary },
              ]}
            >
              {stop.client.name}
            </Text>
            <Text style={styles.deliverySlot}>
              {stop.setsToDeliver} set{stop.setsToDeliver > 1 ? "s" : ""} à livrer
            </Text>
            {stop.specialInstructions && (
              <Text style={[styles.deliveryItems, { color: colors.warningText }]} numberOfLines={1}>
                {stop.specialInstructions}
              </Text>
            )}
          </View>
          {stop.status !== "COMPLETED" && (
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
          )}
        </View>
      </Card>
    </Pressable>
  </Animated.View>
);

function DriverHome() {
  const profile = useProfile();
  const round = useTodayRound();

  const isLoading = profile.isLoading || round.isLoading;
  const refreshing = profile.isRefetching || round.isRefetching;
  const refetch = () => {
    profile.refetch();
    round.refetch();
  };

  if (isLoading && !profile.data) {
    return (
      <ScreenWrapper>
        <SkeletonBox height={120} style={{ marginBottom: spacing.md }} />
        <SkeletonBox height={100} style={{ marginBottom: spacing.md }} />
        <SkeletonBox height={80} />
      </ScreenWrapper>
    );
  }

  const todayRound = round.data;
  const completed = todayRound?.stops.filter((s) => s.status === "COMPLETED").length ?? 0;
  const total = todayRound?.stops.length ?? 0;
  const currentStop = todayRound?.stops
    .filter((s) => s.status === "PENDING")
    .sort((a, b) => a.stopOrder - b.stopOrder)[0];

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={refetch}>
      <LinearGradient
        colors={[colors.success, "#059669"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <Text style={styles.heroGreeting}>{profile.data?.name?.split(" ")[0] ?? "Livreur"}</Text>
        <Text style={[styles.heroPillText, { color: "rgba(255,255,255,0.85)" }]}>
          {todayRound ? `${completed}/${total} arrêts complétés` : "Aucune tournée aujourd'hui"}
        </Text>
      </LinearGradient>

      {!todayRound ? (
        <Card style={styles.noRoundCard}>
          <Ionicons name="car-outline" size={48} color={colors.textTertiary} />
          <Text style={styles.noRoundTitle}>Pas de tournée aujourd'hui</Text>
          <Text style={styles.noRoundSub}>Revenez demain !</Text>
        </Card>
      ) : (
        <>
          {/* Progress gauge */}
          {total > 0 && (
            <Card style={styles.progressCard}>
              <View style={styles.progressRow}>
                <ProgressRing
                  completed={completed}
                  total={total}
                  size={90}
                  color={colors.success}
                />
                <View style={styles.progressInfo}>
                  <Text style={styles.progressTitle}>
                    {completed === total ? "Tournée terminée !" : "En cours"}
                  </Text>
                  <Text style={styles.progressSub}>
                    {completed}/{total} arrêts
                  </Text>
                  {currentStop && (
                    <View style={styles.currentStopBadge}>
                      <Text style={styles.currentStopText}>
                        Prochain : {currentStop.client.name}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Quick nav to Tournée tab */}
              <Pressable
                onPress={() => router.push("/(tabs)/tournee")}
                style={styles.viewTourneeBtn}
                accessibilityRole="button"
                accessibilityLabel="Voir la carte de la tournée"
              >
                <Ionicons name="navigate-outline" size={16} color={colors.primary} />
                <Text style={styles.viewTourneeBtnText}>Voir la carte de la tournée</Text>
              </Pressable>
            </Card>
          )}

          <SectionHeader
            title={`Arrêts (${total - completed} restant${total - completed > 1 ? "s" : ""})`}
            action={{
              label: "Tournée",
              onPress: () => router.push("/(tabs)/tournee"),
            }}
          />
          {[...todayRound.stops]
            .sort((a, b) => a.stopOrder - b.stopOrder)
            .slice(0, 5)
            .map((stop, i) => (
              <DriverStopCard
                key={stop.id}
                stop={stop}
                index={i}
                isCurrent={stop.id === currentStop?.id}
              />
            ))}
        </>
      )}
    </ScreenWrapper>
  );
}

// ─── Router ──────────────────────────────────────────────────────

/**
 * « Nous passons à Avignon demain ».
 *
 * Deux gestes seulement, parce que le client répond depuis son téléphone entre
 * deux chambres : je veux du linge (livraison remisée) ou je rends le sale
 * (gratuit). Le troisième bouton fait les deux, cas le plus fréquent d'une
 * rotation. Le prix barré est affiché : sans lui, la remise ne se voit pas.
 */
function PassageCard({ passage }: { passage: PassageOpportunite }) {
  const repondre = useRepondrePassage();
  const dejaRepondu = passage.reponse?.kind ?? null;

  const jour = parseYmd(passage.date).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const choisir = (kind: "LIVRAISON" | "REPRISE" | "LIVRAISON_ET_REPRISE") =>
    repondre.mutate({ id: passage.id, kind });

  return (
    <Animated.View entering={FadeInDown.duration(300)}>
      <Card style={styles.passageCard}>
        <View style={styles.passageHeader}>
          <Ionicons name="navigate-circle" size={22} color={colors.primary} />
          <Text style={styles.passageTitle}>Nous passons à {passage.communeNom}</Text>
        </View>
        <Text style={styles.passageDate}>{jour}</Text>

        <Text style={styles.passageOffre}>
          Livraison{" "}
          <Text style={styles.passagePrixBarre}>
            {formatCents(passage.livraisonPleinTarifCents)}
          </Text>{" "}
          <Text style={styles.passagePrix}>{formatCents(passage.livraisonCents)}</Text> · reprise de
          votre linge sale gratuite
        </Text>

        {dejaRepondu && dejaRepondu !== "AUCUN" ? (
          <View style={styles.passageConfirme}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Text style={styles.passageConfirmeText}>
              {dejaRepondu === "REPRISE"
                ? "C'est noté : nous récupérons votre linge sale."
                : dejaRepondu === "LIVRAISON"
                  ? "C'est noté : nous vous apportons du linge propre."
                  : "C'est noté : reprise du sale et livraison de propre."}
            </Text>
          </View>
        ) : (
          <View style={styles.passageActions}>
            <Pressable
              style={[styles.passageBtn, styles.passageBtnPrimary]}
              onPress={() => choisir("LIVRAISON_ET_REPRISE")}
              disabled={repondre.isPending}
              accessibilityRole="button"
              accessibilityLabel="Je rends mon linge sale et je veux du propre"
            >
              <Text style={styles.passageBtnPrimaryText}>Les deux</Text>
            </Pressable>
            <Pressable
              style={styles.passageBtn}
              onPress={() => choisir("LIVRAISON")}
              disabled={repondre.isPending}
              accessibilityRole="button"
              accessibilityLabel="Je veux du linge propre"
            >
              <Text style={styles.passageBtnText}>Du linge propre</Text>
            </Pressable>
            <Pressable
              style={styles.passageBtn}
              onPress={() => choisir("REPRISE")}
              disabled={repondre.isPending}
              accessibilityRole="button"
              accessibilityLabel="Je rends mon linge sale, gratuitement"
            >
              <Text style={styles.passageBtnText}>Je rends mon sale</Text>
            </Pressable>
          </View>
        )}

        {/* Le téléphone reste ouvert : tout le monde ne répond pas dans l'app. */}
        <Text style={styles.passageHint}>
          Vous pouvez aussi nous appeler — nous notons votre passage.
        </Text>
      </Card>
    </Animated.View>
  );
}

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
  heroDate: {
    fontSize: font.sizes.sm,
    color: "rgba(255,255,255,0.7)",
    marginTop: spacing.xs,
    textTransform: "capitalize",
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
    marginTop: spacing.xs,
  },
  // Passage groupé
  passageCard: {
    marginBottom: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  passageHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  passageTitle: {
    fontSize: font.sizes.lg,
    fontWeight: font.weights.bold,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  passageDate: {
    fontSize: font.sizes.sm,
    color: colors.textSecondary,
    textTransform: "capitalize",
    marginTop: 2,
  },
  passageOffre: {
    fontSize: font.sizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  passagePrixBarre: {
    textDecorationLine: "line-through",
    color: colors.textTertiary,
  },
  passagePrix: {
    fontWeight: font.weights.bold,
    color: colors.textPrimary,
  },
  passageActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  passageBtn: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  passageBtnText: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.semibold,
    color: colors.textPrimary,
  },
  passageBtnPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  passageBtnPrimaryText: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.bold,
    color: colors.textInverse,
  },
  passageConfirme: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  passageConfirmeText: {
    fontSize: font.sizes.sm,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  passageHint: {
    fontSize: font.sizes.xs,
    color: colors.textTertiary,
    marginTop: spacing.sm,
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
  stockLegendHint: {
    fontSize: font.sizes.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  miniDonutCenter: {
    fontSize: font.sizes.lg,
    fontWeight: font.weights.heavy,
    color: colors.textPrimary,
  },
  // Delivery card
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
    marginBottom: spacing.md,
  },
  actionCard: {
    width: "48%",
    flexGrow: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 90,
    gap: spacing.xs,
  },
  actionLabel: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.semibold,
  },
  actionBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: colors.error,
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  actionBadgeText: {
    fontSize: 10,
    fontWeight: font.weights.bold,
    color: colors.textInverse,
  },
  // Admin KPIs
  statsRow: { flexDirection: "row", gap: spacing.sm },
  kpiCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.sm,
    gap: spacing.xs,
  },
  kpiIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  kpiValue: {
    fontSize: font.sizes.xl,
    fontWeight: font.weights.heavy,
  },
  kpiLabel: {
    fontSize: font.sizes.xs,
    color: colors.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    textAlign: "center",
  },
  kpiTrend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  kpiTrendText: {
    fontSize: font.sizes.xs,
  },
  // Alerts
  alertCard: {
    marginBottom: spacing.sm,
    borderLeftWidth: 4,
  },
  alertRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  alertText: {
    flex: 1,
    fontSize: font.sizes.sm,
    fontWeight: font.weights.medium,
  },
  // Pending orders
  pendingCard: { marginBottom: spacing.sm },
  noPending: {
    fontSize: font.sizes.sm,
    color: colors.textTertiary,
    textAlign: "center",
    paddingVertical: spacing.xl,
  },
  // Driver
  progressCard: { marginBottom: spacing.md },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xl,
    marginBottom: spacing.md,
  },
  progressInfo: { flex: 1 },
  progressTitle: {
    fontSize: font.sizes.lg,
    fontWeight: font.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  progressSub: {
    fontSize: font.sizes.sm,
    color: colors.textSecondary,
  },
  currentStopBadge: {
    backgroundColor: colors.accentLight,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    alignSelf: "flex-start",
    marginTop: spacing.sm,
  },
  currentStopText: {
    fontSize: font.sizes.xs,
    fontWeight: font.weights.semibold,
    color: colors.accent,
  },
  viewTourneeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
  },
  viewTourneeBtnText: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.semibold,
    color: colors.primary,
  },
  stopCard: { marginBottom: spacing.sm },
  stopCardCurrent: {
    borderColor: colors.accent,
    borderWidth: 1.5,
  },
  stopCardDone: {
    opacity: 0.6,
  },
  stopNum: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  stopNumText: {
    fontSize: font.sizes.xs,
    fontWeight: font.weights.bold,
    color: colors.primary,
  },
  noRoundCard: {
    marginTop: spacing.xl,
    alignItems: "center",
    paddingVertical: spacing.xxxl,
    gap: spacing.md,
  },
  noRoundTitle: {
    fontSize: font.sizes.lg,
    fontWeight: font.weights.semibold,
    color: colors.textPrimary,
  },
  noRoundSub: {
    fontSize: font.sizes.sm,
    color: colors.textTertiary,
  },
});
