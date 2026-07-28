import { useEffect, useState, useCallback, memo } from "react";
import { View, Text, TextInput, FlatList, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Card } from "@/components/Card";
import { SkeletonBox } from "@/components/SkeletonBox";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { useClients, clientSubtitle } from "@/lib/api";
import type { ClientListItem } from "@/lib/api";
import { colors, font, spacing, radius, shadow, TAB_BAR_BASE_HEIGHT } from "@/lib/theme";
import { useDebounce } from "@/lib/useDebounce";

const ClientRow = memo(function ClientRow({
  client,
  index,
}: {
  client: ClientListItem;
  index: number;
}) {
  const initials = client.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const hasLowStock = (client.stocks ?? []).some(
    (s) => s.totalInCirculation > 0 && s.cleanSets < 3,
  );

  // E-mail facultatif depuis la refonte CRM : on retombe sur le téléphone,
  // puis la ville, puis une mention explicite — jamais un sous-titre vide.
  const subtitle = clientSubtitle(client);
  const hasContact = Boolean(client.email ?? client.phone ?? client.city);

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 10) * 40).springify()}>
      <Pressable
        onPress={() => router.push(`/(tabs)/clients/${client.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`Client ${client.name}`}
        accessibilityHint="Voir la fiche client"
      >
        <Card style={styles.row}>
          {/* Avatar */}
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>

          {/* Info */}
          <View style={styles.info}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{client.name}</Text>
              {hasLowStock && (
                <View style={styles.lowStockBadge}>
                  <Ionicons name="warning" size={10} color={colors.warning} />
                  <Text style={styles.lowStockText}>Stock bas</Text>
                </View>
              )}
            </View>
            {client.companyName ? (
              <Text style={styles.company} numberOfLines={1}>
                {client.companyName}
              </Text>
            ) : null}
            <Text style={[styles.email, !hasContact && styles.emailMissing]} numberOfLines={1}>
              {subtitle}
            </Text>
            <View style={styles.metaRow}>
              {client.accommodationType && (
                <Text style={styles.meta}>{client.accommodationType}</Text>
              )}
              {client.isActive === false && (
                <Text style={[styles.meta, { color: colors.error }]}>· Inactif</Text>
              )}
              {(client.stocks?.length ?? 0) > 0 && (
                <Text style={styles.meta}>
                  · {client.stocks.reduce((acc, s) => acc + s.totalInCirculation, 0)} sets
                </Text>
              )}
            </View>
          </View>

          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </Card>
      </Pressable>
    </Animated.View>
  );
});

function ClientListSkeleton() {
  return (
    <View style={{ padding: spacing.lg, gap: spacing.md }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <SkeletonBox key={i} height={72} borderRadius={radius.lg} />
      ))}
    </View>
  );
}

export default function ClientsListScreen() {
  // `q` : recherche pré-remplie (ex. retour d'un 409 doublon téléphone sans id).
  const params = useLocalSearchParams<{ q?: string | string[] }>();
  const initialSearch = Array.isArray(params.q) ? (params.q[0] ?? "") : (params.q ?? "");
  const [search, setSearch] = useState(initialSearch);

  // `index` et `new` vivent dans le même Stack : revenir depuis `new` dépile
  // l'écran sans le remonter, donc l'initialiseur de useState ci-dessus n'est
  // PAS rejoué. Sans cet effet, le bouton « Rechercher » du dialogue de doublon
  // ramène sur la liste complète, champ vide, sans le moindre message.
  useEffect(() => {
    if (initialSearch) setSearch(initialSearch);
  }, [initialSearch]);
  const debouncedSearch = useDebounce(search, 300);
  const { data, isLoading, isError, refetch, isRefetching } = useClients(
    debouncedSearch || undefined,
  );
  const insets = useSafeAreaInsets();

  const renderClient = useCallback(
    ({ item, index }: { item: ClientListItem; index: number }) => (
      <ClientRow client={item} index={index} />
    ),
    [],
  );

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={18} color={colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Rechercher un client..."
          placeholderTextColor={colors.textTertiary}
          accessibilityLabel="Rechercher un client"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <Pressable
            onPress={() => setSearch("")}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Effacer la recherche"
          >
            <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
          </Pressable>
        )}
      </View>

      {isLoading ? (
        <ClientListSkeleton />
      ) : isError ? (
        <ErrorState what="la liste des clients" onRetry={() => void refetch()} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(c) => c.id}
          renderItem={renderClient}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: TAB_BAR_BASE_HEIGHT + insets.bottom + spacing.xl },
          ]}
          refreshing={isRefetching}
          onRefresh={refetch}
          ListEmptyComponent={
            <EmptyState
              icon="people-outline"
              title={search ? "Aucun resultat" : "Aucun client"}
              description={
                search
                  ? `Aucun client correspondant à "${search}"`
                  : "Ajoutez votre premier client avec le bouton +."
              }
            />
          }
        />
      )}

      {/* Création rapide — cas d'usage terrain (client rencontré sur un marché) */}
      <Pressable
        onPress={() => router.push("/(tabs)/clients/new")}
        style={[styles.fab, { bottom: TAB_BAR_BASE_HEIGHT + insets.bottom + spacing.lg }]}
        accessibilityRole="button"
        accessibilityLabel="Nouveau client"
        accessibilityHint="Ouvre le formulaire de création d'un client"
      >
        <Ionicons name="person-add" size={24} color={colors.textInverse} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    margin: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 48,
  },
  searchInput: {
    flex: 1,
    fontSize: font.sizes.md,
    color: colors.textPrimary,
    minHeight: 44,
  },
  list: {
    padding: spacing.lg,
    paddingTop: 0,
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarText: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.bold,
    color: colors.primary,
  },
  info: { flex: 1, gap: 2 },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  name: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.semibold,
    color: colors.textPrimary,
  },
  lowStockBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.warningLight,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  lowStockText: {
    fontSize: 10,
    fontWeight: font.weights.semibold,
    color: colors.warningText,
  },
  company: {
    fontSize: font.sizes.xs,
    fontWeight: font.weights.semibold,
    color: colors.accent,
  },
  email: {
    fontSize: font.sizes.sm,
    color: colors.textSecondary,
  },
  emailMissing: {
    color: colors.textTertiary,
    fontStyle: "italic",
  },
  fab: {
    position: "absolute",
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.lg,
  },
  metaRow: {
    flexDirection: "row",
    gap: 4,
  },
  meta: {
    fontSize: font.sizes.xs,
    color: colors.textTertiary,
  },
});
