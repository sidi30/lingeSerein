import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Alert, Platform } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Calendar, type DateData, LocaleConfig } from "react-native-calendars";
import { ScreenWrapper } from "@/components/ScreenWrapper";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { LoadingScreen } from "@/components/LoadingScreen";
import { SectionHeader } from "@/components/SectionHeader";
import { useProducts, useCreateOrder, formatCents } from "@/lib/api";
import type { Product } from "@/lib/api";
import { colors, font, spacing, radius, MIN_HIT_TARGET } from "@/lib/theme";

// French locale
LocaleConfig.locales["fr"] = {
  monthNames: [
    "Janvier",
    "Fevrier",
    "Mars",
    "Avril",
    "Mai",
    "Juin",
    "Juillet",
    "Aout",
    "Septembre",
    "Octobre",
    "Novembre",
    "Decembre",
  ],
  monthNamesShort: [
    "Janv.",
    "Fevr.",
    "Mars",
    "Avr.",
    "Mai",
    "Juin",
    "Juil.",
    "Aout",
    "Sept.",
    "Oct.",
    "Nov.",
    "Dec.",
  ],
  dayNames: ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"],
  dayNamesShort: ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"],
  today: "Aujourd'hui",
};
LocaleConfig.defaultLocale = "fr";

const TIME_SLOTS = [
  { value: "08:00-10:00", label: "8h - 10h", icon: "\ud83c\udf05" },
  { value: "10:00-12:00", label: "10h - 12h", icon: "\u2600\ufe0f" },
  { value: "14:00-16:00", label: "14h - 16h", icon: "\ud83c\udf24\ufe0f" },
];

const CATEGORY_ICONS: Record<string, string> = {
  SERVIETTES: "\ud83e\uddf4",
  DRAPS: "\ud83d\udecf\ufe0f",
  TAPIS_BAIN: "\ud83d\udeb0",
  LINGE_LIT: "\ud83d\udecc",
  KIT_CUISINE: "\ud83c\udf73",
  ARTICLE_ACCUEIL: "\ud83c\udfe8",
};

interface CartItem {
  product: Product;
  quantity: number;
}

// Date locale au format YYYY-MM-DD (sans passer par UTC, qui décale d'un jour
// en soirée pour les fuseaux à l'est de Greenwich comme la France).
function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function tomorrowYmd(): string {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return localYmd(t);
}

export default function NewOrderScreen() {
  const { data: products, isLoading } = useProducts();
  const createOrder = useCreateOrder();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [timeSlot, setTimeSlot] = useState(TIME_SLOTS[0]!.value);
  const [notes, setNotes] = useState("");

  // Date: minimum tomorrow (en date locale)
  const minDate = tomorrowYmd();
  const [selectedDate, setSelectedDate] = useState(minDate);

  if (isLoading) return <LoadingScreen />;

  const haptic = () => {
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const addToCart = (product: Product) => {
    haptic();
    setCart((prev) => {
      const existing = prev.find((c) => c.product.id === product.id);
      if (existing) {
        return prev.map((c) =>
          c.product.id === product.id ? { ...c, quantity: c.quantity + 1 } : c,
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const removeFromCart = (productId: string) => {
    haptic();
    setCart((prev) => {
      const existing = prev.find((c) => c.product.id === productId);
      if (existing && existing.quantity > 1) {
        return prev.map((c) =>
          c.product.id === productId ? { ...c, quantity: c.quantity - 1 } : c,
        );
      }
      return prev.filter((c) => c.product.id !== productId);
    });
  };

  const total = cart.reduce((s, c) => s + c.product.priceCents * c.quantity, 0);

  const handleOrder = () => {
    if (cart.length === 0) return;

    // L'écran a pu rester ouvert jusqu'au lendemain : on revalide la date min
    // au moment du submit pour éviter d'envoyer une date désormais passée.
    const minAtSubmit = tomorrowYmd();
    if (selectedDate < minAtSubmit) {
      setSelectedDate(minAtSubmit);
      Alert.alert(
        "Date à confirmer",
        "La date de livraison doit être au minimum demain. Veuillez la confirmer.",
      );
      return;
    }

    createOrder.mutate(
      {
        items: cart.map((c) => ({ productId: c.product.id, quantity: c.quantity })),
        deliveryDate: selectedDate,
        timeSlot,
        specialNotes: notes.trim() || undefined,
      },
      {
        onSuccess: (order) => {
          Alert.alert(
            "Commande creee !",
            `${order.orderNumber}\nLivraison le ${new Date(selectedDate).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}`,
            [{ text: "OK", onPress: () => router.back() }],
          );
        },
        onError: (e) => {
          Alert.alert(
            "Échec de la commande",
            e instanceof Error ? e.message : "Une erreur est survenue. Réessayez.",
          );
        },
      },
    );
  };

  const getCartQty = (id: string) => cart.find((c) => c.product.id === id)?.quantity ?? 0;
  const categories = [...new Set(products?.map((p) => p.category) ?? [])];

  return (
    <ScreenWrapper>
      {/* Calendar */}
      <SectionHeader title="Date de livraison" />
      <Card padded={false} style={styles.calendarCard}>
        <Calendar
          current={selectedDate}
          minDate={minDate}
          onDayPress={(day: DateData) => setSelectedDate(day.dateString)}
          markedDates={{
            [selectedDate]: {
              selected: true,
              selectedColor: colors.primary,
              selectedTextColor: colors.textInverse,
            },
          }}
          theme={{
            backgroundColor: colors.surface,
            calendarBackground: colors.surface,
            textSectionTitleColor: colors.textTertiary,
            selectedDayBackgroundColor: colors.primary,
            selectedDayTextColor: colors.textInverse,
            todayTextColor: colors.primary,
            dayTextColor: colors.textPrimary,
            textDisabledColor: colors.textTertiary,
            arrowColor: colors.primary,
            monthTextColor: colors.textPrimary,
            textDayFontWeight: font.weights.medium,
            textMonthFontWeight: font.weights.bold,
            textDayHeaderFontWeight: font.weights.semibold,
            textDayFontSize: font.sizes.md,
            textMonthFontSize: font.sizes.lg,
            textDayHeaderFontSize: font.sizes.xs,
          }}
        />
      </Card>

      {/* Time slot */}
      <SectionHeader title="Creneau horaire" />
      <View style={styles.slotsRow}>
        {TIME_SLOTS.map((slot) => (
          <Pressable
            key={slot.value}
            onPress={() => setTimeSlot(slot.value)}
            style={[styles.slotCard, timeSlot === slot.value && styles.slotCardActive]}
            accessibilityRole="radio"
            accessibilityState={{ selected: timeSlot === slot.value }}
          >
            <Text style={styles.slotIcon}>{slot.icon}</Text>
            <Text style={[styles.slotLabel, timeSlot === slot.value && styles.slotLabelActive]}>
              {slot.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Products by category */}
      {categories.map((cat) => (
        <View key={cat}>
          <SectionHeader title={`${CATEGORY_ICONS[cat] ?? ""} ${categoryLabel(cat)}`} />
          {products
            ?.filter((p) => p.category === cat)
            .map((product) => {
              const qty = getCartQty(product.id);
              return (
                <Card key={product.id} style={styles.productCard}>
                  <View style={styles.productRow}>
                    <View
                      style={[
                        styles.productRangeDot,
                        {
                          backgroundColor:
                            product.range === "PRESTIGE"
                              ? "#f59e0b"
                              : product.range === "HOTEL"
                                ? "#6366f1"
                                : "#06b6d4",
                        },
                      ]}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.productName}>{product.name}</Text>
                      <Text style={styles.productRange}>
                        {product.range} · {formatCents(product.priceCents)}/set
                      </Text>
                    </View>
                    <View style={styles.qtyRow}>
                      {qty > 0 && (
                        <Pressable
                          onPress={() => removeFromCart(product.id)}
                          style={styles.qtyBtn}
                          accessibilityLabel={`Retirer ${product.name}`}
                        >
                          <Ionicons name="remove" size={20} color={colors.textPrimary} />
                        </Pressable>
                      )}
                      {qty > 0 && <Text style={styles.qtyText}>{qty}</Text>}
                      <Pressable
                        onPress={() => addToCart(product)}
                        style={[styles.qtyBtn, styles.qtyBtnAdd]}
                        accessibilityLabel={`Ajouter ${product.name}`}
                      >
                        <Text style={[styles.qtyBtnText, { color: colors.textInverse }]}>
                          {"\u002B"}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </Card>
              );
            })}
        </View>
      ))}

      {/* Notes */}
      <SectionHeader title="Notes (optionnel)" />
      <TextInput
        style={styles.notesInput}
        value={notes}
        onChangeText={setNotes}
        multiline
        placeholder="Instructions speciales..."
        placeholderTextColor={colors.textTertiary}
        accessibilityLabel="Notes de livraison"
      />

      {/* Cart summary */}
      {cart.length > 0 && (
        <Card style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Recapitulatif</Text>
          {cart.map((c) => (
            <View key={c.product.id} style={styles.summaryRow}>
              <Text style={styles.summaryItem}>
                {c.quantity}x {c.product.name}
              </Text>
              <Text style={styles.summaryPrice}>
                {formatCents(c.product.priceCents * c.quantity)}
              </Text>
            </View>
          ))}
          <View style={styles.summaryDivider} />
          <View style={styles.summaryRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatCents(total)}</Text>
          </View>
        </Card>
      )}

      <Button
        title={
          cart.length === 0 ? "Selectionnez des articles" : `Commander · ${formatCents(total)}`
        }
        onPress={handleOrder}
        disabled={cart.length === 0}
        loading={createOrder.isPending}
        style={{ marginTop: spacing.lg, marginBottom: spacing.huge }}
      />
    </ScreenWrapper>
  );
}

function categoryLabel(cat: string): string {
  const map: Record<string, string> = {
    SERVIETTES: "Serviettes",
    DRAPS: "Draps",
    TAPIS_BAIN: "Tapis de bain",
    LINGE_LIT: "Linge de lit",
    KIT_CUISINE: "Kit cuisine",
    ARTICLE_ACCUEIL: "Articles d'accueil",
  };
  return map[cat] ?? cat;
}

const styles = StyleSheet.create({
  calendarCard: {
    overflow: "hidden",
  },
  slotsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  slotCard: {
    flex: 1,
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    minHeight: MIN_HIT_TARGET,
  },
  slotCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  slotIcon: { fontSize: 20, marginBottom: spacing.xs },
  slotLabel: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.semibold,
    color: colors.textSecondary,
  },
  slotLabelActive: { color: colors.primary },
  // Products
  productCard: { marginBottom: spacing.sm },
  productRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  productRangeDot: {
    width: 6,
    height: 32,
    borderRadius: 3,
  },
  productName: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.medium,
    color: colors.textPrimary,
  },
  productRange: {
    fontSize: font.sizes.sm,
    color: colors.textTertiary,
    marginTop: 2,
  },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  qtyBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyBtnAdd: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  qtyBtnText: {
    fontSize: 18,
    fontWeight: font.weights.bold,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  qtyText: {
    fontSize: font.sizes.lg,
    fontWeight: font.weights.heavy,
    color: colors.textPrimary,
    minWidth: 28,
    textAlign: "center",
  },
  // Notes
  notesInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    fontSize: font.sizes.md,
    color: colors.textPrimary,
    minHeight: 80,
    textAlignVertical: "top",
    backgroundColor: colors.surface,
  },
  // Summary
  summaryCard: {
    marginTop: spacing.xl,
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  summaryTitle: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.bold,
    color: colors.primaryDark,
    marginBottom: spacing.md,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  summaryItem: {
    fontSize: font.sizes.sm,
    color: colors.primary,
  },
  summaryPrice: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.semibold,
    color: colors.primary,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: colors.primaryMuted + "40",
    marginVertical: spacing.sm,
  },
  totalLabel: {
    fontSize: font.sizes.lg,
    fontWeight: font.weights.bold,
    color: colors.primaryDark,
  },
  totalValue: {
    fontSize: font.sizes.xl,
    fontWeight: font.weights.heavy,
    color: colors.primaryDark,
  },
});
