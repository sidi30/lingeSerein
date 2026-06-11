import { Stack } from "expo-router";
import { colors, font } from "@/lib/theme";

export default function TourneeLayout() {
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
        headerBackTitle: "Tournée",
      }}
    >
      <Stack.Screen name="index" options={{ title: "Ma tournée" }} />
      <Stack.Screen name="stop/[id]" options={{ title: "Détail arrêt" }} />
    </Stack>
  );
}
