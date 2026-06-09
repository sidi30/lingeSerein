import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import type { RegisterInput } from "@lingengo/shared";
import { apiFetch } from "./api";
import { useAuthStore } from "./store";

interface LoginPayload {
  email: string;
  password: string;
}

type RegisterPayload = RegisterInput;

interface LoginResponse {
  success: boolean;
  data: {
    accessToken: string;
    refreshToken: string;
    userId: string;
    role: string;
  };
}

interface MeResponse {
  success: boolean;
  data: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}

export function useLogin() {
  return useMutation({
    mutationFn: async (data: LoginPayload) => {
      const loginRes = await apiFetch<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify(data),
      });

      // Store tokens first so the /me request is authenticated
      useAuthStore
        .getState()
        .setAuth(
          { id: loginRes.data.userId, name: "", email: data.email, role: loginRes.data.role },
          loginRes.data.accessToken,
          loginRes.data.refreshToken,
        );

      // Fetch full user profile
      const meRes = await apiFetch<MeResponse>("/auth/me");

      return {
        user: meRes.data,
        accessToken: loginRes.data.accessToken,
        refreshToken: loginRes.data.refreshToken,
      };
    },
    onSuccess: ({ user, accessToken, refreshToken }) => {
      useAuthStore.getState().setAuth(user, accessToken, refreshToken);
      router.replace("/(tabs)");
    },
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: (data: RegisterPayload) =>
      apiFetch<{ success: boolean; data: { userId: string; message: string } }>("/auth/register", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      // API requires email verification before login
      router.replace("/(auth)/login");
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const refreshToken = useAuthStore.getState().refreshToken;
      try {
        // Révoque le refresh token côté serveur (best-effort).
        await apiFetch("/auth/logout", {
          method: "POST",
          body: JSON.stringify({ refreshToken }),
        });
      } catch {
        // Échec réseau/serveur : on déconnecte quand même localement.
      }
    },
    onSettled: () => {
      useAuthStore.getState().logout();
      qc.clear();
      router.replace("/(auth)/login");
    },
  });
}

export { useAuthStore } from "./store";
