import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Mentions légales",
  description: "Mentions légales du site Linge Serein.",
  robots: { index: true, follow: true },
};

export default function MentionsLegales() {
  return (
    <LegalPage title="Mentions légales" updatedAt="14 mai 2026">
      <h2>Éditeur du site</h2>
      <p>
        <strong>Linge Serein</strong>
        <br />
        Rayana MAHAMAN MOUSTAPHA — Micro-entreprise
        <br />
        Rue Simone Weil — 84100 Orange, Vaucluse, France.
        <br />
        Téléphone : <a href="tel:+33753569548">07 53 56 95 48</a>
        <br />
        Email : <a href="mailto:lingeserein@gmail.com">lingeserein@gmail.com</a>
      </p>
      <p>
        <strong>SIRET :</strong> à compléter
        <br />
        <strong>Directeur de la publication :</strong> Rayana MAHAMAN MOUSTAPHA
      </p>

      <h2>Hébergement</h2>
      <p>
        Le site est hébergé par <strong>Vercel Inc.</strong>, 340 S Lemon Ave #4133, Walnut, CA
        91789, USA.
      </p>

      <h2>Propriété intellectuelle</h2>
      <p>
        L&apos;ensemble du contenu de ce site (textes, images, logos, charte graphique) est la
        propriété exclusive de Linge Serein, sauf mention contraire. Toute reproduction,
        représentation, modification ou exploitation, totale ou partielle, sans autorisation écrite
        préalable est interdite.
      </p>

      <h2>Crédits</h2>
      <p>
        Conception et développement : Linge Serein.
        <br />
        Icônes : <a href="https://lucide.dev">Lucide</a>.
        <br />
        Polices : Playfair Display &amp; Inter (Google Fonts).
      </p>

      <h2>Contact</h2>
      <p>
        Pour toute question relative au site, vous pouvez nous contacter via le formulaire de la
        page d&apos;accueil ou par email à{" "}
        <a href="mailto:lingeserein@gmail.com">lingeserein@gmail.com</a>.
      </p>
    </LegalPage>
  );
}
