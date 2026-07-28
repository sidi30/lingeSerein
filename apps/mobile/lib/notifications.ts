/**
 * Notifications push + résolution des liens profonds.
 *
 * ⚠️ `expo-notifications` est un MODULE NATIF. Ce fichier ne l'appelle JAMAIS au
 * chargement du module : tout passe par des appels tardifs enveloppés de
 * try/catch. Un binaire qui ne contient pas le module (Expo Go, ancien build)
 * perd le push mais ne plante pas — le reste de l'app continue de fonctionner
 * sur le polling REST existant.
 *
 * L'enregistrement du token vise `POST /notifications/device-token`, qui
 * N'EXISTE PAS ENCORE côté API (aucun modèle DeviceToken en base). L'échec est
 * donc attendu et silencieux tant que le backend n'a pas livré la route.
 */

import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { apiFetch } from "./api";
import { invalidateAfter } from "./cache";
import { queryClient } from "./queryClient";
import { useAuthStore } from "./store";

// ─── Résolution des liens profonds ───────────────────────────────

/** Clés d'identifiant tolérées dans `notification.data`, par cible. */
const ID_KEYS = {
  order: ["orderId", "order_id", "commandeId", "orderid"],
  stop: ["stopId", "stop_id", "deliveryStopId", "arretId"],
  client: ["clientId", "client_id", "userId", "user_id"],
} as const;

function pickId(data: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const k of keys) {
    const v = data[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

function isAdmin(role: string | undefined): boolean {
  return role === "ROLE_ADMIN" || role === "ROLE_SUPER_ADMIN";
}

/**
 * Route à ouvrir pour une notification, ou `null` si rien de pertinent.
 *
 * Le serveur peut ajouter des types à tout moment : on ne suppose jamais qu'un
 * type est connu, et l'absence de correspondance se traduit par « on ne navigue
 * pas », jamais par une erreur.
 */
export function resolveNotificationRoute(
  notif: { type: string; data?: Record<string, unknown> | null },
  role: string | undefined,
): string | null {
  const data = notif.data ?? {};

  // 1. Chemin explicite fourni par le serveur — on n'accepte qu'un chemin
  // interne, jamais une URL absolue (un lien externe dans une notif serait un
  // vecteur de phishing).
  const explicit = data.path ?? data.deepLink ?? data.route;
  if (typeof explicit === "string" && explicit.startsWith("/") && !explicit.startsWith("//")) {
    return explicit;
  }

  // 2. Identifiant d'entité — le plus fiable.
  const orderId = pickId(data, ID_KEYS.order);
  if (orderId) return `/(tabs)/orders/${orderId}`;

  const stopId = pickId(data, ID_KEYS.stop);
  if (stopId && role === "ROLE_LIVREUR") return `/(tabs)/tournee/stop/${stopId}`;

  if (isAdmin(role)) {
    const clientId = pickId(data, ID_KEYS.client);
    if (clientId) return `/(tabs)/clients/${clientId}`;
  }

  // 3. Repli par type. `startsWith` plutôt qu'une égalité : les familles
  // ROTATION_*, PAYMENT_*, SUBSCRIPTION_* s'étendront côté serveur.
  const t = notif.type;
  if (t.startsWith("STOCK_")) {
    return isAdmin(role) ? "/(tabs)/stock-global" : "/(tabs)/stock";
  }
  if (t.startsWith("ROTATION_")) {
    return role === "ROLE_LIVREUR" ? "/(tabs)/tournee" : "/(tabs)/stock";
  }
  if (t.startsWith("DELIVERY_")) {
    return role === "ROLE_LIVREUR" ? "/(tabs)/tournee" : "/(tabs)/orders";
  }
  if (t.startsWith("PAYMENT_") || t.startsWith("SUBSCRIPTION_")) {
    return "/(tabs)/profile";
  }

  return null;
}

/** Navigue si une cible est identifiable. Ne lève jamais. */
export function openNotification(
  notif: { type: string; data?: Record<string, unknown> | null },
  role: string | undefined,
): boolean {
  const route = resolveNotificationRoute(notif, role);
  if (!route) return false;
  try {
    router.push(route as Parameters<typeof router.push>[0]);
    return true;
  } catch {
    return false;
  }
}

// ─── Enregistrement du token device ──────────────────────────────

function getProjectId(): string | undefined {
  const fromConfig = Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof fromConfig === "string") return fromConfig;
  // easConfig est renseigné dans les builds EAS quand expoConfig ne l'est pas.
  const fromEas = (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  return typeof fromEas === "string" ? fromEas : undefined;
}

/**
 * Demande la permission et renvoie le token Expo Push, ou `null`.
 * Sur Android 13+ la permission POST_NOTIFICATIONS est demandée ici ; le canal
 * doit exister AVANT, sinon les notifications reçues sont muettes.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === "web") return null;

  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Notifications",
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      const asked = await Notifications.requestPermissionsAsync();
      status = asked.status;
    }
    if (status !== "granted") return null;

    const projectId = getProjectId();
    if (!projectId) return null;

    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data;
  } catch {
    // Module natif absent, simulateur, ou refus système : le push est
    // indisponible, l'app reste fonctionnelle via le polling.
    return null;
  }
}

/** Envoie le token à l'API. Silencieux si la route n'existe pas encore (404). */
async function pushTokenToApi(token: string): Promise<void> {
  try {
    await apiFetch("/notifications/device-token", {
      method: "POST",
      body: JSON.stringify({ token, platform: Platform.OS }),
    });
  } catch {
    // Contrat pas encore livré côté serveur — on n'alerte pas l'utilisateur.
  }
}

/**
 * Branche le push : handler d'affichage, permission, token, et navigation au
 * tap (app ouverte, en arrière-plan, ou lancée depuis la notification).
 *
 * À monter une seule fois, sous l'arbre authentifié.
 */
export function usePushNotifications(): void {
  const token = useAuthStore((s) => s.accessToken);
  const role = useAuthStore((s) => s.user?.role);

  // Le listener est créé une fois ; il lit le rôle courant via une ref pour ne
  // pas se réabonner à chaque changement de session.
  const roleRef = useRef(role);
  roleRef.current = role;

  useEffect(() => {
    if (!token || Platform.OS === "web") return;

    let cancelled = false;
    let subscription: { remove: () => void } | undefined;
    let receivedSub: { remove: () => void } | undefined;

    try {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });

      // Une push REÇUE application ouverte n'était écoutée nulle part : seul le
      // tap l'était. Le badge d'onglet restait donc en retard jusqu'au cycle de
      // polling suivant (60 s) alors que le serveur venait de nous prévenir.
      receivedSub = Notifications.addNotificationReceivedListener(() => {
        void invalidateAfter(queryClient, "notification");
      });

      subscription = Notifications.addNotificationResponseReceivedListener((response) => {
        const content = response.notification.request.content;
        const raw = content.data as Record<string, unknown> | undefined;
        const type = typeof raw?.type === "string" ? raw.type : "GENERAL";
        openNotification({ type, data: raw ?? {} }, roleRef.current);
      });
    } catch {
      // Pas de module natif dans ce binaire : on saute le push.
    }

    void (async () => {
      const pushToken = await registerForPushNotifications();
      if (!cancelled && pushToken) await pushTokenToApi(pushToken);
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
      receivedSub?.remove();
    };
  }, [token]);
}
