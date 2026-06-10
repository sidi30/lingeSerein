import Image from "next/image";

const navLinks = [
  { href: "/#services", label: "Services" },
  { href: "/#tarifs", label: "Tarifs" },
  { href: "/#faq", label: "FAQ" },
  { href: "/devis", label: "Simulateur de devis" },
  { href: "/zone-de-livraison", label: "Zone de livraison" },
  { href: "/#contact", label: "Contact" },
];

export function Footer() {
  return (
    <footer className="relative bg-forest-dark text-white/70 overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-lavender-600/30 to-transparent" />

      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 items-start">
          <div>
            <Image
              src="/images/logo_dark_bg.png"
              alt="Linge Serein — blanchisserie et location de linge hôtelier à Orange, Vaucluse"
              width={200}
              height={100}
              className="h-16 w-auto mb-6 opacity-90"
            />
            <p className="text-sm leading-relaxed text-white/50 max-w-xs">
              Votre linge, notre sérénité.
              <br />
              Service B2B de linge hôtelier basé à Orange, Vaucluse.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-medium text-white/90 uppercase tracking-wider mb-5">
              Navigation
            </h4>
            <div className="flex flex-col gap-3">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="text-sm text-white/50 hover:text-white transition-colors duration-300"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium text-white/90 uppercase tracking-wider mb-5">
              Contact
            </h4>
            <div className="flex flex-col gap-3 text-sm text-white/50">
              <a href="tel:+33753569548" className="hover:text-white transition-colors">
                07 53 56 95 48
              </a>
              <a href="mailto:lingeserein@gmail.com" className="hover:text-white transition-colors">
                lingeserein@gmail.com
              </a>
              <span>Rue Simone Weil, 84100 Orange</span>
            </div>
          </div>
        </div>

        <div className="mt-16 pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-white/60">
            &copy; {new Date().getFullYear()} Linge Serein. Tous droits réservés.
          </p>
          <div className="flex gap-6">
            <a
              href="/mentions-legales"
              className="text-xs text-white/60 hover:text-white transition-colors"
            >
              Mentions légales
            </a>
            <a
              href="/politique-confidentialite"
              className="text-xs text-white/60 hover:text-white transition-colors"
            >
              Politique de confidentialité
            </a>
            <a href="/cgv" className="text-xs text-white/60 hover:text-white transition-colors">
              CGV
            </a>
            <a href="/cgps" className="text-xs text-white/60 hover:text-white transition-colors">
              CGPS
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
