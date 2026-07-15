"use client";

import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { ContractGenerator } from "@/components/contract-generator";

function ContratPageInner() {
  const searchParams = useSearchParams();
  const isAdmin = searchParams.get("admin") === "1";

  return (
    <div className="min-h-dvh bg-cream">
      <header className="bg-white/85 backdrop-blur-sm border-b border-lavender-100 sticky top-0 z-50">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/images/logo_full.png"
              alt="Linge Serein"
              width={512}
              height={512}
              className="h-9 w-auto"
            />
          </Link>
          <Link
            href="/devis?admin=1"
            className="flex items-center gap-1.5 text-sm text-gray-700 hover:text-forest transition-colors"
          >
            <ArrowLeft size={15} aria-hidden />
            Simulateur / devis
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-8 md:py-14">
        <div className="text-center mb-10">
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-forest">
            Générateur de contrat
          </h1>
          <p className="mt-2 text-gray-700 text-sm">
            Contrat d&apos;abonnement Pack Sérénité — remplissez les champs, téléchargez le PDF prêt
            à signer.
          </p>
        </div>

        {isAdmin ? (
          <ContractGenerator />
        ) : (
          <div className="rounded-2xl bg-white border border-lavender-200 p-8 text-center">
            <FileText size={28} aria-hidden className="mx-auto text-lavender-400 mb-3" />
            <p className="text-sm text-gray-700">
              Outil réservé à l&apos;administration. Ajoutez{" "}
              <code className="rounded bg-lavender-50 px-1.5 py-0.5 text-forest">?admin=1</code> à
              l&apos;URL pour y accéder.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

export default function ContratPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh bg-cream flex items-center justify-center">
          <p className="text-gray-700">Chargement…</p>
        </div>
      }
    >
      <ContratPageInner />
    </Suspense>
  );
}
