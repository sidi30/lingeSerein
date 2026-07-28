import type { PrismaClient, Prisma, Rotation, RotationLine, RotationStatus } from "@prisma/client";
import {
  ROTATION_TRANSITIONS,
  computeDateReprise,
  isFacturableRemplacement,
  joursDeRetard,
  normalizeInvoiceLines,
  resolveProductSlug,
  startOfDay,
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
          ...(from ? { gte: startOfDay(new Date(from)) } : {}),
          ...(to ? { lte: startOfDay(new Date(to)) } : {}),
        },
      });
    }

    // « En retard » se lit sur les DATES, pas sur le statut : le cron ne passe
    // qu'une fois par jour, une rotation échue ce matin est déjà en retard même
    // si sa colonne `status` n'a pas encore basculé.
    if (enRetard) {
      conditions.push({
        dateReprisePrevue: { lt: startOfDay(now) },
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

  async getById(id: string, operatorId: string): Promise<RotationView> {
    const rotation = await this.prisma.rotation.findFirst({
      where: { id, operatorId, deletedAt: null },
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
    const dateLivraison = startOfDay(new Date(input.dateLivraison));
    const dateReprisePrevue = input.dateReprisePrevue
      ? startOfDay(new Date(input.dateReprisePrevue))
      : startOfDay(computeDateReprise({ dateLivraison, formule: input.formule }));

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

    const dateLivraison = startOfDay(
      input.dateLivraison ? new Date(input.dateLivraison) : new Date(),
    );
    const dateReprisePrevue = startOfDay(
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
      if (to === "ANNULEE") {
        await StockItemsService.recordAnnulation(tx, operatorId, rotation.lignes);
      }

      return tx.rotation.update({
        where: { id },
        data: { status: to },
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

    const dateRepriseReelle = startOfDay(
      input.dateRepriseReelle ? new Date(input.dateRepriseReelle) : new Date(),
    );

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

  async softDelete(
    id: string,
    operatorId: string,
    adminId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const rotation = await this.prisma.rotation.findFirst({
      where: { id, operatorId, deletedAt: null },
      include: { lignes: true },
    });

    if (!rotation) {
      throw new NotFoundError("Rotation", id);
    }

    // Supprimer une rotation dont le linge est encore dehors ferait disparaître
    // la seule trace de ce qu'il faut aller récupérer.
    if (rotation.status !== "ANNULEE" && rotation.status !== "REPRISE") {
      throw new UnprocessableEntityError(
        "Seule une rotation reprise ou annulée peut être supprimée",
        "ROTATION_NOT_DELETABLE",
      );
    }

    await this.prisma.rotation.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await createAuditLog({
      prisma: this.prisma,
      userId: adminId,
      action: "DELETE",
      entity: "Rotation",
      entityId: id,
      changes: { status: rotation.status },
      ipAddress,
      userAgent,
    });

    return { id, deleted: true };
  }

  // ---- Récapitulatif d'exploitation ----

  /**
   * Compteurs du tableau de bord : passages du jour, du lendemain, et retards.
   * Une seule requête par compteur, sans charger les lignes.
   */
  async summary(operatorId: string, now: Date = new Date()) {
    const aujourdhui = startOfDay(now);
    const demain = new Date(aujourdhui);
    demain.setDate(demain.getDate() + 1);
    const apresDemain = new Date(demain);
    apresDemain.setDate(apresDemain.getDate() + 1);

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
   */
  async markOverdue(operatorId: string, now: Date = new Date()) {
    const aujourdhui = startOfDay(now);

    const echues = await this.prisma.rotation.findMany({
      where: {
        operatorId,
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
