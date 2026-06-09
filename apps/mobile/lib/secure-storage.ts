import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * Stockage sécurisé des tokens d'auth.
 * - Natif (iOS/Android) : Keychain / Keystore via expo-secure-store,
 *   accessible uniquement quand l'appareil est déverrouillé, non synchronisé iCloud.
 * - Web (preview de dev) : localStorage en repli (SecureStore non supporté sur web).
 *   La prod cible le mobile ; le web n'est qu'un aperçu de développement.
 */
interface SecureStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

const webStorage: SecureStorage = {
  getItem: async (key) => (typeof localStorage !== "undefined" ? localStorage.getItem(key) : null),
  setItem: async (key, value) => {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  },
  removeItem: async (key) => {
    if (typeof localStorage !== "undefined") localStorage.removeItem(key);
  },
};

const nativeStorage: SecureStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) =>
    SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};

export const secureStorage: SecureStorage = Platform.OS === "web" ? webStorage : nativeStorage;
