import { useState, useCallback, useEffect, useRef, memo } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  Alert,
  Platform,
  Image,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Calendar, type DateData, LocaleConfig } from "react-native-calendars";
import Animated, { FadeInDown, FadeInRight, FadeOutLeft } from "react-native-reanimated";
import { ScreenWrapper } from "@/components/ScreenWrapper";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { SkeletonBox } from "@/components/SkeletonBox";
import { StepIndicator } from "@/components/StepIndicator";
import { useProducts, useCreateOrder, useProfile, formatCents, errorMessage } from "@/lib/api";
import type { Product, ProductKind } from "@/lib/api";
import { deliveryFeeLine, orderTotals, DELIVERY_FEE_A_CONFIRMER } from "@/lib/order-total";
import { deliveryQuote } from "@/lib/delivery-quote";
import { defaultDeliveryYmd, deliveryUrgencyNotice, minDeliveryYmd } from "@/lib/delivery-urgency";
import { colors, font, spacing, radius, MIN_HIT_TARGET } from "@/lib/theme";

// ─── French locale ───────────────────────────────────────────────
LocaleConfig.locales["fr"] = {
  monthNames: [
    "Janvier",
    "Février",
    "Mars",
    "Avril",
    "Mai",
    "Juin",
    "Juillet",
    "Août",
    "Septembre",
    "Octobre",
    "Novembre",
    "Décembre",
  ],
  monthNamesShort: [
    "Janv.",
    "Févr.",
    "Mars",
    "Avr.",
    "Mai",
    "Juin",
    "Juil.",
    "Août",
    "Sept.",
    "Oct.",
    "Nov.",
    "Déc.",
  ],
  dayNames: ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"],
  dayNamesShort: ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"],
  today: "Aujourd'hui",
};
LocaleConfig.defaultLocale = "fr";

const DEFAULT_TIME_SLOT = "08:00-10:00";
const TIME_SLOTS = [
  { value: DEFAULT_TIME_SLOT, label: "8h - 10h", icon: "sunny-outline" as const },
  { value: "10:00-12:00", label: "10h - 12h", icon: "partly-sunny-outline" as const },
  { value: "14:00-16:00", label: "14h - 16h", icon: "cloud-outline" as const },
];

/** Icônes pour les catégories d'articles unitaires */
const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  SERVIETTES: "water-outline",
  DRAPS: "bed-outline",
  TAPIS_BAIN: "grid-outline",
  LINGE_LIT: "moon-outline",
  KIT_CUISINE: "restaurant-outline",
  ARTICLE_ACCUEIL: "home-outline",
};

/** Labels FR des catégories d'articles */
const CATEGORY_LABELS: Record<string, string> = {
  SERVIETTES: "Serviettes",
  DRAPS: "Draps",
  TAPIS_BAIN: "Tapis de bain",
  LINGE_LIT: "Linge de lit",
};

/** Couleurs distinctives par type de produit */
const KIND_COLORS: Record<ProductKind, string> = {
  KIT: colors.primary,
  ARTICLE: colors.accent,
};

const STEPS = ["Articles", "Date & Heure", "Récap"];

interface CartItem {
  product: Product;
  quantity: number;
}

/**
 * Parse une date civile « YYYY-MM-DD » dans le fuseau LOCAL.
 * `new Date("2026-08-03")` est interprété par la spec comme minuit UTC : à
 * l'ouest de UTC, l'affichage recule d'un jour et la confirmation contredit la
 * date réellement envoyée à l'API.
 */
function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Renvoie l'icône Ionicons appropriée pour un produit selon son slug/kind */
function productIcon(product: Product): keyof typeof Ionicons.glyphMap {
  if (product.kind === "KIT") {
    if (product.slug === "kit-bain") return "water-outline";
    if (product.slug === "kit-lit") return "bed-outline";
    if (product.slug === "kit-complet") return "layers-outline";
    return "cube-outline";
  }
  return CATEGORY_ICONS[product.category ?? ""] ?? "shirt-outline";
}

// ─── ProductCard ─────────────────────────────────────────────────

interface ProductCardProps {
  product: Product;
  quantity: number;
  onAdd: (product: Product) => void;
  onRemove: (productId: string) => void;
}

const ProductCard = memo(function ProductCard({
  product,
  quantity,
  onAdd,
  onRemove,
}: ProductCardProps) {
  const kindColor = KIND_COLORS[product.kind];
  const icon = productIcon(product);
  const isKit = product.kind === "KIT";

  return (
    <Animated.View entering={FadeInDown.springify()}>
      <Card style={[styles.productCard, isKit && styles.productCardKit]}>
        {/* Icône / Image */}
        <View style={styles.productImageContainer}>
          {product.imageUrl ? (
            <Image
              source={{ uri: product.imageUrl }}
              style={styles.productImage}
              accessibilityLabel={product.name}
            />
          ) : (
            <View style={[styles.productImagePlaceholder, { backgroundColor: kindColor + "18" }]}>
              <Ionicons name={icon} size={32} color={kindColor} />
            </View>
          )}
          {/* Badge Kit / Unité */}
          <View style={[styles.kindPill, { backgroundColor: kindColor }]}>
            <Text style={styles.kindPillText}>{isKit ? "Kit" : "Unité"}</Text>
          </View>
        </View>

        {/* Infos */}
        <View style={styles.productInfo}>
          <Text style={styles.productName}>{product.name}</Text>
          {product.description && (
            <Text style={styles.productDesc} numberOfLines={2}>
              {product.description}
            </Text>
          )}
          {/* Prix toujours depuis l'API (AC-F5-01) — zéro valeur en dur */}
          <Text style={[styles.productPrice, { color: kindColor }]}>
            {formatCents(product.priceCents)}
            {isKit ? "/kit" : "/pièce"}
          </Text>
        </View>

        {/* Stepper quantité */}
        <View style={styles.stepper}>
          {quantity > 0 && (
            <Pressable
              onPress={() => onRemove(product.id)}
              style={styles.stepperBtn}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Retirer un ${product.name}`}
            >
              <Ionicons name="remove" size={20} color={kindColor} />
            </Pressable>
          )}
          {quantity > 0 && (
            <Text style={styles.stepperQty} accessibilityLabel={`${quantity} sélectionné`}>
              {quantity}
            </Text>
          )}
          <Pressable
            onPress={() => onAdd(product)}
            style={[
              styles.stepperBtn,
              styles.stepperBtnAdd,
              { backgroundColor: kindColor, borderColor: kindColor },
            ]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Ajouter ${product.name}`}
          >
            <Ionicons name="add" size={20} color={colors.textInverse} />
          </Pressable>
        </View>
      </Card>
    </Animated.View>
  );
});

// ─── En-tête de section (Kits / À l'unité) ───────────────────────

function SectionTitle({
  title,
  icon,
  color,
  subtitle,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.sectionTitleRow}>
      <View style={[styles.sectionTitleIcon, { backgroundColor: color + "18" }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.sectionTitleText, { color }]}>{title}</Text>
        {subtitle ? <Text style={styles.sectionTitleSub}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────

export default function NewOrderScreen() {
  const { data: products, isLoading } = useProducts();
  const createOrder = useCreateOrder();
  // La commune du client (`communeInsee`) porte le palier de livraison : sans
  // elle, les frais restent « à confirmer », avec elle ils sont annoncés ici.
  const profile = useProfile();
  // Article choisi depuis le catalogue : on ARRIVE ici avec lui, plutôt que de
  // dupliquer un sélecteur de produits là-bas.
  const params = useLocalSearchParams<{ productId?: string | string[] }>();
  const preselectId = Array.isArray(params.productId) ? params.productId[0] : params.productId;

  const [step, setStep] = useState(0);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [timeSlot, setTimeSlot] = useState(DEFAULT_TIME_SLOT);
  const [notes, setNotes] = useState("");
  // J+2 : la première date SANS forfait d'urgence. J+1 reste sélectionnable —
  // avec son étiquette et son prix (cf. `urgency` plus bas).
  const [selectedDate, setSelectedDate] = useState(() => defaultDeliveryYmd());

  const haptic = useCallback(() => {
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const addToCart = useCallback(
    (product: Product) => {
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
    },
    [haptic],
  );

  const removeFromCart = useCallback(
    (productId: string) => {
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
    },
    [haptic],
  );

  /**
   * Pré-remplissage depuis le catalogue, une seule fois par article.
   *
   * Le garde par référence est indispensable : le catalogue peut se
   * rafraîchir (react-query) et relancer cet effet, qui ajouterait alors une
   * seconde unité au panier sans que personne n'ait rien touché. On n'appelle
   * pas `addToCart` non plus — son retour haptique n'a pas de sens pour une
   * sélection que l'utilisateur a faite sur l'écran précédent.
   */
  const preselectedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!preselectId || !products) return;
    if (preselectedRef.current === preselectId) return;
    const product = products.find((p) => p.id === preselectId);
    // Produit inconnu (retiré du catalogue, lien périmé) : on ouvre simplement
    // le tunnel vide plutôt que d'afficher une erreur pour un panier.
    if (!product) return;
    preselectedRef.current = preselectId;
    setCart((prev) =>
      prev.some((c) => c.product.id === product.id) ? prev : [...prev, { product, quantity: 1 }],
    );
  }, [preselectId, products]);

  const total = cart.reduce((s, c) => s + c.product.priceCents * c.quantity, 0);
  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);

  // Ce que la date choisie coûte, AVANT l'envoi : le serveur applique le même
  // barème (`computeDeliveryFee`) à la création, et jusqu'ici le client
  // découvrait le forfait Express 24 h dans l'alerte qui suit la commande.
  const urgency = deliveryUrgencyNotice(selectedDate, formatCents);
  const expressYmd = minDeliveryYmd();
  const standardYmd = defaultDeliveryYmd();

  // Ce que la LIVRAISON coûte, avant l'envoi. Le barème est public sur tout le
  // Vaucluse et la commune du client est choisie dans une liste fermée : il n'y
  // a plus de raison de renvoyer le montant à « après la commande ».
  // `deliveryQuote` appelle le même `computeDeliveryFee` que le serveur.
  const quote = deliveryQuote({
    client: profile.data,
    urgency: urgency.level,
    subtotalCents: total,
  });
  /** Total réellement dû ; retombe sur les articles seuls quand il manque les frais. */
  const dueCents = quote.totalCents ?? total;

  const getCartQty = useCallback(
    (id: string) => cart.find((c) => c.product.id === id)?.quantity ?? 0,
    [cart],
  );

  const handleNext = () => {
    if (step === 0 && cart.length === 0) {
      Alert.alert("Panier vide", "Ajoutez au moins un article avant de continuer.");
      return;
    }
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const handleBack = () => {
    setStep((s) => Math.max(s - 1, 0));
  };

  const sendOrder = () => {
    // Le dialogue de confirmation peut être ouvert deux fois avant que la
    // mutation ne passe en `isPending` : sans cette garde, deux POST /orders
    // partent et le client est facturé deux fois (l'API n'a pas d'idempotence).
    if (createOrder.isPending) return;
    createOrder.mutate(
      {
        items: cart.map((c) => ({ productId: c.product.id, quantity: c.quantity })),
        deliveryDate: selectedDate,
        timeSlot,
        specialNotes: notes.trim() || undefined,
      },
      {
        onSuccess: (order) => {
          if (Platform.OS !== "web") {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          // On vide le panier et on quitte AVANT d'alerter. Sur Android une
          // alerte se ferme par le bouton retour sans jamais exécuter `onPress` :
          // on restait alors sur le récapitulatif, panier plein et bouton actif,
          // ce qui invitait à recommander la même chose.
          setCart([]);
          setStep(0);
          router.back();
          // Le serveur vient de calculer les frais : c'est le premier moment où
          // on peut annoncer le montant réellement dû. On le fait ici, pour que
          // le client ne le découvre pas sur la facture.
          const totals = orderTotals(order);
          // « Offerte » et « à confirmer » valent toutes deux 0 € en base :
          // `deliveryFeeLine` les sépare, ici comme sur la fiche.
          const feeLine = deliveryFeeLine(totals, formatCents);
          Alert.alert(
            "Commande envoyée !",
            `${order.orderNumber} — Livraison le ${parseYmd(selectedDate).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}` +
              `\n${totals.totalLabel} : ${formatCents(totals.totalCents)}` +
              (feeLine ? `\n${feeLine}` : ""),
          );
        },
        onError: (e) => {
          Alert.alert("Échec de la commande", errorMessage(e));
        },
      },
    );
  };

  const handleSubmit = () => {
    if (createOrder.isPending) return;
    const minAtSubmit = minDeliveryYmd();
    if (selectedDate < minAtSubmit) {
      setSelectedDate(minAtSubmit);
      Alert.alert("Date à confirmer", "La date de livraison doit être au minimum demain.");
      return;
    }

    // Dernier garde-fou avant l'envoi : la commande engage le client, on lui
    // rappelle montant, date et créneau en toutes lettres.
    const dateLabel = parseYmd(selectedDate).toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    const qty = cart.reduce((s, c) => s + c.quantity, 0);

    // Les frais sont connus dès que la commune l'est : le récapitulatif de
    // confirmation annonce alors le montant TOTAL, pas un sous-total suivi
    // d'une surprise. Sans commune, on le dit — on ne l'omet pas.
    const feeLabel =
      quote.cents === null
        ? `Frais de livraison : ${DELIVERY_FEE_A_CONFIRMER.toLowerCase()}`
        : `Dont ${formatCents(quote.cents)} de frais de livraison`;

    Alert.alert(
      "Confirmer la commande",
      `${qty} article${qty > 1 ? "s" : ""} — ${formatCents(dueCents)}\n${feeLabel}\n` +
        `Livraison le ${dateLabel}, créneau ${timeSlot}.` +
        // Dernier rappel du forfait d'urgence : c'est le bouton qui engage.
        (urgency.isSurcharged ? `\n\n${urgency.message}` : ""),
      [
        { text: "Modifier", style: "cancel" },
        { text: "Confirmer et envoyer", onPress: sendOrder },
      ],
    );
  };

  // ── Données : Kits en premier (AC-F5-01), puis Articles par catégorie ──
  const kits = products?.filter((p) => p.kind === "KIT") ?? [];
  const articles = products?.filter((p) => p.kind === "ARTICLE") ?? [];
  const articleCategories = [...new Set(articles.map((p) => p.category ?? "AUTRE"))];

  const renderProductItem = useCallback(
    ({ item }: { item: Product }) => (
      <ProductCard
        product={item}
        quantity={getCartQty(item.id)}
        onAdd={addToCart}
        onRemove={removeFromCart}
      />
    ),
    [getCartQty, addToCart, removeFromCart],
  );

  // ── Loading ──────────────────────────────────────────────────

  if (isLoading) {
    return (
      <ScreenWrapper>
        <View style={styles.skeletonContainer}>
          <SkeletonBox height={8} width="60%" style={{ marginBottom: spacing.md }} />
          <SkeletonBox height={100} style={{ marginBottom: spacing.sm }} />
          <SkeletonBox height={100} style={{ marginBottom: spacing.sm }} />
          <SkeletonBox height={80} style={{ marginBottom: spacing.md }} />
          <SkeletonBox height={80} />
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <StepIndicator steps={STEPS} current={step} />

      {/* Total en direct — visible à chaque étape, pas seulement au récap */}
      {cart.length > 0 && (
        <Card style={styles.cartSummary}>
          <View style={styles.cartSummaryRow}>
            <Ionicons name="cart" size={22} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.cartSummaryText}>
                {cartCount} article{cartCount > 1 ? "s" : ""} sélectionné
                {cartCount > 1 ? "s" : ""}
              </Text>
              <Text style={styles.cartSummaryHint}>Sous-total articles</Text>
            </View>
            <Text
              style={styles.cartSummaryTotal}
              accessibilityLabel={`Total de la commande : ${formatCents(total)}`}
            >
              {formatCents(total)}
            </Text>
          </View>
        </Card>
      )}

      {/* ── Step 0: Articles ── */}
      {step === 0 && (
        <Animated.View entering={FadeInRight.duration(200)}>
          {/* ── Section KITS — affiché en premier (AC-F5-01) ── */}
          {kits.length > 0 && (
            <View>
              <SectionTitle
                title="Kits"
                icon="layers-outline"
                color={colors.primary}
                subtitle="Solution complète tout inclus"
              />
              <FlatList
                data={kits}
                keyExtractor={(p) => p.id}
                renderItem={renderProductItem}
                scrollEnabled={false}
              />
            </View>
          )}

          {/* ── Section À L'UNITÉ ── */}
          {articleCategories.length > 0 && (
            <View style={{ marginTop: spacing.md }}>
              <SectionTitle
                title="À l'unité"
                icon="shirt-outline"
                color={colors.accent}
                subtitle="Articles individuels"
              />
              {articleCategories.map((cat) => {
                const catProducts = articles.filter((p) => (p.category ?? "AUTRE") === cat);
                return (
                  <View key={cat}>
                    <View style={styles.subCatHeader}>
                      <Ionicons
                        name={CATEGORY_ICONS[cat] ?? "shirt-outline"}
                        size={14}
                        color={colors.textTertiary}
                      />
                      <Text style={styles.subCatTitle}>{CATEGORY_LABELS[cat] ?? cat}</Text>
                    </View>
                    <FlatList
                      data={catProducts}
                      keyExtractor={(p) => p.id}
                      renderItem={renderProductItem}
                      scrollEnabled={false}
                    />
                  </View>
                );
              })}
            </View>
          )}

          {/* Lien catalogue */}
          <Pressable
            onPress={() => router.push("/(tabs)/catalogue")}
            style={styles.catalogueLink}
            accessibilityRole="link"
            accessibilityLabel="Voir le catalogue complet"
          >
            <Ionicons name="shirt-outline" size={14} color={colors.primary} />
            <Text style={styles.catalogueLinkText}>Voir le catalogue complet</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.primary} />
          </Pressable>

          <Button
            title={cart.length === 0 ? "Selectionnez des articles" : "Suivant - Date de livraison"}
            onPress={handleNext}
            disabled={cart.length === 0}
            style={{ marginTop: spacing.sm }}
          />
        </Animated.View>
      )}

      {/* ── Step 1: Date & Heure ── */}
      {step === 1 && (
        <Animated.View entering={FadeInRight.duration(200)} exiting={FadeOutLeft.duration(150)}>
          <Text style={styles.sectionLabel}>Date de livraison</Text>
          <Card padded={false} style={styles.calendarCard}>
            <Calendar
              current={selectedDate}
              minDate={expressYmd}
              onDayPress={(day: DateData) => setSelectedDate(day.dateString)}
              markedDates={{
                // J+1 reste offert, mais pastillé : il déclenche le forfait
                // Express 24 h, que l'encart sous le calendrier chiffre.
                [expressYmd]: { marked: true, dotColor: colors.warning },
                [selectedDate]: {
                  selected: true,
                  selectedColor: colors.primary,
                  selectedTextColor: colors.textInverse,
                  marked: selectedDate === expressYmd,
                  dotColor: colors.textInverse,
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

          {/* Le palier d'urgence, annoncé DÈS la sélection de la date : c'est
              le serveur qui facture, mais c'est ici que le client décide. */}
          <View style={[styles.urgencyCard, urgency.isSurcharged && styles.urgencyCardWarn]}>
            <Ionicons
              name={urgency.isSurcharged ? "flash-outline" : "calendar-outline"}
              size={20}
              color={urgency.isSurcharged ? colors.warning : colors.textSecondary}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.urgencyTitle, urgency.isSurcharged && styles.urgencyTitleWarn]}>
                {urgency.title}
              </Text>
              <Text style={styles.urgencyMessage}>{urgency.message}</Text>
              {urgency.isSurcharged && (
                <Pressable
                  onPress={() => setSelectedDate(standardYmd)}
                  style={styles.urgencySwitch}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Choisir la date sans supplément d'urgence"
                >
                  <Text style={styles.urgencySwitchText}>
                    Livrer le{" "}
                    {parseYmd(standardYmd).toLocaleDateString("fr-FR", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })}{" "}
                    sans supplément
                  </Text>
                </Pressable>
              )}
            </View>
          </View>

          <Text style={styles.sectionLabel}>Créneau horaire</Text>
          <View style={styles.slotsRow}>
            {TIME_SLOTS.map((slot) => (
              <Pressable
                key={slot.value}
                onPress={() => setTimeSlot(slot.value)}
                style={[styles.slotCard, timeSlot === slot.value && styles.slotCardActive]}
                accessibilityRole="radio"
                accessibilityState={{ selected: timeSlot === slot.value }}
                accessibilityLabel={`Créneau ${slot.label}`}
              >
                <Ionicons
                  name={slot.icon}
                  size={22}
                  color={timeSlot === slot.value ? colors.primary : colors.textTertiary}
                />
                <Text style={[styles.slotLabel, timeSlot === slot.value && styles.slotLabelActive]}>
                  {slot.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.sectionLabel}>Notes (optionnel)</Text>
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            multiline
            maxLength={1000}
            placeholder="Instructions spéciales, code d'accès..."
            placeholderTextColor={colors.textTertiary}
            accessibilityLabel="Notes de livraison"
            textAlignVertical="top"
          />

          <View style={styles.navRow}>
            <Button title="Retour" onPress={handleBack} variant="outline" style={styles.navBtn} />
            <Button title="Vérifier la commande" onPress={handleNext} style={styles.navBtnMain} />
          </View>
        </Animated.View>
      )}

      {/* ── Step 2: Récap ── */}
      {step === 2 && (
        <Animated.View entering={FadeInRight.duration(200)} exiting={FadeOutLeft.duration(150)}>
          <Text style={styles.sectionLabel}>Récapitulatif de commande</Text>

          <Card style={styles.recapCard}>
            <View style={styles.recapRow}>
              <Ionicons name="calendar-outline" size={20} color={colors.primary} />
              <Text style={styles.recapLabel}>Livraison le</Text>
              <Text style={styles.recapValue}>
                {parseYmd(selectedDate).toLocaleDateString("fr-FR", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </Text>
            </View>
            <View style={[styles.recapRow, styles.recapRowBorder]}>
              <Ionicons name="time-outline" size={20} color={colors.accent} />
              <Text style={styles.recapLabel}>Créneau</Text>
              <Text style={styles.recapValue}>{timeSlot}</Text>
            </View>
            {notes.trim() ? (
              <View style={[styles.recapRow, styles.recapRowBorder]}>
                <Ionicons name="chatbubble-outline" size={20} color={colors.textSecondary} />
                <Text style={styles.recapLabel}>Note</Text>
                <Text style={[styles.recapValue, { flex: 1 }]} numberOfLines={3}>
                  {notes.trim()}
                </Text>
              </View>
            ) : null}
          </Card>

          <Text style={styles.sectionLabel}>Articles</Text>
          <Card>
            {cart.map((c, i) => (
              <Animated.View
                key={c.product.id}
                entering={FadeInDown.delay(i * 40).springify()}
                style={[styles.recapItem, i > 0 && styles.recapItemBorder]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.recapItemName}>{c.product.name}</Text>
                  <Text style={styles.recapItemMeta}>
                    {c.product.kind === "KIT" ? "Kit" : "À l'unité"}
                    {c.product.category
                      ? ` · ${CATEGORY_LABELS[c.product.category] ?? c.product.category}`
                      : ""}
                  </Text>
                </View>
                <Text style={styles.recapItemQty}>{c.quantity}x</Text>
                <Text style={styles.recapItemPrice}>
                  {formatCents(c.product.priceCents * c.quantity)}
                </Text>
              </Animated.View>
            ))}
            {/* Ventilation explicite : `totalCents` est le SOUS-TOTAL des
                articles, les frais de livraison s'y ajoutent. Le barème est
                public sur tout le Vaucluse et la commune du client est connue :
                le montant s'annonce ICI, pas après l'envoi. Il reste « à
                confirmer » quand la commune manque — un « 0 € » promettrait une
                gratuité que personne n'a décidée. */}
            <View style={[styles.recapItem, styles.recapItemBorder]}>
              <Text style={styles.recapSubLabel}>Sous-total articles</Text>
              <Text style={styles.recapSubValue}>{formatCents(total)}</Text>
            </View>
            <View style={styles.recapItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.recapSubLabel}>Frais de livraison</Text>
                {/* Motif du tarif, repris tel quel du barème partagé : ni
                    « offerte » ni « Express » ne se déduisent d'un montant —
                    25 € est à la fois le palier au-delà de 35 km ET le forfait
                    Express 24 h, et Orange rend 0 € sans rien offrir. */}
                {quote.label ? <Text style={styles.recapFeeLabel}>{quote.label}</Text> : null}
                {quote.detail ? <Text style={styles.recapFeeLabel}>{quote.detail}</Text> : null}
                {quote.manquePourGratuiteCents !== null ? (
                  <Text style={styles.recapFeeLabel}>
                    Encore {formatCents(quote.manquePourGratuiteCents)} pour la livraison offerte.
                  </Text>
                ) : null}
              </View>
              {quote.cents === null ? (
                <Text style={styles.recapPending}>{DELIVERY_FEE_A_CONFIRMER}</Text>
              ) : (
                <Text style={quote.fee.urgent ? styles.recapFeeUrgent : styles.recapSubValue}>
                  {formatCents(quote.cents)}
                </Text>
              )}
            </View>
            <View style={[styles.recapItem, styles.recapItemBorder, styles.recapTotal]}>
              <Text style={styles.recapTotalLabel}>
                {quote.surDevis ? "Total (hors livraison)" : "Total"}
              </Text>
              <Text style={styles.recapTotalValue}>{formatCents(dueCents)}</Text>
            </View>
          </Card>
          {quote.needsCommune ? (
            <Pressable
              onPress={() => router.push("/(tabs)/profile-edit")}
              style={styles.communeLink}
              accessibilityRole="link"
              accessibilityLabel="Renseigner ma commune de livraison"
            >
              <Ionicons name="location-outline" size={14} color={colors.primary} />
              <Text style={styles.communeLinkText}>Renseigner ma commune</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.primary} />
            </Pressable>
          ) : null}
          <Text style={styles.recapFeeHint}>
            {quote.surDevis
              ? "Le montant définitif, frais de livraison compris, vous est confirmé dès l'envoi de la commande."
              : "Ce montant est celui qui vous sera facturé, frais de livraison compris."}
          </Text>

          <View style={styles.navRow}>
            <Button title="Modifier" onPress={handleBack} variant="outline" style={styles.navBtn} />
            <Button
              title={`Commander · ${formatCents(dueCents)}`}
              onPress={handleSubmit}
              loading={createOrder.isPending}
              style={styles.navBtnMain}
            />
          </View>
        </Animated.View>
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  skeletonContainer: { gap: spacing.md },
  sectionLabel: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.semibold,
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  // Cart summary bar
  cartSummary: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
    marginBottom: spacing.md,
  },
  cartSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  cartSummaryText: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.semibold,
    color: colors.primary,
  },
  cartSummaryHint: {
    fontSize: font.sizes.xs,
    color: colors.primary,
    opacity: 0.75,
    marginTop: 2,
  },
  cartSummaryTotal: {
    fontSize: font.sizes.xl,
    fontWeight: font.weights.heavy,
    color: colors.primary,
  },
  // Section title (Kits / À l'unité)
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionTitleIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitleText: {
    fontSize: font.sizes.lg,
    fontWeight: font.weights.bold,
  },
  sectionTitleSub: {
    fontSize: font.sizes.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  // Sous-catégorie articles
  subCatHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    paddingLeft: spacing.xs,
  },
  subCatTitle: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.semibold,
    color: colors.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  // Product card
  productCard: {
    marginBottom: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
  },
  productCardKit: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  productImageContainer: {
    position: "relative",
  },
  productImage: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
  },
  productImagePlaceholder: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  kindPill: {
    position: "absolute",
    bottom: -4,
    right: -4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  kindPillText: {
    fontSize: 9,
    fontWeight: font.weights.bold,
    color: colors.textInverse,
  },
  productInfo: { flex: 1 },
  productName: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.semibold,
    color: colors.textPrimary,
  },
  productDesc: {
    fontSize: font.sizes.xs,
    color: colors.textTertiary,
    marginTop: 2,
    lineHeight: 16,
  },
  productPrice: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.bold,
    marginTop: spacing.xs,
  },
  // Stepper
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  stepperBtn: {
    width: MIN_HIT_TARGET,
    height: MIN_HIT_TARGET,
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
  stepperQty: {
    fontSize: font.sizes.lg,
    fontWeight: font.weights.heavy,
    color: colors.textPrimary,
    minWidth: 28,
    textAlign: "center",
  },
  // Calendar
  calendarCard: { overflow: "hidden" },
  // Palier d'urgence
  urgencyCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
  },
  urgencyCardWarn: {
    borderColor: colors.warning,
    backgroundColor: colors.warningLight,
  },
  urgencyTitle: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.bold,
    color: colors.textSecondary,
  },
  urgencyTitleWarn: { color: colors.warningText },
  urgencyMessage: {
    fontSize: font.sizes.xs,
    color: colors.textSecondary,
    lineHeight: 17,
    marginTop: 2,
  },
  urgencySwitch: {
    marginTop: spacing.sm,
    minHeight: 32,
    justifyContent: "center",
  },
  urgencySwitchText: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.semibold,
    color: colors.primary,
    textDecorationLine: "underline",
  },
  // Slots
  slotsRow: { flexDirection: "row", gap: spacing.sm },
  slotCard: {
    flex: 1,
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    gap: spacing.xs,
    minHeight: MIN_HIT_TARGET + 16,
  },
  slotCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  slotLabel: {
    fontSize: font.sizes.xs,
    fontWeight: font.weights.semibold,
    color: colors.textSecondary,
  },
  slotLabelActive: { color: colors.primary },
  // Notes
  notesInput: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    fontSize: font.sizes.md,
    color: colors.textPrimary,
    minHeight: 80,
    backgroundColor: colors.surface,
  },
  // Nav
  navRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xl,
    marginBottom: spacing.huge,
  },
  navBtn: { flex: 1 },
  navBtnMain: { flex: 2 },
  // Recap
  recapCard: { marginBottom: spacing.md },
  recapRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  recapRowBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  recapLabel: {
    fontSize: font.sizes.sm,
    color: colors.textSecondary,
    flex: 1,
  },
  recapValue: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.semibold,
    color: colors.textPrimary,
    textAlign: "right",
  },
  recapItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  recapItemBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  recapItemName: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.medium,
    color: colors.textPrimary,
  },
  recapItemMeta: {
    fontSize: font.sizes.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  recapItemQty: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.bold,
    color: colors.textSecondary,
    width: 28,
    textAlign: "center",
  },
  recapItemPrice: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.semibold,
    color: colors.textPrimary,
    minWidth: 72,
    textAlign: "right",
  },
  recapSubLabel: {
    flex: 1,
    fontSize: font.sizes.sm,
    color: colors.textSecondary,
  },
  recapSubValue: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.semibold,
    color: colors.textPrimary,
  },
  recapPending: {
    fontSize: font.sizes.sm,
    fontStyle: "italic",
    color: colors.textTertiary,
  },
  recapFeeLabel: {
    fontSize: font.sizes.xs,
    color: colors.textTertiary,
    lineHeight: 16,
    marginTop: 2,
  },
  communeLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
    minHeight: MIN_HIT_TARGET,
  },
  communeLinkText: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.semibold,
    color: colors.primary,
    textDecorationLine: "underline",
  },
  recapFeeUrgent: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.bold,
    color: colors.warningText,
  },
  recapFeeHint: {
    fontSize: font.sizes.xs,
    color: colors.textTertiary,
    lineHeight: 17,
    marginTop: spacing.sm,
  },
  recapTotal: { paddingTop: spacing.md },
  recapTotalLabel: {
    flex: 1,
    fontSize: font.sizes.lg,
    fontWeight: font.weights.bold,
    color: colors.textPrimary,
  },
  recapTotalValue: {
    fontSize: font.sizes.xl,
    fontWeight: font.weights.heavy,
    color: colors.primary,
  },
  // Catalogue link
  catalogueLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
    minHeight: 44,
  },
  catalogueLinkText: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.semibold,
    color: colors.primary,
    textDecorationLine: "underline",
  },
});
