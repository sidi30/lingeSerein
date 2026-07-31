/**
 * Stop detail screen — écran "anti-erreur" pour le livreur.
 * Affiche les informations clés de l'arrêt avant validation.
 */

import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  Linking,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { SkeletonBox } from "@/components/SkeletonBox";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { SignaturePad, strokesToDataUrl, isMeaningfulSignature } from "@/components/SignaturePad";
import type { SignatureStroke } from "@/components/SignaturePad";
import { useTodayRound, useCompleteStop, errorMessage } from "@/lib/api";
import type { DeliveryStop, CompleteStopInput } from "@/lib/api";
import {
  addressLines,
  destinationQuery,
  navigationTargets,
  stopSubtitle,
  stopTitle,
} from "@/lib/navigation-links";
import { useAuthStore } from "@/lib/store";
import { colors, font, spacing, radius, MIN_HIT_TARGET, TAB_BAR_BASE_HEIGHT } from "@/lib/theme";

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

  const roundQuery = useTodayRound();
  const { data: round } = roundQuery;
  const completeStop = useCompleteStop();
  const role = useAuthStore((s) => s.user?.role);
  const isDriver = role === "ROLE_LIVREUR";
  const insets = useSafeAreaInsets();

  const stop: DeliveryStop | undefined = round?.stops.find((s) => s.id === stopId);

  const [setsDelivered, setSetsDelivered] = useState<number | null>(null);
  const [dirtyPickedUp, setDirtyPickedUp] = useState(0);
  const [confirmed, setConfirmed] = useState(false);

  // Bon de livraison : signature manuscrite + identité du signataire + réserves,
  // pour coller au bon papier déjà utilisé sur le terrain.
  const [strokes, setStrokes] = useState<SignatureStroke[]>([]);
  const [padSize, setPadSize] = useState({ width: 0, height: 0 });
  const [signataireNom, setSignataireNom] = useState("");
  const [conforme, setConforme] = useState(true);
  const [reserves, setReserves] = useState("");

  // Un appui accidentel sur la zone (pour faire défiler) ne vaut pas signature.
  const hasSignature = isMeaningfulSignature(strokes);

  // Pre-fill when stop data loads
  const setsVal = setsDelivered ?? stop?.setsToDeliver ?? 0;

  // Écran réservé au livreur. `useTodayRound` est désactivé pour les autres
  // rôles, et une requête désactivée reste `isPending` indéfiniment : sans ce
  // garde-fou, un client arrivant ici par lien profond voyait un squelette qui
  // ne se résolvait jamais.
  if (!isDriver) {
    return (
      <View style={styles.flex}>
        <EmptyState
          icon="lock-closed-outline"
          title="Réservé aux livreurs"
          description="Cet écran fait partie de la tournée de livraison."
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

  // Tant que la tournée n'est pas arrivée, on affiche le squelette — y compris
  // quand la requête est en cours de rafraîchissement. `isLoading` seul valait
  // « introuvable » dans ce cas, alors que l'arrêt existe.
  if (!stop && (roundQuery.isPending || roundQuery.isFetching)) {
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

  // La tournée n'a pas pu être chargée : l'arrêt existe toujours, c'est la
  // liaison qui manque. Le dire évite d'annoncer au livreur la disparition
  // d'un arrêt sur lequel il doit encore faire signer.
  if (!stop && roundQuery.isError) {
    return (
      <View style={styles.flex}>
        <ErrorState what="votre tournée" onRetry={() => void roundQuery.refetch()} />
        <Button
          title="Retour"
          onPress={() => router.back()}
          variant="outline"
          style={{ margin: spacing.lg }}
        />
      </View>
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

  // Destination GPS : rue + code postal + ville réunis (`address` seule est un
  // champ texte libre SANS commune — cf. lib/navigation-links.ts). `null` quand
  // la rue manque : aucun bouton n'est alors proposé.
  const destination = destinationQuery(stop.client);
  const navTargets = destination ? navigationTargets(destination, Platform.OS) : [];

  const handleNavigate = (url: string, label: string) => {
    void (async () => {
      try {
        // `canOpenURL` d'abord : sans lui, un appareil incapable d'ouvrir le
        // lien reste sur un appui sans effet, et le livreur appuie trois fois
        // avant de comprendre qu'il ne se passera rien.
        const supported = await Linking.canOpenURL(url);
        if (!supported) {
          Alert.alert(
            `${label} indisponible`,
            "Cette application n'est pas installée sur cet appareil.",
          );
          return;
        }
        await Linking.openURL(url);
      } catch {
        Alert.alert("Erreur", `Impossible d'ouvrir ${label}.`);
      }
    })();
  };

  const submit = () => {
    // `submit` est aussi appelé depuis une alerte, hors de la protection
    // `disabled` du bouton : sans cette garde, deux validations peuvent partir.
    if (completeStop.isPending) return;

    const data: CompleteStopInput = {
      setsDelivered: setsVal,
      dirtyPickedUp,
      conforme,
    };
    if (hasSignature) {
      data.signatureDataUrl = strokesToDataUrl(strokes, padSize.width, padSize.height);
    }
    if (signataireNom.trim()) data.signataireNom = signataireNom.trim();
    if (!conforme && reserves.trim()) data.reserves = reserves.trim();

    completeStop.mutate(
      {
        stopId: stop.id,
        data,
      },
      {
        onSuccess: () => {
          // Haptique de succès seulement une fois le serveur d'accord : la
          // jouer avant l'envoi confirmait aussi les échecs.
          if (Platform.OS !== "web") {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          // Find next pending stop
          const nextStop = round?.stops
            .filter((s) => s.status === "PENDING" && s.id !== stop.id)
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
          // On ne réinitialise que l'étape de confirmation : la signature, le
          // nom et les réserves restent saisis pour pouvoir réessayer sans
          // redemander au client de signer une seconde fois.
          if (Platform.OS !== "web") {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          }
          Alert.alert(
            "Validation impossible",
            `${errorMessage(e)}

Votre signature est conservée.`,
          );
          setConfirmed(false);
        },
      },
    );
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

    if (!conforme && !reserves.trim()) {
      Alert.alert("Réserves à préciser", "Décrivez brièvement le problème constaté.");
      return;
    }

    // La signature n'est pas bloquante : un client absent ne doit pas empêcher
    // le livreur de finir sa tournée. On demande une confirmation explicite.
    if (!hasSignature) {
      Alert.alert("Aucune signature", "Le client n'a pas signé. Valider quand même cet arrêt ?", [
        { text: "Revenir signer", style: "cancel", onPress: () => setConfirmed(false) },
        { text: "Valider sans signature", style: "destructive", onPress: submit },
      ]);
      return;
    }

    submit();
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: TAB_BAR_BASE_HEIGHT + insets.bottom + spacing.xl },
        ]}
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

        {/* Identité de l'arrêt — l'établissement d'abord : c'est l'enseigne que
            le livreur cherche des yeux en arrivant, pas le nom du gérant. */}
        <Animated.View entering={FadeInDown.delay(50)}>
          <Card style={styles.clientCard}>
            <View style={styles.stopNumBadge}>
              <Text style={styles.stopNumBadgeText}>Arrêt #{stop.stopOrder}</Text>
            </View>
            <Text style={styles.clientNameBig} accessibilityRole="header">
              {stopTitle(stop.client)}
            </Text>
            {stopSubtitle(stop.client) && (
              <Text style={styles.clientContact}>{stopSubtitle(stop.client)}</Text>
            )}

            {/* Adresse sur ses lignes naturelles : rue, puis code postal + ville */}
            {addressLines(stop.client).length > 0 && (
              <View style={styles.addressBlock}>
                <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
                <View style={{ flex: 1 }}>
                  {addressLines(stop.client).map((line) => (
                    <Text key={line} style={styles.addressText}>
                      {line}
                    </Text>
                  ))}
                </View>
              </View>
            )}

            {/* Itinéraire — proposé UNIQUEMENT si la rue est connue. Une
                destination réduite à une commune ouvrirait un GPS sur un
                centre-ville : pire qu'un bouton absent, qui invite à appeler. */}
            {navTargets.length > 0 ? (
              <View style={styles.navRow}>
                {navTargets.map((target) => (
                  <Pressable
                    key={target.key}
                    onPress={() => handleNavigate(target.url, target.label)}
                    style={({ pressed }) => [styles.navBtn, pressed && styles.navBtnPressed]}
                    accessibilityRole="button"
                    accessibilityLabel={`Itinéraire avec ${target.label}`}
                    accessibilityHint={`Vers ${destination ?? ""}`}
                  >
                    <Ionicons name="navigate-outline" size={16} color={colors.primary} />
                    <Text style={styles.navBtnText}>{target.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <View style={styles.noAddressBox}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.warning} />
                <Text style={styles.noAddressText}>
                  Aucune adresse de rue enregistrée : l&apos;itinéraire ne peut pas être calculé.
                  {stop.client.phone ? " Appelez le client pour vous faire guider." : ""}
                </Text>
              </View>
            )}

            {stop.client.phone && (
              <Pressable
                onPress={handleCall}
                style={styles.phoneRow}
                accessibilityRole="button"
                accessibilityLabel={`Appeler ${stopTitle(stop.client)} au ${stop.client.phone}`}
              >
                <Ionicons name="call-outline" size={18} color={colors.primary} />
                <Text style={styles.phoneText}>{stop.client.phone}</Text>
                <Text style={styles.phoneCta}>Appeler</Text>
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

            {/* Bon de livraison — miroir du bon papier utilisé sur le terrain */}
            <View style={styles.bonCard}>
              <Text style={styles.bonTitle}>Bon de livraison</Text>

              <Text style={styles.fieldLabel}>État de la livraison</Text>
              <View style={styles.segmentRow}>
                <Pressable
                  onPress={() => {
                    setConforme(true);
                    setConfirmed(false);
                  }}
                  style={[styles.segment, conforme && styles.segmentActiveOk]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: conforme }}
                  accessibilityLabel="Livraison conforme"
                >
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={20}
                    color={conforme ? colors.successText : colors.textTertiary}
                  />
                  <Text style={[styles.segmentText, conforme && styles.segmentTextOk]}>
                    Conforme
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setConforme(false);
                    setConfirmed(false);
                  }}
                  style={[styles.segment, !conforme && styles.segmentActiveWarn]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: !conforme }}
                  accessibilityLabel="Livraison avec réserves"
                >
                  <Ionicons
                    name="alert-circle-outline"
                    size={20}
                    color={!conforme ? colors.warningText : colors.textTertiary}
                  />
                  <Text style={[styles.segmentText, !conforme && styles.segmentTextWarn]}>
                    Réserves
                  </Text>
                </Pressable>
              </View>

              {!conforme && (
                <Animated.View entering={FadeInUp.duration(180)}>
                  <Text style={styles.fieldLabel}>Détail des réserves</Text>
                  <TextInput
                    style={styles.textArea}
                    value={reserves}
                    onChangeText={(t) => {
                      setReserves(t);
                      setConfirmed(false);
                    }}
                    multiline
                    placeholder="Linge manquant, article abîmé, adresse inaccessible..."
                    placeholderTextColor={colors.textTertiary}
                    accessibilityLabel="Détail des réserves"
                    textAlignVertical="top"
                  />
                </Animated.View>
              )}

              <Text style={styles.fieldLabel}>Nom du signataire</Text>
              <TextInput
                style={styles.textInput}
                value={signataireNom}
                onChangeText={(t) => {
                  setSignataireNom(t);
                  setConfirmed(false);
                }}
                placeholder={stop.client.name}
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="words"
                accessibilityLabel="Nom de la personne qui signe"
              />

              <SignaturePad
                disabled={completeStop.isPending}
                onChange={(s, size) => {
                  setStrokes(s);
                  setPadSize(size);
                  setConfirmed(false);
                }}
              />
            </View>

            {/* Confirmation step */}
            {confirmed && (
              <Animated.View entering={FadeInUp.duration(200)}>
                <Card style={styles.confirmCard}>
                  <Ionicons name="information-circle-outline" size={20} color={colors.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.confirmText}>
                      Confirmer : {setsVal} sets livrés + {dirtyPickedUp} sales récupérés chez{" "}
                      <Text style={styles.confirmBold}>{stop.client.name}</Text> ?
                    </Text>
                    <Text style={styles.confirmMeta}>
                      {conforme ? "Livraison conforme" : "Avec réserves"} ·{" "}
                      {hasSignature
                        ? `signé${signataireNom.trim() ? ` par ${signataireNom.trim()}` : ""}`
                        : "sans signature"}
                    </Text>
                  </View>
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
    color: colors.successText,
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
  clientContact: {
    fontSize: font.sizes.md,
    color: colors.textSecondary,
    marginTop: -spacing.xs,
  },
  addressBlock: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  addressText: {
    fontSize: font.sizes.md,
    color: colors.textPrimary,
    fontWeight: font.weights.medium,
    lineHeight: 22,
  },
  // Itinéraire : une cible par application, 44 px de haut, utilisable d'une
  // main en extérieur.
  navRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  navBtn: {
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: MIN_HIT_TARGET,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  navBtnPressed: { opacity: 0.7 },
  navBtnText: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.bold,
    color: colors.primary,
  },
  noAddressBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.warningLight,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  noAddressText: {
    flex: 1,
    fontSize: font.sizes.xs,
    color: colors.warningText,
    lineHeight: 17,
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: MIN_HIT_TARGET,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  phoneText: {
    flex: 1,
    fontSize: font.sizes.md,
    fontWeight: font.weights.medium,
    color: colors.textPrimary,
  },
  phoneCta: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.bold,
    color: colors.primary,
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
    color: colors.warningText,
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
    fontSize: font.sizes.md,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  confirmMeta: {
    fontSize: font.sizes.sm,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  // Bon de livraison
  bonCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  bonTitle: {
    fontSize: font.sizes.lg,
    fontWeight: font.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  fieldLabel: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.semibold,
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: spacing.md,
  },
  segmentRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  segment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: MIN_HIT_TARGET,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  segmentActiveOk: {
    borderColor: colors.success,
    backgroundColor: colors.successLight,
  },
  segmentActiveWarn: {
    borderColor: colors.warning,
    backgroundColor: colors.warningLight,
  },
  segmentText: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.semibold,
    color: colors.textTertiary,
  },
  segmentTextOk: { color: colors.successText },
  segmentTextWarn: { color: colors.warningText },
  textInput: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    minHeight: MIN_HIT_TARGET,
    fontSize: font.sizes.md,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  textArea: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    minHeight: 80,
    fontSize: font.sizes.md,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
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
