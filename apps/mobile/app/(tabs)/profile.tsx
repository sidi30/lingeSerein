import { View, Text, StyleSheet, Alert } from "react-native";
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
  usePauseSubscription,
  useResumeSubscription,
  useCancelSubscription,
  useIsClient,
  formatDate,
} from "@/lib/api";
import { useLogout } from "@/lib/auth";
import { colors, font, spacing, radius } from "@/lib/theme";

const PLAN_INFO: Record<string, { deliveries: string; sets: string }> = {
  ESSENTIELLE: { deliveries: "4 /mois", sets: "20 sets" },
  CONFORT: { deliveries: "8 /mois", sets: "40 sets" },
  PRESTIGE: { deliveries: "Illimitees", sets: "60 sets" },
};

const ACCOMMODATION_LABELS: Record<string, string> = {
  HOTEL: "Hotel",
  GITE: "Gite",
  AIRBNB: "Airbnb",
  AUBERGE: "Auberge",
  AUTRE: "Autre",
};

export default function ProfileScreen() {
  const profile = useProfile();
  const sub = useMySubscription();
  const pauseSub = usePauseSubscription();
  const resumeSub = useResumeSubscription();
  const cancelSub = useCancelSubscription();
  const logout = useLogout();

  const isClient = useIsClient();
  const isLoading = profile.isLoading || (isClient && sub.isLoading);
  const refreshing = profile.isRefetching || (isClient && sub.isRefetching);
  const refetch = () => {
    profile.refetch();
    sub.refetch();
  };

  if (isLoading && !profile.data) return <LoadingScreen />;

  const user = profile.data;
  const subscription = sub.data;
  const planInfo = subscription ? PLAN_INFO[subscription.plan] : null;

  const handlePause = () => {
    Alert.alert(
      "Mettre en pause",
      `Votre abonnement sera mis en pause. Vous avez utilise ${subscription?.pauseMonthsUsed ?? 0}/2 mois de pause cette annee.`,
      [
        { text: "Annuler", style: "cancel" },
        { text: "Confirmer", onPress: () => pauseSub.mutate() },
      ],
    );
  };

  const handleResume = () => {
    resumeSub.mutate();
  };

  const handleCancel = () => {
    Alert.alert(
      "Resilier l'abonnement",
      "La resiliation prendra effet dans 30 jours. Vous pourrez continuer a utiliser le service jusque-la.",
      [
        { text: "Non", style: "cancel" },
        {
          text: "Oui, resilier",
          style: "destructive",
          onPress: () => cancelSub.mutate(),
        },
      ],
    );
  };

  const handleLogout = () => {
    Alert.alert("Deconnexion", "Voulez-vous vous deconnecter ?", [
      { text: "Non", style: "cancel" },
      {
        text: "Se deconnecter",
        onPress: () => logout.mutate(),
      },
    ]);
  };

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={refetch}>
      {/* User info */}
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

      {/* Account info */}
      <Card style={styles.infoCard}>
        <InfoRow label="Creneau prefere" value={user?.preferredTimeSlot ?? "Non defini"} />
        <InfoRow label="Seuil alerte stock" value={`${user?.stockAlertThreshold ?? 30}%`} />
        <InfoRow label="Membre depuis" value={user?.createdAt ? formatDate(user.createdAt) : "-"} />
      </Card>

      {/* Subscription - client only */}
      {!isClient ? (
        <Card style={{ marginTop: spacing.xl }}>
          <Text style={styles.infoLabel}>Role</Text>
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
          {subscription ? (
            <Card style={styles.subCard}>
              <View style={styles.subHeader}>
                <View>
                  <Text style={styles.subPlan}>{subscription.plan}</Text>
                  <StatusBadge type="subscription" status={subscription.status} />
                </View>
              </View>

              {planInfo && (
                <View style={styles.planDetails}>
                  <View style={styles.planItem}>
                    <Text style={styles.planValue}>{planInfo.deliveries}</Text>
                    <Text style={styles.planLabel}>Livraisons</Text>
                  </View>
                  <View style={styles.planDivider} />
                  <View style={styles.planItem}>
                    <Text style={styles.planValue}>{planInfo.sets}</Text>
                    <Text style={styles.planLabel}>Inclus</Text>
                  </View>
                  <View style={styles.planDivider} />
                  <View style={styles.planItem}>
                    <Text style={styles.planValue}>
                      {formatDate(subscription.currentPeriodEnd)}
                    </Text>
                    <Text style={styles.planLabel}>Fin periode</Text>
                  </View>
                </View>
              )}

              {/* Products in subscription */}
              {subscription.products.length > 0 && (
                <View style={styles.subProducts}>
                  <Text style={styles.subProductsTitle}>Articles inclus</Text>
                  {subscription.products.map((sp) => (
                    <View key={sp.id} style={styles.subProductRow}>
                      <Text style={styles.subProductName}>{sp.product.name}</Text>
                      <Text style={styles.subProductQty}>x{sp.quantity}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Subscription actions */}
              <View style={styles.subActions}>
                {subscription.status === "ACTIVE" && (
                  <>
                    <Button
                      title="Mettre en pause"
                      onPress={handlePause}
                      variant="outline"
                      loading={pauseSub.isPending}
                      accessibilityHint={`${2 - (subscription.pauseMonthsUsed ?? 0)} mois de pause restants cette annee`}
                    />
                    <Button
                      title="Resilier"
                      onPress={handleCancel}
                      variant="danger"
                      loading={cancelSub.isPending}
                      accessibilityHint="La resiliation prend effet dans 30 jours"
                    />
                  </>
                )}
                {subscription.status === "PAUSED" && (
                  <Button
                    title="Reprendre l'abonnement"
                    onPress={handleResume}
                    loading={resumeSub.isPending}
                  />
                )}
                {subscription.status === "CANCELLED" && subscription.cancelEffectiveAt && (
                  <View style={styles.cancelInfo}>
                    <Text style={styles.cancelText}>
                      Resiliation effective le {formatDate(subscription.cancelEffectiveAt)}
                    </Text>
                  </View>
                )}
              </View>
            </Card>
          ) : (
            <Card>
              <Text style={styles.noSub}>Vous n'avez pas encore d'abonnement</Text>
            </Card>
          )}
        </>
      )}

      {/* Logout */}
      <Button
        title="Se deconnecter"
        onPress={handleLogout}
        variant="outline"
        loading={logout.isPending}
        style={{ marginTop: spacing.xxxl }}
        accessibilityHint="Se deconnecter de l'application"
      />

      <Text style={styles.version}>Linge Serein v0.1.0</Text>
    </ScreenWrapper>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
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
  // Subscription
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
  planDetails: {
    flexDirection: "row",
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  planItem: {
    flex: 1,
    alignItems: "center",
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
    marginTop: 2,
  },
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
  subActions: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  cancelInfo: {
    backgroundColor: colors.errorLight,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  cancelText: {
    fontSize: font.sizes.sm,
    color: colors.error,
    fontWeight: font.weights.medium,
  },
  noSub: {
    fontSize: font.sizes.sm,
    color: colors.textTertiary,
    textAlign: "center",
  },
  // Logout
  version: {
    textAlign: "center",
    fontSize: font.sizes.xs,
    color: colors.textTertiary,
    marginTop: spacing.xl,
    marginBottom: spacing.xxxl,
  },
});
