import { useMemo } from "react";
import { View, Text, Pressable, SectionList, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from "@/lib/api";
import type { Notification } from "@/lib/api";
import { resolveNotificationRoute, openNotification } from "@/lib/notifications";
import { useAuthStore } from "@/lib/store";
import { colors, font, spacing, radius, MIN_HIT_TARGET, TAB_BAR_BASE_HEIGHT } from "@/lib/theme";

type IconName = keyof typeof Ionicons.glyphMap;
interface TypeMeta {
  icon: IconName;
  color: string;
  bg: string;
}

const TYPE_META: Record<string, TypeMeta> = {
  STOCK_LOW: { icon: "cube-outline", color: colors.warning, bg: colors.warningLight },
  DELIVERY_REMINDER: { icon: "car-outline", color: colors.info, bg: colors.infoLight },
  DELIVERY_CONFIRMED: {
    icon: "checkmark-circle-outline",
    color: colors.success,
    bg: colors.successLight,
  },
  DELIVERY_CANCELLED: { icon: "close-circle-outline", color: colors.error, bg: colors.errorLight },
  DELIVERY_DELAYED: { icon: "time-outline", color: colors.warning, bg: colors.warningLight },
  // Les quatre types du calendrier de rotations
  // (migration 20260728100000_rotation_notification_types).
  ROTATION_REMINDER: { icon: "sync-outline", color: colors.accent, bg: colors.accentLight },
  ROTATION_TODAY: { icon: "today-outline", color: colors.warning, bg: colors.warningLight },
  ROTATION_OVERDUE: { icon: "alert-circle-outline", color: colors.error, bg: colors.errorLight },
  ROTATION_PICKED_UP: {
    icon: "checkmark-done-outline",
    color: colors.success,
    bg: colors.successLight,
  },
  PAYMENT_FAILED: { icon: "card-outline", color: colors.error, bg: colors.errorLight },
  PAYMENT_SUCCESS: {
    icon: "checkmark-circle-outline",
    color: colors.success,
    bg: colors.successLight,
  },
  SUBSCRIPTION_RENEWED: { icon: "refresh-outline", color: colors.info, bg: colors.infoLight },
  SUBSCRIPTION_EXPIRING: {
    icon: "alert-circle-outline",
    color: colors.warning,
    bg: colors.warningLight,
  },
  ACCOUNT_LOCKED: { icon: "lock-closed-outline", color: colors.error, bg: colors.errorLight },
  QUOTE_CREATED: { icon: "document-text-outline", color: colors.accent, bg: colors.accentLight },
  ORDER_CREATED: { icon: "receipt-outline", color: colors.primary, bg: colors.primaryLight },
  USER_CREATED: { icon: "person-add-outline", color: colors.primary, bg: colors.primaryLight },
  GENERAL: { icon: "mail-outline", color: colors.primary, bg: colors.primaryLight },
};

/** Repli par famille de type, pour les valeurs que le serveur ajoutera. */
const PREFIX_META: [string, TypeMeta][] = [
  ["ROTATION_", { icon: "sync-outline", color: colors.accent, bg: colors.accentLight }],
  ["DELIVERY_", { icon: "car-outline", color: colors.info, bg: colors.infoLight }],
  ["PAYMENT_", { icon: "card-outline", color: colors.info, bg: colors.infoLight }],
  ["SUBSCRIPTION_", { icon: "refresh-outline", color: colors.info, bg: colors.infoLight }],
  ["STOCK_", { icon: "cube-outline", color: colors.warning, bg: colors.warningLight }],
];

/** Ne lève jamais sur un type inconnu : c'est le serveur qui fait foi. */
function metaFor(type: string): TypeMeta {
  const exact = TYPE_META[type];
  if (exact) return exact;
  const prefixed = PREFIX_META.find(([p]) => type.startsWith(p));
  return prefixed ? prefixed[1] : TYPE_META.GENERAL;
}

// ─── Regroupement par jour ───────────────────────────────────────

function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Date inconnue";

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (dayKey(iso) === dayKey(today.toISOString())) return "Aujourd'hui";
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return "Hier";

  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

interface DaySection {
  title: string;
  data: Notification[];
}

/** Conserve l'ordre du serveur (antéchronologique) tout en groupant par jour. */
function groupByDay(notifications: Notification[]): DaySection[] {
  const sections: DaySection[] = [];
  const indexByKey = new Map<string, number>();

  for (const n of notifications) {
    const key = dayKey(n.createdAt);
    const existing = indexByKey.get(key);
    if (existing != null) {
      sections[existing].data.push(n);
    } else {
      indexByKey.set(key, sections.length);
      sections.push({ title: dayLabel(n.createdAt), data: [n] });
    }
  }
  return sections;
}

// ─── Item ────────────────────────────────────────────────────────

function NotifItem({
  notif,
  onPress,
  navigable,
}: {
  notif: Notification;
  onPress: () => void;
  navigable: boolean;
}) {
  const isUnread = !notif.readAt;
  const meta = metaFor(notif.type);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${isUnread ? "Non lue: " : ""}${notif.title}`}
      accessibilityHint={navigable ? "Ouvrir l'élément concerné" : "Marquer comme lue"}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Card style={[styles.notifCard, isUnread && styles.notifUnread]}>
        <View style={styles.notifRow}>
          <View style={[styles.notifIconChip, { backgroundColor: meta.bg }]}>
            <Ionicons name={meta.icon} size={20} color={meta.color} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.notifHeader}>
              <Text
                style={[styles.notifTitle, isUnread && styles.notifTitleUnread]}
                numberOfLines={1}
              >
                {notif.title}
              </Text>
              {isUnread && <View style={styles.unreadDot} />}
            </View>
            <Text style={styles.notifBody} numberOfLines={2}>
              {notif.body}
            </Text>
            <Text style={styles.notifDate}>{timeLabel(notif.createdAt)}</Text>
          </View>
          {navigable && <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />}
        </View>
      </Card>
    </Pressable>
  );
}

// ─── Écran ───────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const { data, isLoading, isError, refetch, isRefetching } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const insets = useSafeAreaInsets();
  const role = useAuthStore((s) => s.user?.role);

  const notifications = useMemo(() => data?.notifications ?? [], [data]);
  const sections = useMemo(() => groupByDay(notifications), [notifications]);

  if (isLoading) return <LoadingScreen />;
  if (isError) return <ErrorState what="vos notifications" onRetry={() => void refetch()} />;

  const unreadCount = data?.unreadCount ?? 0;

  return (
    <View style={styles.container}>
      {unreadCount > 0 && (
        <View style={styles.topBar}>
          <Text style={styles.unreadText}>
            {unreadCount} non lue{unreadCount > 1 ? "s" : ""}
          </Text>
          <Button
            title="Tout marquer comme lu"
            onPress={() => markAllRead.mutate()}
            variant="ghost"
            loading={markAllRead.isPending}
          />
        </View>
      )}

      <SectionList
        sections={sections}
        keyExtractor={(n) => n.id}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        renderItem={({ item }) => (
          <NotifItem
            notif={item}
            navigable={resolveNotificationRoute(item, role) !== null}
            onPress={() => {
              // Marquer lu d'abord : la navigation démonte cet écran.
              if (!item.readAt) markRead.mutate(item.id);
              openNotification(item, role);
            }}
          />
        )}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: TAB_BAR_BASE_HEIGHT + insets.bottom + spacing.xl },
        ]}
        refreshing={isRefetching}
        onRefresh={refetch}
        ListEmptyComponent={
          <EmptyState
            icon="notifications-outline"
            title="Aucune notification"
            description="Vous serez notifié des rotations, livraisons, stocks et paiements"
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: MIN_HIT_TARGET,
  },
  unreadText: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.semibold,
    color: colors.primary,
  },
  pressed: {
    opacity: 0.7,
  },
  list: {
    padding: spacing.lg,
  },
  sectionHeader: {
    fontSize: font.sizes.xs,
    fontWeight: font.weights.bold,
    color: colors.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  notifCard: {
    marginBottom: spacing.sm,
  },
  notifUnread: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  notifRow: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
  },
  notifIconChip: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  notifHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  notifTitle: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.medium,
    color: colors.textPrimary,
    flex: 1,
  },
  notifTitleUnread: {
    fontWeight: font.weights.bold,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  notifBody: {
    fontSize: font.sizes.sm,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 20,
  },
  notifDate: {
    fontSize: font.sizes.xs,
    color: colors.textTertiary,
    marginTop: spacing.sm,
  },
});
