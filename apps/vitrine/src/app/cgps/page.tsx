import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Conditions générales de prestation de service",
  description:
    "Conditions générales de prestation de service de location et entretien de linge hôtelier — Linge Serein.",
  alternates: { canonical: "https://lingeserein.fr/cgps" },
  robots: { index: true, follow: true },
};

export default function CGPS() {
  return (
    <LegalPage title="Conditions générales de prestation de service" updatedAt="22 mai 2026">
      <p>
        Les présentes conditions générales de prestation de service (CGPS) définissent les modalités
        techniques, hygiéniques et opérationnelles des prestations réalisées par{" "}
        <strong>Linge Serein</strong> (ci-après « le Prestataire ») auprès de ses clients
        professionnels (ci-après « le Client »). Elles complètent les{" "}
        <a href="/cgv">Conditions Générales de Vente (CGV)</a> et en font partie intégrante. En cas
        de contradiction, les CGV prévalent.
      </p>

      <h2>1. Objet</h2>
      <p>
        Les présentes CGPS encadrent l&apos;ensemble du cycle de service de linge hôtelier :
        collecte du linge sale, traitement en blanchisserie (lavage, séchage, repassage, pliage),
        contrôle qualité, conditionnement et livraison du linge propre au Client.
      </p>

      <h2>2. Protocole hygiénique — conformité RABC / EN 14065</h2>
      <p>
        Linge Serein applique les principes de la norme <strong>NF EN 14065</strong> (Textiles
        traités en blanchisserie — Système de maîtrise de la biocontamination) dans son processus de
        traitement, afin de garantir la sécurité microbiologique du linge livré.
      </p>
      <p>Ce protocole comprend notamment :</p>
      <ul>
        <li>
          <strong>Séparation stricte</strong> des flux linge sale / linge propre à toutes les étapes
          (collecte, transport, traitement, livraison).
        </li>
        <li>
          <strong>Lavage à température adaptée</strong> selon la nature du linge (60 °C minimum pour
          le linge de lit et de bain, conformément aux recommandations HCSP pour les établissements
          d&apos;hébergement).
        </li>
        <li>
          <strong>Produits lessiviels et désinfectants</strong> agréés, conformes à la
          réglementation biocides (Règlement UE 528/2012).
        </li>
        <li>
          <strong>Conditionnement protecteur</strong> du linge propre (housses, emballages fermés)
          garantissant l&apos;absence de recontamination jusqu&apos;à la livraison.
        </li>
        <li>
          <strong>Nettoyage et désinfection réguliers</strong> des véhicules de transport selon un
          plan de nettoyage documenté.
        </li>
      </ul>
      <p>
        Le Client est informé que les produits utilisés peuvent varier selon les gammes. Sur demande
        écrite, Linge Serein communique les fiches de données de sécurité (FDS) des produits
        utilisés, notamment en cas d&apos;allergie signalée par les occupants.
      </p>

      <h2>3. Conditionnement du linge sale par le Client</h2>
      <p>
        Pour garantir l&apos;hygiène des équipes de collecte et la qualité du traitement, le Client
        s&apos;engage à :
      </p>
      <ul>
        <li>
          Rassembler le linge sale dans des <strong>sacs fermés</strong> (sacs fournis par Linge
          Serein ou sacs de couleur claire de taille standard). Aucun linge vrac ni en tas ne sera
          collecté.
        </li>
        <li>
          <strong>Ne pas mélanger</strong> le linge de lit, le linge de bain et les torchons dans un
          même sac.
        </li>
        <li>
          Signaler explicitement (étiquette ou note) tout linge présentant une contamination
          biologique particulière (vomissures, sang, matières fécales) afin d&apos;appliquer un
          traitement renforcé.
        </li>
        <li>
          Vider les poches et retirer tout objet personnel (bijoux, argent, téléphones) avant mise
          en sac. Linge Serein décline toute responsabilité pour les objets trouvés dans le linge
          collecté, qui seront restitués sur signalement ou détruits après 30 jours si non réclamés.
        </li>
        <li>
          Déposer le linge dans un <strong>espace accessible</strong> au moment de la collecte
          (réception, local dédié, garage). À défaut d&apos;accès, la collecte est reportée et
          facturée comme une tournée infructueuse si non signalée 24 h à l&apos;avance.
        </li>
      </ul>

      <h2>4. Traçabilité du linge</h2>
      <p>
        Chaque lot de linge confié fait l&apos;objet d&apos;un <strong>bon de collecte</strong>{" "}
        remis au Client lors de chaque enlèvement. Ce bon mentionne le nombre de sacs, la gamme et
        la date de collecte. Il constitue la référence en cas de litige sur les quantités.
      </p>
      <p>
        Linge Serein maintient un inventaire par Client du linge en circulation. Le Client peut
        demander à tout moment un état de son parc via email. En cas d&apos;écart constaté entre le
        stock théorique et le stock physique, un constat contradictoire est établi dans les{" "}
        <strong>5 jours ouvrés</strong>.
      </p>

      <h2>5. Contrôle qualité</h2>
      <p>
        Avant chaque livraison, Linge Serein effectue un contrôle visuel systématique du linge
        traité :
      </p>
      <ul>
        <li>Vérification de la propreté (absence de taches, odeurs).</li>
        <li>Contrôle de l&apos;intégrité (absence de déchirures, accrocs).</li>
        <li>Contrôle du repassage et du pliage selon les standards de la gamme.</li>
        <li>
          Tri et mise en quarantaine du linge ne satisfaisant pas aux critères (traitement
          complémentaire ou remplacement).
        </li>
      </ul>
      <p>
        En cas de défaut de qualité constaté par le Client à la livraison, celui-ci dispose de{" "}
        <strong>24 heures</strong> pour émettre une réserve par email avec photo à l&apos;appui.
        Passé ce délai, la livraison est réputée conforme. Linge Serein s&apos;engage à remédier à
        tout défaut avéré dans un délai de <strong>48 heures ouvrées</strong> (remplacement ou
        retraitement sans frais supplémentaires).
      </p>

      <h2>6. Niveaux de service (SLA)</h2>
      <ul>
        <li>
          <strong>Délai de traitement standard :</strong> 48 heures ouvrées entre collecte du linge
          sale et livraison du linge propre.
        </li>
        <li>
          <strong>Délai express (sur demande) :</strong> 24 heures ouvrées, sous réserve de
          disponibilité et majoré de 30 % sur le tarif standard.
        </li>
        <li>
          <strong>Disponibilité du service :</strong> du lundi au vendredi (hors jours fériés), avec
          possibilité de collecte le samedi sur abonnement et selon planning communiqué.
        </li>
        <li>
          <strong>Taux de service cible :</strong> Linge Serein s&apos;engage à respecter les délais
          dans <strong>95 % des cas</strong> sur une période mensuelle glissante.
        </li>
      </ul>

      <h2>7. Obligations du Client</h2>
      <p>Le Client s&apos;engage à :</p>
      <ul>
        <li>
          Respecter scrupuleusement le protocole de conditionnement décrit à l&apos;article 3.
        </li>
        <li>
          Informer Linge Serein de toute modification de volume prévisible (saison haute, événement)
          avec un préavis de <strong>7 jours</strong> afin d&apos;ajuster les tournées.
        </li>
        <li>
          Signaler toute absence prévue (fermeture de l&apos;établissement, congés) avec un préavis
          d&apos;au moins <strong>48 heures</strong>.
        </li>
        <li>
          Fournir un accès sûr pour les livraisons et collectes, et désigner un référent joignable
          en cas de besoin.
        </li>
        <li>
          Ne pas utiliser de produits chimiques agressifs (eau de Javel non diluée, solvants,
          peroxyde concentré) directement sur le linge loué, sous peine d&apos;engager sa
          responsabilité au titre du barème de dégradation des CGV.
        </li>
      </ul>

      <h2>8. Gestion des litiges qualité</h2>
      <p>
        Toute réclamation qualité doit être adressée par email à{" "}
        <a href="mailto:lingeserein@gmail.com">lingeserein@gmail.com</a> avec :
      </p>
      <ul>
        <li>Le numéro du bon de livraison concerné.</li>
        <li>Une description précise du défaut constaté.</li>
        <li>Des photographies datées du linge incriminé.</li>
      </ul>
      <p>
        Linge Serein accuse réception sous <strong>24 heures</strong> et propose une solution
        (remplacement, avoir, retraitement) sous <strong>3 jours ouvrés</strong>. En cas de
        désaccord persistant, les parties recourent à la procédure de médiation prévue dans les CGV.
      </p>

      <h2>9. Signalement d&apos;incidents hygiéniques</h2>
      <p>
        En cas de signalement par le Client d&apos;une réaction allergique ou dermatologique
        potentiellement liée au linge, Linge Serein s&apos;engage à :
      </p>
      <ul>
        <li>Retirer immédiatement le lot concerné de la circulation.</li>
        <li>Communiquer les fiches de données de sécurité des produits utilisés.</li>
        <li>Collaborer avec toute autorité sanitaire compétente si nécessaire.</li>
      </ul>
      <p>
        Le Client s&apos;engage de son côté à signaler tout incident à Linge Serein dans les plus
        brefs délais, et à ne pas diffuser publiquement d&apos;accusations non fondées avant la
        clôture de l&apos;enquête contradictoire.
      </p>

      <h2>10. Confidentialité opérationnelle</h2>
      <p>
        Linge Serein s&apos;engage à traiter avec confidentialité toute information communiquée par
        le Client dans le cadre de la prestation (planning d&apos;occupation, données
        d&apos;exploitation, nom des occupants). Ces informations ne seront ni divulguées à des
        tiers, ni utilisées à d&apos;autres fins que l&apos;exécution du contrat, conformément à
        notre <a href="/politique-confidentialite">politique de confidentialité</a>.
      </p>

      <h2>11. Évolution des conditions</h2>
      <p>
        Linge Serein peut modifier les présentes CGPS pour adapter les protocoles aux évolutions
        réglementaires (sanitaires, environnementales) ou opérationnelles. Toute modification
        substantielle est notifiée au Client par email avec un préavis de <strong>30 jours</strong>.
        La poursuite de la relation commerciale vaut acceptation des nouvelles conditions.
      </p>

      <h2>12. Droit applicable</h2>
      <p>
        Les présentes CGPS sont soumises au <strong>droit français</strong>. Tout litige est régi
        par les dispositions des CGV.
      </p>
    </LegalPage>
  );
}
