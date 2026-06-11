"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, setToken, getToken } from "./api";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  userId: string;
  role: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const ADMIN_ROLES = ["ROLE_ADMIN", "ROLE_SUPER_ADMIN"] as const;

function isAdminRole(role: string): boolean {
  return (ADMIN_ROLES as readonly string[]).includes(role);
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUser = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      // GET /auth/me renvoie directement { id, email, name, role, ... }
      const data = await api.get<User>("/auth/me");
      // Garde-fou défensif : si le rôle n'est pas admin → logout immédiat
      if (!isAdminRole(data.role)) {
        setToken(null);
        setUser(null);
        if (typeof window !== "undefined" && !window.location.pathname.includes("/login")) {
          window.location.href = "/login?error=acces-refuse";
        }
        return;
      }
      setUser(data);
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      // POST /auth/login renvoie { accessToken, refreshToken, userId, role }
      const data = await api.post<LoginResponse>("/auth/login", { email, password });

      // Vérification du rôle AVANT de stocker le token
      if (!isAdminRole(data.role)) {
        throw new Error("Accès réservé aux administrateurs.");
      }

      setToken(data.accessToken);

      // Fetch le profil complet
      const me = await api.get<User>("/auth/me");
      setUser(me);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur de connexion";
      setError(message);
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // ignore
    } finally {
      setToken(null);
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, error, login, logout }),
    [user, loading, error, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
