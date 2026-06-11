import { View, Text, StyleSheet, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { ScreenWrapper } from "@/components/ScreenWrapper";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/Button";
import { SectionHeader } from "@/components/SectionHeader";
import { LoadingScreen } from "@/components/LoadingScreen";
import {
  useProfile,
  useMySubscription,
  useSubscriptionConfig,
  useSubscribeToPackSerenite,
  usePauseSubscription,
  useResumeSubscription,
  useCancelSubscription,
  useIsClient,
  formatDate,
  formatCents,
  ApiError,
} from "@/lib/api";
import { useLogout } from "@/lib/auth";
import { colors, font, spacing, radius } from "@/lib/theme";

const ACCOMMODATION_LABELS: Record<string, string> = {
  HOTEL: "Hôtel",
  GITE: "Gîte",
  AIRBNB: "Airbnb",
  AUBERGE: "Auberge",
  AUTRE: "Autre",
};

// ─── Helper : date longue FR ─────────────────────────────────────

function committedUntilLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

// ─── Composant info-ligne ─────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

// ─── Bandeau engagement actif ─────────────────────────────────────

function EngagementBanner({
  committedUntil,
  minEngagementMonths,
}: {
  committedUntil: string | null;
  minEngagementMonths: number;
}) {
  if (!committedUntil) return null;
  const until = new Date(committedUntil);
  if (!(until > new Date())) return null;

  return (
    <Animated.View entering={FadeInDown.duration(200)}>
      <View style={styles.engagementBanner}>
        <Ionicons name="lock-closed-outline" size={16} color={colors.warning} />
        <Text style={styles.engagementText}>
          Engagement {minEngagementMonths} mois en cours jusqu'au{" "}
          <Text style={styles.engagementDate}>{committedUntilLabel(committedUntil)}</Text>
        </Text>
      </View>
    </Animated.View>
  );
}

// ─── Section Pack Sérénité ────────────────────────────────────────

function PackSereniteSubscription() {
  const sub = useMySubscription();
  const config = useSubscriptionConfig();
  const subscribe = useSubscribeToPackSerenite();
  const pauseSub = usePauseSubscription();
  const resumeSub = useResumeSubscription();
  const cancelSub = useCancelSubscription();

  const subscription = sub.data;
  const cfg = config.data;

  // Valeurs affichées : snapshot immuable de l'abonnement, sinon config courante
  const displayPriceCents = subscription?.priceCents ?? cfg?.priceCents;
  const displayKitBain = subscription?.kitBainQty ?? cfg?.kitBainQty ?? 8;
  const displayKitLit = subscription?.kitLitQty ?? cfg?.kitLitQty ?? 4;
  const displayMinMonths = subscription?.minEngagementMonths ?? cfg?.minEngagementMonths ?? 3;
  const displayNoticeDays = cfg?.noticePeriodDays ?? 30;
  const planName = cfg?.planName ?? "Pack Sérénité";

  const handleSubscribe = () => {
    Alert.alert(
      `Souscrire au ${planName}`,
      `${displayPriceCents != null ? formatCents(displayPriceCents) : "—"}/mois\nEngagement minimum : ${displayMinMonths} mois\n\nAprès souscription, la résiliation ne sera possible qu'à l'issue de la période d'engagement.`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Confirmer",
          onPress: () =>
            subscribe.mutate(undefined, {
              onError: (e) => {
                Alert.alert("Erreur", e instanceof Error ? e.message : "Une erreur est survenue.");
              },
            }),
        },
      ],
    );
  };

  const handlePause = () => {
    Alert.alert(
      "Mettre en pause",
      `Votre abonnement sera mis en pause. Vous avez utilisé ${subscription?.pauseMonthsUsed ?? 0}/2 mois de pause cette année.`,
      [
        { text: "Annuler", style: "cancel" },
        { text: "Confirmer", onPress: () => pauseSub.mutate() },
      ],
    );
  };

  const handleCancel = () => {
    const committedUntil = subscription?.committedUntil ?? null;
    const isEngaged = committedUntil != null && new Date(committedUntil) > new Date();

    // Vérification locale avant appel API (AC-F6-05) — l'API bloque également côté serveur
    if (isEngaged) {
      Alert.alert(
        "Résiliation indisponible",
        `Votre engagement de ${displayMinMonths} mois court jusqu'au ${committedUntilLabel(committedUntil)}.\n\nVous pourrez résilier à partir de cette date.`,
        [{ text: "Compris" }],
      );
      return;
    }

    Alert.alert(
      "Résilier l'abonnement",
      `La résiliation prendra effet dans ${displayNoticeDays} jours. Vous pourrez continuer à utiliser le service jusqu'à cette date.`,
      [
        { text: "Non", style: "cancel" },
        {
          text: "Oui, résilier",
          style: "destructive",
          onPress: () =>
            cancelSub.mutate(undefined, {
              onError: (e) => {
                // 422 ENGAGEMENT_ACTIVE : l'API bloque la résiliation (AC-F6-03)
                if (e instanceof ApiError && e.status === 422) {
                  Alert.alert("Résiliation bloquée", e.message);
                } else {
                  Alert.alert(
                    "Erreur",
                    e instanceof Error ? e.message : "Une erreur est survenue.",
                  );
                }
              },
            }),
        },
      ],
    );
  };

  // Aucun abonnement → proposer de souscrire
  if (!subscription) {
    return (
      <Card style={styles.noSubCard}>
        <Ionicons name="shield-checkmark-outline" size={40} color={colors.primary} />
        <Text style={styles.noSubTitle}>{planName}</Text>

        {cfg && (
          <>
            <Text style={styles.noSubPrice}>{formatCents(cfg.priceCents)}/mois</Text>

            <View style={styles.noSubDetails}>
              <View style={styles.noSubRow}>
                <Ionicons name="water-outline" size={16} color={colors.primary} />
                <Text style={styles.noSubDetailText}>{cfg.kitBainQty} kits bain / mois</Text>
              </View>
              <View style={styles.noSubRow}>
                <Ionicons name="bed-outline" size={16} color={colors.accent} />
                <Text style={styles.noSubDetailText}>{cfg.kitLitQty} kits lit / mois</Text>
              </View>
              <View style={styles.noSubRow}>
                <Ionicons name="car-outline" size={16} color={colors.success} />
                <Text style={styles.noSubDetailText}>Livraisons incluses</Text>
              </View>
            </View>

            {/* Engagement clairement affiché AVANT souscription (AC-F6-01) */}
            <View style={styles.engagementNotice}>
              <Ionicons name="information-circle-outline" size={16} color={colors.info} />
              <Text style={styles.engagementNoticeText}>
                Engagement minimum : {cfg.minEngagementMonths} mois{"\n"}
                Résiliation possible ensuite avec {cfg.noticePeriodDays} j de préavis
              </Text>
            </View>
          </>
        )}

        <Button
          title={`Souscrire au ${planName}`}
          onPress={handleSubscribe}
          loading={subscribe.isPending}
          style={{ marginTop: spacing.lg, width: "100%" }}
          accessibilityHint={`Engagement minimum ${cfg?.minEngagementMonths ?? 3} mois`}
        />
      </Card>
    );
  }

  // Abonnement existant
  const committedUntil = subscription.committedUntil;
  const isEngaged = committedUntil != null && new Date(committedUntil) > new Date();

  return (
    <Card style={styles.subCard}>
      {/* En-tête */}
      <View style={styles.subHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.subPlan}>{planName}</Text>
          <StatusBadge type="subscription" status={subscription.status} />
        </View>
        {displayPriceCents != null && (
          <Text style={styles.subPrice}>{formatCents(displayPriceCents)}/mois</Text>
        )}
      </View>

      {/* Composition et période */}
      <View style={styles.planDetails}>
        <View style={styles.planItem}>
          <Ionicons name="water-outline" size={18} color={colors.primary} />
          <Text style={styles.planValue}>{displayKitBain}</Text>
          <Text style={styles.planLabel}>kits bain</Text>
        </View>
        <View style={styles.planDivider} />
        <View style={styles.planItem}>
          <Ionicons name="bed-outline" size={18} color={colors.accent} />
          <Text style={styles.planValue}>{displayKitLit}</Text>
          <Text style={styles.planLabel}>kits lit</Text>
        </View>
        <View style={styles.planDivider} />
        <View style={styles.planItem}>
          <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
          <Text style={styles.planValue}>{formatDate(subscription.currentPeriodEnd)}</Text>
          <Text style={styles.planLabel}>fin période</Text>
        </View>
      </View>

      {/* Bandeau engagement si actif (AC-F6-05) */}
      <EngagementBanner committedUntil={committedUntil} minEngagementMonths={displayMinMonths} />

      {/* Date de fin engagement si terminée */}
      {committedUntil != null && !isEngaged && (
        <View style={styles.engagementDone}>
          <Ionicons name="checkmark-circle-outline" size={14} color={colors.success} />
          <Text style={styles.engagementDoneText}>
            Engagement terminé le {committedUntilLabel(committedUntil)}
          </Text>
        </View>
      )}

      {/* Résiliation en cours */}
      {subscription.status === "CANCELLED" && subscription.cancelEffectiveAt && (
        <View style={styles.cancelInfo}>
          <Text style={styles.cancelText}>
            Résiliation effective le {formatDate(subscription.cancelEffectiveAt)}
          </Text>
        </View>
      )}

      {/* Articles inclus si renvoyés par l'API */}
      {(subscription.products?.length ?? 0) > 0 && (
        <View style={styles.subProducts}>
          <Text style={styles.subProductsTitle}>Composition détaillée</Text>
          {subscription.products?.map((sp) => (
            <View key={sp.id} style={styles.subProductRow}>
              <Text style={styles.subProductName}>{sp.product.name}</Text>
              <Text style={styles.subProductQty}>x{sp.quantity}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Actions */}
      <View style={styles.subActions}>
        {subscription.status === "ACTIVE" && (
          <>
            <Button
              title="Mettre en pause"
              onPress={handlePause}
              variant="outline"
              loading={pauseSub.isPending}
              accessibilityHint={`${2 - (subscription.pauseMonthsUsed ?? 0)} mois de pause restants`}
            />
            <Button
              title={
                isEngaged
                  ? `Résiliation indisponible jusqu'au ${committedUntilLabel(committedUntil)}`
                  : "Résilier"
              }
              onPress={handleCancel}
              variant="danger"
              loading={cancelSub.isPending}
              accessibilityHint={
                isEngaged
                  ? `Engagement en cours jusqu'au ${committedUntilLabel(committedUntil)}`
                  : `La résiliation prend effet dans ${displayNoticeDays} jours`
              }
            />
          </>
        )}
        {subscription.status === "PAUSED" && (
          <Button
            title="Reprendre l'abonnement"
            onPress={() => resumeSub.mutate()}
            loading={resumeSub.isPending}
          />
        )}
      </View>
    </Card>
  );
}

// ─── Main screen ─────────────────────────────────────────────────

export default function ProfileScreen() {
  const profile = useProfile();
  const sub = useMySubscription();
  const logout = useLogout();
  const isClient = useIsClient();

  const isLoading = profile.isLoading || (isClient && sub.isLoading);
  const refreshing = profile.isRefetching || (isClient && sub.isRefetching);
  const refetch = () => {
    void profile.refetch();
    void sub.refetch();
  };

  if (isLoading && !profile.data) return <LoadingScreen />;

  const user = profile.data;

  const handleLogout = () => {
    Alert.alert("Déconnexion", "Voulez-vous vous déconnecter ?", [
      { text: "Non", style: "cancel" },
      { text: "Se déconnecter", onPress: () => logout.mutate() },
    ]);
  };

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={refetch}>
      {/* En-tête profil */}
      <View style={styles.profileHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.name
              ?.split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase()
              .slice(0, 2) ?? "?"}
          </Text>
        </View>
        <Text style={styles.name}>{user?.name}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        {user?.accommodationType && (
          <Badge label={ACCOMMODATION_LABELS[user.accommodationType] ?? user.accommodationType} />
        )}
      </View>

      {/* Infos compte */}
      <Card style={styles.infoCard}>
        <InfoRow label="Créneau préféré" value={user?.preferredTimeSlot ?? "Non défini"} />
        <InfoRow label="Seuil alerte stock" value={`${user?.stockAlertThreshold ?? 30}%`} />
        <InfoRow label="Membre depuis" value={user?.createdAt ? formatDate(user.createdAt) : "-"} />
      </Card>

      {/* Abonnement — clients uniquement */}
      {!isClient ? (
        <Card style={{ marginTop: spacing.xl }}>
          <Text style={styles.infoLabel}>Rôle</Text>
          <Text style={[styles.infoValue, { fontSize: font.sizes.lg }]}>
            {user?.role === "ROLE_ADMIN"
              ? "Administrateur"
              : user?.role === "ROLE_LIVREUR"
                ? "Livreur"
                : (user?.role ?? "")}
          </Text>
        </Card>
      ) : (
        <>
          <SectionHeader title="Abonnement" />
          <PackSereniteSubscription />
        </>
      )}

      {/* Déconnexion */}
      <Button
        title="Se déconnecter"
        onPress={handleLogout}
        variant="outline"
        loading={logout.isPending}
        style={{ marginTop: spacing.xxxl }}
        accessibilityHint="Se déconnecter de l'application"
      />

      <Text style={styles.version}>Linge Serein v0.1.1</Text>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  profileHeader: {
    alignItems: "center",
    paddingVertical: spacing.xxl,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primaryLight,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  avatarText: {
    fontSize: font.sizes.xxl,
    fontWeight: font.weights.bold,
    color: colors.primary,
  },
  name: {
    fontSize: font.sizes.xl,
    fontWeight: font.weights.bold,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  email: {
    fontSize: font.sizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  // Info card
  infoCard: { marginBottom: spacing.md },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
  },
  infoLabel: {
    fontSize: font.sizes.sm,
    color: colors.textSecondary,
  },
  infoValue: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.semibold,
    color: colors.textPrimary,
  },
  // Pas encore d'abonnement
  noSubCard: {
    alignItems: "center",
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  noSubTitle: {
    fontSize: font.sizes.xl,
    fontWeight: font.weights.bold,
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  noSubPrice: {
    fontSize: font.sizes.xxl,
    fontWeight: font.weights.heavy,
    color: colors.primary,
  },
  noSubDetails: {
    width: "100%",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  noSubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  noSubDetailText: {
    fontSize: font.sizes.sm,
    color: colors.textPrimary,
  },
  // Notice engagement avant souscription (AC-F6-01)
  engagementNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.infoLight,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginTop: spacing.sm,
    width: "100%",
  },
  engagementNoticeText: {
    flex: 1,
    fontSize: font.sizes.xs,
    color: colors.info,
    lineHeight: 18,
  },
  // Abonnement existant
  subCard: {},
  subHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.lg,
  },
  subPlan: {
    fontSize: font.sizes.xl,
    fontWeight: font.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subPrice: {
    fontSize: font.sizes.lg,
    fontWeight: font.weights.heavy,
    color: colors.primary,
  },
  planDetails: {
    flexDirection: "row",
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  planItem: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  planDivider: {
    width: 1,
    backgroundColor: colors.border,
  },
  planValue: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.bold,
    color: colors.textPrimary,
    textAlign: "center",
  },
  planLabel: {
    fontSize: font.sizes.xs,
    color: colors.textTertiary,
  },
  // Bandeau engagement actif
  engagementBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.warningLight,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  engagementText: {
    flex: 1,
    fontSize: font.sizes.xs,
    color: colors.warning,
    lineHeight: 18,
  },
  engagementDate: {
    fontWeight: font.weights.bold,
  },
  engagementDone: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  engagementDoneText: {
    fontSize: font.sizes.xs,
    color: colors.success,
  },
  // Articles inclus
  subProducts: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.md,
    marginBottom: spacing.md,
  },
  subProductsTitle: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  subProductRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  subProductName: {
    fontSize: font.sizes.sm,
    color: colors.textPrimary,
  },
  subProductQty: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.semibold,
    color: colors.textSecondary,
  },
  // Actions
  subActions: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  cancelInfo: {
    backgroundColor: colors.errorLight,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cancelText: {
    fontSize: font.sizes.sm,
    color: colors.error,
    fontWeight: font.weights.medium,
  },
  // Version
  version: {
    textAlign: "center",
    fontSize: font.sizes.xs,
    color: colors.textTertiary,
    marginTop: spacing.xl,
    marginBottom: spacing.xxxl,
  },
});
