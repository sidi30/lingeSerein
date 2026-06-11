/**
 * Stop detail screen — écran "anti-erreur" pour le livreur.
 * Affiche les informations clés de l'arrêt avant validation.
 */

import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  Linking,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { SkeletonBox } from "@/components/SkeletonBox";
import { EmptyState } from "@/components/EmptyState";
import { useTodayRound, useCompleteStop } from "@/lib/api";
import type { DeliveryStop } from "@/lib/api";
import { colors, font, spacing, radius, MIN_HIT_TARGET } from "@/lib/theme";

// ─── Stepper ──────────────────────────────────────────────────────

function Stepper({
  value,
  onChange,
  min = 0,
  max = 999,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  label: string;
}) {
  return (
    <View style={styles.stepperContainer}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperRow}>
        <Pressable
          onPress={() => onChange(Math.max(min, value - 1))}
          style={[styles.stepperBtn, value <= min && styles.stepperBtnDisabled]}
          disabled={value <= min}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Diminuer ${label}`}
        >
          <Ionicons
            name="remove"
            size={22}
            color={value <= min ? colors.textTertiary : colors.primary}
          />
        </Pressable>
        <Text style={styles.stepperValue} accessibilityLabel={`${value} ${label}`}>
          {value}
        </Text>
        <Pressable
          onPress={() => onChange(Math.min(max, value + 1))}
          style={[
            styles.stepperBtn,
            styles.stepperBtnAdd,
            value >= max && styles.stepperBtnDisabled,
          ]}
          disabled={value >= max}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Augmenter ${label}`}
        >
          <Ionicons name="add" size={22} color={colors.textInverse} />
        </Pressable>
      </View>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────

export default function StopDetailScreen() {
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const stopId = Array.isArray(params.id) ? params.id[0] : params.id;

  const { data: round, isLoading } = useTodayRound();
  const completeStop = useCompleteStop();

  const stop: DeliveryStop | undefined = round?.stops.find((s) => s.id === stopId);

  const [setsDelivered, setSetsDelivered] = useState<number | null>(null);
  const [dirtyPickedUp, setDirtyPickedUp] = useState(0);
  const [confirmed, setConfirmed] = useState(false);

  // Pre-fill when stop data loads
  const setsVal = setsDelivered ?? stop?.setsToDeliver ?? 0;

  if (isLoading) {
    return (
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.flex}>
          <SkeletonBox height={80} style={{ margin: spacing.lg }} />
          <SkeletonBox height={120} style={{ marginHorizontal: spacing.lg }} />
          <SkeletonBox height={80} style={{ margin: spacing.lg }} />
        </View>
      </KeyboardAvoidingView>
    );
  }

  if (!stop) {
    return (
      <View style={styles.flex}>
        <EmptyState
          icon="location-outline"
          title="Arret introuvable"
          description="Cet arrêt n'existe pas ou la tournée a changé."
        />
        <Button
          title="Retour"
          onPress={() => router.back()}
          variant="outline"
          style={{ margin: spacing.lg }}
        />
      </View>
    );
  }

  const isDone = stop.status === "COMPLETED";

  const handleCall = () => {
    if (!stop.client.phone) return;
    void (async () => {
      try {
        await Linking.openURL(`tel:${stop.client.phone}`);
      } catch {
        Alert.alert("Erreur", "Impossible d'ouvrir l'application Téléphone.");
      }
    })();
  };

  const handleNavigate = () => {
    const address = encodeURIComponent(stop.client.address ?? stop.client.name);
    const url =
      Platform.OS === "ios" ? `https://maps.apple.com/?daddr=${address}` : `geo:0,0?q=${address}`;
    void (async () => {
      try {
        await Linking.openURL(url);
      } catch {
        Alert.alert("Erreur", "Impossible d'ouvrir l'application Plans.");
      }
    })();
  };

  const handleValidate = () => {
    if (!confirmed) {
      // First press = confirmation step
      if (Platform.OS !== "web") {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      setConfirmed(true);
      return;
    }

    // Second press = actual submit
    if (Platform.OS !== "web") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    completeStop.mutate(
      {
        stopId: stop.id,
        data: { setsDelivered: setsVal, dirtyPickedUp },
      },
      {
        onSuccess: () => {
          // Find next pending stop
          const nextStop = round?.stops
            .filter((s) => s.status !== "COMPLETED" && s.id !== stop.id)
            .sort((a, b) => a.stopOrder - b.stopOrder)[0];

          if (nextStop) {
            Alert.alert("Arrêt validé !", `Prochain arrêt : ${nextStop.client.name}`, [
              {
                text: "Voir le prochain",
                onPress: () => router.replace(`/(tabs)/tournee/stop/${nextStop.id}`),
              },
              { text: "Retour à la tournée", onPress: () => router.back() },
            ]);
          } else {
            Alert.alert("Dernier arrêt validé !", "Tous les arrêts sont complétés.", [
              { text: "Retour à la tournée", onPress: () => router.back() },
            ]);
          }
        },
        onError: (e) => {
          Alert.alert(
            "Erreur de validation",
            e instanceof Error ? e.message : "Une erreur est survenue.",
          );
          setConfirmed(false);
        },
      },
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Already done */}
        {isDone && (
          <Animated.View entering={FadeInDown}>
            <Card style={styles.doneBanner}>
              <Ionicons name="checkmark-circle" size={24} color={colors.success} />
              <Text style={styles.doneBannerText}>Arrêt déjà validé</Text>
            </Card>
          </Animated.View>
        )}

        {/* Client name — BIG */}
        <Animated.View entering={FadeInDown.delay(50)}>
          <Card style={styles.clientCard}>
            <View style={styles.stopNumBadge}>
              <Text style={styles.stopNumBadgeText}>Arrêt #{stop.stopOrder}</Text>
            </View>
            <Text style={styles.clientNameBig} accessibilityRole="header">
              {stop.client.name}
            </Text>
            {stop.client.address && (
              <Pressable
                onPress={handleNavigate}
                style={styles.addressRow}
                accessibilityRole="button"
                accessibilityLabel={`Naviguer vers ${stop.client.address}`}
                accessibilityHint="Ouvre les plans natifs"
              >
                <Ionicons name="location-outline" size={16} color={colors.primary} />
                <Text style={styles.addressText}>{stop.client.address}</Text>
                <Ionicons name="navigate-outline" size={14} color={colors.primary} />
              </Pressable>
            )}
            {stop.client.phone && (
              <Pressable
                onPress={handleCall}
                style={styles.phoneRow}
                accessibilityRole="button"
                accessibilityLabel={`Appeler ${stop.client.name}`}
              >
                <Ionicons name="call-outline" size={16} color={colors.textSecondary} />
                <Text style={styles.phoneText}>{stop.client.phone}</Text>
              </Pressable>
            )}
          </Card>
        </Animated.View>

        {/* Special instructions — highlighted */}
        {stop.specialInstructions && (
          <Animated.View entering={FadeInDown.delay(100)}>
            <Card style={styles.warningCard}>
              <View style={styles.warningHeader}>
                <Ionicons name="warning" size={20} color={colors.warning} />
                <Text style={styles.warningTitle}>Instructions spéciales</Text>
              </View>
              <Text style={styles.warningText}>{stop.specialInstructions}</Text>
            </Card>
          </Animated.View>
        )}

        {/* Order info */}
        {stop.order && (
          <Animated.View entering={FadeInDown.delay(150)}>
            <Card style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Ionicons name="receipt-outline" size={16} color={colors.textSecondary} />
                <Text style={styles.infoLabel}>Commande</Text>
                <Text style={styles.infoValue}>{stop.order.orderNumber}</Text>
              </View>
            </Card>
          </Animated.View>
        )}

        {/* Validation section */}
        {!isDone && (
          <Animated.View entering={FadeInDown.delay(200)} style={styles.validationSection}>
            <Text style={styles.validationTitle}>Validation de l'arrêt</Text>

            <Stepper
              value={setsVal}
              onChange={(v) => {
                setSetsDelivered(v);
                setConfirmed(false);
              }}
              min={0}
              max={(stop.setsToDeliver ?? 0) + 10}
              label="Sets livrés"
            />

            <Stepper
              value={dirtyPickedUp}
              onChange={(v) => {
                setDirtyPickedUp(v);
                setConfirmed(false);
              }}
              min={0}
              max={50}
              label="Sets sales récupérés"
            />

            {/* Confirmation step */}
            {confirmed && (
              <Animated.View entering={FadeInUp.duration(200)}>
                <Card style={styles.confirmCard}>
                  <Ionicons name="information-circle-outline" size={20} color={colors.accent} />
                  <Text style={styles.confirmText}>
                    Confirmer : {setsVal} sets livrés + {dirtyPickedUp} sales récupérés chez{" "}
                    <Text style={styles.confirmBold}>{stop.client.name}</Text> ?
                  </Text>
                </Card>
              </Animated.View>
            )}

            <Button
              title={
                confirmed ? `Valider l'arrêt chez ${stop.client.name}` : "Confirmer les chiffres"
              }
              onPress={handleValidate}
              loading={completeStop.isPending}
              style={confirmed ? [styles.validateBtn, styles.validateBtnFinal] : styles.validateBtn}
            />

            {confirmed && (
              <Button
                title="Modifier"
                onPress={() => setConfirmed(false)}
                variant="ghost"
                style={{ marginTop: spacing.sm }}
              />
            )}
          </Animated.View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.huge,
    gap: spacing.md,
  },
  doneBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.successLight,
    borderColor: colors.success,
  },
  doneBannerText: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.semibold,
    color: colors.success,
  },
  // Client card
  clientCard: { gap: spacing.sm },
  stopNumBadge: {
    backgroundColor: colors.primaryLight,
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  stopNumBadgeText: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.bold,
    color: colors.primary,
  },
  clientNameBig: {
    fontSize: font.sizes.xxxl,
    fontWeight: font.weights.heavy,
    color: colors.textPrimary,
    lineHeight: 40,
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  addressText: {
    flex: 1,
    fontSize: font.sizes.md,
    color: colors.primary,
    fontWeight: font.weights.medium,
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  phoneText: {
    fontSize: font.sizes.md,
    color: colors.textSecondary,
  },
  // Warning card
  warningCard: {
    backgroundColor: colors.warningLight,
    borderColor: colors.warning,
    borderWidth: 1.5,
    gap: spacing.sm,
  },
  warningHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  warningTitle: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.bold,
    color: colors.warning,
  },
  warningText: {
    fontSize: font.sizes.md,
    color: "#92400e",
    lineHeight: 22,
  },
  // Info card
  infoCard: {},
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  infoLabel: {
    flex: 1,
    fontSize: font.sizes.sm,
    color: colors.textSecondary,
  },
  infoValue: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.semibold,
    color: colors.textPrimary,
  },
  // Validation
  validationSection: { gap: spacing.md },
  validationTitle: {
    fontSize: font.sizes.lg,
    fontWeight: font.weights.bold,
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  // Stepper
  stepperContainer: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  stepperLabel: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stepperBtn: {
    width: MIN_HIT_TARGET + 8,
    height: MIN_HIT_TARGET + 8,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperBtnAdd: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  stepperBtnDisabled: {
    opacity: 0.4,
  },
  stepperValue: {
    fontSize: font.sizes.xxxl,
    fontWeight: font.weights.heavy,
    color: colors.textPrimary,
    minWidth: 60,
    textAlign: "center",
  },
  // Confirm card
  confirmCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    backgroundColor: colors.accentLight,
    borderColor: colors.accent,
    borderWidth: 1.5,
  },
  confirmText: {
    flex: 1,
    fontSize: font.sizes.md,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  confirmBold: {
    fontWeight: font.weights.bold,
    color: colors.textPrimary,
  },
  // Buttons
  validateBtn: {},
  validateBtnFinal: {
    backgroundColor: colors.success,
  },
});
