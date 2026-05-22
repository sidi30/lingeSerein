import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Conditions générales de vente",
  description:
    "Conditions générales de vente du service de location et entretien de linge hôtelier — Linge Serein.",
  robots: { index: true, follow: true },
};

export default function CGV() {
  return (
    <LegalPage title="Conditions générales de vente" updatedAt="22 mai 2026">
      <p>
        Les présentes conditions générales de vente (CGV) régissent l&apos;ensemble des relations
        contractuelles entre <strong>Linge Serein</strong> (ci-après « le Prestataire ») et ses
        clients professionnels (hôteliers, exploitants de gîtes, chambres d&apos;hôtes,
        propriétaires en location saisonnière, résidences de tourisme — ci-après « le Client »).
        Elles prévalent sur toute condition d&apos;achat du Client sauf accord écrit contraire signé
        par le Prestataire.
      </p>
      <p>
        Toute passation de commande vaut acceptation sans réserve des présentes CGV ainsi que des{" "}
        <a href="/cgps">Conditions Générales de Prestation de Service (CGPS)</a>.
      </p>

      <h2>1. Objet et champ d&apos;application</h2>
      <p>
        Linge Serein propose un service B2B de <strong>location</strong>, <strong>entretien</strong>{" "}
        (lavage, séchage, repassage, pliage) et <strong>livraison</strong> de linge hôtelier dans le
        Vaucluse (84), selon trois gammes :
      </p>
      <ul>
        <li>
          <strong>Confort</strong> — usage standard, entretien hebdomadaire.
        </li>
        <li>
          <strong>Hôtel</strong> — qualité hôtellerie 3 étoiles, finitions soignées.
        </li>
        <li>
          <strong>Prestige</strong> — linge haut de gamme, conditionnement premium.
        </li>
      </ul>
      <p>Les présentes CGV s&apos;appliquent aux commandes ponctuelles comme aux abonnements.</p>

      <h2>2. Formation du contrat</h2>
      <p>
        Toute commande ou abonnement est précédé d&apos;un devis émis par Linge Serein, valable{" "}
        <strong>30 jours</strong> à compter de sa date d&apos;émission. Le contrat est formé à la
        réception par Linge Serein du devis signé ou d&apos;un email d&apos;acceptation express du
        Client. Aucune commande verbale ne peut engager le Prestataire.
      </p>
      <p>
        Pour les abonnements, un <strong>bon de commande initial</strong> précisant la gamme, le
        volume estimé de sets, la fréquence de livraison et l&apos;adresse d&apos;intervention est
        obligatoire.
      </p>

      <h2>3. Tarifs et révision des prix</h2>
      <p>
        Les tarifs applicables sont ceux en vigueur au jour de la commande, tels qu&apos;affichés
        sur <a href="/#tarifs">la page tarifs</a> du site. Ils sont exprimés{" "}
        <strong>hors taxes (HT)</strong> ; la TVA au taux légal en vigueur s&apos;y ajoute.
      </p>
      <p>
        Les frais de livraison sont <strong>offerts</strong> à partir de 4 sets par commande ou pour
        tout abonnement actif. En deçà, un forfait de déplacement de <strong>8 € HT</strong> est
        appliqué.
      </p>
      <p>
        Les tarifs d&apos;abonnement peuvent être révisés une fois par an, au 1er janvier, avec un
        préavis de <strong>60 jours</strong> par email. En cas de refus du Client, celui-ci peut
        résilier son abonnement sans pénalité dans un délai de 30 jours suivant la notification.
      </p>

      <h2>4. Livraison et collecte</h2>
      <p>
        Linge Serein assure la livraison du linge propre et la collecte du linge sale dans tout le
        Vaucluse selon la <a href="/zone-de-livraison">zone de livraison</a>. Les tournées sont
        organisées selon un planning communiqué au Client lors de la prise de commande.
      </p>
      <p>
        Le délai de traitement est de <strong>48 heures ouvrées</strong> entre la collecte du linge
        sale et la livraison du linge propre, sauf circonstance exceptionnelle dûment notifiée. En
        cas de retard supérieur à 24 heures par rapport au délai contractuel, le Client peut
        demander un avoir correspondant à 10 % de la facturation du cycle concerné.
      </p>
      <p>
        La livraison est réputée effectuée dès la remise du linge propre à une personne habilitée
        sur site ou dans le contenant désigné. Toute réserve sur la livraison doit être formulée{" "}
        <strong>dans les 24 heures</strong> par email.
      </p>

      <h2>5. Réserve de propriété</h2>
      <p>
        Le linge mis à disposition reste en toutes circonstances la{" "}
        <strong>propriété exclusive de Linge Serein</strong> (article 2367 du Code civil). Le Client
        n&apos;acquiert aucun droit de propriété, même partiel, sur le linge loué. Cette réserve
        subsiste jusqu&apos;au paiement intégral de toutes les sommes dues.
      </p>
      <p>
        En cas de procédure collective (redressement ou liquidation judiciaire), Linge Serein se
        réserve le droit de revendiquer le linge en nature dans les conditions prévues par le Code
        de commerce.
      </p>

      <h2>6. Obligations et usage du linge par le Client</h2>
      <p>Le Client s&apos;engage à :</p>
      <ul>
        <li>
          Utiliser le linge <strong>exclusivement</strong> dans le cadre de son activité
          d&apos;hébergement déclarée.
        </li>
        <li>
          Ne pas sous-louer, céder ou prêter le linge à des tiers sans accord écrit du Prestataire.
        </li>
        <li>
          Conditionner le linge sale dans des sacs fermés fournis ou agréés par Linge Serein,
          conformément au protocole décrit dans les CGPS.
        </li>
        <li>
          Signaler <strong>immédiatement</strong> toute dégradation ou perte constatée avant la
          collecte, par email ou WhatsApp.
        </li>
        <li>
          Restituer la totalité du linge confié à chaque collecte. Tout article non restitué sans
          justification est considéré comme perdu.
        </li>
      </ul>

      <h2>7. Barème de dégradation et pertes</h2>
      <p>
        Toute dégradation anormale (hors usure normale liée à l&apos;entretien standard) ou perte de
        linge sera facturée au Client selon le barème suivant, modulé selon l&apos;ancienneté de
        l&apos;article :
      </p>
      <ul>
        <li>
          <strong>Linge neuf (0–6 mois)</strong> : 100 % du prix de remplacement catalogue.
        </li>
        <li>
          <strong>Linge récent (6–18 mois)</strong> : 70 % du prix de remplacement catalogue.
        </li>
        <li>
          <strong>Linge standard (&gt; 18 mois)</strong> : 40 % du prix de remplacement catalogue.
        </li>
      </ul>
      <p>Types de dégradations facturables (liste non exhaustive) :</p>
      <ul>
        <li>Taches indélébiles (autobronzant, décolorant, peinture, huile moteur…).</li>
        <li>Brûlures (cigarettes, fer à repasser).</li>
        <li>Déchirures, découpes ou perforations volontaires.</li>
        <li>Disparition totale de l&apos;article.</li>
        <li>Dégradations par produits chimiques non conformes.</li>
      </ul>
      <p>
        L&apos;usure normale (jaunissement léger, petites pilules de coton, élasticité réduite)
        n&apos;est pas facturée. Linge Serein établit un constat contradictoire en cas de litige sur
        la qualification de la dégradation.
      </p>

      <h2>8. Facturation et paiement</h2>
      <p>
        Les factures sont émises <strong>mensuellement</strong> (ou à la fin de chaque commande
        ponctuelle), par email. Elles récapitulent l&apos;ensemble des prestations réalisées et du
        linge manquant ou dégradé.
      </p>
      <p>
        Paiement exigible à <strong>30 jours fin de mois</strong> par virement bancaire sur le
        compte indiqué sur la facture. Aucun escompte pour paiement anticipé, sauf accord
        spécifique.
      </p>
      <p>Tout retard de paiement entraîne de plein droit, sans mise en demeure préalable :</p>
      <ul>
        <li>
          Des intérêts de retard au taux directeur de la Banque Centrale Européenne (BCE) majoré de{" "}
          <strong>10 points</strong> par an (art. L441-10 du Code de commerce).
        </li>
        <li>
          Une indemnité forfaitaire de recouvrement de <strong>40 €</strong> (art. D441-5 du Code de
          commerce), sans préjudice de toute demande de dommages-intérêts supplémentaires si les
          frais de recouvrement réels sont supérieurs.
        </li>
      </ul>
      <p>
        En cas de non-paiement persistant au-delà de <strong>60 jours</strong>, Linge Serein se
        réserve le droit de suspendre toute prestation en cours sans préavis et de procéder à la
        récupération immédiate du linge mis à disposition.
      </p>

      <h2>9. Durée, renouvellement et résiliation</h2>
      <p>
        <strong>Commandes ponctuelles :</strong> sans engagement, valables pour la commande
        concernée.
      </p>
      <p>
        <strong>Abonnements :</strong> conclus pour une durée initiale d&apos;un mois, renouvelables
        tacitement par mois. Chaque partie peut résilier l&apos;abonnement avec un préavis de{" "}
        <strong>30 jours calendaires</strong>, notifié par lettre recommandée avec accusé de
        réception ou par email avec accusé de lecture.
      </p>
      <p>Linge Serein peut résilier immédiatement et sans indemnité en cas de :</p>
      <ul>
        <li>Non-paiement persistant après relance formelle.</li>
        <li>Usage anormal ou non conforme du linge.</li>
        <li>Comportement abusif ou frauduleux du Client.</li>
        <li>Ouverture d&apos;une procédure collective à l&apos;encontre du Client.</li>
      </ul>

      <h2>10. Force majeure</h2>
      <p>
        Conformément à l&apos;article 1218 du Code civil, Linge Serein ne saurait être tenu
        responsable d&apos;une inexécution ou d&apos;un retard résultant d&apos;un événement de
        force majeure. Sont notamment considérés comme tels : catastrophe naturelle, épidémie, grève
        générale des transports, panne majeure d&apos;équipement industriel indépendante de la
        volonté du Prestataire, réquisition administrative.
      </p>
      <p>
        Dès que possible, Linge Serein informe le Client par tout moyen de l&apos;événement et de sa
        durée prévisible. Si l&apos;empêchement dure plus de <strong>15 jours</strong>, les deux
        parties peuvent résilier le contrat sans pénalité.
      </p>

      <h2>11. Responsabilité et assurances</h2>
      <p>
        Linge Serein est soumis à une <strong>obligation de moyens</strong>. Sa responsabilité est
        limitée au montant des prestations facturées au cours des 3 derniers mois précédant le
        sinistre. Linge Serein décline toute responsabilité pour les dommages indirects, pertes
        d&apos;exploitation ou manque à gagner subis par le Client.
      </p>
      <p>
        Linge Serein justifie d&apos;une assurance{" "}
        <strong>responsabilité civile professionnelle</strong> couvrant les risques liés à son
        activité. Le Client s&apos;engage à maintenir une assurance multirisque couvrant les
        dommages causés au linge mis à sa disposition.
      </p>

      <h2>12. Cession et sous-traitance</h2>
      <p>
        Le Client ne peut céder tout ou partie de ses droits et obligations issus du présent contrat
        sans accord écrit préalable de Linge Serein. Linge Serein peut faire appel à des
        sous-traitants pour l&apos;exécution de certaines prestations (blanchisserie industrielle,
        transports), sous sa responsabilité.
      </p>

      <h2>13. Données personnelles</h2>
      <p>
        Le traitement des données à caractère personnel du Client (coordonnées, données de
        facturation) est régi par notre{" "}
        <a href="/politique-confidentialite">politique de confidentialité</a>, conforme au RGPD.
      </p>

      <h2>14. Droit applicable et règlement des litiges</h2>
      <p>
        Les présentes CGV sont soumises au <strong>droit français</strong>. En cas de litige, les
        parties s&apos;engagent à rechercher une solution amiable dans un délai de 30 jours. À
        défaut d&apos;accord, compétence exclusive est attribuée au{" "}
        <strong>Tribunal de Commerce d&apos;Avignon (84)</strong>, même en cas de pluralité de
        défendeurs ou d&apos;appel en garantie.
      </p>
    </LegalPage>
  );
}
