import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { Link } from "expo-router";
import type { RegisterInput } from "@lingengo/shared";
import { useRegister } from "@/lib/auth";
import { Button } from "@/components/Button";
import { colors, font, spacing, radius } from "@/lib/theme";

type AccommodationType = RegisterInput["accommodationType"];

const ACCOMMODATION_TYPES: { value: AccommodationType; label: string }[] = [
  { value: "HOTEL", label: "Hotel" },
  { value: "GITE", label: "Gite" },
  { value: "AIRBNB", label: "Airbnb" },
  { value: "AUBERGE", label: "Auberge" },
  { value: "AUTRE", label: "Autre" },
];

export default function RegisterScreen() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [address, setAddress] = useState("");
  const [accoType, setAccoType] = useState<AccommodationType>("HOTEL");
  const [success, setSuccess] = useState(false);
  const register = useRegister();

  const handleRegister = () => {
    if (!name.trim() || !email.trim() || !password || !address.trim()) return;
    register.mutate(
      {
        name: name.trim(),
        email: email.trim(),
        password,
        address: address.trim(),
        accommodationType: accoType,
      },
      { onSuccess: () => setSuccess(true) },
    );
  };

  if (success) {
    return (
      <View style={styles.container}>
        <View style={styles.inner}>
          <Text style={styles.successIcon}>{"✉️"}</Text>
          <Text style={styles.successTitle}>Compte cree !</Text>
          <Text style={styles.successText}>
            Un email de verification a ete envoye. Verifiez votre boite mail puis connectez-vous.
          </Text>
          <Link href="/(auth)/login" style={{ marginTop: spacing.xxl }}>
            <Text
              style={{
                color: colors.primary,
                fontWeight: font.weights.semibold,
                fontSize: font.sizes.md,
              }}
            >
              Retour a la connexion
            </Text>
          </Link>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={styles.inner} showsVerticalScrollIndicator={false}>
        <Text style={styles.title} accessibilityRole="header">
          Creer un compte
        </Text>

        <Text style={styles.label}>Nom complet</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          autoComplete="name"
          placeholder="Pierre Leclerc"
          placeholderTextColor={colors.textTertiary}
        />

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          placeholder="email@example.com"
          placeholderTextColor={colors.textTertiary}
        />

        <Text style={styles.label}>Mot de passe</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          placeholder="Min. 8 caracteres"
          placeholderTextColor={colors.textTertiary}
        />

        <Text style={styles.label}>Adresse de livraison</Text>
        <TextInput
          style={[styles.input, { minHeight: 64, textAlignVertical: "top" }]}
          value={address}
          onChangeText={setAddress}
          multiline
          placeholder="12 rue de la Republique, 84000 Avignon"
          placeholderTextColor={colors.textTertiary}
        />

        <Text style={styles.label}>Type d'hebergement</Text>
        <View style={styles.chips}>
          {ACCOMMODATION_TYPES.map((t) => (
            <Text
              key={t.value}
              onPress={() => setAccoType(t.value)}
              style={[styles.chip, accoType === t.value && styles.chipActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: accoType === t.value }}
            >
              {t.label}
            </Text>
          ))}
        </View>

        {register.isError && (
          <View style={styles.errorBox} accessibilityRole="alert">
            <Text style={styles.errorText}>Erreur lors de l'inscription</Text>
          </View>
        )}

        <Button
          title="S'inscrire"
          onPress={handleRegister}
          loading={register.isPending}
          disabled={!name.trim() || !email.trim() || !password || !address.trim()}
          style={{ marginTop: spacing.xl }}
        />

        <Link href="/(auth)/login" style={styles.link}>
          <Text style={styles.linkText}>
            Deja un compte ? <Text style={styles.linkBold}>Se connecter</Text>
          </Text>
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  inner: { padding: spacing.xxl, paddingTop: 60 },
  title: {
    fontSize: font.sizes.xxl,
    fontWeight: font.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xxl,
  },
  label: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.medium,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: font.sizes.md,
    color: colors.textPrimary,
    minHeight: 48,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: font.sizes.sm,
    color: colors.textSecondary,
    overflow: "hidden",
  },
  chipActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
    color: colors.primary,
  },
  errorBox: {
    backgroundColor: colors.errorLight,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  errorText: { color: colors.error, fontSize: font.sizes.sm },
  link: { alignSelf: "center", marginTop: spacing.xl, marginBottom: spacing.xxxl },
  linkText: { fontSize: font.sizes.sm, color: colors.textSecondary },
  linkBold: { color: colors.primary, fontWeight: font.weights.semibold },
  successIcon: { fontSize: 48, textAlign: "center", marginBottom: spacing.lg },
  successTitle: {
    fontSize: font.sizes.xl,
    fontWeight: font.weights.bold,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  successText: {
    fontSize: font.sizes.md,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 24,
  },
});
