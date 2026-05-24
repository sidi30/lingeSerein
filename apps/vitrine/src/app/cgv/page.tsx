import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Conditions générales de vente et de location",
  description:
    "Conditions générales de vente et de location — Linge Serein, location et entretien de linge de bain et de lit.",
  robots: { index: true, follow: true },
};

export default function CGV() {
  return (
    <LegalPage title="Conditions générales de vente et de location" updatedAt="24 mai 2026">
      <p>
        <strong>Linge Serein</strong> — Location &amp; entretien de linge de bain et de lit
        <br />
        Rayana MAHAMAN MOUSTAPHA — Micro-entreprise
        <br />
        Rue Simone Weil — 84100 Orange
        <br />
        Téléphone : <a href="tel:+33753569548">07 53 56 95 48</a> | Email :{" "}
        <a href="mailto:lingeserein@gmail.com">lingeserein@gmail.com</a>
        <br />
        Zone de livraison : Vaucluse
      </p>

      <h2>Article 1 — Objet</h2>
      <p>
        Les présentes Conditions Générales de Vente et de Location (ci-après les « CGV »)
        définissent les conditions dans lesquelles Linge Serein fournit à ses clients des
        prestations de location, livraison, reprise, entretien et remplacement de linge de bain et
        de lit destiné notamment aux locations de courte durée.
      </p>
      <p>
        Toute commande implique l&apos;acceptation pleine et entière des présentes CGV, sans
        réserve.
      </p>

      <h2>Article 2 — Champ d&apos;application</h2>
      <p>
        Les présentes CGV s&apos;appliquent à toute commande passée auprès de Linge Serein, que le
        Client agisse à titre professionnel ou particulier, par téléphone, message électronique,
        formulaire ou tout autre moyen de commande proposé par le Prestataire.
      </p>
      <p>
        Les CGV prévalent sur tout autre document du Client, sauf accord écrit contraire du
        Prestataire.
      </p>

      <h2>Article 3 — Prestations proposées</h2>
      <p>Linge Serein propose notamment :</p>
      <ul>
        <li>la location de linge de bain ;</li>
        <li>la location de linge de lit ;</li>
        <li>la livraison et la reprise du linge ;</li>
        <li>l&apos;entretien et le traitement du linge ;</li>
        <li>le remplacement des articles détériorés ou manquants.</li>
      </ul>
      <p>
        Le contenu exact des kits, les quantités, les tarifs et les modalités de livraison sont
        communiqués au Client avant validation de la commande.
      </p>

      <h2>Article 4 — Commande</h2>
      <p>
        Toute commande devient ferme dès confirmation par Linge Serein. Le Prestataire se réserve le
        droit de refuser toute commande en cas d&apos;indisponibilité du stock, d&apos;adresse hors
        zone desservie, d&apos;incident de paiement ou de tout autre motif légitime.
      </p>
      <p>
        Le Client est responsable de l&apos;exactitude des informations fournies, notamment
        l&apos;adresse de livraison, les horaires et le nombre de kits commandés.
      </p>

      <h2>Article 5 — Tarifs</h2>
      <p>
        Les tarifs applicables sont ceux en vigueur au jour de la commande, exprimés en euros TTC.
        Ils peuvent être modifiés à tout moment ; le prix facturé est celui confirmé lors de la
        commande.
      </p>

      <table>
        <thead>
          <tr>
            <th>Prestation</th>
            <th>Tarif TTC</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Set bain</td>
            <td>7,50 €</td>
          </tr>
          <tr>
            <td>Set lit</td>
            <td>16,50 €</td>
          </tr>
          <tr>
            <td>Livraison à Orange (dès 4 kits)</td>
            <td>Offerte</td>
          </tr>
          <tr>
            <td>Livraison dès 120 € de commande (alentours)</td>
            <td>Offerte</td>
          </tr>
          <tr>
            <td>Livraison zone proche</td>
            <td>12,00 €</td>
          </tr>
          <tr>
            <td>Livraison zone élargie</td>
            <td>15,00 €</td>
          </tr>
        </tbody>
      </table>

      <h2>Article 6 — Modalités de paiement</h2>
      <p>
        Sauf accord contraire, le paiement est exigible à la commande ou à la livraison. Le
        règlement peut s&apos;effectuer par virement, carte bancaire ou tout autre moyen accepté par
        le Prestataire.
      </p>
      <p>
        En cas de retard ou de défaut de paiement, Linge Serein pourra suspendre la prestation en
        cours ou refuser toute nouvelle commande jusqu&apos;à règlement complet.
      </p>

      <h2>Article 7 — Livraison et reprise</h2>
      <p>
        La livraison et la reprise s&apos;effectuent selon les créneaux convenus avec le Client. Le
        Client s&apos;engage à assurer l&apos;accessibilité du lieu de livraison et de reprise, ou à
        désigner une personne habilitée à réceptionner les articles.
      </p>
      <p>
        Tout retard, absence, impossibilité d&apos;accès ou demande de déplacement supplémentaire
        pourra entraîner une facturation additionnelle.
      </p>
      <p>
        Le linge doit être restitué dans les contenants fournis ou dans un conditionnement
        équivalent propre à faciliter la reprise et le tri.
      </p>

      <h2>Article 8 — Vérification à réception</h2>
      <p>
        Le Client doit vérifier l&apos;état et la conformité du linge dès réception. Toute anomalie,
        article manquant ou détérioré doit être signalé par écrit dans un délai de{" "}
        <strong>24 heures</strong> à compter de la livraison ou de la reprise.
      </p>
      <p>
        À défaut de réclamation dans ce délai, le linge est réputé conforme, sauf preuve contraire
        ou disposition légale impérative.
      </p>

      <h2>Article 9 — Utilisation du linge</h2>
      <p>
        Le linge loué demeure la propriété exclusive de Linge Serein pendant toute la durée de la
        prestation. Le Client s&apos;engage à utiliser le linge conformément à son usage normal, à
        en assurer la garde et à éviter toute manipulation inadaptée.
      </p>
      <p>
        Le Client est responsable du linge depuis sa remise jusqu&apos;à sa restitution effective.
      </p>

      <h2>Article 10 — Dégradations, pertes et remplacement</h2>
      <p>
        Le Client est tenu de restituer les articles loués en bon état d&apos;usage, hors usure
        normale liée à une utilisation conforme et au lavage courant. Toute détérioration, tache
        indélébile, brûlure, déchirure, rétrécissement anormal, disparition ou retour d&apos;un
        article inutilisable pourra donner lieu à facturation selon le barème ci-dessous.
      </p>
      <p>
        La distinction entre usure normale et dégradation est appréciée par le Prestataire au moment
        du retour des articles.
      </p>

      <table>
        <thead>
          <tr>
            <th>Article / dommage</th>
            <th>Facturation</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Petite serviette 30×50 perdue ou inutilisable</td>
            <td>2,50 €</td>
          </tr>
          <tr>
            <td>Serviette 50×90 perdue ou inutilisable</td>
            <td>5,00 €</td>
          </tr>
          <tr>
            <td>Serviette 70×150 perdue ou inutilisable</td>
            <td>9,00 €</td>
          </tr>
          <tr>
            <td>Serviette 90×150 perdue ou inutilisable</td>
            <td>12,00 €</td>
          </tr>
          <tr>
            <td>Tapis de bain perdu ou inutilisable</td>
            <td>8,00 €</td>
          </tr>
          <tr>
            <td>Taie / petite pièce de lit perdue ou inutilisable</td>
            <td>6,00 €</td>
          </tr>
          <tr>
            <td>Housse de couette / drap housse perdu(e) ou inutilisable</td>
            <td>15,00 €</td>
          </tr>
          <tr>
            <td>Kit lit complet perdu ou inutilisable</td>
            <td>29,90 €</td>
          </tr>
          <tr>
            <td>Tache indélébile nécessitant remplacement</td>
            <td>Prix de remplacement de l&apos;article</td>
          </tr>
          <tr>
            <td>Déchirure, brûlure, rétrécissement anormal</td>
            <td>Prix de remplacement de l&apos;article</td>
          </tr>
          <tr>
            <td>Article rendu très sale — traitement renforcé</td>
            <td>5,00 € par kit</td>
          </tr>
          <tr>
            <td>Article non restitué après relance</td>
            <td>Prix de remplacement + frais de gestion</td>
          </tr>
        </tbody>
      </table>

      <p>
        Lorsque la dégradation entraîne un temps de tri, de contrôle ou de remise en état
        exceptionnel, un forfait de traitement complémentaire pourra être appliqué selon la nature
        du dommage.
      </p>

      <h2>Article 11 — Annulation de commande et rétractation</h2>
      <p>
        Le Client peut demander l&apos;annulation de sa commande avant la date de livraison, sous
        réserve de confirmation écrite du Prestataire. Lorsque la commande n&apos;a pas encore été
        préparée, aucun frais d&apos;annulation ne sera appliqué.
      </p>
      <p>
        Si la commande a déjà été préparée, emballée ou planifiée pour une tournée, Linge Serein
        pourra conserver tout ou partie des sommes versées à titre de compensation des frais
        engagés, dans la limite du préjudice réellement subi.
      </p>
      <p>
        Pour les commandes conclues à distance par un consommateur, le droit légal de rétractation
        de <strong>14 jours</strong> s&apos;applique dans les conditions prévues par le Code de la
        consommation, sauf si le Client a demandé l&apos;exécution immédiate de la prestation avec
        son accord exprès.
      </p>
      <p>
        En cas d&apos;annulation tardive (moins de 24 heures avant la livraison prévue) ou
        d&apos;absence au créneau convenu, le Prestataire pourra facturer des frais de préparation
        et de déplacement correspondant aux coûts réellement engagés.
      </p>
      <p>
        En cas d&apos;annulation après livraison, les articles déjà remis seront facturés selon les
        conditions tarifaires applicables.
      </p>
      <p>
        Toute demande d&apos;annulation doit être adressée par écrit à :{" "}
        <a href="mailto:lingeserein@gmail.com">lingeserein@gmail.com</a>. Le Prestataire confirmera
        la prise en compte par retour écrit.
      </p>

      <h2>Article 12 — Réserve de propriété et responsabilité</h2>
      <p>
        Le linge demeure la propriété de Linge Serein jusqu&apos;à sa restitution complète. Le
        Client supporte la responsabilité des pertes, vols, disparitions ou détériorations
        intervenus pendant la période où le linge est sous sa garde, sauf preuve d&apos;une faute
        imputable exclusivement au Prestataire.
      </p>
      <p>
        Le Prestataire ne pourra être tenu responsable des dommages causés par une mauvaise
        utilisation du linge, un usage non conforme ou un stockage inadapté par le Client.
      </p>

      <h2>Article 13 — Réclamations</h2>
      <p>
        Toute réclamation relative à la prestation doit être adressée par écrit dans les meilleurs
        délais et au plus tard dans les <strong>24 heures</strong> suivant la livraison ou la
        reprise. Le Prestataire pourra demander toute preuve utile (photographies, messages ou
        éléments permettant de constater le dommage allégué).
      </p>

      <h2>Article 14 — Force majeure</h2>
      <p>
        Le Prestataire ne pourra être tenu responsable d&apos;un retard ou d&apos;un manquement dans
        l&apos;exécution de ses obligations lorsqu&apos;il résulte d&apos;un événement de force
        majeure, d&apos;un cas fortuit ou de toute cause extérieure indépendante de sa volonté.
      </p>

      <h2>Article 15 — Données personnelles</h2>
      <p>
        Les données personnelles collectées sont utilisées uniquement pour la gestion des commandes,
        la facturation, la livraison, la reprise et le suivi client. Le Client dispose des droits
        prévus par la <a href="/politique-confidentialite">politique de confidentialité</a> conforme
        au RGPD.
      </p>

      <h2>Article 16 — Droit applicable et litiges</h2>
      <p>
        Les présentes CGV sont soumises au <strong>droit français</strong>. En cas de litige, les
        parties rechercheront en priorité une solution amiable. À défaut d&apos;accord amiable, le
        litige sera soumis aux juridictions compétentes conformément aux règles de droit commun.
      </p>

      <h2>Article 17 — Acceptation</h2>
      <p>
        La validation de la commande implique l&apos;acceptation pleine et entière des présentes CGV
        par le Client, qui reconnaît en avoir pris connaissance avant toute commande.
      </p>
    </LegalPage>
  );
}
