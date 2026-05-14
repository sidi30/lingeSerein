import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  description: "Politique de confidentialité et gestion des données personnelles — Linge Serein.",
  robots: { index: true, follow: true },
};

export default function PolitiqueConfidentialite() {
  return (
    <LegalPage title="Politique de confidentialité" updatedAt="14 mai 2026">
      <p>
        La présente politique décrit la manière dont Linge Serein collecte, utilise et protège les
        données personnelles, conformément au Règlement Général sur la Protection des Données (RGPD)
        et à la loi Informatique et Libertés.
      </p>

      <h2>Responsable du traitement</h2>
      <p>
        <strong>Linge Serein</strong>, Orange (84100), Vaucluse, France.
        <br />
        Email : <a href="mailto:lingeserein@gmail.com">lingeserein@gmail.com</a>
      </p>

      <h2>Données collectées</h2>
      <p>
        Via le formulaire de contact, nous collectons : <strong>nom</strong>,{" "}
        <strong>établissement</strong>, <strong>email</strong>, <strong>téléphone</strong>,{" "}
        <strong>message</strong>. Aucune donnée bancaire n&apos;est collectée sur ce site.
      </p>

      <h2>Finalités</h2>
      <ul>
        <li>Répondre à votre demande de devis ou de contact.</li>
        <li>Vous transmettre une proposition commerciale personnalisée.</li>
        <li>Assurer le suivi de la relation client si vous devenez partenaire.</li>
      </ul>

      <h2>Base légale</h2>
      <p>
        Le traitement repose sur votre <strong>consentement</strong> (case à cocher du formulaire)
        et sur l&apos;<strong>intérêt légitime</strong> à répondre à une demande commerciale.
      </p>

      <h2>Durée de conservation</h2>
      <p>
        Les données issues du formulaire sont conservées <strong>3 ans</strong> à compter du dernier
        contact si vous n&apos;êtes pas devenu client, et <strong>10 ans</strong> après la fin de la
        relation commerciale pour respecter nos obligations comptables et fiscales.
      </p>

      <h2>Destinataires</h2>
      <p>
        Les données sont uniquement destinées à l&apos;équipe Linge Serein. Aucune donnée n&apos;est
        revendue. Des sous-traitants techniques peuvent y avoir accès (hébergeur Vercel, service
        d&apos;email transactionnel) dans le cadre strict de leur prestation.
      </p>

      <h2>Vos droits</h2>
      <p>Conformément au RGPD, vous disposez d&apos;un droit :</p>
      <ul>
        <li>d&apos;accès, de rectification et d&apos;effacement de vos données ;</li>
        <li>de limitation et d&apos;opposition au traitement ;</li>
        <li>à la portabilité de vos données ;</li>
        <li>de définir des directives post-mortem.</li>
      </ul>
      <p>
        Pour exercer ces droits, écrivez-nous à{" "}
        <a href="mailto:lingeserein@gmail.com">lingeserein@gmail.com</a>. Vous pouvez également
        introduire une réclamation auprès de la <a href="https://www.cnil.fr">CNIL</a>.
      </p>

      <h2>Cookies</h2>
      <p>
        Le site n&apos;utilise{" "}
        <strong>aucun cookie de mesure d&apos;audience ni publicitaire</strong> soumis à
        consentement. Seuls des cookies techniques strictement nécessaires au fonctionnement peuvent
        être déposés.
      </p>

      <h2>Sécurité</h2>
      <p>
        Nous mettons en œuvre des mesures techniques et organisationnelles pour protéger vos données
        : transmission chiffrée HTTPS, accès limité, sauvegardes régulières.
      </p>
    </LegalPage>
  );
}
