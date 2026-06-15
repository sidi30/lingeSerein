import { View, Text, Pressable, FlatList, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { LoadingScreen } from "@/components/LoadingScreen";
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  formatDateShort,
} from "@/lib/api";
import type { Notification } from "@/lib/api";
import { colors, font, spacing, radius, TAB_BAR_BASE_HEIGHT } from "@/lib/theme";

type IconName = keyof typeof Ionicons.glyphMap;

const TYPE_META: Record<string, { icon: IconName; color: string; bg: string }> = {
  STOCK_LOW: { icon: "cube-outline", color: colors.warning, bg: colors.warningLight },
  DELIVERY_REMINDER: { icon: "car-outline", color: colors.info, bg: colors.infoLight },
  DELIVERY_CONFIRMED: {
    icon: "checkmark-circle-outline",
    color: colors.success,
    bg: colors.successLight,
  },
  DELIVERY_CANCELLED: { icon: "close-circle-outline", color: colors.error, bg: colors.errorLight },
  DELIVERY_DELAYED: { icon: "time-outline", color: colors.warning, bg: colors.warningLight },
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
  GENERAL: { icon: "mail-outline", color: colors.primary, bg: colors.primaryLight },
};

const FALLBACK_META = TYPE_META.GENERAL;

function NotifItem({ notif, onPress }: { notif: Notification; onPress: () => void }) {
  const isUnread = !notif.readAt;
  const meta = TYPE_META[notif.type] ?? FALLBACK_META;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${isUnread ? "Non lue: " : ""}${notif.title}`}
      accessibilityHint="Marquer comme lue"
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
            <Text style={styles.notifDate}>{formatDateShort(notif.createdAt)}</Text>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const { data, isLoading, refetch, isRefetching } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const insets = useSafeAreaInsets();

  if (isLoading) return <LoadingScreen />;

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  return (
    <View style={styles.container}>
      {/* Mark all read */}
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

      <FlatList
        data={notifications}
        keyExtractor={(n) => n.id}
        renderItem={({ item }) => (
          <NotifItem
            notif={item}
            onPress={() => {
              if (!item.readAt) markRead.mutate(item.id);
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
            description="Vous serez notifie des livraisons, stocks et paiements"
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
    alignItems: "flex-start",
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
