import { useMutation } from "@tanstack/react-query";
import { router } from "expo-router";
import { apiFetch } from "./api";
import { useAuthStore } from "./store";

interface LoginPayload {
  email: string;
  password: string;
}

interface RegisterPayload {
  name: string;
  email: string;
  password: string;
}

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

      // Store token first so /me request is authenticated
      useAuthStore
        .getState()
        .setAuth(
          { id: loginRes.data.userId, name: "", email: data.email, role: loginRes.data.role },
          loginRes.data.accessToken,
        );

      // Fetch full user profile
      const meRes = await apiFetch<MeResponse>("/auth/me");

      return { user: meRes.data, accessToken: loginRes.data.accessToken };
    },
    onSuccess: ({ user, accessToken }) => {
      useAuthStore.getState().setAuth(user, accessToken);
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

export { useAuthStore } from "./store";
