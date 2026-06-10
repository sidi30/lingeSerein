import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";

export function LegalPage({
  title,
  updatedAt,
  children,
}: {
  title: string;
  updatedAt: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-cream">
      <header className="bg-white/85 backdrop-blur-sm border-b border-lavender-100">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/images/logo_full.png"
              alt="Linge Serein — location et entretien de linge hôtelier en Vaucluse"
              width={512}
              height={512}
              className="h-9 w-auto"
            />
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-gray-800 hover:text-forest transition-colors"
          >
            <ArrowLeft size={15} aria-hidden />
            Retour à l&apos;accueil
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-12 md:py-20">
        <h1 className="font-serif text-3xl md:text-4xl font-bold text-forest mb-3">{title}</h1>
        <p className="text-sm text-gray-700 mb-10">Dernière mise à jour : {updatedAt}</p>
        <div className="prose-legal text-gray-900 leading-relaxed space-y-6">{children}</div>
      </main>
    </div>
  );
}
