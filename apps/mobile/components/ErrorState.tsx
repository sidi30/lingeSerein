import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "@/components/Button";
import { colors, font, spacing } from "@/lib/theme";

interface Props {
  /** Ce qui n'a pas pu être chargé, au singulier : « la tournée », « le stock ». */
  what: string;
  onRetry: () => void;
}

/**
 * Écran affiché quand la requête a échoué — à ne PAS confondre avec un état vide.
 *
 * Les écrans mobiles retombaient tous sur leur `EmptyState` en cas d'erreur :
 * « Aucune tournée aujourd'hui » s'affichait à l'identique que la journée soit
 * vraiment vide ou que le réseau ait lâché. Sur le terrain, la différence est
 * entière : dans un cas le livreur rentre chez lui, dans l'autre il a des
 * clients qui l'attendent. On le dit, et on offre le bouton qui va avec.
 */
export function ErrorState({ what, onRetry }: Props) {
  return (
    <View style={styles.container} accessibilityRole="alert">
      <View style={styles.iconWrap}>
        <Ionicons name="cloud-offline-outline" size={48} color={colors.warning} />
      </View>
      <Text style={styles.title}>Chargement impossible</Text>
      <Text style={styles.description}>
        Impossible de charger {what}. Vérifiez votre connexion : rien n&apos;est perdu, l&apos;écran
        se remplira dès que le serveur répondra.
      </Text>
      <Button title="Réessayer" onPress={onRetry} style={styles.button} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xxxl,
  },
  iconWrap: {
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: font.sizes.lg,
    fontWeight: font.weights.semibold,
    color: colors.textPrimary,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  description: {
    fontSize: font.sizes.sm,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  button: {
    minWidth: 160,
  },
});
