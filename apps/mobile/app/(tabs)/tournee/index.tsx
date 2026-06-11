/**
 * Tournée screen — vue liste + carte (react-native-maps)
 *
 * IMPORTANT: react-native-maps + expo-location = modules natifs.
 * Un rebuild EAS est obligatoire après l'ajout de ces dépendances.
 * NE PAS faire d'OTA sur ce changement.
 */

import { useState, useEffect, useRef, useCallback, memo } from "react";
import { View, Text, Pressable, FlatList, StyleSheet, Platform, Alert } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import * as Location from "expo-location";
import { ScreenWrapper } from "@/components/ScreenWrapper";
import { Card } from "@/components/Card";
import { SkeletonBox } from "@/components/SkeletonBox";
import { ProgressRing } from "@/components/ProgressRing";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/Button";
import { useTodayRound, useCompleteRound } from "@/lib/api";
import type { DeliveryStop } from "@/lib/api";
import { colors, font, spacing, radius, MIN_HIT_TARGET } from "@/lib/theme";

// ─── Geocoding cache ─────────────────────────────────────────────
// Simple in-memory cache. For persistent cache, use AsyncStorage.
const geocodeCache = new Map<string, { latitude: number; longitude: number }>();

async function geocodeAddress(
  address: string,
): Promise<{ latitude: number; longitude: number } | null> {
  if (geocodeCache.has(address)) return geocodeCache.get(address)!;
  try {
    const results = await Location.geocodeAsync(address);
    if (results.length > 0 && results[0]) {
      const coord = { latitude: results[0].latitude, longitude: results[0].longitude };
      geocodeCache.set(address, coord);
      return coord;
    }
  } catch {
    // geocoding failed silently
  }
  return null;
}

// ─── View toggle ─────────────────────────────────────────────────

type ViewMode = "list" | "map";

// La carte n'est activée que sur iOS (Apple Maps, provider par défaut).
// Sur Android, react-native-maps utilise Google Maps qui exige une clé API
// (`expo.android.config.googleMaps.apiKey` dans app.json) — actuellement vide,
// d'où une carte grise. On masque donc l'onglet carte sur Android.
// TODO(maps): renseigner la clé Google Maps Android puis réactiver la carte
// (passer MAP_SUPPORTED à true sur Android).
const MAP_SUPPORTED = Platform.OS === "ios";

// ─── Stop card (list view) ────────────────────────────────────────

const StopCard = memo(function StopCard({
  stop,
  index,
  isCurrent,
}: {
  stop: DeliveryStop;
  index: number;
  isCurrent: boolean;
}) {
  const isDone = stop.status === "COMPLETED";

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 12) * 40).springify()}>
      <Pressable
        onPress={() => router.push(`/(tabs)/tournee/stop/${stop.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`Arrêt ${stop.stopOrder}: ${stop.client.name}${isCurrent ? " (prochain arrêt)" : ""}${isDone ? " (terminé)" : ""}`}
        disabled={isDone}
      >
        <Card
          style={[
            styles.stopCard,
            isCurrent && styles.stopCardCurrent,
            isDone && styles.stopCardDone,
          ]}
        >
          <View style={styles.stopRow}>
            {/* Order number / status */}
            <View
              style={[
                styles.stopBadge,
                isDone && styles.stopBadgeDone,
                isCurrent && styles.stopBadgeCurrent,
              ]}
            >
              {isDone ? (
                <Ionicons name="checkmark" size={18} color={colors.textInverse} />
              ) : (
                <Text style={[styles.stopNum, isCurrent && styles.stopNumCurrent]}>
                  {stop.stopOrder}
                </Text>
              )}
            </View>

            {/* Client info */}
            <View style={{ flex: 1, gap: 2 }}>
              <Text
                style={[
                  styles.clientName,
                  isDone && styles.doneText,
                  isCurrent && styles.currentText,
                ]}
              >
                {stop.client.name}
              </Text>
              {stop.client.address && (
                <Text style={styles.address} numberOfLines={1}>
                  {stop.client.address}
                </Text>
              )}
              <View style={styles.metaRow}>
                <View style={styles.setsBadge}>
                  <Ionicons name="cube-outline" size={12} color={colors.textSecondary} />
                  <Text style={styles.setsText}>{stop.setsToDeliver} sets</Text>
                </View>
                {stop.specialInstructions && (
                  <View style={styles.warnBadge}>
                    <Ionicons name="warning" size={12} color={colors.warning} />
                    <Text style={styles.warnText}>Instructions</Text>
                  </View>
                )}
              </View>
            </View>

            {!isDone && (
              <Ionicons
                name="chevron-forward"
                size={18}
                color={isCurrent ? colors.accent : colors.textTertiary}
              />
            )}
          </View>
        </Card>
      </Pressable>
    </Animated.View>
  );
});

// ─── Map view ─────────────────────────────────────────────────────

// Lazy-loaded MapView to avoid crashing if module missing in dev
function MapViewSection({
  stops,
  userLocation,
}: {
  stops: DeliveryStop[];
  userLocation: { latitude: number; longitude: number } | null;
}) {
  // Dynamic import of react-native-maps — avoids crash if module isn't installed
  let MapView: React.ComponentType<Record<string, unknown>> | null = null;
  let Marker: React.ComponentType<Record<string, unknown>> | null = null;
  let Polyline: React.ComponentType<Record<string, unknown>> | null = null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const RNMaps = require("react-native-maps") as {
      default: React.ComponentType<Record<string, unknown>>;
      Marker: React.ComponentType<Record<string, unknown>>;
      Polyline: React.ComponentType<Record<string, unknown>>;
    };
    MapView = RNMaps.default;
    Marker = RNMaps.Marker;
    Polyline = RNMaps.Polyline;
  } catch {
    // Maps module not available (simulator / fresh install before rebuild)
  }

  const [coords, setCoords] = useState<
    Array<{ stopId: string; latitude: number; longitude: number } | null>
  >([]);

  useEffect(() => {
    const load = async () => {
      const results = await Promise.all(
        stops.map(async (stop) => {
          if (!stop.client.address) return null;
          const c = await geocodeAddress(stop.client.address);
          if (!c) return null;
          return { stopId: stop.id, ...c };
        }),
      );
      setCoords(results);
    };
    void load();
  }, [stops]);

  const validCoords = coords.filter(Boolean) as Array<{
    stopId: string;
    latitude: number;
    longitude: number;
  }>;
  const polylineCoords = validCoords.map(({ latitude, longitude }) => ({
    latitude,
    longitude,
  }));

  if (!MapView || !Marker || !Polyline) {
    return (
      <View style={styles.mapFallback}>
        <Ionicons name="map-outline" size={48} color={colors.textTertiary} />
        <Text style={styles.mapFallbackTitle}>Carte non disponible</Text>
        <Text style={styles.mapFallbackSub}>Un rebuild EAS est requis pour activer la carte.</Text>
      </View>
    );
  }

  const firstValid = validCoords[0];
  const initialRegion = firstValid
    ? {
        latitude: firstValid.latitude,
        longitude: firstValid.longitude,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
      }
    : undefined;

  return (
    <View style={styles.mapContainer}>
      {/* provider non spécifié → Apple Maps sur iOS (aucune clé requise).
          PROVIDER_GOOGLE forçait Google Maps, grise sans clé API. */}
      <MapView
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton
      >
        {/* Polyline */}
        {polylineCoords.length > 1 && (
          <Polyline coordinates={polylineCoords} strokeColor={colors.primary} strokeWidth={3} />
        )}

        {/* Stop markers */}
        {stops.map((stop) => {
          const coord = validCoords.find((c) => c.stopId === stop.id);
          if (!coord) return null;
          const isDone = stop.status === "COMPLETED";
          return (
            <Marker
              key={stop.id}
              coordinate={{ latitude: coord.latitude, longitude: coord.longitude }}
              title={`#${stop.stopOrder} — ${stop.client.name}`}
              description={`${stop.setsToDeliver} sets`}
              pinColor={isDone ? colors.success : colors.primary}
              onCalloutPress={() => router.push(`/(tabs)/tournee/stop/${stop.id}`)}
            />
          );
        })}
      </MapView>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────

export default function TourneeScreen() {
  const { data: round, isLoading, refetch, isRefetching } = useTodayRound();
  const completeRound = useCompleteRound();
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [locationPermission, setLocationPermission] = useState<"granted" | "denied" | "unknown">(
    "unknown",
  );
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  // Request location permission when map tab selected (iOS uniquement)
  useEffect(() => {
    if (!MAP_SUPPORTED || viewMode !== "map") return;
    const requestPerm = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationPermission(status === "granted" ? "granted" : "denied");
      if (status === "granted") {
        try {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        } catch {
          // GPS unavailable
        }
      }
    };
    void requestPerm();
  }, [viewMode]);

  // Stops triés + arrêt courant calculés AVANT les early returns (Rules of
  // Hooks) — round peut être null, on tolère donc l'absence de données ici.
  const sortedStops = round ? [...round.stops].sort((a, b) => a.stopOrder - b.stopOrder) : [];
  const currentStop = sortedStops.find((s) => s.status !== "COMPLETED");

  // renderStop déclaré avant tout return conditionnel : sinon le nombre de
  // hooks change entre le rendu loading et le rendu data → crash
  // « Rendered more hooks than during the previous render ».
  const renderStop = useCallback(
    ({ item, index }: { item: DeliveryStop; index: number }) => (
      <StopCard stop={item} index={index} isCurrent={item.id === currentStop?.id} />
    ),
    [currentStop?.id],
  );

  const handleCompleteRound = () => {
    if (!round) return;
    const completedCount = round.stops.filter((s) => s.status === "COMPLETED").length;
    const total = round.stops.length;
    Alert.alert(
      "Terminer la tournée",
      `${completedCount}/${total} arrêts complétés. Confirmer la fin de tournée ?`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Terminer",
          onPress: () => completeRound.mutate(round.id),
        },
      ],
    );
  };

  if (isLoading) {
    return (
      <ScreenWrapper>
        <SkeletonBox height={100} style={{ marginBottom: spacing.md }} />
        <SkeletonBox height={70} style={{ marginBottom: spacing.sm }} />
        <SkeletonBox height={70} style={{ marginBottom: spacing.sm }} />
        <SkeletonBox height={70} />
      </ScreenWrapper>
    );
  }

  if (!round) {
    return (
      <ScreenWrapper>
        <EmptyState
          icon="car-outline"
          title="Aucune tournee aujourd'hui"
          description="Votre tournée de livraison apparaîtra ici quand elle sera planifiée."
        />
      </ScreenWrapper>
    );
  }

  const completedStops = sortedStops.filter((s) => s.status === "COMPLETED");
  const total = sortedStops.length;
  const completed = completedStops.length;
  const allDone = completed === total;

  return (
    <View style={styles.container}>
      {/* Progress header */}
      <View style={styles.progressHeader}>
        <ProgressRing completed={completed} total={total} size={80} color={colors.success} />
        <View style={styles.progressInfo}>
          <Text style={styles.progressTitle}>
            {allDone ? "Tournée terminée !" : "Tournée en cours"}
          </Text>
          <Text style={styles.progressSub}>
            {completed}/{total} arrêt{total > 1 ? "s" : ""}
          </Text>
          {currentStop && !allDone && (
            <Text style={styles.nextStop} numberOfLines={1}>
              Prochain : {currentStop.client.name}
            </Text>
          )}
        </View>
      </View>

      {/* View toggle — masqué sur Android (carte indisponible sans clé Google) */}
      {MAP_SUPPORTED ? (
        <View style={styles.toggleRow}>
          <Pressable
            onPress={() => setViewMode("list")}
            style={[styles.toggleBtn, viewMode === "list" && styles.toggleBtnActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: viewMode === "list" }}
          >
            <Ionicons
              name="list-outline"
              size={18}
              color={viewMode === "list" ? colors.textInverse : colors.textSecondary}
            />
            <Text style={[styles.toggleText, viewMode === "list" && styles.toggleTextActive]}>
              Liste
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setViewMode("map")}
            style={[styles.toggleBtn, viewMode === "map" && styles.toggleBtnActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: viewMode === "map" }}
          >
            <Ionicons
              name="map-outline"
              size={18}
              color={viewMode === "map" ? colors.textInverse : colors.textSecondary}
            />
            <Text style={[styles.toggleText, viewMode === "map" && styles.toggleTextActive]}>
              Carte
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.mapUnavailable}>
          <Ionicons name="map-outline" size={16} color={colors.textTertiary} />
          <Text style={styles.mapUnavailableText}>
            Carte indisponible sur Android pour le moment
          </Text>
        </View>
      )}

      {/* Location denied warning */}
      {MAP_SUPPORTED && viewMode === "map" && locationPermission === "denied" && (
        <View style={styles.locWarning}>
          <Ionicons name="location-outline" size={16} color={colors.warning} />
          <Text style={styles.locWarningText}>
            Autorisation de localisation refusée. Activez-la dans les réglages.
          </Text>
        </View>
      )}

      {/* Content */}
      {!MAP_SUPPORTED || viewMode === "list" ? (
        <FlatList
          data={sortedStops}
          keyExtractor={(s) => s.id}
          renderItem={renderStop}
          contentContainerStyle={styles.list}
          refreshing={isRefetching}
          onRefresh={refetch}
          ListFooterComponent={
            allDone ? (
              <View style={styles.footer}>
                <Button
                  title="Terminer la tournée"
                  onPress={handleCompleteRound}
                  loading={completeRound.isPending}
                  style={styles.completeBtn}
                />
              </View>
            ) : null
          }
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <MapViewSection stops={sortedStops} userLocation={userLocation} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  // Progress header
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xl,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  progressInfo: { flex: 1 },
  progressTitle: {
    fontSize: font.sizes.lg,
    fontWeight: font.weights.bold,
    color: colors.textPrimary,
  },
  progressSub: {
    fontSize: font.sizes.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  nextStop: {
    fontSize: font.sizes.xs,
    color: colors.accent,
    fontWeight: font.weights.semibold,
    marginTop: spacing.xs,
  },
  // Toggle
  toggleRow: {
    flexDirection: "row",
    margin: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: colors.borderLight,
    borderRadius: radius.lg,
    padding: 4,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    minHeight: MIN_HIT_TARGET,
  },
  toggleBtnActive: {
    backgroundColor: colors.primary,
  },
  toggleText: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.semibold,
    color: colors.textSecondary,
  },
  toggleTextActive: { color: colors.textInverse },
  // Map unavailable banner (Android)
  mapUnavailable: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.borderLight,
    borderRadius: radius.md,
  },
  mapUnavailableText: {
    fontSize: font.sizes.xs,
    color: colors.textTertiary,
  },
  // Location warning
  locWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.warningLight,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  locWarningText: {
    flex: 1,
    fontSize: font.sizes.xs,
    color: colors.warning,
  },
  // List
  list: {
    padding: spacing.lg,
    paddingBottom: 100,
    gap: spacing.sm,
  },
  // Stop card
  stopCard: {},
  stopCardCurrent: {
    borderColor: colors.accent,
    borderWidth: 2,
  },
  stopCardDone: { opacity: 0.55 },
  stopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  stopBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  stopBadgeDone: { backgroundColor: colors.success },
  stopBadgeCurrent: { backgroundColor: colors.accent },
  stopNum: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.heavy,
    color: colors.textSecondary,
  },
  stopNumCurrent: { color: colors.textInverse },
  clientName: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.semibold,
    color: colors.textPrimary,
  },
  currentText: { color: colors.accent },
  doneText: { color: colors.textTertiary },
  address: {
    fontSize: font.sizes.xs,
    color: colors.textTertiary,
  },
  metaRow: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
    marginTop: spacing.xs,
  },
  setsBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.infoLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  setsText: { fontSize: 10, color: colors.info, fontWeight: font.weights.semibold },
  warnBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.warningLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  warnText: { fontSize: 10, color: colors.warning, fontWeight: font.weights.semibold },
  // Map
  mapContainer: { flex: 1 },
  map: { flex: 1 },
  mapFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xxxl,
  },
  mapFallbackTitle: {
    fontSize: font.sizes.lg,
    fontWeight: font.weights.semibold,
    color: colors.textPrimary,
  },
  mapFallbackSub: {
    fontSize: font.sizes.sm,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  // Footer
  footer: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.huge,
  },
  completeBtn: {},
});
