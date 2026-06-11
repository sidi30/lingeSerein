"use client";

import { Suspense } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import Image from "next/image";
import { ClipboardList, Truck, AlertCircle, CheckCircle2 } from "lucide-react";

/** Lit les query params — doit être sous <Suspense> en Next.js 15 */
function LoginBanners({ error }: { error: string | null }) {
  const searchParams = useSearchParams();
  const accessDenied = searchParams.get("error") === "acces-refuse";
  const passwordChanged = searchParams.get("message") === "mdp-change";

  if (passwordChanged && !error) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-success-50 px-4 py-3 text-sm text-success-700">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-success-600" aria-hidden="true" />
        Mot de passe modifié. Reconnectez-vous avec votre nouveau mot de passe.
      </div>
    );
  }

  if (accessDenied && !error) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-danger-50 px-4 py-3 text-sm text-danger-600">
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        Accès réservé aux administrateurs.
      </div>
    );
  }

  return null;
}

export default function LoginPage() {
  const { login, user, loading, error } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/");
    }
  }, [user, loading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(email, password);
      router.push("/");
    } catch {
      // error is set in auth context
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* Left panel — branding */}
      <div className="hidden w-1/2 flex-col justify-between bg-primary-600 p-12 lg:flex">
        <div>
          <Image
            src="/logo-dark.png"
            alt="Linge Serein"
            width={200}
            height={80}
            className="h-16 w-auto"
          />
          <p className="mt-2 text-primary-200">Votre linge, notre sérénité</p>
        </div>

        <div className="space-y-8">
          <div className="rounded-xl bg-white/10 p-6 backdrop-blur-sm">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20">
                <ClipboardList className="h-5 w-5 text-white" />
              </div>
              <h3 className="font-semibold text-white">Gestion centralisée</h3>
            </div>
            <p className="text-sm leading-relaxed text-primary-100">
              Commandes, stock, livraisons et abonnements — tout en un seul tableau de bord.
            </p>
          </div>

          <div className="rounded-xl bg-white/10 p-6 backdrop-blur-sm">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20">
                <Truck className="h-5 w-5 text-white" />
              </div>
              <h3 className="font-semibold text-white">Planning en temps réel</h3>
            </div>
            <p className="text-sm leading-relaxed text-primary-100">
              Planifiez vos tournées et suivez chaque livraison en direct.
            </p>
          </div>
        </div>

        <p className="text-xs text-primary-300">
          &copy; {new Date().getFullYear()} Linge Serein — Vaucluse, France
        </p>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <Image
              src="/logo.png"
              alt="Linge Serein"
              width={160}
              height={64}
              className="mx-auto h-14 w-auto"
            />
            <p className="mt-3 text-sm text-gray-500">
              Connectez-vous à votre espace administrateur
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
          >
            <div className="flex flex-col gap-4">
              <Input
                label="Adresse email"
                type="email"
                placeholder="admin@linge-serein.fr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />

              <div>
                <Input
                  label="Mot de passe"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <div className="mt-1.5 text-right">
                  <button
                    type="button"
                    className="text-xs text-primary-600 hover:text-primary-700 hover:underline"
                  >
                    Mot de passe oublié ?
                  </button>
                </div>
              </div>

              {/* Query-param banners (access denied / password changed) */}
              <Suspense fallback={null}>
                <LoginBanners error={error} />
              </Suspense>

              {error && (
                <div className="flex items-center gap-2 rounded-lg bg-danger-50 px-4 py-3 text-sm text-danger-600">
                  <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {error}
                </div>
              )}

              <Button type="submit" loading={submitting} className="w-full">
                Se connecter
              </Button>
            </div>
          </form>

          <p className="mt-6 text-center text-xs text-gray-400">
            Environnement sécurisé — Accès réservé aux administrateurs
          </p>
        </div>
      </div>
    </div>
  );
}
