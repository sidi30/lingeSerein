import { useEffect } from "react";
import { Text, View, StyleSheet } from "react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, type ErrorBoundaryProps } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Button } from "@/components/Button";
import { LoadingScreen } from "@/components/LoadingScreen";
import { setUpAppStateRefetch } from "@/lib/query";
import { queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/lib/store";
import { colors, font, spacing } from "@/lib/theme";

/**
 * Filet de sécurité de l'application entière.
 *
 * Expo Router monte ce composant à la place de l'arbre quand un rendu lève.
 * Sans lui, la moindre exception (une réponse d'API sans la relation attendue,
 * un `map` sur un champ absent) fermait l'application : un livreur en tournée se
 * retrouvait devant un écran noir, sans autre issue que de relancer depuis
 * l'accueil du téléphone. Ici, il reste un bouton.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={styles.errorContainer}>
      <Text style={styles.errorTitle}>L&apos;écran n&apos;a pas pu s&apos;afficher</Text>
      <Text style={styles.errorMessage}>
        Vos données ne sont pas perdues. Réessayez ; si l&apos;écran ne revient pas, fermez et
        rouvrez l&apos;application.
      </Text>
      {/* Le détail technique reste visible : c'est ce que le propriétaire nous
          transmettra pour corriger, et il ne veut rien dire de sensible. */}
      <Text style={styles.errorDetail}>{error.message}</Text>
      <Button title="Réessayer" onPress={() => void retry()} />
    </View>
  );
}

export default function RootLayout() {
  const hydrated = useAuthStore((s) => s.hydrated);

  // Recharge les tokens persistés (SecureStore) avant toute décision de routage.
  useEffect(() => {
    void useAuthStore.getState().hydrate();
  }, []);

  // Branche le rafraîchissement au retour au premier plan.
  useEffect(() => setUpAppStateRefetch(), []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="dark" />
        {!hydrated ? (
          <LoadingScreen />
        ) : (
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
              animation: "slide_from_right",
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
          </Stack>
        )}
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  errorTitle: {
    fontSize: font.sizes.lg,
    fontWeight: font.weights.bold,
    color: colors.textPrimary,
  },
  errorMessage: {
    fontSize: font.sizes.md,
    color: colors.textSecondary,
  },
  errorDetail: {
    fontSize: font.sizes.sm,
    color: colors.textTertiary,
  },
});
