import { Tabs } from "expo-router";
import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, font, radius, TAB_BAR_BASE_HEIGHT } from "@/lib/theme";
import { useNotifications, useOrders } from "@/lib/api";
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

function PendingOrdersIcon({ focused }: { focused: boolean }) {
  const { data } = useOrders("PENDING");
  const role = useAuthStore((s) => s.user?.role);
  const count = role === "ROLE_ADMIN" || role === "ROLE_SUPER_ADMIN" ? (data?.length ?? 0) : 0;

  return (
    <View>
      <Ionicons
        name={focused ? "cube" : "cube-outline"}
        size={24}
        color={focused ? colors.primary : colors.textTertiary}
      />
      {count > 0 && (
        <View
          style={styles.badge}
          accessibilityLabel={`${count} commande${count > 1 ? "s" : ""} en attente`}
        >
          <Text style={styles.badgeText}>{count > 9 ? "9+" : count}</Text>
        </View>
      )}
    </View>
  );
}

export default function TabsLayout() {
  const role = useAuthStore((s) => s.user?.role);
  const insets = useSafeAreaInsets();
  const isClient = role === "ROLE_CLIENT";
  const isDriver = role === "ROLE_LIVREUR";
  const isAdmin = role === "ROLE_ADMIN" || role === "ROLE_SUPER_ADMIN";

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
          borderTopWidth: 0,
          backgroundColor: colors.surface,
          height: TAB_BAR_BASE_HEIGHT + insets.bottom,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
          paddingTop: 8,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
          // soft upward shadow → floating menu look
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.06,
          shadowRadius: 12,
          elevation: 12,
        },
        tabBarItemStyle: {
          paddingTop: 2,
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
      {/* ── Accueil ── tous les rôles ── */}
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

      {/* ── Commander (catalogue + commandes) — CLIENT seulement ── */}
      <Tabs.Screen
        name="orders"
        options={{
          title: isClient ? "Commander" : "Commandes",
          headerShown: false,
          tabBarIcon: ({ focused }) =>
            isAdmin ? (
              <PendingOrdersIcon focused={focused} />
            ) : (
              <TabIcon name="cube" outline="cube-outline" focused={focused} />
            ),
          tabBarAccessibilityLabel: isClient ? "Commander ou voir mes commandes" : "Commandes",
          href: isDriver ? null : "/(tabs)/orders",
        }}
      />

      {/* ── Catalogue — accessible via quick-actions, jamais dans la tab bar ── */}
      <Tabs.Screen
        name="catalogue"
        options={{
          title: "Catalogue",
          href: null,
        }}
      />

      {/* ── Stock — CLIENT seulement ── */}
      <Tabs.Screen
        name="stock"
        options={{
          title: "Stock",
          tabBarIcon: ({ focused }) => (
            <TabIcon name="stats-chart" outline="stats-chart-outline" focused={focused} />
          ),
          tabBarAccessibilityLabel: "Mon stock de linge",
          href: isClient ? "/(tabs)/stock" : null,
        }}
      />

      {/* ── Clients — ADMIN seulement ── */}
      <Tabs.Screen
        name="clients"
        options={{
          title: "Clients",
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <TabIcon name="people" outline="people-outline" focused={focused} />
          ),
          tabBarAccessibilityLabel: "Gestion des clients",
          href: isAdmin ? "/(tabs)/clients" : null,
        }}
      />

      {/* ── Stock global — ADMIN seulement (masqué du tab bar, accessible depuis accueil) ── */}
      <Tabs.Screen
        name="stock-global"
        options={{
          title: "Stock global",
          href: null,
        }}
      />

      {/* ── Tournée — LIVREUR seulement ── */}
      <Tabs.Screen
        name="tournee"
        options={{
          title: "Tournée",
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <TabIcon name="navigate" outline="navigate-outline" focused={focused} />
          ),
          tabBarAccessibilityLabel: "Ma tournée de livraison",
          href: isDriver ? "/(tabs)/tournee" : null,
        }}
      />

      {/* ── Notifications — tous les rôles ── */}
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Alertes",
          tabBarIcon: ({ focused }) => <NotifIcon focused={focused} />,
          tabBarAccessibilityLabel: "Notifications",
        }}
      />

      {/* ── Profil — tous les rôles ── */}
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
