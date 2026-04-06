import { Stack } from "expo-router";
import { colors, font } from "@/lib/theme";

export default function OrdersLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: {
          fontWeight: font.weights.bold,
          fontSize: font.sizes.lg,
          color: colors.textPrimary,
        },
        headerShadowVisible: false,
        headerBackTitle: "Retour",
      }}
    >
      <Stack.Screen name="index" options={{ title: "Mes commandes" }} />
      <Stack.Screen name="new" options={{ title: "Nouvelle commande" }} />
      <Stack.Screen name="[id]" options={{ title: "Detail commande" }} />
    </Stack>
  );
}
