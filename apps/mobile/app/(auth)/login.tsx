import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useLogin } from "@/lib/auth";
import { Button } from "@/components/Button";
import { colors, font, spacing, radius } from "@/lib/theme";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = useLogin();
  const insets = useSafeAreaInsets();

  const handleLogin = () => {
    if (!email.trim() || !password) return;
    login.mutate({ email: email.trim(), password });
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <LinearGradient
          colors={[colors.primary, colors.primaryDark]}
          style={[styles.headerGradient, { paddingTop: insets.top + spacing.xxxl }]}
        >
          <Text style={styles.logo} accessibilityRole="header">
            Linge Serein
          </Text>
          <Text style={styles.subtitle}>Votre linge, notre sérénité</Text>
        </LinearGradient>

        <View style={[styles.formContainer, { paddingBottom: insets.bottom + spacing.xxl }]}>
          <View style={styles.form}>
            <Text style={styles.formTitle}>Connexion</Text>

            <Text style={styles.label} nativeID="email-label">
              Adresse email
            </Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              accessibilityLabel="Adresse email"
              placeholder="client@example.com"
              placeholderTextColor={colors.textTertiary}
            />

            <Text style={styles.label} nativeID="password-label">
              Mot de passe
            </Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              textContentType="password"
              accessibilityLabel="Mot de passe"
              placeholder="Votre mot de passe"
              placeholderTextColor={colors.textTertiary}
            />

            {login.isError && (
              <View
                style={styles.errorBox}
                accessibilityRole="alert"
                accessibilityLiveRegion="assertive"
              >
                <Text style={styles.errorText}>Email ou mot de passe incorrect</Text>
              </View>
            )}

            <Button
              title="Se connecter"
              onPress={handleLogin}
              loading={login.isPending}
              disabled={!email.trim() || !password}
              style={{ marginTop: spacing.xl }}
            />
          </View>

          <Link href="/(auth)/register" style={styles.link}>
            <Text style={styles.linkText}>
              Pas encore de compte ? <Text style={styles.linkBold}>S'inscrire</Text>
            </Text>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
  headerGradient: {
    paddingBottom: 40,
    paddingHorizontal: spacing.xxl,
    alignItems: "center",
  },
  logo: {
    fontSize: font.sizes.display,
    fontWeight: font.weights.heavy,
    color: colors.textInverse,
  },
  subtitle: {
    fontSize: font.sizes.sm,
    color: "rgba(255,255,255,0.7)",
    marginTop: spacing.xs,
  },
  formContainer: {
    flexGrow: 1,
    marginTop: -spacing.xl,
    paddingHorizontal: spacing.xxl,
  },
  form: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xxl,
    ...Platform.select({
      web: { boxShadow: "0px 4px 24px rgba(0,0,0,0.08)" } as unknown as ViewStyle,
      default: {
        elevation: 6,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
      },
    }),
  },
  formTitle: {
    fontSize: font.sizes.xl,
    fontWeight: font.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xl,
  },
  label: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.medium,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: font.sizes.md,
    color: colors.textPrimary,
    backgroundColor: colors.background,
    minHeight: 48,
  },
  errorBox: {
    backgroundColor: colors.errorLight,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  errorText: {
    color: colors.errorText,
    fontSize: font.sizes.sm,
    fontWeight: font.weights.medium,
  },
  link: {
    alignSelf: "center",
    marginTop: spacing.xxl,
  },
  linkText: {
    fontSize: font.sizes.sm,
    color: colors.textSecondary,
  },
  linkBold: {
    color: colors.primary,
    fontWeight: font.weights.semibold,
  },
});
