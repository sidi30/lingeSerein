import { View, ActivityIndicator, StyleSheet } from "react-native";
import { colors } from "@/lib/theme";

export function LoadingScreen() {
  return (
    <View style={styles.container} accessibilityRole="progressbar" accessibilityLabel="Chargement">
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
  },
});
