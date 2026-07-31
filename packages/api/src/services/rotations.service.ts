import type { PrismaClient, Prisma, Rotation, RotationLine, RotationStatus } from "@prisma/client";
import {
  ROTATION_TRANSITIONS,
  computeDateReprise,
  isFacturableRemplacement,
  joursDeRetard,
  normalizeInvoiceLines,
  resolveProductSlug,
  jourCalendaire,
  type InvoiceMetadata,
} from "@lingengo/shared";
import { NotFoundError, ConflictError, UnprocessableEntityError } from "../utils/errors.js";
import { createAuditLog } from "../utils/audit.js";
import { StockItemsService } from "./stock-items.service.js";
import type {
  CreateRotationFromInvoiceInput,
  CreateRotationInput,
  ListRotationsQuery,
  RotationRepriseInput,
  UpdateRotationStatusInput,
} from "../schemas/rotations.schema.js";

type RotationWithLines = Rotation & { lignes: RotationLine[] };

/** Forme de sortie du contrat d'API — stable, consommée par l'admin et le mobile. */
export interface RotationView {
  id: string;
  clientNom: string;
  clientEmail: string | null;
  clientAdresse: string | null;
  userId: string | null;
  quoteId: string | null;
  invoiceId: string | null;
  deliveryStopId: string | null;
  formule: string;
  status: RotationStatus;
  dateLivraison: string;
  dateReprisePrevue: string;
  dateRepriseReelle: string | null;
  passage: number | null;
  facturableRemplacement: boolean;
  notes: string | null;
  lignes: {
    id: string;
    productSlug: string | null;
    designation: string;
    qtyLivree: number;
    qtyReprise: number | null;
  }[];
  joursDeRetard: number;
}

/** Date seule (YYYY-MM-DD) — une rotation se lit au jour, pas à l'instant. */
function toDateOnly(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export function toRotationView(rotation: RotationWithLines, now: Date = new Date()): RotationView {
  return {
    id: rotation.id,
    clientNom: rotation.clientNom,
    clientEmail: rotation.clientEmail,
    clientAdresse: rotation.clientAdresse,
    userId: rotation.userId,
    quoteId: rotation.quoteId,
    invoiceId: rotation.invoiceId,
    deliveryStopId: rotation.deliveryStopId,
    formule: rotation.formule,
    status: rotation.status,
    dateLivraison: toDateOnly(rotation.dateLivraison) as string,
    dateReprisePrevue: toDateOnly(rotation.dateReprisePrevue) as string,
    dateRepriseReelle: toDateOnly(rotation.dateRepriseReelle),
    passage: rotation.passage,
    facturableRemplacement: rotation.facturableRemplacement,
    notes: rotation.notes,
    lignes: rotation.lignes
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((l) => ({
        id: l.id,
        productSlug: l.productSlug,
        designation: l.designation,
        qtyLivree: l.qtyLivree,
        qtyReprise: l.qtyReprise,
      })),
    // Recalculé à la lecture, jamais persisté : un retard vieillit tout seul, une
    // colonne figée mentirait dès le lendemain.
    joursDeRetard: joursDeRetard(
      {
        status: rotation.status,
        dateReprisePrevue: rotation.dateReprisePrevue,
        dateRepriseReelle: rotation.dateRepriseReelle,
      },
      now,
    ),
  };
}

/**
 * Lignes de rotation déduites d'un snapshot de facture.
 *
 * Le snapshot `Invoice.metadata` est déjà FIGÉ à l'émission : on le relit tel
 * quel plutôt que de rouvrir le devis, qui a pu bouger depuis. Les lignes sans
 * quantité (remise, forfait de livraison, mention) ne sortent aucun linge et
 * sont écartées — sinon la rotation demanderait de « reprendre 1 livraison ».
 */
export function linesFromInvoiceMetadata(
  metadata: InvoiceMetadata,
): { productSlug: string | null; designation: string; qtyLivree: number; position: number }[] {
  return normalizeInvoiceLines(metadata.lines)
    .map((l, index) => ({
      productSlug: resolveProductSlug(l.designation),
      designation: l.designation,
      qtyLivree: l.qty,
      position: index,
    }))
    .filter((l) => l.designation.length > 0 && l.qtyLivree > 0);
}

export class RotationsService {
  constructor(private readonly prisma: PrismaClient) {}

  // ---- Liste / calendrier ----

  /**
   * Liste filtrable. `from`/`to` portent sur la date de reprise PRÉVUE, ce qui
   * en fait directement la vue calendrier de l'admin (« la semaine du 12 »).
   */
  /**
   * @param forcedUserId Restriction imposée par le serveur (appelant non-admin).
   * Prioritaire sur le `userId` de la requête : c'est ce qui empêche un client de
   * lire les rotations d'un autre en passant simplement `?userId=<autre>`.
   */
  async list(query: ListRotationsQuery, operatorId: string, forcedUserId?: string) {
    const { page, limit, from, to, status, formule, search, enRetard } = query;
    const userId = forcedUserId ?? query.userId;
    const skip = (page - 1) * limit;
    const now = new Date();

    // Les critères qui portent sur les MÊMES colonnes (dateReprisePrevue, status)
    // sont composés via AND et non par étalement d'objets : un spread ferait
    // silencieusement disparaître la plage de dates dès que `enRetard` est coché,
    // et l'admin verrait « les retards de la semaine » alors qu'il lit tous les
    // retards, toutes périodes confondues.
    const conditions: Prisma.RotationWhereInput[] = [];

    if (from || to) {
      conditions.push({
        dateReprisePrevue: {
          ...(from ? { gte: jourCalendaire(from) } : {}),
          ...(to ? { lte: jourCalendaire(to) } : {}),
        },
      });
    }

    // « En retard » se lit sur les DATES, pas sur le statut : le cron ne passe
    // qu'une fois par jour, une rotation échue ce matin est déjà en retard même
    // si sa colonne `status` n'a pas encore basculé.
    if (enRetard) {
      conditions.push({
        dateReprisePrevue: { lt: jourCalendaire(now) },
        dateRepriseReelle: null,
        status: { notIn: ["REPRISE", "ANNULEE"] },
      });
    }

    if (status) {
      conditions.push({ status });
    }

    if (search) {
      conditions.push({
        OR: [
          { clientNom: { contains: search, mode: "insensitive" } },
          { clientEmail: { contains: search, mode: "insensitive" } },
          { clientAdresse: { contains: search, mode: "insensitive" } },
        ],
      });
    }

    const where: Prisma.RotationWhereInput = {
      operatorId,
      deletedAt: null,
      ...(formule ? { formule } : {}),
      ...(userId ? { userId } : {}),
      ...(conditions.length > 0 ? { AND: conditions } : {}),
    };

    const [rotations, total] = await Promise.all([
      this.prisma.rotation.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ dateReprisePrevue: "asc" }, { createdAt: "asc" }],
        include: { lignes: true },
      }),
      this.prisma.rotation.count({ where }),
    ]);

    return {
      data: rotations.map((r) => toRotationView(r, now)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // ---- Détail ----

  /**
   * @param userId restreint la rotation à son propriétaire (rôle CLIENT).
   *
   * `GET /rotations?mine=1` est ouvert à tout compte authentifié, mais le
   * détail était réservé aux admins : un client qui touchait sa notification de
   * rappel — dont le lien porte `rotationId` — recevait un 403 sur sa propre
   * rotation.
   */
  async getById(id: string, operatorId: string, userId?: string): Promise<RotationView> {
    const rotation = await this.prisma.rotation.findFirst({
      where: { id, operatorId, deletedAt: null, ...(userId ? { userId } : {}) },
      include: { lignes: true },
    });

    if (!rotation) {
      throw new NotFoundError("Rotation", id);
    }

    return toRotationView(rotation);
  }

  // ---- Création manuelle ----

  async create(
    input: CreateRotationInput,
    operatorId: string,
    adminId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<RotationView> {
    const dateLivraison = jourCalendaire(input.dateLivraison);
    const dateReprisePrevue = input.dateReprisePrevue
      ? jourCalendaire(input.dateReprisePrevue)
      : jourCalendaire(computeDateReprise({ dateLivraison, formule: input.formule }));

    if (dateReprisePrevue < dateLivraison) {
      throw new UnprocessableEntityError(
        "La date de reprise ne peut pas précéder la livraison",
        "INVALID_ROTATION_DATES",
      );
    }

    const lignes = input.lignes.map((l, index) => ({
      productSlug: l.productSlug ?? resolveProductSlug(l.designation),
      designation: l.designation,
      qtyLivree: l.qtyLivree,
      position: index,
    }));

    const rotation = await this.prisma.$transaction(async (tx) => {
      const created = await tx.rotation.create({
        data: {
          operatorId,
          userId: input.userId ?? null,
          clientNom: input.clientNom,
          clientEmail: input.clientEmail ?? null,
          clientAdresse: input.clientAdresse ?? null,
          quoteId: input.quoteId ?? null,
          invoiceId: input.invoiceId ?? null,
          deliveryStopId: input.deliveryStopId ?? null,
          formule: input.formule,
          status: "PLANIFIEE",
          dateLivraison,
          dateReprisePrevue,
          passage: input.passage ?? null,
          notes: input.notes ?? null,
          // Saisie manuelle : l'admin enregistre un linge DÉJÀ sorti (ce qu'il
          // vient de déposer). Le stock bouge donc immédiatement, et on horodate
          // ce mouvement pour qu'une bascule LIVREE ultérieure ne le rejoue pas.
          // Les rotations créées d'avance depuis une commande, elles, laissent ce
          // champ NULL jusqu'à la livraison réelle.
          sortieStockAt: new Date(),
          lignes: { create: lignes },
        },
        include: { lignes: true },
      });

      await StockItemsService.recordSortie(tx, operatorId, created.lignes);

      return created;
    });

    await createAuditLog({
      prisma: this.prisma,
      userId: adminId,
      action: "CREATE",
      entity: "Rotation",
      entityId: rotation.id,
      changes: {
        formule: rotation.formule,
        dateLivraison: toDateOnly(rotation.dateLivraison),
        dateReprisePrevue: toDateOnly(rotation.dateReprisePrevue),
        lignes: rotation.lignes.length,
      },
      ipAddress,
      userAgent,
    });

    return toRotationView(rotation);
  }

  // ---- Création depuis une facture ----

  /**
   * Crée la rotation correspondant au linge sorti pour une facture.
   *
   * L'émission de la facture est le moment où le linge part : c'est donc le
   * point de départ naturel du compte à rebours de reprise. Les lignes sont
   * reprises du snapshot figé de la facture (`metadata.lines`), pas du devis —
   * une facture est une pièce arrêtée, le devis a pu être modifié depuis.
   */
  async createFromInvoice(
    invoiceId: string,
    operatorId: string,
    input: CreateRotationFromInvoiceInput,
    adminId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<RotationView> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, operatorId, deletedAt: null },
    });

    if (!invoice) {
      throw new NotFoundError("Facture", invoiceId);
    }

    if (invoice.status === "CANCELLED") {
      throw new UnprocessableEntityError(
        "Une facture annulée ne sort aucun linge",
        "INVOICE_CANCELLED",
      );
    }

    // Idempotence : un double-clic ne doit pas sortir deux fois le même linge et
    // gonfler le stock en circulation. Une rotation ANNULEE, elle, autorise la
    // recréation (livraison refaite après un échec de tournée).
    const existing = await this.prisma.rotation.findFirst({
      where: {
        invoiceId,
        deletedAt: null,
        status: { not: "ANNULEE" },
        ...(input.passage !== undefined ? { passage: input.passage } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictError(
        `Une rotation existe déjà pour cette facture (${existing.id}). ` +
          `Annulez-la avant d'en créer une nouvelle.`,
      );
    }

    const metadata = (invoice.metadata ?? {}) as InvoiceMetadata;
    const lignes = linesFromInvoiceMetadata(metadata);

    if (lignes.length === 0) {
      throw new UnprocessableEntityError(
        "Cette facture ne porte aucune ligne de linge : rien à reprendre",
        "NO_ROTATION_LINES",
      );
    }

    const dateLivraison = jourCalendaire(input.dateLivraison ?? new Date());
    const dateReprisePrevue = jourCalendaire(
      computeDateReprise({ dateLivraison, formule: input.formule }),
    );

    const rotation = await this.prisma.$transaction(async (tx) => {
      const created = await tx.rotation.create({
        data: {
          operatorId,
          userId: invoice.userId,
          // Snapshot client repris de la facture, elle-même figée à l'émission.
          clientNom: invoice.clientNom ?? "Client",
          clientEmail: invoice.clientEmail,
          clientAdresse: invoice.clientAdresse,
          quoteId: invoice.quoteId,
          invoiceId: invoice.id,
          deliveryStopId: input.deliveryStopId ?? null,
          formule: input.formule,
          status: "PLANIFIEE",
          dateLivraison,
          dateReprisePrevue,
          passage: input.passage ?? null,
          notes: input.notes ?? null,
          // Émettre la facture, c'est constater que le linge est parti : le
          // mouvement de stock est immédiat, donc horodaté (cf. `create`).
          sortieStockAt: new Date(),
          lignes: { create: lignes },
        },
        include: { lignes: true },
      });

      await StockItemsService.recordSortie(tx, operatorId, created.lignes);

      return created;
    });

    await createAuditLog({
      prisma: this.prisma,
      userId: adminId,
      action: "CREATE",
      entity: "Rotation",
      entityId: rotation.id,
      changes: {
        invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        formule: rotation.formule,
        dateReprisePrevue: toDateOnly(rotation.dateReprisePrevue),
        lignesNonResolues: rotation.lignes.filter((l) => !l.productSlug).length,
      },
      ipAddress,
      userAgent,
    });

    return toRotationView(rotation);
  }

  // ---- Création AUTOMATIQUE depuis une commande ----

  /**
   * Aligne la rotation d'une commande sur l'état de cette commande.
   *
   * C'est le seul automatisme du cycle du linge, et il existe parce que
   * l'inverse a été constaté en production : trois commandes portant chacune une
   * date de livraison, et un calendrier vide. Une rotation ne naissait que d'un
   * geste manuel, donc le linge partait sans que rien ne dise quand il revient —
   * ni échéance, ni rappel J-1, ni relance de retard.
   *
   * La commande est la SEULE source de dates fiable : le devis n'en porte
   * aucune (regardé le modèle `Quote`), elles sont saisies à la conversion
   * devis → commande, ou par le client sur le mobile.
   *
   * Correspondance des états, volontairement stricte :
   *   PENDING              → rien. Une commande non validée n'engage aucun linge.
   *   CONFIRMED/IN_DELIVERY→ rotation PLANIFIEE, **sans mouvement de stock** : le
   *                          calendrier montre la livraison et l'échéance de
   *                          reprise à venir, le parc ne bouge qu'au départ réel.
   *   DELIVERED            → rotation LIVREE + sortie de stock (une seule fois).
   *   CANCELLED            → rotation ANNULEE, et retour en stock UNIQUEMENT si
   *                          le linge en était réellement sorti.
   *
   * **Ne lève jamais** : une commande enregistrée est un engagement pris, la
   * refuser parce que sa rotation n'a pas pu être créée serait le pire échange.
   * L'échec laisse une ligne de log et le cron de rattrapage repassera.
   *
   * Idempotente : la contrainte unique sur `order_id` fait foi, et une course
   * entre deux appels (cron + changement de statut) se solde par un P2002
   * silencieux, pas par un doublon.
   *
   * @returns ce qui a été fait, pour que le cron puisse en rendre compte.
   */
  async syncFromOrder(
    orderId: string,
    opts: { adminId?: string } = {},
  ): Promise<{ created: boolean; livree: boolean; annulee: boolean; rotationId: string | null }> {
    const rien = { created: false, livree: false, annulee: false, rotationId: null };

    try {
      const order = await this.prisma.order.findFirst({
        where: { id: orderId, deletedAt: null },
        include: {
          items: { include: { product: { select: { slug: true, name: true } } } },
          user: {
            select: {
              id: true,
              name: true,
              companyName: true,
              email: true,
              address: true,
              operatorId: true,
              subscription: { select: { status: true } },
            },
          },
          deliveryStop: { select: { id: true, completedAt: true } },
          // Devis d'origine : la rotation le porte pour que la fiche client
          // remonte à la pièce commerciale signée.
          quote: { select: { id: true } },
          rotation: { include: { lignes: true } },
        },
      });

      if (!order || !order.user) return rien;

      const existante = order.rotation;

      // ---- Commande annulée ----
      if (order.status === "CANCELLED") {
        if (!existante || existante.status === "ANNULEE" || existante.status === "REPRISE") {
          return { ...rien, rotationId: existante?.id ?? null };
        }
        await this.updateStatus(
          existante.id,
          order.user.operatorId,
          { status: "ANNULEE" },
          opts.adminId ?? order.user.id,
        );
        return { created: false, livree: false, annulee: true, rotationId: existante.id };
      }

      // Une commande encore à valider n'a pas à peupler le calendrier : elle
      // n'engage rien et son linge n'est pas réservé.
      if (order.status === "PENDING") {
        return { ...rien, rotationId: existante?.id ?? null };
      }

      const lignes = order.items
        .map((item, index) => ({
          // Le slug du catalogue d'abord : c'est lui qui fait bouger le stock.
          // `resolveProductSlug` n'intervient qu'en repli sur un produit legacy
          // sans slug — il devine à partir du libellé, et une mauvaise devinette
          // imputerait le mouvement au mauvais article.
          productSlug: item.product?.slug ?? resolveProductSlug(item.product?.name ?? ""),
          designation: item.product?.name ?? "Article",
          qtyLivree: item.quantity,
          position: index,
        }))
        .filter((l) => l.qtyLivree > 0);

      if (lignes.length === 0) return { ...rien, rotationId: existante?.id ?? null };

      // Abonnement (14 j de détention) contre location ponctuelle (7 j, seuil du
      // renouvellement hebdomadaire para-hôtelier — cf. ADR, ne pas « simplifier »).
      const formule =
        order.isRecurring || order.user.subscription?.status === "ACTIVE"
          ? "ABONNEMENT"
          : "PONCTUEL";

      let rotation = existante;
      let created = false;

      if (!rotation) {
        const dateLivraison = jourCalendaire(order.deliveryDate);
        const dateReprisePrevue = jourCalendaire(computeDateReprise({ dateLivraison, formule }));

        try {
          rotation = await this.prisma.rotation.create({
            data: {
              operatorId: order.user.operatorId,
              userId: order.user.id,
              orderId: order.id,
              // Snapshot au même titre que sur une facture : la plupart des
              // clients changent d'adresse ou de raison sociale sans que le
              // linge déjà dehors doive changer de destination.
              clientNom: order.user.companyName ?? order.user.name,
              clientEmail: order.user.email,
              clientAdresse: order.user.address,
              quoteId: order.quote?.id ?? null,
              deliveryStopId: order.deliveryStop?.id ?? null,
              formule,
              status: "PLANIFIEE",
              dateLivraison,
              dateReprisePrevue,
              notes: `Créée automatiquement depuis la commande ${order.orderNumber}`,
              lignes: { create: lignes },
            },
            include: { lignes: true },
          });
          created = true;
        } catch (err) {
          // P2002 : une autre exécution (cron, second changement de statut) a
          // gagné la course. C'est le résultat voulu, pas un incident.
          if ((err as { code?: string }).code !== "P2002") throw err;
          rotation = await this.prisma.rotation.findFirst({
            where: { orderId: order.id },
            include: { lignes: true },
          });
          if (!rotation) return rien;
        }

        await createAuditLog({
          prisma: this.prisma,
          userId: opts.adminId ?? order.user.id,
          action: "CREATE",
          entity: "Rotation",
          entityId: rotation.id,
          changes: {
            automatique: true,
            orderId: order.id,
            orderNumber: order.orderNumber,
            formule,
            dateLivraison: toDateOnly(rotation.dateLivraison),
            dateReprisePrevue: toDateOnly(rotation.dateReprisePrevue),
            lignes: lignes.length,
          },
        });
      }

      // ---- Livraison réelle : le linge sort du parc ----
      if (order.status === "DELIVERED" && rotation.status === "PLANIFIEE") {
        // Date RÉELLE quand l'arrêt de tournée en donne une : c'est elle qui
        // fait courir le délai de détention. Sans arrêt (commande passée en
        // livrée à la main), la date prévue reste la meilleure approximation.
        const reel = order.deliveryStop?.completedAt
          ? jourCalendaire(order.deliveryStop.completedAt)
          : null;

        if (reel && reel.getTime() !== rotation.dateLivraison.getTime()) {
          await this.prisma.rotation.update({
            where: { id: rotation.id },
            data: {
              dateLivraison: reel,
              dateReprisePrevue: jourCalendaire(
                computeDateReprise({ dateLivraison: reel, formule }),
              ),
              ...(order.deliveryStop ? { deliveryStopId: order.deliveryStop.id } : {}),
            },
          });
        }

        await this.updateStatus(
          rotation.id,
          order.user.operatorId,
          { status: "LIVREE" },
          opts.adminId ?? order.user.id,
        );
        return { created, livree: true, annulee: false, rotationId: rotation.id };
      }

      return { created, livree: false, annulee: false, rotationId: rotation.id };
    } catch (err) {
      const raison = err instanceof Error ? err.message : String(err);
      console.error(`[rotations] Synchronisation de la commande ${orderId} échouée : ${raison}`);
      return rien;
    }
  }

  /**
   * Rattrapage : toutes les commandes dont la rotation manque ou a pris du retard.
   *
   * Les appels au fil des changements de statut sont « best effort » — ils ne
   * doivent jamais faire échouer une commande. Ce balayage est le filet qui
   * garantit qu'un mailer indisponible, un redémarrage au mauvais moment ou une
   * commande antérieure à cette fonctionnalité finit quand même par apparaître
   * au calendrier, avec ses rappels.
   *
   * Borné à `limit` commandes par passage : un rattrapage initial sur un
   * historique volumineux ne doit pas monopoliser la base. Le reste passe au
   * lendemain, et le compteur retourné le dit.
   */
  async backfillFromOrders(
    limit = 200,
  ): Promise<{ examinees: number; creees: number; livrees: number; restantes: number }> {
    const where: Prisma.OrderWhereInput = {
      deletedAt: null,
      status: { in: ["CONFIRMED", "IN_DELIVERY", "DELIVERED"] },
      OR: [
        { rotation: { is: null } },
        // Livrée mais rotation encore prévisionnelle : la sortie de stock et le
        // décompte de détention n'ont pas encore démarré.
        { status: "DELIVERED", rotation: { is: { status: "PLANIFIEE" } } },
      ],
    };

    const [commandes, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        select: { id: true },
        orderBy: { deliveryDate: "asc" },
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    let creees = 0;
    let livrees = 0;

    for (const commande of commandes) {
      const bilan = await this.syncFromOrder(commande.id);
      if (bilan.created) creees++;
      if (bilan.livree) livrees++;
    }

    return {
      examinees: commandes.length,
      creees,
      livrees,
      restantes: Math.max(0, total - commandes.length),
    };
  }

  // ---- Transition de statut ----

  async updateStatus(
    id: string,
    operatorId: string,
    input: UpdateRotationStatusInput,
    adminId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<RotationView> {
    const rotation = await this.prisma.rotation.findFirst({
      where: { id, operatorId, deletedAt: null },
      include: { lignes: true },
    });

    if (!rotation) {
      throw new NotFoundError("Rotation", id);
    }

    const from = rotation.status;
    const to = input.status;
    const allowed = ROTATION_TRANSITIONS[from] ?? [];

    if (!allowed.includes(to)) {
      throw new UnprocessableEntityError(
        `Transition de statut non autorisée : ${from} → ${to}`,
        "INVALID_TRANSITION",
      );
    }

    // REPRISE passe par PATCH /reprise : il faut les quantités revenues pour
    // solder le stock. L'autoriser ici laisserait du linge en circulation à vie.
    if (to === "REPRISE") {
      throw new UnprocessableEntityError(
        "Utilisez PATCH /rotations/:id/reprise pour clôturer une rotation (quantités reprises requises)",
        "USE_REPRISE_ENDPOINT",
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Annuler une rotation en cours remet en stock le linge qu'on croyait
      // sorti : sans cela, une erreur de saisie immobiliserait le parc.
      //
      // `sortieStockAt` conditionne le retour : une rotation PLANIFIEE créée
      // d'avance depuis une commande n'a JAMAIS décrémenté le parc. La créditer
      // à l'annulation inventerait du linge — le stock disponible grossirait à
      // chaque commande annulée avant livraison.
      if (to === "ANNULEE" && rotation.sortieStockAt) {
        await StockItemsService.recordAnnulation(tx, operatorId, rotation.lignes);
      }

      // La livraison est le moment où le linge quitte réellement le parc. Une
      // rotation prévisionnelle attend ici sa sortie de stock ; celles déjà
      // sorties (saisie manuelle, facture) ne la rejouent pas.
      const sortie = to === "LIVREE" && !rotation.sortieStockAt;
      if (sortie) {
        await StockItemsService.recordSortie(tx, operatorId, rotation.lignes);
      }

      return tx.rotation.update({
        where: { id },
        data: { status: to, ...(sortie ? { sortieStockAt: new Date() } : {}) },
        include: { lignes: true },
      });
    });

    await createAuditLog({
      prisma: this.prisma,
      userId: adminId,
      action: "UPDATE",
      entity: "Rotation",
      entityId: id,
      changes: { previousStatus: from, newStatus: to },
      ipAddress,
      userAgent,
    });

    return toRotationView(updated);
  }

  // ---- Enregistrement de la reprise ----

  /**
   * Clôture une rotation : le linge est revenu.
   *
   * Une seule transaction pour les lignes, le statut et le stock — un stock
   * décrémenté sans rotation clôturée (ou l'inverse) est irrattrapable sans
   * inventaire manuel.
   */
  async enregistrerReprise(
    id: string,
    operatorId: string,
    input: RotationRepriseInput,
    adminId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<RotationView> {
    const rotation = await this.prisma.rotation.findFirst({
      where: { id, operatorId, deletedAt: null },
      include: { lignes: true },
    });

    if (!rotation) {
      throw new NotFoundError("Rotation", id);
    }

    if (rotation.status === "REPRISE") {
      throw new ConflictError("Cette rotation est déjà clôturée");
    }

    if (rotation.status === "ANNULEE") {
      throw new UnprocessableEntityError(
        "Une rotation annulée ne peut pas être reprise",
        "ROTATION_CANCELLED",
      );
    }

    const byId = new Map(rotation.lignes.map((l) => [l.id, l]));
    for (const ligne of input.lignes) {
      if (!byId.has(ligne.id)) {
        throw new UnprocessableEntityError(
          `La ligne ${ligne.id} n'appartient pas à cette rotation`,
          "LINE_NOT_IN_ROTATION",
        );
      }
    }

    const dateRepriseReelle = jourCalendaire(input.dateRepriseReelle ?? new Date());

    // Les lignes non transmises sont réputées non revenues (0), pas ignorées :
    // une reprise partielle doit solder la rotation entière, sinon du linge
    // resterait éternellement compté en circulation.
    const repriseByLineId = new Map(input.lignes.map((l) => [l.id, l.qtyReprise]));
    const soldes = rotation.lignes.map((l) => ({
      id: l.id,
      productSlug: l.productSlug,
      qtyLivree: l.qtyLivree,
      qtyReprise: repriseByLineId.get(l.id) ?? l.qtyReprise ?? 0,
    }));

    const updated = await this.prisma.$transaction(async (tx) => {
      for (const solde of soldes) {
        await tx.rotationLine.update({
          where: { id: solde.id },
          data: { qtyReprise: solde.qtyReprise },
        });
      }

      await StockItemsService.recordReprise(tx, operatorId, soldes);

      return tx.rotation.update({
        where: { id },
        data: {
          status: "REPRISE",
          dateRepriseReelle,
          // Le drapeau d'escalade n'a plus lieu d'être une fois le linge revenu.
          facturableRemplacement: false,
        },
        include: { lignes: true },
      });
    });

    const manquants = soldes.reduce((n, s) => n + Math.max(0, s.qtyLivree - s.qtyReprise), 0);

    await createAuditLog({
      prisma: this.prisma,
      userId: adminId,
      action: "UPDATE",
      entity: "Rotation",
      entityId: id,
      changes: {
        previousStatus: rotation.status,
        newStatus: "REPRISE",
        dateRepriseReelle: toDateOnly(dateRepriseReelle),
        articlesManquants: manquants,
        joursDeRetard: joursDeRetard(
          {
            status: rotation.status,
            dateReprisePrevue: rotation.dateReprisePrevue,
            dateRepriseReelle: null,
          },
          dateRepriseReelle,
        ),
      },
      ipAddress,
      userAgent,
    });

    return toRotationView(updated);
  }

  // ---- Soft-delete ----

  /**
   * @param force Supprime AUSSI une rotation en cours, en l'annulant d'abord.
   *
   * Sans ce drapeau, une rotation PLANIFIEE ou LIVREE est indéléguable : l'écran
   * offrait un bouton Supprimer qui répondait toujours « Seule une rotation
   * reprise ou annulée peut être supprimée », sans jamais dire quoi faire — un
   * cul-de-sac constaté en production sur la rotation « hotel me ».
   *
   * Le refus avait pourtant une bonne raison : effacer une rotation dont le
   * linge est dehors fait disparaître la seule trace de ce qu'il faut aller
   * récupérer, ET laisse ce linge compté en circulation à vie. `force` ne
   * contourne donc pas la règle, il exécute la sortie légitime : annuler
   * (ce qui REND le linge au stock quand il en était sorti), puis supprimer.
   */
  async softDelete(
    id: string,
    operatorId: string,
    adminId: string,
    ipAddress?: string,
    userAgent?: string,
    force = false,
  ) {
    const rotation = await this.prisma.rotation.findFirst({
      where: { id, operatorId, deletedAt: null },
      include: { lignes: true },
    });

    if (!rotation) {
      throw new NotFoundError("Rotation", id);
    }

    const enCours = rotation.status !== "ANNULEE" && rotation.status !== "REPRISE";

    if (enCours && !force) {
      throw new UnprocessableEntityError(
        "Cette rotation suit du linge encore dehors. Annulez-la d'abord " +
          "(le linge revient alors en stock), ou supprimez-la en confirmant l'annulation.",
        "ROTATION_NOT_DELETABLE",
      );
    }

    // Une seule transaction : une rotation effacée dont le stock n'a pas été
    // rendu est irrattrapable sans inventaire manuel.
    await this.prisma.$transaction(async (tx) => {
      if (enCours) {
        if (rotation.sortieStockAt) {
          await StockItemsService.recordAnnulation(tx, operatorId, rotation.lignes);
        }
        await tx.rotation.update({ where: { id }, data: { status: "ANNULEE" } });
      }

      await tx.rotation.update({ where: { id }, data: { deletedAt: new Date() } });
    });

    await createAuditLog({
      prisma: this.prisma,
      userId: adminId,
      action: "DELETE",
      entity: "Rotation",
      entityId: id,
      changes: {
        status: rotation.status,
        ...(enCours
          ? {
              annuleeAvantSuppression: true,
              // Tracé explicitement : c'est la seule trace du mouvement de parc
              // qu'a provoqué une suppression.
              stockRendu: Boolean(rotation.sortieStockAt),
              articles: rotation.lignes.reduce((n, l) => n + l.qtyLivree, 0),
            }
          : {}),
      },
      ipAddress,
      userAgent,
    });

    return { id, deleted: true, annulee: enCours };
  }

  // ---- Récapitulatif d'exploitation ----

  /**
   * Compteurs du tableau de bord : passages du jour, du lendemain, et retards.
   * Une seule requête par compteur, sans charger les lignes.
   */
  async summary(operatorId: string, now: Date = new Date()) {
    const aujourdhui = jourCalendaire(now);
    // Journées suivantes par pas de 24 h EXACTES : les dates canoniques sont des
    // minuits UTC, où le jour dure toujours 24 h (pas de changement d'heure).
    const demain = new Date(aujourdhui.getTime() + 86_400_000);
    const apresDemain = new Date(demain.getTime() + 86_400_000);

    const enCours: Prisma.RotationWhereInput = {
      operatorId,
      deletedAt: null,
      dateRepriseReelle: null,
      status: { notIn: ["REPRISE", "ANNULEE"] },
    };

    const [reprisesAujourdhui, reprisesDemain, enRetard, facturables] = await Promise.all([
      this.prisma.rotation.count({
        where: { ...enCours, dateReprisePrevue: { gte: aujourdhui, lt: demain } },
      }),
      this.prisma.rotation.count({
        where: { ...enCours, dateReprisePrevue: { gte: demain, lt: apresDemain } },
      }),
      this.prisma.rotation.count({
        where: { ...enCours, dateReprisePrevue: { lt: aujourdhui } },
      }),
      this.prisma.rotation.count({
        where: { ...enCours, facturableRemplacement: true },
      }),
    ]);

    return { reprisesAujourdhui, reprisesDemain, enRetard, facturables };
  }

  /**
   * Bascule en EN_RETARD les rotations échues et lève le drapeau d'escalade
   * au-delà du seuil. Idempotent : rejouable sans effet de bord.
   *
   * Utilisé par le cron quotidien ET appelé en tête de `list()` côté admin —
   * même filet que `markOverdue` sur les factures.
   *
   * **Seule** implémentation de la bascule EN_RETARD et de l'escalade en
   * remplacement facturable. Le cron `rotation-overdue` l'appelle sans opérateur
   * — donc sur tous — puis se charge des seules relances, qui elles ne relèvent
   * pas de l'état.
   *
   * @param operatorId Limite à un opérateur. Omis ⇒ TOUS.
   */
  async markOverdue(operatorId?: string, now: Date = new Date()) {
    const aujourdhui = jourCalendaire(now);

    const echues = await this.prisma.rotation.findMany({
      where: {
        ...(operatorId ? { operatorId } : {}),
        deletedAt: null,
        dateRepriseReelle: null,
        status: { in: ["PLANIFIEE", "LIVREE", "EN_RETARD"] },
        dateReprisePrevue: { lt: aujourdhui },
      },
      select: { id: true, status: true, dateReprisePrevue: true, facturableRemplacement: true },
    });

    const aBasculer = echues.filter((r) => r.status !== "EN_RETARD").map((r) => r.id);

    const aEscalader = echues
      .filter(
        (r) =>
          !r.facturableRemplacement &&
          isFacturableRemplacement(
            { status: "EN_RETARD", dateReprisePrevue: r.dateReprisePrevue },
            now,
          ),
      )
      .map((r) => r.id);

    if (aBasculer.length > 0) {
      await this.prisma.rotation.updateMany({
        where: { id: { in: aBasculer } },
        data: { status: "EN_RETARD" },
      });
    }

    if (aEscalader.length > 0) {
      await this.prisma.rotation.updateMany({
        where: { id: { in: aEscalader } },
        data: { facturableRemplacement: true },
      });
    }

    return { basculees: aBasculer.length, escaladees: aEscalader.length, echues: echues.length };
  }
}
