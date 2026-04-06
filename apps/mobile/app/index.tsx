import { Redirect } from "expo-router";
import { useAuthStore } from "@/lib/store";

export default function Index() {
  const token = useAuthStore((s) => s.accessToken);

  if (token) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/(auth)/login" />;
}
