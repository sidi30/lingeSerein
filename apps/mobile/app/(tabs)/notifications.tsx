import { View, Text, Pressable, FlatList, StyleSheet } from "react-native";
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
import { colors, font, spacing } from "@/lib/theme";

const TYPE_ICONS: Record<string, string> = {
  STOCK_LOW: "\ud83d\udce6",
  DELIVERY_REMINDER: "\ud83d\ude9a",
  DELIVERY_CONFIRMED: "\u2705",
  DELIVERY_CANCELLED: "\u274c",
  DELIVERY_DELAYED: "\u23f0",
  PAYMENT_FAILED: "\ud83d\udcb3",
  PAYMENT_SUCCESS: "\u2705",
  SUBSCRIPTION_RENEWED: "\ud83d\udd04",
  SUBSCRIPTION_EXPIRING: "\u26a0\ufe0f",
  ACCOUNT_LOCKED: "\ud83d\udd12",
  GENERAL: "\ud83d\udce8",
};

function NotifItem({ notif, onPress }: { notif: Notification; onPress: () => void }) {
  const isUnread = !notif.readAt;
  const icon = TYPE_ICONS[notif.type] ?? "\ud83d\udce8";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${isUnread ? "Non lue: " : ""}${notif.title}`}
      accessibilityHint="Marquer comme lue"
    >
      <Card style={[styles.notifCard, isUnread && styles.notifUnread]}>
        <View style={styles.notifRow}>
          <Text style={styles.notifIcon}>{icon}</Text>
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
        contentContainerStyle={styles.list}
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
  list: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
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
  },
  notifIcon: {
    fontSize: 24,
    marginTop: 2,
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
