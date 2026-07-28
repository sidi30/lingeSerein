/**
 * Capture de signature au doigt — SANS module natif supplémentaire.
 *
 * Les alternatives courantes (react-native-signature-canvas) passent par une
 * WebView, donc par `react-native-webview` : un module natif de plus et un
 * rebuild EAS. Ici on n'utilise que `PanResponder` (cœur de React Native) et
 * `react-native-svg`, déjà présent dans le projet.
 *
 * La signature est sérialisée en SVG (quelques Ko) et non en PNG : c'est
 * transportable dans un corps JSON, lisible tel quel côté admin, et ça évite
 * tout stockage objet (aucun S3 n'est configuré côté serveur).
 */

import { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  PanResponder,
  type LayoutChangeEvent,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { colors, font, spacing, radius, MIN_HIT_TARGET } from "@/lib/theme";

export interface SignaturePoint {
  x: number;
  y: number;
}

/** Un trait = la suite de points entre un poser et un lever de doigt. */
export type SignatureStroke = SignaturePoint[];

const STROKE_COLOR = "#0f172a";
const STROKE_WIDTH = 2.5;
const PAD_HEIGHT = 180;

/**
 * Distance minimale entre deux points retenus. Les événements tactiles arrivent
 * bien plus vite que le doigt ne bouge : sans ce filtre, on accumule des points
 * quasi confondus qui alourdissent le SVG (plafonné à 256 Ko côté serveur) et
 * font ramer le rendu sur les appareils modestes.
 */
const MIN_POINT_DISTANCE = 2;

/**
 * Longueur totale de tracé en-dessous de laquelle on ne considère pas avoir une
 * signature. Un simple appui — fréquent quand le livreur pose le doigt sur la
 * zone pour faire défiler l'écran — laisserait sinon un point qui vaudrait
 * preuve de réception signée par le client.
 */
const MIN_SIGNATURE_INK = 40;

/** Longueur cumulée de tous les traits, en pixels. */
export function signatureInkLength(strokes: SignatureStroke[]): number {
  let total = 0;
  for (const stroke of strokes) {
    for (let i = 1; i < stroke.length; i++) {
      total += Math.hypot(stroke[i].x - stroke[i - 1].x, stroke[i].y - stroke[i - 1].y);
    }
  }
  return total;
}

/** Vrai tracé volontaire, par opposition à un appui accidentel. */
export function isMeaningfulSignature(strokes: SignatureStroke[]): boolean {
  return signatureInkLength(strokes) >= MIN_SIGNATURE_INK;
}

/** Arrondi à 1 décimale : la précision sub-pixel ne sert à rien et triple le poids du SVG. */
function r(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Convertit un trait en attribut `d`. Les points sont reliés par des courbes
 * quadratiques passant par leurs milieux : le tracé est lissé sans avoir à
 * garder plus de deux points en mémoire.
 */
export function strokeToPath(stroke: SignatureStroke): string {
  if (stroke.length === 0) return "";
  if (stroke.length === 1) {
    // Un point isolé : un segment de longueur nulle, rendu comme un rond par
    // stroke-linecap="round". Sans ça, un simple tap ne laisserait aucune trace.
    const p = stroke[0];
    return `M${r(p.x)},${r(p.y)} L${r(p.x)},${r(p.y)}`;
  }

  let d = `M${r(stroke[0].x)},${r(stroke[0].y)}`;
  for (let i = 1; i < stroke.length - 1; i++) {
    const cur = stroke[i];
    const next = stroke[i + 1];
    d += ` Q${r(cur.x)},${r(cur.y)} ${r((cur.x + next.x) / 2)},${r((cur.y + next.y) / 2)}`;
  }
  const last = stroke[stroke.length - 1];
  d += ` L${r(last.x)},${r(last.y)}`;
  return d;
}

/** Document SVG autonome, prêt à être affiché côté admin ou converti en image. */
export function strokesToSvg(strokes: SignatureStroke[], width: number, height: number): string {
  const paths = strokes
    .filter((s) => s.length > 0)
    .map((s) => `<path d="${strokeToPath(s)}"/>`)
    .join("");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r(width)} ${r(height)}" ` +
    `width="${r(width)}" height="${r(height)}">` +
    `<rect width="100%" height="100%" fill="#ffffff"/>` +
    `<g fill="none" stroke="${STROKE_COLOR}" stroke-width="${STROKE_WIDTH}" ` +
    `stroke-linecap="round" stroke-linejoin="round">${paths}</g>` +
    `</svg>`
  );
}

/**
 * Data URL du SVG. On encode en pourcent plutôt qu'en base64 : `btoa` n'est pas
 * garanti sous Hermes, et `encodeURIComponent` est natif partout.
 */
export function strokesToDataUrl(
  strokes: SignatureStroke[],
  width: number,
  height: number,
): string {
  const svg = strokesToSvg(strokes, width, height);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export interface SignaturePadProps {
  /** Appelé au lever du doigt et à l'effacement — jamais pendant le tracé. */
  onChange: (strokes: SignatureStroke[], size: { width: number; height: number }) => void;
  disabled?: boolean;
  label?: string;
}

export function SignaturePad({ onChange, disabled, label }: SignaturePadProps) {
  const [strokes, setStrokes] = useState<SignatureStroke[]>([]);
  const [current, setCurrent] = useState<SignatureStroke>([]);
  const [width, setWidth] = useState(0);

  // Refs miroir : le PanResponder est mémoïsé une seule fois, il ne peut pas
  // lire les states via closure sans se recréer à chaque point tracé.
  const strokesRef = useRef<SignatureStroke[]>([]);
  const currentRef = useRef<SignatureStroke>([]);
  const widthRef = useRef(0);
  const disabledRef = useRef(false);
  const onChangeRef = useRef(onChange);

  onChangeRef.current = onChange;
  disabledRef.current = !!disabled;

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    widthRef.current = w;
    setWidth(w);
  }, []);

  const commit = useCallback(() => {
    if (currentRef.current.length === 0) return;
    strokesRef.current = [...strokesRef.current, currentRef.current];
    currentRef.current = [];
    setStrokes(strokesRef.current);
    setCurrent([]);
    onChangeRef.current(strokesRef.current, {
      width: widthRef.current,
      height: PAD_HEIGHT,
    });
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // `Capture` : la zone de signature est dans un ScrollView, il faut lui
        // prendre le geste avant qu'il ne devienne un défilement.
        onStartShouldSetPanResponderCapture: () => !disabledRef.current,
        onMoveShouldSetPanResponderCapture: () => !disabledRef.current,
        onPanResponderTerminationRequest: () => false,

        onPanResponderGrant: (e) => {
          const { locationX, locationY } = e.nativeEvent;
          currentRef.current = [{ x: locationX, y: locationY }];
          setCurrent(currentRef.current);
        },

        onPanResponderMove: (e) => {
          const { locationX, locationY } = e.nativeEvent;
          const last = currentRef.current[currentRef.current.length - 1];
          if (last && Math.hypot(locationX - last.x, locationY - last.y) < MIN_POINT_DISTANCE) {
            return;
          }
          currentRef.current = [...currentRef.current, { x: locationX, y: locationY }];
          setCurrent(currentRef.current);
        },

        onPanResponderRelease: commit,
        // Le système peut retirer le geste sans passer par `release` (appel
        // entrant, volet de notifications, mise en arrière-plan). Sans ce
        // gestionnaire, le trait en cours restait affiché mais n'était jamais
        // enregistré, puis était écrasé au trait suivant : le livreur voyait une
        // signature à l'écran et l'app affirmait qu'il n'y en avait aucune.
        onPanResponderTerminate: commit,
      }),
    [commit],
  );

  const handleClear = useCallback(() => {
    strokesRef.current = [];
    currentRef.current = [];
    setStrokes([]);
    setCurrent([]);
    onChangeRef.current([], { width: widthRef.current, height: PAD_HEIGHT });
  }, []);

  const isEmpty = strokes.length === 0 && current.length === 0;
  // Les traits terminés ne changent plus : on ne recalcule leur `d` que lorsque
  // la liste change, pas à chaque point tracé.
  const committedPaths = useMemo(() => strokes.map(strokeToPath), [strokes]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>{label ?? "Signature du client"}</Text>
        {!isEmpty && !disabled && (
          <Pressable
            onPress={handleClear}
            style={styles.clearBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Effacer la signature"
          >
            <Ionicons name="refresh-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.clearText}>Effacer</Text>
          </Pressable>
        )}
      </View>

      <View
        style={[styles.pad, disabled && styles.padDisabled]}
        onLayout={handleLayout}
        accessibilityLabel="Zone de signature. Signez avec le doigt."
        {...panResponder.panHandlers}
      >
        {width > 0 && (
          <Svg width={width} height={PAD_HEIGHT} style={StyleSheet.absoluteFill}>
            {committedPaths.map((d, i) => (
              <Path
                key={i}
                d={d}
                stroke={STROKE_COLOR}
                strokeWidth={STROKE_WIDTH}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            ))}
            {current.length > 0 && (
              <Path
                d={strokeToPath(current)}
                stroke={STROKE_COLOR}
                strokeWidth={STROKE_WIDTH}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            )}
          </Svg>
        )}

        {isEmpty && (
          <View style={styles.placeholder} pointerEvents="none">
            <Ionicons name="create-outline" size={26} color={colors.textTertiary} />
            <Text style={styles.placeholderText}>Signez ici avec le doigt</Text>
          </View>
        )}

        <View style={styles.baseline} pointerEvents="none" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.semibold,
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  clearBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: MIN_HIT_TARGET,
    paddingHorizontal: spacing.sm,
  },
  clearText: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.semibold,
    color: colors.textSecondary,
  },
  pad: {
    height: PAD_HEIGHT,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    overflow: "hidden",
    justifyContent: "center",
  },
  padDisabled: { opacity: 0.5 },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  placeholderText: {
    fontSize: font.sizes.sm,
    color: colors.textTertiary,
  },
  baseline: {
    position: "absolute",
    left: spacing.xl,
    right: spacing.xl,
    bottom: spacing.xxl,
    height: 1,
    backgroundColor: colors.borderLight,
  },
});
