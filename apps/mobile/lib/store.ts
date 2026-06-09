import { create } from "zustand";
import { secureStorage } from "./secure-storage";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

const ACCESS_KEY = "ls_access_token";
const REFRESH_KEY = "ls_refresh_token";
const USER_KEY = "ls_user";

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  /** false tant que les tokens persistés n'ont pas été rechargés au boot */
  hydrated: boolean;
  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  /** met à jour les tokens après un refresh (sans toucher au user) */
  setTokens: (accessToken: string, refreshToken: string) => void;
  logout: () => void;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  hydrated: false,

  setAuth: (user, accessToken, refreshToken) => {
    set({ user, accessToken, refreshToken });
    void secureStorage.setItem(ACCESS_KEY, accessToken);
    void secureStorage.setItem(REFRESH_KEY, refreshToken);
    void secureStorage.setItem(USER_KEY, JSON.stringify(user));
  },

  setTokens: (accessToken, refreshToken) => {
    set({ accessToken, refreshToken });
    void secureStorage.setItem(ACCESS_KEY, accessToken);
    void secureStorage.setItem(REFRESH_KEY, refreshToken);
  },

  logout: () => {
    set({ user: null, accessToken: null, refreshToken: null });
    void secureStorage.removeItem(ACCESS_KEY);
    void secureStorage.removeItem(REFRESH_KEY);
    void secureStorage.removeItem(USER_KEY);
  },

  hydrate: async () => {
    try {
      const [accessToken, refreshToken, userJson] = await Promise.all([
        secureStorage.getItem(ACCESS_KEY),
        secureStorage.getItem(REFRESH_KEY),
        secureStorage.getItem(USER_KEY),
      ]);
      let user: User | null = null;
      if (userJson) {
        try {
          user = JSON.parse(userJson) as User;
        } catch {
          user = null;
        }
      }
      set({
        accessToken: accessToken ?? null,
        refreshToken: refreshToken ?? null,
        user,
        hydrated: true,
      });
    } catch {
      set({ hydrated: true });
    }
  },
}));
