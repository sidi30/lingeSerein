import { Stack } from "expo-router";
import { colors, font } from "@/lib/theme";

export default function ClientsLayout() {
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
      <Stack.Screen name="index" options={{ title: "Clients" }} />
      <Stack.Screen name="[id]" options={{ title: "Fiche client" }} />
    </Stack>
  );
}
