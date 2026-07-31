/**
 * « Modifier mes informations » — self-service client.
 *
 * Le propriétaire a remonté qu'un client ne pouvait pas corriger lui-même ses
 * coordonnées : il fallait appeler pour faire changer un numéro ou une adresse.
 *
 * L'écran ne propose QUE les champs que le serveur accepte
 * (`updateMyProfileSchema`, liste blanche stricte). L'e-mail y figure en lecture
 * seule, avec le motif : afficher un champ que le serveur rejettera à coup sûr
 * transformerait une limite assumée en bug apparent.
 */

import { useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Alert, Platform } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";
import { ScreenWrapper } from "@/components/ScreenWrapper";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { LoadingScreen } from "@/components/LoadingScreen";
import { ErrorState } from "@/components/ErrorState";
import { useProfile, useUpdateProfile, ApiError, errorMessage } from "@/lib/api";
import {
  buildProfilePatch,
  clearCommune,
  hasProfileChanges,
  selectCommune,
  selectPostalCode,
  selectedCommune,
  toFormValues,
  validateProfileForm,
  PROFILE_MAX,
  type ProfileErrors,
  type ProfileField,
  type ProfileFormValues,
} from "@/lib/profile-form";
import {
  communeLabel,
  communeSearchState,
  suggestCommunes,
  type CommuneLivrable,
} from "@/lib/communes";
import { colors, font, spacing, radius, MIN_HIT_TARGET } from "@/lib/theme";

/** Mêmes créneaux que le tunnel de commande — un seul vocabulaire pour le client. */
const TIME_SLOTS = [
  { value: "08:00-10:00", label: "8h - 10h" },
  { value: "10:00-12:00", label: "10h - 12h" },
  { value: "14:00-16:00", label: "14h - 16h" },
];

// ─── Champ de saisie ─────────────────────────────────────────────

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
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  hint?: string;
  error?: string | null;
  keyboardType?: "default" | "phone-pad" | "number-pad";
  autoCapitalize?: "none" | "sentences" | "words";
  maxLength?: number;
  multiline?: boolean;
}) {
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
        <Text style={styles.errorText} accessibilityLiveRegion="polite" accessibilityRole="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

// ─── Commune de livraison ────────────────────────────────────────

/**
 * La commune se CHOISIT, elle ne se tape pas.
 *
 * Ville et code postal étaient deux champs libres, et le palier de livraison se
 * déduisait du code postal : écrire « 84100 » suffisait à s'attribuer le tarif
 * d'Orange. La liste (`VAUCLUSE_COMMUNES`, packages/shared) est fermée, ce qui
 * règle du même coup deux choses — une commune hors Vaucluse n'est pas
 * proposée, donc pas sélectionnable ; et le code INSEE retenu désigne UNE
 * commune, là où 84100 en couvre deux (Orange et Uchaux).
 *
 * Les résultats sont bornés (`COMMUNE_RESULTS_MAX`) : les 151 communes rendues
 * d'un bloc à chaque frappe hachent le défilement sur un téléphone modeste.
 */
function CommunePicker({
  values,
  onChange,
  suggestions,
  previousLabel,
  error,
}: {
  values: ProfileFormValues;
  onChange: (next: ProfileFormValues) => void;
  /** Communes à faire confirmer sur une fiche antérieure à la liste fermée. */
  suggestions: readonly CommuneLivrable[];
  /** Ville/code postal tels qu'ils étaient enregistrés, pour situer la question. */
  previousLabel: string;
  error?: string | null;
}) {
  const [query, setQuery] = useState("");
  const commune = selectedCommune(values);
  const search = useMemo(() => communeSearchState(query), [query]);

  const choose = (choix: CommuneLivrable) => {
    setQuery("");
    onChange(selectCommune(values, choix));
  };

  if (commune) {
    return (
      <View style={styles.field}>
        <Text style={styles.label}>Commune de livraison</Text>
        <View style={styles.communeChosen}>
          <Ionicons name="location" size={20} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.communeChosenName}>{commune.nom}</Text>
            <Text style={styles.communeChosenMeta}>
              {commune.codesPostaux.join(" · ")} — Vaucluse
            </Text>
          </View>
          <Pressable
            onPress={() => {
              setQuery("");
              onChange(clearCommune(values));
            }}
            style={styles.communeChange}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Changer de commune"
          >
            <Text style={styles.communeChangeText}>Changer</Text>
          </Pressable>
        </View>

        {/* Avignon porte 84000 et 84140 : le code postal ne se devine pas, on
            le fait choisir plutôt que de retenir le premier de la liste. */}
        {commune.codesPostaux.length > 1 ? (
          <View style={styles.communeCpBlock}>
            <Text style={styles.hint}>
              Cette commune a plusieurs codes postaux — indiquez le vôtre.
            </Text>
            <View style={styles.slotsRow}>
              {commune.codesPostaux.map((cp) => {
                const active = values.postalCode === cp;
                return (
                  <Pressable
                    key={cp}
                    onPress={() => onChange(selectPostalCode(values, cp))}
                    style={[styles.slotChip, active && styles.slotChipActive]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Code postal ${cp}`}
                  >
                    <Text style={[styles.slotText, active && styles.slotTextActive]}>{cp}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {error ? (
          <Text style={styles.errorText} accessibilityRole="alert">
            {error}
          </Text>
        ) : (
          <Text style={styles.hint}>Elle détermine vos frais de livraison.</Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.field}>
      {/* Pas d'astérisque : la commune n'est pas exigée pour enregistrer. La
          rendre obligatoire empêcherait un client de corriger son numéro de
          téléphone tant qu'il n'a pas choisi — et sans elle, les frais restent
          simplement « à confirmer », ce que le tunnel de commande annonce. */}
      <Text style={styles.label}>Commune de livraison</Text>
      <TextInput
        style={[styles.input, !!error && styles.inputError]}
        value={query}
        onChangeText={setQuery}
        placeholder="Orange, Avignon, Carpentras…"
        placeholderTextColor={colors.textTertiary}
        autoCapitalize="words"
        autoCorrect={false}
        accessibilityLabel="Rechercher votre commune"
        accessibilityHint="Nous livrons uniquement dans le Vaucluse"
      />

      {search.results.map((c) => (
        <Pressable
          key={c.codeInsee}
          onPress={() => choose(c)}
          style={styles.communeRow}
          accessibilityRole="button"
          accessibilityLabel={communeLabel(c)}
        >
          <Ionicons name="location-outline" size={18} color={colors.textTertiary} />
          <Text style={styles.communeRowName}>{c.nom}</Text>
          <Text style={styles.communeRowCp}>{c.codesPostaux.join(", ")}</Text>
        </Pressable>
      ))}

      {search.notice ? (
        <Text
          style={search.horsListe ? styles.communeNotice : styles.hint}
          accessibilityLiveRegion="polite"
        >
          {search.notice}
        </Text>
      ) : null}

      {/* Fiche antérieure à la liste fermée : on ne convertit pas sa ville en
          silence — le palier tarifaire en dépend, c'est au client de trancher. */}
      {!query && suggestions.length > 0 ? (
        <View style={styles.communeSuggest}>
          <Text style={styles.communeSuggestTitle}>
            {previousLabel
              ? `Vous aviez indiqué « ${previousLabel} ». Confirmez votre commune :`
              : "Confirmez votre commune :"}
          </Text>
          <View style={styles.slotsRow}>
            {suggestions.map((c) => (
              <Pressable
                key={c.codeInsee}
                onPress={() => choose(c)}
                style={styles.slotChip}
                accessibilityRole="button"
                accessibilityLabel={`Choisir ${communeLabel(c)}`}
              >
                <Text style={styles.slotText}>{c.nom}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {error ? (
        <Text style={styles.errorText} accessibilityRole="alert">
          {error}
        </Text>
      ) : !query ? (
        <Text style={styles.hint}>
          Nous livrons uniquement dans le Vaucluse. Votre commune détermine vos frais de livraison.
        </Text>
      ) : null}
    </View>
  );
}

// ─── Écran ───────────────────────────────────────────────────────

export default function EditProfileScreen() {
  const profile = useProfile();
  const updateProfile = useUpdateProfile();

  const initial = useMemo(() => toFormValues(profile.data), [profile.data]);
  // `null` tant que le profil n'est pas arrivé : on ne peut pas pré-remplir un
  // formulaire avec des valeurs qu'on n'a pas encore, et repartir d'un état vide
  // ferait envoyer des effacements que personne n'a demandés.
  const [values, setValues] = useState<ProfileFormValues | null>(null);
  const [touched, setTouched] = useState(false);
  /** Erreurs renvoyées par le serveur, champ par champ (ApiError.details). */
  const [serverErrors, setServerErrors] = useState<ProfileErrors>({});

  const form = values ?? initial;
  const clientErrors = validateProfileForm(form);
  const changed = hasProfileChanges(initial, form);

  const errorFor = (field: ProfileField): string | null =>
    (touched ? clientErrors[field] : undefined) ?? serverErrors[field] ?? null;

  const setField = (field: ProfileField, v: string) => {
    setValues({ ...form, [field]: v });
    // L'erreur serveur porte sur la valeur envoyée : dès qu'elle change, elle
    // n'a plus de sens et disparaît.
    if (serverErrors[field]) setServerErrors({ ...serverErrors, [field]: undefined });
  };

  /**
   * Écriture groupée — la commune pose `communeInsee`, `city` et `postalCode`
   * d'un seul tenant (cf. `selectCommune`). Les trois erreurs serveur qui s'y
   * rapportent tombent ensemble : elles portaient sur l'ancienne commune.
   */
  const applyValues = (next: ProfileFormValues) => {
    setValues(next);
    if (serverErrors.communeInsee ?? serverErrors.city ?? serverErrors.postalCode) {
      setServerErrors({
        ...serverErrors,
        communeInsee: undefined,
        city: undefined,
        postalCode: undefined,
      });
    }
  };

  // Fiche antérieure à la liste fermée : elle n'a qu'une ville et un code
  // postal en texte. On propose les communes correspondantes, sans en appliquer
  // aucune d'office — c'est le palier tarifaire qui se joue là.
  const suggestions = useMemo(
    () => (initial.communeInsee ? [] : suggestCommunes(initial)),
    [initial],
  );
  const previousLocation = [initial.postalCode, initial.city].filter(Boolean).join(" ");

  const haptic = (type: "success" | "error") => {
    if (Platform.OS === "web") return;
    void Haptics.notificationAsync(
      type === "success"
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Warning,
    );
  };

  const handleSave = () => {
    if (updateProfile.isPending) return;
    setTouched(true);

    if (Object.keys(clientErrors).length > 0) {
      haptic("error");
      return;
    }
    if (!changed) {
      // Le serveur refuse un corps vide (« Aucun champ à modifier ») : autant le
      // dire ici plutôt que d'aller chercher un 400.
      Alert.alert("Aucune modification", "Vos informations sont déjà à jour.");
      return;
    }

    updateProfile.mutate(buildProfilePatch(initial, form), {
      onSuccess: () => {
        haptic("success");
        // On quitte AVANT d'alerter : sur Android, fermer une alerte par le
        // bouton retour n'exécute jamais son `onPress`, et l'utilisateur restait
        // sur un formulaire déjà enregistré.
        router.back();
        Alert.alert("Informations enregistrées", "Vos coordonnées ont bien été mises à jour.");
      },
      onError: (e) => {
        haptic("error");
        // Le serveur détaille les champs fautifs : on les replace sous les
        // champs concernés au lieu d'un message global illisible.
        const details = e instanceof ApiError ? e.details : undefined;
        if (details) {
          const mapped: ProfileErrors = {};
          for (const [key, messages] of Object.entries(details)) {
            if (key in form && Array.isArray(messages) && typeof messages[0] === "string") {
              mapped[key as ProfileField] = messages[0];
            }
          }
          if (Object.keys(mapped).length > 0) {
            setServerErrors(mapped);
            return;
          }
        }
        Alert.alert("Enregistrement impossible", errorMessage(e));
      },
    });
  };

  if (profile.isLoading && !profile.data) return <LoadingScreen />;

  // Sans profil chargé, le formulaire pré-remplirait des champs vides et
  // proposerait d'effacer des données qu'on n'a pas lues.
  if (!profile.data) {
    return (
      <ScreenWrapper>
        <ErrorState what="vos informations" onRetry={() => void profile.refetch()} />
      </ScreenWrapper>
    );
  }

  const slotOptions =
    form.preferredTimeSlot && !TIME_SLOTS.some((s) => s.value === form.preferredTimeSlot)
      ? // Créneau hors liste (posé par l'admin) : on l'affiche plutôt que de le
        // faire disparaître à la première ouverture de l'écran.
        [...TIME_SLOTS, { value: form.preferredTimeSlot, label: form.preferredTimeSlot }]
      : TIME_SLOTS;

  return (
    <ScreenWrapper>
      <Animated.View entering={FadeInDown.duration(200)}>
        <Field
          label="Nom"
          value={form.name}
          onChangeText={(v) => setField("name", v)}
          placeholder="Nom de l'établissement ou du contact"
          required
          autoCapitalize="words"
          maxLength={PROFILE_MAX.name}
          error={errorFor("name")}
        />

        <Field
          label="Téléphone"
          value={form.phone}
          onChangeText={(v) => setField("phone", v)}
          placeholder="06 12 34 56 78"
          keyboardType="phone-pad"
          autoCapitalize="none"
          maxLength={PROFILE_MAX.phone}
          hint="Utilisé par le livreur le jour de la livraison."
          error={errorFor("phone")}
        />

        <Field
          label="Adresse de livraison"
          value={form.address}
          onChangeText={(v) => setField("address", v)}
          placeholder="12 rue des Lilas, bâtiment B"
          multiline
          maxLength={PROFILE_MAX.address}
          hint="Rue et complément — la commune se choisit juste en dessous."
          error={errorFor("address")}
        />

        <CommunePicker
          values={form}
          onChange={applyValues}
          suggestions={suggestions}
          previousLabel={previousLocation}
          error={errorFor("communeInsee") ?? errorFor("city") ?? errorFor("postalCode")}
        />

        {/* Créneau préféré — sélection plutôt que saisie libre : le serveur
            impose le format « 08:00-10:00 » et refuserait « le matin ». */}
        <View style={styles.field}>
          <Text style={styles.label}>
            Créneau préféré<Text style={styles.optional}> (facultatif)</Text>
          </Text>
          <View style={styles.slotsRow}>
            {slotOptions.map((slot) => {
              const active = form.preferredTimeSlot === slot.value;
              return (
                <Pressable
                  key={slot.value}
                  onPress={() => setField("preferredTimeSlot", active ? "" : slot.value)}
                  style={[styles.slotChip, active && styles.slotChipActive]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Créneau ${slot.label}`}
                  accessibilityHint={
                    active ? "Appuyez pour ne plus indiquer de préférence" : undefined
                  }
                >
                  <Text style={[styles.slotText, active && styles.slotTextActive]}>
                    {slot.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {errorFor("preferredTimeSlot") ? (
            <Text style={styles.errorText} accessibilityRole="alert">
              {errorFor("preferredTimeSlot")}
            </Text>
          ) : (
            <Text style={styles.hint}>
              Indicatif : nous faisons au mieux selon la tournée du jour.
            </Text>
          )}
        </View>

        {/* E-mail : non modifiable, et on dit pourquoi. */}
        <Card style={styles.lockedCard}>
          <View style={styles.lockedRow}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.textSecondary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.lockedLabel}>Adresse e-mail</Text>
              <Text style={styles.lockedValue}>
                {profile.data.email ?? "Aucun e-mail enregistré"}
              </Text>
              <Text style={styles.lockedHint}>
                L&apos;e-mail identifie votre compte : sa modification passe par notre équipe, qui
                vérifie la nouvelle adresse avant de l&apos;activer.
              </Text>
            </View>
          </View>
        </Card>

        <Button
          title="Enregistrer"
          onPress={handleSave}
          loading={updateProfile.isPending}
          disabled={!changed}
          style={{ marginTop: spacing.xl }}
          accessibilityHint={
            changed ? "Enregistrer vos informations" : "Aucune modification à enregistrer"
          }
        />
        <Button
          title="Annuler"
          onPress={() => router.back()}
          variant="ghost"
          style={{ marginTop: spacing.sm }}
        />
      </Animated.View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: spacing.lg },
  label: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  required: { color: colors.error },
  optional: {
    color: colors.textTertiary,
    fontWeight: font.weights.medium,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: MIN_HIT_TARGET,
    fontSize: font.sizes.md,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  inputMultiline: { minHeight: 88, paddingTop: spacing.md },
  inputError: { borderColor: colors.error },
  errorText: {
    fontSize: font.sizes.xs,
    color: colors.error,
    marginTop: spacing.xs,
  },
  hint: {
    fontSize: font.sizes.xs,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  // Commune de livraison
  communeChosen: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
    minHeight: MIN_HIT_TARGET,
  },
  communeChosenName: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.semibold,
    color: colors.textPrimary,
  },
  communeChosenMeta: {
    fontSize: font.sizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  communeChange: {
    minHeight: MIN_HIT_TARGET,
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
  },
  communeChangeText: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.semibold,
    color: colors.primary,
    textDecorationLine: "underline",
  },
  communeCpBlock: { marginTop: spacing.md, gap: spacing.sm },
  communeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: MIN_HIT_TARGET,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  communeRowName: {
    flex: 1,
    fontSize: font.sizes.md,
    color: colors.textPrimary,
  },
  communeRowCp: {
    fontSize: font.sizes.xs,
    color: colors.textTertiary,
  },
  communeNotice: {
    fontSize: font.sizes.xs,
    color: colors.textSecondary,
    lineHeight: 17,
    marginTop: spacing.sm,
  },
  communeSuggest: { marginTop: spacing.md, gap: spacing.sm },
  communeSuggestTitle: {
    fontSize: font.sizes.xs,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  // Créneaux
  slotsRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  slotChip: {
    paddingHorizontal: spacing.lg,
    minHeight: MIN_HIT_TARGET,
    justifyContent: "center",
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  slotChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  slotText: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.semibold,
    color: colors.textSecondary,
  },
  slotTextActive: { color: colors.primary },
  // E-mail verrouillé
  lockedCard: { marginTop: spacing.sm },
  lockedRow: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "flex-start",
  },
  lockedLabel: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.semibold,
    color: colors.textSecondary,
  },
  lockedValue: {
    fontSize: font.sizes.md,
    color: colors.textPrimary,
    marginTop: 2,
  },
  lockedHint: {
    fontSize: font.sizes.xs,
    color: colors.textTertiary,
    lineHeight: 17,
    marginTop: spacing.xs,
  },
});
