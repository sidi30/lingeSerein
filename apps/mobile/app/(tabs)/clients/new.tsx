import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  Platform,
  type KeyboardTypeOptions,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";
import { ScreenWrapper } from "@/components/ScreenWrapper";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import {
  useCreateClient,
  extractDetailId,
  ApiError,
  CLIENT_SOURCES,
  type ClientSource,
  type CreateClientInput,
} from "@/lib/api";
import { colors, font, spacing, radius, MIN_HIT_TARGET } from "@/lib/theme";

/** Source par défaut : le cas d'usage n°1 est le client rencontré sur un marché. */
const DEFAULT_SOURCE: ClientSource = "MARCHE";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Clés possibles portant l'id du client existant dans les `details` du 409. */
const DUPLICATE_ID_KEYS = ["clientId", "existingClientId", "userId", "id"];

// ─── Champ de formulaire ─────────────────────────────────────────

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  hint?: string;
  error?: string | null;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  maxLength?: number;
  multiline?: boolean;
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  required = false,
  hint,
  error,
  keyboardType,
  autoCapitalize = "sentences",
  maxLength,
  multiline = false,
}: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
        {!required ? <Text style={styles.optional}> (facultatif)</Text> : null}
      </Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline, !!error && styles.inputError]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        maxLength={maxLength}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        accessibilityLabel={label}
        accessibilityHint={hint}
      />
      {error ? (
        <Text style={styles.errorText} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

// ─── Écran ───────────────────────────────────────────────────────

export default function NewClientScreen() {
  const createClient = useCreateClient();

  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [source, setSource] = useState<ClientSource>(DEFAULT_SOURCE);
  const [notes, setNotes] = useState("");
  const [touched, setTouched] = useState(false);

  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  const nameError = touched && !trimmedName ? "Le nom est obligatoire." : null;
  const emailError =
    touched && trimmedEmail && !EMAIL_RE.test(trimmedEmail) ? "Adresse e-mail invalide." : null;

  const haptic = (type: "light" | "success" | "error") => {
    if (Platform.OS === "web") return;
    if (type === "light") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else if (type === "success")
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  };

  const buildPayload = (force: boolean): CreateClientInput => ({
    name: trimmedName,
    companyName: companyName.trim() || undefined,
    phone: phone.trim() || undefined,
    email: trimmedEmail || undefined,
    city: city.trim() || undefined,
    postalCode: postalCode.trim() || undefined,
    notes: notes.trim() || undefined,
    source,
    ...(force ? { force: true } : {}),
  });

  const submit = (force: boolean) => {
    createClient.mutate(buildPayload(force), {
      onSuccess: (result) => {
        haptic("success");
        const created = result.client;
        const extra = result.temporaryPassword
          ? `\n\nMot de passe temporaire : ${result.temporaryPassword}`
          : "";
        // Navigation AVANT l'alerte, et alerte non esquivable : sur Android, un
        // appui sur retour ferme une alerte sans déclencher onPress. On restait
        // alors sur le formulaire encore rempli, client déjà créé — un second
        // appui sur « Créer » produisait un vrai doublon (le garde-fou téléphone
        // ne joue pas si aucun téléphone n'a été saisi).
        router.replace(`/(tabs)/clients/${created.id}`);
        Alert.alert("Client créé", `${created.name} a bien été enregistré.${extra}`, [
          { text: "OK" },
        ]);
      },
      onError: (e) => {
        haptic("error");
        if (e instanceof ApiError && e.status === 409 && e.code === "CLIENT_DUPLICATE_PHONE") {
          handleDuplicate(e);
          return;
        }
        Alert.alert(
          "Création impossible",
          e instanceof Error ? e.message : "Une erreur est survenue. Réessayez.",
        );
      },
    });
  };

  /**
   * 409 CLIENT_DUPLICATE_PHONE : un client porte déjà ce téléphone.
   * On propose d'ouvrir sa fiche plutôt que de créer un doublon ; si l'API n'a
   * pas fourni l'id, on retombe sur une recherche pré-remplie avec le numéro.
   */
  const handleDuplicate = (e: ApiError) => {
    const existingId = extractDetailId(e.details, DUPLICATE_ID_KEYS);
    Alert.alert(
      "Ce téléphone existe déjà",
      `${e.message}\n\nVoulez-vous ouvrir la fiche existante ou créer quand même un second client ?`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Créer quand même",
          style: "destructive",
          onPress: () => submit(true),
        },
        {
          text: existingId ? "Ouvrir la fiche" : "Rechercher",
          onPress: () => {
            if (existingId) {
              router.replace(`/(tabs)/clients/${existingId}`);
            } else {
              router.replace({
                pathname: "/(tabs)/clients",
                params: { q: phone.trim() },
              });
            }
          },
        },
      ],
    );
  };

  const handleSubmit = () => {
    setTouched(true);
    if (!trimmedName) {
      haptic("error");
      Alert.alert("Nom manquant", "Indiquez au moins le nom du client.");
      return;
    }
    if (trimmedEmail && !EMAIL_RE.test(trimmedEmail)) {
      haptic("error");
      Alert.alert("E-mail invalide", "Corrigez l'adresse e-mail ou laissez le champ vide.");
      return;
    }
    if (!phone.trim() && !trimmedEmail) {
      haptic("error");
      Alert.alert(
        "Aucun moyen de contact",
        "Ce client n'aura ni téléphone ni e-mail. Continuer quand même ?",
        [
          { text: "Compléter", style: "cancel" },
          { text: "Continuer", onPress: () => submit(false) },
        ],
      );
      return;
    }
    haptic("light");
    submit(false);
  };

  return (
    <ScreenWrapper>
      <Animated.View entering={FadeInDown.duration(200)}>
        <Card style={styles.introCard}>
          <Ionicons name="flash-outline" size={20} color={colors.primary} />
          <Text style={styles.introText}>
            Saisie rapide sur le terrain. Seul le nom est obligatoire — vous compléterez la fiche
            plus tard.
          </Text>
        </Card>

        <Field
          label="Nom du contact"
          value={name}
          onChangeText={setName}
          placeholder="Marie Dupont"
          required
          autoCapitalize="words"
          error={nameError}
        />

        <Field
          label="Établissement"
          value={companyName}
          onChangeText={setCompanyName}
          placeholder="Hôtel des Lilas"
          autoCapitalize="words"
          hint="Nom de l'hôtel, du gîte ou de la société"
        />

        <Field
          label="Téléphone"
          value={phone}
          onChangeText={setPhone}
          placeholder="06 12 34 56 78"
          keyboardType="phone-pad"
          autoCapitalize="none"
          maxLength={20}
        />

        <Field
          label="E-mail"
          value={email}
          onChangeText={setEmail}
          placeholder="contact@hotel.fr"
          keyboardType="email-address"
          autoCapitalize="none"
          error={emailError}
        />

        <View style={styles.row}>
          <View style={styles.rowSmall}>
            <Field
              label="Code postal"
              value={postalCode}
              onChangeText={(v) => setPostalCode(v.replace(/[^0-9]/g, ""))}
              placeholder="75011"
              keyboardType="number-pad"
              autoCapitalize="none"
              maxLength={5}
            />
          </View>
          <View style={styles.rowLarge}>
            <Field
              label="Ville"
              value={city}
              onChangeText={setCity}
              placeholder="Paris"
              autoCapitalize="words"
            />
          </View>
        </View>

        {/* Origine du client */}
        <View style={styles.field}>
          <Text style={styles.label}>Origine</Text>
          <View style={styles.chips}>
            {CLIENT_SOURCES.map((s) => {
              const active = source === s.value;
              return (
                <Pressable
                  key={s.value}
                  onPress={() => {
                    haptic("light");
                    setSource(s.value);
                  }}
                  style={[styles.chip, active && styles.chipActive]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Origine ${s.label}`}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{s.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Field
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Rencontré au marché de Belleville, 12 chambres, veut un devis..."
          multiline
        />

        <View style={styles.actions}>
          <Button
            title="Annuler"
            onPress={() => router.back()}
            variant="outline"
            style={styles.actionSecondary}
          />
          <Button
            title="Créer le client"
            onPress={handleSubmit}
            loading={createClient.isPending}
            style={styles.actionPrimary}
            accessibilityHint="Enregistre le client et ouvre sa fiche"
          />
        </View>
      </Animated.View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  introCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
    marginBottom: spacing.lg,
  },
  introText: {
    flex: 1,
    fontSize: font.sizes.sm,
    color: colors.primary,
    lineHeight: 19,
  },
  field: { marginBottom: spacing.lg },
  label: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  required: { color: colors.error },
  optional: {
    fontWeight: font.weights.regular,
    color: colors.textTertiary,
    fontSize: font.sizes.xs,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: font.sizes.md,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    minHeight: MIN_HIT_TARGET + 4,
  },
  inputMultiline: { minHeight: 88, paddingTop: spacing.md },
  inputError: { borderColor: colors.error },
  errorText: {
    fontSize: font.sizes.xs,
    color: colors.errorText,
    marginTop: spacing.xs,
  },
  hint: {
    fontSize: font.sizes.xs,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  row: { flexDirection: "row", gap: spacing.md },
  rowSmall: { flex: 1 },
  rowLarge: { flex: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: MIN_HIT_TARGET,
    justifyContent: "center",
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  chipText: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.medium,
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.primary,
    fontWeight: font.weights.bold,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.huge,
  },
  actionSecondary: { flex: 1 },
  actionPrimary: { flex: 2 },
});
