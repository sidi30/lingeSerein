import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Conditions générales de vente",
  description:
    "Conditions générales de vente du service de location et entretien de linge — Linge Serein.",
  robots: { index: true, follow: true },
};

export default function CGV() {
  return (
    <LegalPage title="Conditions générales de vente" updatedAt="14 mai 2026">
      <p>
        Les présentes conditions générales de vente (CGV) régissent les relations contractuelles
        entre <strong>Linge Serein</strong> et ses clients professionnels (hôteliers, gîtes,
        résidences, propriétaires Airbnb). Elles prévalent sur toute autre condition d&apos;achat
        sauf accord écrit contraire.
      </p>

      <h2>1. Objet</h2>
      <p>
        Linge Serein propose un service de location et d&apos;entretien (lavage, repassage, pliage,
        livraison) de linge hôtelier dans le Vaucluse, selon trois gammes (Confort, Hôtel,
        Prestige).
      </p>

      <h2>2. Commande</h2>
      <p>
        Toute commande implique l&apos;acceptation sans réserve des présentes CGV. Une commande
        devient ferme après validation écrite du devis par le client (email ou bon de commande
        signé).
      </p>

      <h2>3. Tarifs</h2>
      <p>
        Les tarifs en vigueur sont ceux affichés sur <a href="/#tarifs">la page tarifs</a> à la date
        de commande. Tarifs HT, hors taxes applicables. Les frais de livraison sont offerts à partir
        de 4 sets ou en formule d&apos;abonnement.
      </p>

      <h2>4. Livraison</h2>
      <p>
        Les livraisons sont assurées en propre par Linge Serein dans tout le Vaucluse. Délai de
        livraison maximal : <strong>48 heures ouvrées</strong> à compter de la confirmation de
        commande, sauf circonstance exceptionnelle.
      </p>

      <h2>5. Conditions d&apos;utilisation du linge</h2>
      <p>Le linge fourni reste la propriété de Linge Serein. Le client s&apos;engage à :</p>
      <ul>
        <li>Utiliser le linge uniquement dans le cadre de son activité d&apos;hébergement.</li>
        <li>
          Signaler toute dégradation anormale (taches indélébiles, brûlures, déchirures) qui pourra
          être facturée selon barème.
        </li>
        <li>Restituer l&apos;intégralité du linge à chaque collecte.</li>
      </ul>

      <h2>6. Facturation et paiement</h2>
      <p>
        Les factures sont émises mensuellement. Paiement à 30 jours fin de mois par virement. Tout
        retard de paiement entraîne de plein droit l&apos;application d&apos;intérêts au taux de la
        BCE majoré de 10 points, ainsi qu&apos;une indemnité forfaitaire de recouvrement de 40 €
        (art. L441-10 et D441-5 du Code de commerce).
      </p>

      <h2>7. Durée et résiliation</h2>
      <p>
        Les commandes ponctuelles sont sans engagement. Les abonnements sont mensuels, résiliables à
        tout moment avec un préavis de 30 jours par lettre recommandée ou email avec accusé de
        réception.
      </p>

      <h2>8. Responsabilité</h2>
      <p>
        Linge Serein s&apos;engage à une obligation de moyens. Sa responsabilité ne saurait être
        engagée en cas de force majeure (intempéries, grève, panne véhicule, etc.) ni pour les
        dommages indirects subis par le client.
      </p>

      <h2>9. Données personnelles</h2>
      <p>
        Le traitement des données est régi par notre{" "}
        <a href="/politique-confidentialite">politique de confidentialité</a>.
      </p>

      <h2>10. Droit applicable et litiges</h2>
      <p>
        Les présentes CGV sont soumises au <strong>droit français</strong>. En cas de litige et
        après tentative de résolution amiable, compétence exclusive est attribuée au{" "}
        <strong>Tribunal de Commerce d&apos;Avignon</strong>.
      </p>
    </LegalPage>
  );
}
