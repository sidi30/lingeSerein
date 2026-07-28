import type { PrismaClient } from "@prisma/client";
import { NotFoundError, ForbiddenError, UnprocessableEntityError } from "../utils/errors.js";
import { createAuditLog } from "../utils/audit.js";
import { ROLES } from "@lingengo/shared";

/**
 * Suppressions en cascade et anonymisation.
 *
 * Le ménage dans l'admin traverse tous les domaines (devis, factures, commandes,
 * rotations, abonnement, tournées) : concentrer la cascade ici, plutôt que de la
 * disséminer dans chaque service, garantit qu'il n'existe qu'UN endroit où la
 * règle légale ci-dessous peut être contournée — donc un seul à relire.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * RÈGLE NON NÉGOCIABLE — une facture ÉMISE ne s'efface jamais.
 * ═══════════════════════════════════════════════════════════════════════════
 * Article L123-22 du Code de commerce : les pièces comptables se conservent
 * DIX ANS. Dès qu'un client porte une facture dont le statut n'est plus DRAFT,
 * la cascade est refusée (422 CLIENT_HAS_ISSUED_INVOICES).
 *
 * Il n'existe VOLONTAIREMENT aucun paramètre `force` pour passer outre. Un
 * garde-fou qu'on peut désactiver n'est pas un garde-fou : c'est une case à
 * cocher qu'un admin pressé cochera le jour où il sera pressé. La sortie de
 * secours est `anonymizeUser()`, qui retire le client des listes sans toucher à
 * la comptabilité.
 *
 * Un brouillon (DRAFT) n'est pas une pièce comptable : il n'a jamais été émis,
 * ne porte aucune créance, et se supprime donc librement.
 */

/** Statuts de rotation considérés comme soldés (le linge est rentré ou la rotation est morte). */
const ROTATION_CLOSED = ["REPRISE", "ANNULEE"] as const;

/** Préfixe du pseudonyme. Sert aussi à numéroter les anonymisations suivantes. */
const ANON_PREFIX = "Client anonymisé #";

export interface UserDeletionPreview {
  quotes: { draft: number; other: number };
  invoices: { draft: number; issued: number };
  orders: number;
  rotations: { active: number; closed: number };
  subscription: boolean;
  deliveryStops: number;
  canHardDelete: boolean;
  blockingReason?: string;
}

export interface SubscriptionDeletionPreview {
  subscriptionId: string;
  userId: string;
  status: string;
  rotations: { active: number; closed: number };
  recurringInvoices: number;
  engagement: { committedUntil: Date | null; active: boolean; joursRestants: number };
  canDelete: boolean;
}

export class DeletionService {
  constructor(private readonly prisma: PrismaClient) {}

  // ==========================================================================
  // Aperçu avant suppression d'un client
  // ==========================================================================

  /**
   * Décompte tout ce qu'une suppression en cascade emporterait.
   *
   * Alimente la modale de confirmation : sans ce décompte, l'admin valide à
   * l'aveugle une opération qui touche potentiellement des dizaines de lignes.
   *
   * Les entités sont filtrées sur `userId` seul (et non sur `operatorId`) parce
   * que l'appartenance du client à l'opérateur est déjà vérifiée ci-dessous :
   * tout ce qui pend à ce client appartient par construction au même opérateur.
   * `Order` et `DeliveryStop` n'ont d'ailleurs pas de colonne `operatorId`.
   */
  async previewUser(userId: string, operatorId: string): Promise<UserDeletionPreview> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, operatorId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundError("Utilisateur", userId);
    }

    const [
      quotesDraft,
      quotesOther,
      invoicesDraft,
      invoicesIssued,
      orders,
      rotationsActive,
      rotationsClosed,
      subscription,
      deliveryStops,
    ] = await Promise.all([
      this.prisma.quote.count({ where: { userId, deletedAt: null, status: "BROUILLON" } }),
      this.prisma.quote.count({
        where: { userId, deletedAt: null, status: { not: "BROUILLON" } },
      }),
      this.prisma.invoice.count({ where: { userId, deletedAt: null, status: "DRAFT" } }),
      this.prisma.invoice.count({ where: { userId, deletedAt: null, status: { not: "DRAFT" } } }),
      this.prisma.order.count({ where: { userId, deletedAt: null } }),
      this.prisma.rotation.count({
        where: { userId, deletedAt: null, status: { notIn: [...ROTATION_CLOSED] } },
      }),
      this.prisma.rotation.count({
        where: { userId, deletedAt: null, status: { in: [...ROTATION_CLOSED] } },
      }),
      this.prisma.subscription.count({ where: { userId } }),
      this.prisma.deliveryStop.count({ where: { clientId: userId } }),
    ]);

    const canHardDelete = invoicesIssued === 0;

    return {
      quotes: { draft: quotesDraft, other: quotesOther },
      invoices: { draft: invoicesDraft, issued: invoicesIssued },
      orders,
      rotations: { active: rotationsActive, closed: rotationsClosed },
      subscription: subscription > 0,
      deliveryStops,
      canHardDelete,
      // Le motif est renvoyé tel quel pour que l'interface propose directement
      // l'anonymisation, au lieu d'un « suppression impossible » sans issue.
      ...(canHardDelete ? {} : { blockingReason: "CLIENT_HAS_ISSUED_INVOICES" }),
    };
  }

  // ==========================================================================
  // Suppression en cascade d'un client
  // ==========================================================================

  /**
   * Supprime un client ET tout ce qui en dépend, sauf ses factures émises —
   * dont la seule présence interdit l'opération.
   *
   * Tout passe en soft-delete (`deletedAt`), conformément au reste du projet :
   * une suppression admin doit rester rattrapable. Seul l'abonnement est
   * réellement effacé, faute de colonne `deletedAt` — et parce qu'un abonnement
   * soft-deleté resterait bloquant : `Subscription.userId` est UNIQUE, le client
   * ne pourrait alors plus jamais se réabonner.
   */
  async cascadeDeleteUser(
    userId: string,
    operatorId: string,
    actorId: string,
    actorRole: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    if (userId === actorId) {
      throw new UnprocessableEntityError(
        "Vous ne pouvez pas supprimer votre propre compte",
        "CANNOT_DELETE_SELF",
      );
    }

    // Pas de `deletedAt: null` : `previewUser` ne le filtre pas non plus, et
    // un compte DÉSACTIVÉ est justement celui qu'on veut supprimer. Le filtre
    // faisait réussir l'aperçu puis échouer le DELETE en 404, que l'admin
    // affiche comme « le serveur ne propose pas encore cette route ».
    const target = await this.prisma.user.findFirst({
      where: { id: userId, operatorId },
      select: { id: true, role: true },
    });

    if (!target) {
      throw new NotFoundError("Utilisateur", userId);
    }

    if (target.role === ROLES.SUPER_ADMIN && actorRole !== ROLES.SUPER_ADMIN) {
      throw new ForbiddenError("Vous ne pouvez pas supprimer un Super Admin");
    }

    // ─── Garde-fou légal ───────────────────────────────────────────────────
    // Vérifié JUSTE AVANT d'écrire, pas au moment de l'aperçu : entre l'ouverture
    // de la modale et la validation, une facture a pu être émise.
    const issued = await this.prisma.invoice.count({
      where: { userId, deletedAt: null, status: { not: "DRAFT" } },
    });

    if (issued > 0) {
      throw new UnprocessableEntityError(
        `Ce client porte ${issued} facture(s) émise(s), conservées 10 ans (art. L123-22 C. com.). ` +
          `Anonymisez-le pour le retirer de vos listes sans toucher à la comptabilité.`,
        "CLIENT_HAS_ISSUED_INVOICES",
      );
    }

    const now = new Date();

    // Transaction : une cascade à moitié appliquée laisserait un client actif
    // dont les devis ont disparu — plus incohérent que de ne rien supprimer.
    const deleted = await this.prisma.$transaction(async (tx) => {
      const quotes = await tx.quote.updateMany({
        where: { userId, deletedAt: null },
        data: { deletedAt: now },
      });

      // DRAFT uniquement — la garde ci-dessus assure qu'il n'y a rien d'autre,
      // le filtre reste explicite pour que la requête soit sûre isolément.
      const invoices = await tx.invoice.updateMany({
        where: { userId, deletedAt: null, status: "DRAFT" },
        data: { deletedAt: now },
      });

      const orders = await tx.order.updateMany({
        where: { userId, deletedAt: null },
        data: { deletedAt: now },
      });

      const rotations = await tx.rotation.updateMany({
        where: { userId, deletedAt: null },
        data: { deletedAt: now },
      });

      // Hard delete : `SubscriptionProduct` suit en cascade (onDelete: Cascade).
      const subscription = await tx.subscription.deleteMany({ where: { userId } });

      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });

      // Les jetons push partent aussi : sans cela, un appareil continuerait de
      // recevoir les notifications d'un compte supprimé.
      await tx.deviceToken.deleteMany({ where: { userId } });

      await tx.user.update({
        where: { id: userId },
        data: { deletedAt: now, isActive: false },
      });

      return {
        quotes: quotes.count,
        invoices: invoices.count,
        orders: orders.count,
        rotations: rotations.count,
        subscription: subscription.count > 0,
      };
    });

    // Une cascade DOIT laisser une trace : c'est la seule façon de répondre à
    // « où sont passés les devis de ce client ? » trois mois plus tard.
    await createAuditLog({
      prisma: this.prisma,
      userId: actorId,
      action: "DELETE",
      entity: "User",
      entityId: userId,
      changes: { cascade: true, deleted },
      ipAddress,
      userAgent,
    });

    return { deleted };
  }

  // ==========================================================================
  // Anonymisation (RGPD) — la sortie de secours du cas ci-dessus
  // ==========================================================================

  /**
   * Retire l'identité d'un client sans toucher à sa comptabilité.
   *
   * C'est la réponse au client déjà facturé : le droit à l'effacement (art. 17
   * RGPD) et l'obligation de conservation comptable ne s'annulent pas, ils se
   * concilient — on retire les données nominatives partout où aucune loi
   * n'impose de les garder, et on conserve la pièce comptable intacte.
   *
   * ⚠️ Les snapshots des factures ÉMISES ne sont volontairement PAS anonymisés.
   * Une facture doit nommer son client (mentions obligatoires, art. 242 nonies A
   * ann. II CGI) : effacer `clientNom` la rendrait non conforme, donc inopposable
   * en cas de contrôle. Elles sont recomptées et renvoyées dans `preserved` pour
   * que l'admin sache exactement ce qui reste nominatif — et pourquoi.
   * Les brouillons, eux, ne sont pas des pièces comptables : ils sont anonymisés.
   */
  async anonymizeUser(
    userId: string,
    operatorId: string,
    actorId: string,
    actorRole: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    if (userId === actorId) {
      throw new UnprocessableEntityError(
        "Vous ne pouvez pas anonymiser votre propre compte",
        "CANNOT_ANONYMIZE_SELF",
      );
    }

    // Pas de filtre `deletedAt` : un client déjà désactivé doit rester
    // anonymisable, c'est même le cas le plus courant.
    const target = await this.prisma.user.findFirst({
      where: { id: userId, operatorId },
      select: { id: true, role: true, name: true },
    });

    if (!target) {
      throw new NotFoundError("Utilisateur", userId);
    }

    if (target.role === ROLES.SUPER_ADMIN && actorRole !== ROLES.SUPER_ADMIN) {
      throw new ForbiddenError("Vous ne pouvez pas anonymiser un Super Admin");
    }

    if (target.name.startsWith(ANON_PREFIX)) {
      throw new UnprocessableEntityError("Ce client est déjà anonymisé", "ALREADY_ANONYMIZED");
    }

    const pseudonyme = `${ANON_PREFIX}${await this.nextAnonymousNumber(operatorId)}`;
    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          name: pseudonyme,
          email: null,
          // OBLIGATOIRE avec `email: null` : la contrainte
          // `users_password_requires_email` (CHECK password_hash IS NULL OR
          // email IS NOT NULL) rejetterait sinon la transaction entière. Sans
          // email il n'y a de toute façon plus aucun moyen de se connecter.
          passwordHash: null,
          phone: null,
          address: null,
          companyName: null,
          city: null,
          postalCode: null,
          // Notes et exigences sont saisies en clair par l'admin : elles
          // contiennent presque toujours de quoi réidentifier la personne.
          notes: null,
          requirements: null,
          stripeCustomerId: null,
          deliveryPin: null,
          mfaSecret: null,
          mfaRecoveryCodes: null,
          mfaEnabled: false,
          isActive: false,
          deletedAt: now,
        },
      });

      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });

      await tx.deviceToken.deleteMany({ where: { userId } });

      // Snapshots nominatifs — un devis ou une rotation n'a aucune obligation
      // de conservation nominative.
      const quotes = await tx.quote.updateMany({
        where: { userId },
        data: { clientNom: pseudonyme, clientEmail: null, clientTel: null, clientAdresse: null },
      });

      const rotations = await tx.rotation.updateMany({
        where: { userId },
        data: { clientNom: pseudonyme, clientEmail: null, clientAdresse: null },
      });

      const invoicesAnonymized = await tx.invoice.updateMany({
        where: { userId, status: "DRAFT" },
        data: { clientNom: pseudonyme, clientEmail: null, clientAdresse: null },
      });

      const preserved = await tx.invoice.count({
        where: { userId, status: { not: "DRAFT" } },
      });

      return {
        quotes: quotes.count,
        rotations: rotations.count,
        invoices: { anonymized: invoicesAnonymized.count, preserved },
      };
    });

    await createAuditLog({
      prisma: this.prisma,
      userId: actorId,
      action: "UPDATE",
      entity: "User",
      entityId: userId,
      // Aucune donnée personnelle : on trace le geste, pas ce qu'il a effacé.
      changes: { anonymized: true, ...result },
      ipAddress,
      userAgent,
    });

    return { id: userId, name: pseudonyme, ...result };
  }

  /**
   * Numéro du prochain pseudonyme.
   *
   * Simple compteur : deux anonymisations simultanées produiraient le même
   * numéro. C'est assumé — le pseudonyme est une ÉTIQUETTE d'affichage, jamais
   * une clé ; un doublon n'a aucune conséquence, et le geste est manuel.
   */
  private async nextAnonymousNumber(operatorId: string): Promise<number> {
    const deja = await this.prisma.user.count({
      where: { operatorId, name: { startsWith: ANON_PREFIX } },
    });
    return deja + 1;
  }

  // ==========================================================================
  // Abonnements
  // ==========================================================================

  /**
   * Impact de la suppression d'un abonnement.
   *
   * `Rotation` ne porte pas de `subscriptionId` : le rattachement se fait par
   * (client, formule ABONNEMENT). De même, une facture d'abonnement se
   * reconnaît à sa période (`periodStart`), seul marqueur existant. Ces deux
   * heuristiques sont assumées et documentées plutôt que d'ajouter deux colonnes
   * à un modèle déjà en production.
   */
  async previewSubscription(
    subscriptionId: string,
    operatorId: string,
    now = new Date(),
  ): Promise<SubscriptionDeletionPreview> {
    const subscription = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, user: { operatorId } },
      select: { id: true, userId: true, status: true, committedUntil: true },
    });

    if (!subscription) {
      throw new NotFoundError("Abonnement", subscriptionId);
    }

    const { userId } = subscription;

    const [rotationsActive, rotationsClosed, recurringInvoices] = await Promise.all([
      this.prisma.rotation.count({
        where: {
          userId,
          deletedAt: null,
          formule: "ABONNEMENT",
          status: { notIn: [...ROTATION_CLOSED] },
        },
      }),
      this.prisma.rotation.count({
        where: {
          userId,
          deletedAt: null,
          formule: "ABONNEMENT",
          status: { in: [...ROTATION_CLOSED] },
        },
      }),
      this.prisma.invoice.count({
        where: { userId, deletedAt: null, periodStart: { not: null } },
      }),
    ]);

    const committedUntil = subscription.committedUntil;
    const engagementActif = committedUntil !== null && committedUntil.getTime() > now.getTime();
    const joursRestants = engagementActif
      ? Math.ceil((committedUntil.getTime() - now.getTime()) / 86_400_000)
      : 0;

    return {
      subscriptionId: subscription.id,
      userId,
      status: subscription.status,
      rotations: { active: rotationsActive, closed: rotationsClosed },
      recurringInvoices,
      // SIGNALÉ, jamais bloquant : supprimer un abonnement est un geste de
      // gestion (doublon, erreur de saisie), pas une résiliation client. Le
      // blocage d'engagement vit sur `cancel`, où il a un sens contractuel.
      engagement: { committedUntil, active: engagementActif, joursRestants },
      canDelete: true,
    };
  }

  /**
   * Supprime un abonnement. Avec `cascade`, solde aussi ses rotations.
   *
   * Les factures récurrentes déjà générées ne sont JAMAIS touchées, pour la même
   * raison que pour un client : ce sont des pièces comptables.
   */
  async deleteSubscription(
    subscriptionId: string,
    operatorId: string,
    cascade: boolean,
    actorId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, user: { operatorId } },
      select: { id: true, userId: true, status: true, committedUntil: true },
    });

    if (!subscription) {
      throw new NotFoundError("Abonnement", subscriptionId);
    }

    const { userId } = subscription;
    const now = new Date();

    const deleted = await this.prisma.$transaction(async (tx) => {
      let rotations = 0;

      if (cascade) {
        const result = await tx.rotation.updateMany({
          where: { userId, deletedAt: null, formule: "ABONNEMENT" },
          data: { deletedAt: now },
        });
        rotations = result.count;
      }

      await tx.subscription.delete({ where: { id: subscriptionId } });

      return { subscription: true, rotations };
    });

    const invoicesPreserved = await this.prisma.invoice.count({
      where: { userId, deletedAt: null, periodStart: { not: null } },
    });

    await createAuditLog({
      prisma: this.prisma,
      userId: actorId,
      action: "DELETE",
      entity: "Subscription",
      entityId: subscriptionId,
      changes: {
        cascade,
        deleted,
        invoicesPreserved,
        engagementEnCours:
          subscription.committedUntil !== null &&
          subscription.committedUntil.getTime() > now.getTime(),
      },
      ipAddress,
      userAgent,
    });

    return { deleted, invoicesPreserved };
  }
}
