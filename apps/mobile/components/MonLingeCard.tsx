/**
 * « Mon linge » — ce que le client détient et quand il doit être repris.
 *
 * Alimenté par GET /rotations?mine=1, qui n'est pas encore déployé côté API :
 * `useMyRotations` renvoie `null` sur 404 et la carte disparaît alors
 * proprement, sans erreur ni espace vide.
 */

import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/Card";
import { SectionHeader } from "@/components/SectionHeader";
import { useMyRotations, formatDate, ROTATION_TERMINAL } from "@/lib/api";
import type { Rotation } from "@/lib/api";
import { colors, font, spacing, radius } from "@/lib/theme";

/**
 * On filtre par exclusion des statuts terminaux : un statut que le serveur
 * ajouterait reste ainsi visible — mieux vaut afficher une rotation de trop
 * qu'en cacher une dont le client attend la reprise.
 */
function isOpen(r: Rotation): boolean {
  return !(ROTATION_TERMINAL as string[]).includes(r.status);
}

/**
 * Jours avant reprise : négatif = en retard. `null` si la date est absente.
 *
 * Les dates de rotation sont des dates civiles (Prisma `@db.Date`), sérialisées
 * à minuit UTC. Les lire en heure locale reste juste tant que le fuseau est à
 * l'est de UTC — le cas de la France, seul marché de l'app.
 */
function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return null;

  // Comparaison de dates civiles : sinon « demain 8h » depuis « aujourd'hui 18h »
  // donnerait 0 jour.
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffMs = startOfDay(target) - startOfDay(new Date());
  return Math.round(diffMs / 86_400_000);
}

function RotationRow({ rotation }: { rotation: Rotation }) {
  const remaining = daysUntil(rotation.dateReprisePrevue);
  // Le serveur fait autorité sur le retard ; on ne recalcule que s'il ne le
  // fournit pas.
  const lateDays =
    rotation.joursDeRetard != null && rotation.joursDeRetard > 0
      ? rotation.joursDeRetard
      : remaining != null && remaining < 0
        ? -remaining
        : 0;
  const isLate = lateDays > 0;
  const isSoon = !isLate && remaining != null && remaining <= 1;

  // `lignes` vient d'un DTO encore mouvant côté API : on ne suppose pas.
  const lignes = rotation.lignes ?? [];
  const totalItems = lignes.reduce((s, l) => s + l.qtyLivree, 0);

  let statusText: string;
  if (!rotation.dateReprisePrevue) {
    statusText = "Date de reprise à confirmer";
  } else if (isLate) {
    statusText = `Reprise en retard de ${lateDays} jour${lateDays > 1 ? "s" : ""}`;
  } else if (remaining === 0) {
    statusText = "Reprise prévue aujourd'hui";
  } else if (remaining === 1) {
    statusText = "Reprise prévue demain";
  } else if (remaining != null && remaining > 1) {
    statusText = `Reprise dans ${remaining} jours · ${formatDate(rotation.dateReprisePrevue)}`;
  } else {
    statusText = `Reprise le ${formatDate(rotation.dateReprisePrevue)}`;
  }

  const tone = isLate ? colors.errorText : isSoon ? colors.warningText : colors.textSecondary;
  const toneBg = isLate ? colors.errorLight : isSoon ? colors.warningLight : colors.borderLight;
  const icon = isLate ? "alert-circle" : isSoon ? "time" : "checkmark-circle-outline";

  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <Text style={styles.rowTitle}>
          {totalItems} article{totalItems > 1 ? "s" : ""} chez vous
        </Text>
        <Text style={styles.rowSince}>depuis le {formatDate(rotation.dateLivraison)}</Text>
      </View>

      {lignes.length > 0 && (
        <Text style={styles.rowLines} numberOfLines={2}>
          {lignes.map((l) => `${l.qtyLivree}x ${l.designation}`).join(" · ")}
        </Text>
      )}

      <View style={[styles.statusPill, { backgroundColor: toneBg }]}>
        <Ionicons name={icon} size={14} color={tone} />
        <Text style={[styles.statusText, { color: tone }]}>{statusText}</Text>
      </View>
    </View>
  );
}

export function MonLingeCard() {
  const { data: rotations } = useMyRotations();

  // `null` = route absente ou rôle non concerné ; `[]` = rien en circulation.
  if (!rotations) return null;
  const open = rotations.filter(isOpen);
  if (open.length === 0) return null;

  return (
    <>
      <SectionHeader title="Mon linge" />
      <Card style={styles.card}>
        {open.map((r, i) => (
          <View key={r.id} style={i > 0 ? styles.rowBordered : undefined}>
            <RotationRow rotation={r} />
          </View>
        ))}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  row: { gap: spacing.sm, paddingVertical: spacing.xs },
  rowBordered: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  rowTitle: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.bold,
    color: colors.textPrimary,
  },
  rowSince: {
    fontSize: font.sizes.xs,
    color: colors.textTertiary,
  },
  rowLines: {
    fontSize: font.sizes.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  statusText: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.semibold,
  },
});
