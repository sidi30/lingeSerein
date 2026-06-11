"use client";

import { useAuth } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const ADMIN_ROLES = ["ROLE_ADMIN", "ROLE_SUPER_ADMIN"];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    // Garde-fou défensif : token déjà en localStorage d'un rôle non-admin
    if (!ADMIN_ROLES.includes(user.role)) {
      logout().finally(() => {
        router.replace("/login?error=acces-refuse");
      });
    }
  }, [user, loading, router, logout]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
