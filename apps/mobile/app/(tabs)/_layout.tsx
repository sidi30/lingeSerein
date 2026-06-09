import { Tabs } from "expo-router";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, font } from "@/lib/theme";
import { useNotifications } from "@/lib/api";
import { useAuthStore } from "@/lib/store";

type IoniconName = keyof typeof Ionicons.glyphMap;

function TabIcon({
  name,
  outline,
  focused,
}: {
  name: IoniconName;
  outline: IoniconName;
  focused: boolean;
}) {
  return (
    <Ionicons
      name={focused ? name : outline}
      size={24}
      color={focused ? colors.primary : colors.textTertiary}
    />
  );
}

function NotifIcon({ focused }: { focused: boolean }) {
  const { data } = useNotifications();
  const count = data?.unreadCount ?? 0;

  return (
    <View>
      <Ionicons
        name={focused ? "notifications" : "notifications-outline"}
        size={24}
        color={focused ? colors.primary : colors.textTertiary}
      />
      {count > 0 && (
        <View
          style={styles.badge}
          accessibilityLabel={`${count} notification${count > 1 ? "s" : ""} non lue${count > 1 ? "s" : ""}`}
        >
          <Text style={styles.badgeText}>{count > 9 ? "9+" : count}</Text>
        </View>
      )}
    </View>
  );
}

export default function TabsLayout() {
  const role = useAuthStore((s) => s.user?.role);
  const isClient = role === "ROLE_CLIENT";
  const isDriver = role === "ROLE_LIVREUR";

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarLabelStyle: {
          fontSize: font.sizes.xs,
          fontWeight: font.weights.medium,
        },
        tabBarStyle: {
          borderTopColor: colors.border,
          backgroundColor: colors.surface,
          height: 60,
          paddingBottom: 8,
          paddingTop: 4,
        },
        headerStyle: {
          backgroundColor: colors.surface,
        },
        headerTitleStyle: {
          fontWeight: font.weights.bold,
          fontSize: font.sizes.lg,
          color: colors.textPrimary,
        },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Accueil",
          tabBarIcon: ({ focused }) => (
            <TabIcon name="home" outline="home-outline" focused={focused} />
          ),
          tabBarAccessibilityLabel: "Accueil",
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: "Commandes",
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <TabIcon name="cube" outline="cube-outline" focused={focused} />
          ),
          tabBarAccessibilityLabel: "Commandes",
          // Hide for drivers - they use deliveries
          href: isDriver ? null : "/(tabs)/orders",
        }}
      />
      <Tabs.Screen
        name="stock"
        options={{
          title: "Stock",
          tabBarIcon: ({ focused }) => (
            <TabIcon name="stats-chart" outline="stats-chart-outline" focused={focused} />
          ),
          tabBarAccessibilityLabel: "Mon stock de linge",
          // Only for clients
          href: isClient ? "/(tabs)/stock" : null,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Alertes",
          tabBarIcon: ({ focused }) => <NotifIcon focused={focused} />,
          tabBarAccessibilityLabel: "Notifications",
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profil",
          tabBarIcon: ({ focused }) => (
            <TabIcon name="person" outline="person-outline" focused={focused} />
          ),
          tabBarAccessibilityLabel: "Mon profil",
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    top: -4,
    right: -8,
    backgroundColor: colors.error,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    color: colors.textInverse,
    fontSize: 10,
    fontWeight: font.weights.bold,
  },
});
