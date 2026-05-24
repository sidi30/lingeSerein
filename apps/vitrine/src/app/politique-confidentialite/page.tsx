import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  description: "Politique de confidentialité et gestion des données personnelles — Linge Serein.",
  robots: { index: true, follow: true },
};

export default function PolitiqueConfidentialite() {
  return (
    <LegalPage title="Politique de confidentialité" updatedAt="22 mai 2026">
      <p>
        La présente politique décrit la manière dont <strong>Linge Serein</strong> collecte, utilise
        et protège les données à caractère personnel, conformément au Règlement Général sur la
        Protection des Données (RGPD — Règlement UE 2016/679) et à la loi n° 78-17 du 6 janvier 1978
        dite « Informatique et Libertés » dans sa version consolidée.
      </p>

      <h2>1. Responsable du traitement</h2>
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
        En tant que micro-entreprise ne traitant ni données sensibles (art. 9 RGPD) ni données à
        grande échelle, Linge Serein n&apos;est pas soumis à l&apos;obligation de désignation
        d&apos;un Délégué à la Protection des Données (DPO). Pour toute question relative à vos
        données, contactez directement l&apos;adresse ci-dessus.
      </p>

      <h2>2. Registre des traitements</h2>
      <p>
        Conformément à l&apos;article 30 du RGPD, Linge Serein tient un registre des activités de
        traitement. Les principaux traitements sont les suivants :
      </p>

      <h3>2.1 Gestion des prospects et demandes de devis</h3>
      <ul>
        <li>
          <strong>Données :</strong> nom, établissement, email, téléphone, message, ville.
        </li>
        <li>
          <strong>Base légale :</strong> consentement (case à cocher du formulaire) et intérêt
          légitime à répondre à une demande commerciale.
        </li>
        <li>
          <strong>Durée :</strong> 3 ans à compter du dernier contact si la relation commerciale ne
          s&apos;engage pas.
        </li>
      </ul>

      <h3>2.2 Exécution des contrats clients</h3>
      <ul>
        <li>
          <strong>Données :</strong> raison sociale, nom du contact, email professionnel, téléphone,
          adresse de livraison, historique des commandes.
        </li>
        <li>
          <strong>Base légale :</strong> exécution du contrat (art. 6.1.b RGPD).
        </li>
        <li>
          <strong>Durée :</strong> durée du contrat + 5 ans (prescription civile — art. 2224 Code
          civil).
        </li>
      </ul>

      <h3>2.3 Facturation et obligations comptables</h3>
      <ul>
        <li>
          <strong>Données :</strong> coordonnées de facturation, montants, références de commandes.
        </li>
        <li>
          <strong>Base légale :</strong> obligation légale (art. L123-22 Code de commerce —
          conservation 10 ans).
        </li>
        <li>
          <strong>Durée :</strong> 10 ans à compter de la clôture de l&apos;exercice.
        </li>
      </ul>

      <h3>2.4 Gestion des livraisons</h3>
      <ul>
        <li>
          <strong>Données :</strong> adresse de livraison, instructions d&apos;accès, nom du
          réceptionnaire, horodatage.
        </li>
        <li>
          <strong>Base légale :</strong> exécution du contrat.
        </li>
        <li>
          <strong>Durée :</strong> 3 ans (traçabilité opérationnelle).
        </li>
      </ul>

      <h3>2.5 Communication commerciale</h3>
      <ul>
        <li>
          <strong>Données :</strong> email professionnel, nom du contact.
        </li>
        <li>
          <strong>Base légale :</strong> intérêt légitime (B2B, produits et services similaires —
          art. L34-5 CPCE et considérant 47 RGPD). Opt-out disponible à tout moment.
        </li>
        <li>
          <strong>Durée :</strong> 3 ans à compter du dernier contact commercial.
        </li>
      </ul>

      <h2>3. Destinataires des données</h2>
      <p>
        Les données traitées sont destinées exclusivement à l&apos;exploitant de Linge Serein. Elles
        ne sont ni vendues, ni louées, ni cédées à des tiers à des fins commerciales.
      </p>
      <p>
        Certains sous-traitants techniques accèdent aux données dans le cadre strict de leur mission
        :
      </p>
      <ul>
        <li>
          <strong>Vercel Inc.</strong> (hébergement du site et de l&apos;infrastructure) — voir
          section Transferts hors UE ci-dessous.
        </li>
        <li>
          <strong>Service d&apos;email transactionnel</strong> (notifications de commandes,
          factures) — prestataire soumis à DPA conforme RGPD.
        </li>
      </ul>
      <p>
        Chaque sous-traitant est lié par un accord de traitement des données (DPA) conformément à
        l&apos;article 28 du RGPD.
      </p>

      <h2>4. Transferts de données hors Union Européenne</h2>
      <p>
        Le site est hébergé par <strong>Vercel Inc.</strong>, société de droit américain dont le
        siège est situé aux États-Unis. Ce transfert implique un traitement de données hors de
        l&apos;Espace Économique Européen (EEE).
      </p>
      <p>
        Ce transfert est encadré par les <strong>Clauses Contractuelles Types (CCT)</strong>{" "}
        adoptées par la Commission Européenne (décision d&apos;exécution 2021/914 du 4 juin 2021),
        conformément à l&apos;article 46.2.c du RGPD. Vercel est également certifié dans le cadre du{" "}
        <strong>Data Privacy Framework UE-États-Unis</strong> (successeur du Privacy Shield).
      </p>
      <p>
        Aucun autre transfert de données hors UE n&apos;est effectué. Si un nouveau sous-traitant
        hors EEE devait être introduit, la présente politique sera mise à jour et les garanties
        appropriées documentées.
      </p>

      <h2>5. Vos droits</h2>
      <p>
        Conformément aux articles 15 à 22 du RGPD, vous disposez des droits suivants sur vos données
        personnelles :
      </p>
      <ul>
        <li>
          <strong>Droit d&apos;accès</strong> (art. 15) : obtenir confirmation du traitement et
          copie des données vous concernant.
        </li>
        <li>
          <strong>Droit de rectification</strong> (art. 16) : corriger des données inexactes ou
          incomplètes.
        </li>
        <li>
          <strong>Droit à l&apos;effacement</strong> (art. 17) : obtenir la suppression de vos
          données, sauf obligation légale de conservation.
        </li>
        <li>
          <strong>Droit à la limitation</strong> (art. 18) : restreindre temporairement un
          traitement en cas de litige sur les données.
        </li>
        <li>
          <strong>Droit à la portabilité</strong> (art. 20) : recevoir vos données dans un format
          structuré et lisible par machine, pour les traitements fondés sur le consentement ou
          l&apos;exécution du contrat.
        </li>
        <li>
          <strong>Droit d&apos;opposition</strong> (art. 21) : vous opposer à tout moment à un
          traitement fondé sur l&apos;intérêt légitime, notamment à des fins de prospection
          commerciale.
        </li>
        <li>
          <strong>Retrait du consentement</strong> (art. 7.3) : retirer votre consentement à tout
          moment, sans affecter la licéité des traitements antérieurs.
        </li>
        <li>
          <strong>Directives post-mortem</strong> (loi Informatique et Libertés, art. 85) : définir
          des instructions relatives au sort de vos données après votre décès.
        </li>
      </ul>
      <p>
        Pour exercer ces droits, adressez votre demande à{" "}
        <a href="mailto:lingeserein@gmail.com">lingeserein@gmail.com</a> en indiquant votre
        identité. Réponse sous <strong>30 jours calendaires</strong>. En cas de demande complexe ou
        nombreuse, ce délai peut être prolongé de 2 mois supplémentaires avec notification motivée.
      </p>
      <p>
        En cas de réponse insatisfaisante, vous pouvez introduire une réclamation auprès de la{" "}
        <strong>Commission Nationale de l&apos;Informatique et des Libertés (CNIL)</strong> :{" "}
        <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer">
          www.cnil.fr
        </a>{" "}
        ou par courrier : CNIL, 3 place de Fontenoy — TSA 80715 — 75334 Paris Cedex 07.
      </p>

      <h2>6. Cookies et traceurs</h2>
      <p>
        Le site{" "}
        <strong>
          n&apos;utilise aucun cookie de mesure d&apos;audience, de ciblage publicitaire, ou de
          réseau social
        </strong>{" "}
        soumis au consentement préalable (art. 82 de la loi Informatique et Libertés).
      </p>
      <p>
        Seuls les cookies strictement nécessaires au fonctionnement technique du site peuvent être
        déposés :
      </p>
      <ul>
        <li>Cookie de session Next.js (sécurité CSRF, navigation).</li>
        <li>Préférences d&apos;affichage (non lié à un identifiant individuel).</li>
      </ul>
      <p>
        Ces cookies étant exemptés de consentement (recommandation CNIL du 17 septembre 2020),
        aucune bannière de consentement n&apos;est requise. Si des outils analytiques venaient à
        être ajoutés, la politique sera mise à jour et un mécanisme de consentement déployé.
      </p>

      <h2>7. Sécurité des données</h2>
      <p>
        Linge Serein met en œuvre des mesures techniques et organisationnelles appropriées pour
        protéger vos données contre tout accès non autorisé, perte, destruction ou altération :
      </p>
      <ul>
        <li>
          <strong>Chiffrement en transit :</strong> toutes les communications sont chiffrées via
          HTTPS/TLS 1.3.
        </li>
        <li>
          <strong>Accès limité :</strong> seul l&apos;exploitant de Linge Serein accède aux données
          opérationnelles.
        </li>
        <li>
          <strong>Sauvegardes :</strong> sauvegardes régulières avec conservation chiffrée.
        </li>
        <li>
          <strong>Mots de passe :</strong> gestion sécurisée via gestionnaire de mots de passe,
          authentification à deux facteurs sur les comptes critiques.
        </li>
      </ul>

      <h2>8. Violation de données</h2>
      <p>
        En cas de violation de données susceptible d&apos;engendrer un risque pour les droits et
        libertés des personnes concernées, Linge Serein s&apos;engage à :
      </p>
      <ul>
        <li>
          Notifier la <strong>CNIL</strong> dans les <strong>72 heures</strong> suivant la prise de
          connaissance (art. 33 RGPD).
        </li>
        <li>
          Informer les personnes concernées <strong>dans les meilleurs délais</strong> si la
          violation est susceptible d&apos;engendrer un risque élevé (art. 34 RGPD).
        </li>
        <li>
          Documenter la violation dans un registre interne, même si la notification CNIL n&apos;est
          pas requise.
        </li>
      </ul>

      <h2>9. Modification de la politique</h2>
      <p>
        La présente politique peut être modifiée à tout moment pour refléter des évolutions légales,
        réglementaires ou opérationnelles. La date de mise à jour est indiquée en haut de page. En
        cas de modification substantielle affectant des traitements en cours, les personnes
        concernées seront informées par email avec un délai raisonnable avant entrée en vigueur.
      </p>
    </LegalPage>
  );
}
