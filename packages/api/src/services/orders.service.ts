import type { PrismaClient, Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { NotFoundError, AppError, UnprocessableEntityError } from "../utils/errors.js";
import { createAuditLog } from "../utils/audit.js";
import { NotificationsService } from "./notifications.service.js";
// `passages.service` importe `zoneTarifaire` d'ici : le cycle est assumé et sans
// danger (les deux exports sont résolus au premier appel, pas au chargement).
import { PassagesService } from "./passages.service.js";
import { RotationsService } from "./rotations.service.js";
import {
  ORDER_TRANSITIONS,
  communeParInsee,
  computeDeliveryFee,
  deliveryLabelFromCents,
  differenceInCalendarDays,
  zoneParCodePostal,
} from "@lingengo/shared";
import type { DeliveryZone, OrderStatus } from "@lingengo/shared";
import {
  sendTransactionalMail,
  toMailDate,
  type SendMailInput,
  type SendMailResult,
} from "../utils/mailer.js";
import { emailAutorise, emailsAutorises } from "../utils/notify.js";
import type {
  CreateOrderInput,
  ListOrdersQuery,
  CancelOrderInput,
  UpdateOrderStatusInput,
} from "../schemas/orders.schema.js";

/**
 * Seuls états supprimables : la commande n'est pas encore entrée dans la chaîne
 * logistique (PENDING), ou en est déjà sortie sans effet (CANCELLED).
 */
const ORDER_DELETABLE: OrderStatus[] = ["PENDING", "CANCELLED"];

/**
 * Zone TARIFAIRE d'un client (barème de `@lingengo/shared`), déduite de sa fiche.
 *
 * Le palier vient de la COMMUNE, et d'elle seule. Il se déduisait auparavant du
 * `postalCode`, une chaîne que le client écrit lui-même depuis `PATCH /auth/me` :
 * saisir « 84100 » suffisait à s'attribuer la gratuité d'Orange. Le code INSEE,
 * lui, est choisi dans une liste FERMÉE et revalidé à l'écriture.
 *
 * Trois chemins, dans cet ordre :
 *   1. `communeInsee` renseigné → le palier de la commune. C'est le cas normal ;
 *   2. sinon, REPLI par code postal, pour les fiches antérieures à la liste
 *      fermée. Quand le code postal est à cheval sur deux paliers (84100 =
 *      Orange + Uchaux), `zoneParCodePostal` retient le MOINS CHER : on ne
 *      facture pas un client sur une incertitude qui n'est pas la sienne ;
 *   3. commune inconnue ou hors Vaucluse → `HORS_ZONE`, donc « sur devis ».
 *      Aucun tarif n'est publié hors du département : le deviner reviendrait à
 *      inventer un prix.
 *
 * `zoneId` (le secteur de TOURNÉE en base, « Vaucluse Nord ») n'entre plus dans
 * le calcul : c'est une donnée d'organisation logistique, elle ne porte aucun
 * barème public, et s'en servir donnait le tarif de proximité à toute adresse
 * qu'un admin avait rattachée à un secteur, fût-elle à 60 km.
 */
export function zoneTarifaire(client: {
  communeInsee?: string | null;
  postalCode?: string | null;
}): DeliveryZone {
  const insee = (client.communeInsee ?? "").trim();
  if (insee) {
    return communeParInsee(insee)?.zone ?? "HORS_ZONE";
  }
  return zoneParCodePostal(client.postalCode).zone;
}

/** Frais de livraison tels qu'exposés dans les réponses de l'API. */
export interface DeliveryFeeResume {
  cents: number;
  label: string;
  /** Aucun tarif public : montant à chiffrer à la main sur le devis. */
  surDevis: boolean;
}

/**
 * Relit les frais figés sur une commande.
 *
 * Le libellé se déduit du montant, sauf quand la commande porte le drapeau
 * « sur devis » : 0 € y signifie « à chiffrer », surtout pas « offerte ».
 */
export function resumeFrais(order: {
  deliveryFeeCents: number;
  deliveryFeeSurDevis: boolean;
}): DeliveryFeeResume {
  return {
    cents: order.deliveryFeeCents,
    label: order.deliveryFeeSurDevis
      ? "Livraison — sur devis"
      : deliveryLabelFromCents(order.deliveryFeeCents),
    surDevis: order.deliveryFeeSurDevis,
  };
}

/**
 * Prépare une valeur texte pour le mailer, qui valide en `.strict()` : il refuse
 * tout caractère de CONTRÔLE et borne la longueur de chaque champ.
 *
 * Sans ce passage, deux cas parfaitement ordinaires faisaient échouer l'email
 * entier en 400 : une adresse saisie sur plusieurs lignes (`User.address` est un
 * TEXT libre, et une adresse postale tient rarement sur une ligne), et un sujet
 * dépassant 200 caractères pour un client au nom long. L'échec était silencieux
 * pour l'utilisateur — la commande passe — mais l'email n'arrivait jamais.
 *
 * On replie donc les blancs sur une espace simple plutôt que de laisser le
 * mailer refuser : mieux vaut une adresse sur une ligne qu'aucun email.
 *
 * ⚠️ Replier `\s` ne SUFFIT PAS. `\s` ne couvre que les blancs ; les autres
 * caractères de contrôle (\u0000-\u0008, \u000e-\u001f, \u007f) traversaient la
 * normalisation intacts et faisaient refuser l'envoi entier. Or `name`,
 * `address` et `phone` sont écrits par le CLIENT lui-même depuis
 * `PATCH /auth/me` : un seul octet de contrôle posé sur sa fiche éteignait à la
 * fois sa confirmation et l'alerte « nouvelle commande » de l'exploitation, sans
 * la moindre trace visible. On les retire donc ici, à l'ÉMISSION — le mailer,
 * lui, continue de les refuser, et c'est très bien ainsi : deux remparts.
 */
function pourMail(valeur: string, maxLongueur: number): string {
  return (
    valeur
      // Les blancs deviennent une espace : une adresse sur trois lignes reste lisible.
      .replace(/\s+/g, " ")
      // Les autres caractères de contrôle n'ont aucune représentation utile.
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .slice(0, maxLongueur)
  );
}

/** Fiche client, telle que la création de commande a besoin de la lire. */
interface FicheClient {
  name: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  postalCode: string | null;
  /** Commune de livraison (code INSEE) — porte le palier tarifaire. */
  communeInsee: string | null;
}

export interface OrdersDeps {
  /**
   * Transport d'email — injectable pour les tests, qui ne doivent joindre aucun
   * mailer. En production, c'est le client HTTP interne de `utils/mailer.ts`.
   */
  sendMail?: (input: SendMailInput) => Promise<SendMailResult>;
}

export class OrdersService {
  private readonly sendMail: (input: SendMailInput) => Promise<SendMailResult>;

  /**
   * Envoi d'emails lancé par la dernière `create()`, détaché du fil de la requête.
   *
   * Conservé pour une seule raison : donner aux TESTS un point d'attente
   * (`attendreEmails()`). La production ne le lit jamais — elle n'a rien à
   * attendre, c'est tout l'intérêt.
   */
  private envoiEmailsEnCours: Promise<void> = Promise.resolve();

  constructor(
    private readonly prisma: PrismaClient,
    deps: OrdersDeps = {},
  ) {
    this.sendMail = deps.sendMail ?? sendTransactionalMail;
  }

  /**
   * Attend la fin des emails détachés par la dernière `create()`.
   *
   * **Réservé aux tests.** Aucune route n'a de raison d'appeler ceci : le seul
   * effet serait de remettre le mailer sur le chemin de la réponse HTTP, c'est-
   * à-dire de rétablir exactement ce que le détachement corrige.
   */
  async attendreEmails(): Promise<void> {
    await this.envoiEmailsEnCours;
  }

  async list(query: ListOrdersQuery, userId?: string, isAdmin = false) {
    const { page, limit, status, source, from, to, search } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {
      deletedAt: null,
      ...(userId ? { userId } : {}),
      ...(status ? { status } : {}),
      ...(source ? { source } : {}),
      ...(from || to
        ? {
            deliveryDate: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
      // On cherche un numéro de commande OU un client (nom, établissement) :
      // c'est ce que l'admin tape, jamais un identifiant technique.
      ...(search
        ? {
            OR: [
              { orderNumber: { contains: search, mode: "insensitive" as const } },
              { user: { name: { contains: search, mode: "insensitive" as const } } },
              { user: { companyName: { contains: search, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    };

    const [orders, total, newCount] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          items: { include: { product: { select: { name: true, range: true, category: true } } } },
          user: { select: { id: true, name: true, email: true } },
          // Devis DÉJÀ ÉMIS depuis la commande — même relation que `getById`.
          // Sans elle, la liste proposait « générer un devis » pour une commande
          // qui en avait déjà un : l'admin cliquait, la route idempotente lui
          // rendait le devis existant, et l'écran laissait croire à une émission.
          // `deletedAt` est sélectionné parce qu'un brouillon jeté doit se relire
          // comme absent — c'est la condition sous laquelle on réémet.
          quoteFromOrder: { select: { id: true, numero: true, status: true, deletedAt: true } },
        },
      }),
      this.prisma.order.count({ where }),
      // newCount: total commandes PENDING (badge sidebar, admin seulement)
      isAdmin
        ? this.prisma.order.count({ where: { status: "PENDING", deletedAt: null } })
        : Promise.resolve(0),
    ]);

    return {
      // Aplati en `generatedQuote`, exactement comme `getById` : les écrans
      // lisent la même forme qu'ils viennent de la liste ou de la fiche, et
      // `deletedAt` ne fuit pas dans la réponse.
      data: orders.map((order) => {
        const { quoteFromOrder, ...rest } = order;
        return {
          ...rest,
          generatedQuote:
            quoteFromOrder && !quoteFromOrder.deletedAt
              ? {
                  id: quoteFromOrder.id,
                  numero: quoteFromOrder.numero,
                  status: quoteFromOrder.status,
                }
              : null,
        };
      }),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      ...(isAdmin ? { meta: { newCount } } : {}),
    };
  }

  /**
   * @param userId  restreint au propriétaire de la commande (rôle CLIENT).
   * @param driverId restreint aux commandes d'une tournée que ce livreur conduit.
   *
   * Le livreur n'est ni admin ni propriétaire : il tombait donc dans la branche
   * `userId = son propre id` et **toute** commande lui renvoyait 404, y compris
   * celles de sa tournée du jour.
   */
  async getById(id: string, userId?: string, driverId?: string) {
    const where: Prisma.OrderWhereInput = { id, deletedAt: null };
    if (driverId) {
      where.deliveryStop = { round: { driverId } };
    } else if (userId) {
      where.userId = userId;
    }

    const order = await this.prisma.order.findFirst({
      where,
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, range: true, category: true } },
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            zone: { select: { id: true, name: true } },
          },
        },
        deliveryStop: true,
        quote: { select: { id: true, numero: true } },
        // Devis ÉMIS depuis cette commande — relation inverse de `quote`, à ne
        // pas confondre : `quote` dit « commande issue du devis X », celui-ci
        // « devis X émis depuis cette commande ». `deletedAt` est sélectionné
        // parce qu'un brouillon jeté doit se relire comme absent : c'est
        // exactement la condition sous laquelle `createFromOrder` réémet.
        quoteFromOrder: { select: { id: true, numero: true, status: true, deletedAt: true } },
      },
    });

    if (!order) {
      throw new NotFoundError("Commande", id);
    }

    // Récupérer l'historique de statuts depuis AuditLog
    const auditLogs = await this.prisma.auditLog.findMany({
      where: { entity: "Order", entityId: id, action: "UPDATE" },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, name: true } } },
    });

    const statusHistory = auditLogs
      .filter((log) => {
        const changes = log.changes as Record<string, unknown>;
        return changes.previousStatus !== undefined || changes.newStatus !== undefined;
      })
      .map((log) => {
        const changes = log.changes as Record<string, unknown>;
        return {
          at: log.createdAt,
          by: {
            id: log.user?.id ?? null,
            name: log.user?.name ?? null,
          },
          from: (changes.previousStatus as string) ?? null,
          to: (changes.newStatus as string) ?? null,
          raison: (changes.raison as string) ?? null,
        };
      });

    // Sorti de l'objet renvoyé : l'écran lit `generatedQuote`, une forme stable
    // qui ne laisse pas fuir `deletedAt` ni la relation brute.
    const { quoteFromOrder, ...rest } = order;
    const devisEmis =
      quoteFromOrder && !quoteFromOrder.deletedAt
        ? { id: quoteFromOrder.id, numero: quoteFromOrder.numero, status: quoteFromOrder.status }
        : null;

    return {
      ...rest,
      statusHistory,
      convertedFromQuote: order.quote ?? null,
      /** Devis déjà émis pour cette commande — `null` tant que rien n'a été généré. */
      generatedQuote: devisEmis,
      // Même forme que la réponse de création : les écrans lisent le libellé au
      // même endroit, qu'ils viennent de créer la commande ou de la rouvrir.
      deliveryFee: resumeFrais(order),
    };
  }

  /**
   * Crée une commande.
   *
   * @param ownerId  Le client PROPRIÉTAIRE de la commande (order.userId).
   * @param actorId  L'utilisateur qui effectue l'action (audit). Différent de
   *                 ownerId quand un admin passe une commande pour un client.
   * @param opts.source  Origine de la commande. MANUAL = saisie admin : dans ce
   *                 cas on ne notifie pas les admins (ils se notifieraient eux-mêmes).
   */
  async create(
    data: CreateOrderInput,
    ownerId: string,
    actorId: string,
    opts?: { source?: "MOBILE" | "QUOTE_CONVERSION" | "MANUAL" },
    ipAddress?: string,
    userAgent?: string,
  ) {
    const source = opts?.source ?? "MOBILE";

    // Fetch product prices
    const productIds = data.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, isActive: true, deletedAt: null },
    });

    // Comparaison sur les identifiants DISTINCTS : commander deux fois le même
    // produit (deux lignes du même kit) donnait un `productIds` plus long que
    // le nombre de lignes en base, et la commande était refusée en « produits
    // invalides » alors que tout était valide.
    if (products.length !== new Set(productIds).size) {
      throw new AppError(
        400,
        "INVALID_PRODUCTS",
        "Un ou plusieurs produits sont invalides ou inactifs",
      );
    }

    const productMap = new Map(products.map((p) => [p.id, p]));

    const items = data.items.map((item) => {
      const product = productMap.get(item.productId);
      if (!product) {
        throw new AppError(400, "INVALID_PRODUCTS", `Produit ${item.productId} introuvable`);
      }
      return {
        productId: item.productId,
        quantity: item.quantity,
        unitCents: product.priceCents,
        totalCents: product.priceCents * item.quantity,
      };
    });

    const totalCents = items.reduce((sum, item) => sum + item.totalCents, 0);

    // Une seule lecture de la fiche client : elle sert au barème de livraison
    // (commune, code postal de repli) ET aux emails de confirmation plus bas.
    const client = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: {
        name: true,
        companyName: true,
        email: true,
        phone: true,
        address: true,
        postalCode: true,
        communeInsee: true,
      },
    });

    const deliveryDate = new Date(data.deliveryDate);

    // Frais de livraison : le barème vit dans `@lingengo/shared` et NULLE PART
    // ailleurs — la vitrine, le devis, le contrat et l'API doivent annoncer le
    // même prix au même client. On ne lui fournit ici que ses trois entrées.
    //
    // Le délai se compte en jours de CALENDRIER : la date de livraison désigne
    // un jour, pas un instant. Une date déjà passée donne un délai négatif, donc
    // le niveau le plus urgent — c'est la lecture honnête d'une commande à
    // livrer « pour hier », et le seul autre choix serait d'inventer un tarif.
    //
    // Le nombre de kits n'est plus compté : la gratuité « dès 4 kits à Orange »
    // a disparu le jour où Orange est devenue gratuite sans condition. Le champ
    // reste accepté par le barème (déprécié), le lui passer ne changerait rien.
    // Passage groupé : la remise de 50 % ne s'applique QUE si trois faits sont
    // vrais en même temps — une tournée est planifiée ce jour-là dans la commune
    // du client, et le client a répondu qu'il voulait du linge. Sans réponse
    // enregistrée, aucune remise : sinon toute commande passée un jour de
    // tournée serait remisée à l'insu de l'exploitant.
    const passage = await new PassagesService(this.prisma)
      .remiseApplicable(ownerId, deliveryDate)
      // Une remise est un CONFORT ; une commande est le métier. Si l'évaluation
      // échoue (table absente sur un environnement en retard de migration, base
      // momentanément indisponible), on facture le plein tarif et la commande
      // passe — l'inverse ferait perdre une vente pour une réduction.
      .catch(() => ({ applicable: false, opportunityId: null }));

    const fee = computeDeliveryFee({
      zone: client ? zoneTarifaire(client) : "HORS_ZONE",
      delaiJours: differenceInCalendarDays(new Date(), deliveryDate),
      // Aucune remise sur une commande : le sous-total des articles EST le
      // montant après remise attendu par le barème.
      montantApresRemiseCents: totalCents,
      passageGroupe: passage.applicable,
    });

    // `surDevis` ⇒ 0 en base et le drapeau qui l'explique. Enregistrer le
    // `cents` du barème serait ici enregistrer un montant inventé : hors zone et
    // Flash n'ont AUCUN tarif public, ils se chiffrent à la main sur le devis.
    const deliveryFeeCents = fee.surDevis ? 0 : fee.cents;

    // orderNumber est aléatoire sur 3 octets : la collision est rare mais réelle
    // (contrainte unique → P2002). On retente avec un nouveau tirage.
    const year = new Date().getFullYear();
    const MAX_ATTEMPTS = 3;

    const insert = (num: string) =>
      this.prisma.order.create({
        data: {
          userId: ownerId,
          orderNumber: num,
          totalCents,
          deliveryFeeCents,
          deliveryFeeSurDevis: fee.surDevis,
          source,
          deliveryDate,
          timeSlot: data.timeSlot,
          specialNotes: data.specialNotes,
          items: {
            create: items,
          },
        },
        // Même forme que `GET /orders/:id` : le mobile amorce son cache de
        // détail avec cette réponse (`setQueryData(["order", id], order)`), et
        // l'écran y lit le client et sa zone. Sans eux, la fiche s'ouvrait
        // amputée jusqu'au premier rafraîchissement.
        include: {
          items: {
            include: {
              product: { select: { id: true, name: true, range: true, category: true } },
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              zone: { select: { id: true, name: true } },
            },
          },
        },
      });

    let order: Awaited<ReturnType<typeof insert>>;
    let orderNumber = "";
    let attempt = 0;

    for (;;) {
      attempt += 1;
      orderNumber = `LNG-${year}-${randomBytes(3).toString("hex").toUpperCase()}`;

      try {
        order = await insert(orderNumber);
        break;
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === "P2002" && attempt < MAX_ATTEMPTS) {
          continue;
        }
        throw err;
      }
    }

    await createAuditLog({
      prisma: this.prisma,
      userId: actorId,
      action: "CREATE",
      entity: "Order",
      entityId: order.id,
      changes: {
        orderNumber,
        totalCents,
        deliveryFeeCents,
        // Tracé : c'est la seule trace qui explique pourquoi une commande hors
        // zone porte 0 € de livraison sans que personne n'ait fait de cadeau.
        ...(fee.surDevis ? { deliveryFeeSurDevis: true } : {}),
        itemCount: items.length,
        source,
        ...(actorId !== ownerId ? { onBehalfOf: ownerId } : {}),
      },
      ipAddress,
      userAgent,
    });

    // Badge « Commandes ». Best effort, ne peut pas faire échouer la commande.
    // Inutile sur MANUAL : c'est l'admin lui-même qui vient de saisir la commande.
    if (source !== "MANUAL") {
      await new NotificationsService(this.prisma).notifyAdmins(
        "ORDER_CREATED",
        `Nouvelle commande ${orderNumber}`,
        `${items.length} article(s) — ${(totalCents / 100).toFixed(2)} €`,
        { orderId: order.id, orderNumber, href: `/commandes/${order.id}` },
      );
    }

    // ⚠️ PAS de `await` : les emails partent HORS du fil de la requête.
    //
    // Attendus ici, ils s'ajoutaient au temps de réponse de `POST /orders` :
    // un envoi client, puis un par gestionnaire, chacun pouvant courir jusqu'au
    // timeout de 10 s du mailer. Avec trois administrateurs, la requête pouvait
    // dépasser les 20 s au bout desquelles le mobile abandonne — le client
    // voyait « Erreur », repassait sa commande, et la première était pourtant
    // bien enregistrée. Le numéro de commande étant tiré au hasard, rien ne
    // dédoublonnait les deux. Même raisonnement que `notify()` pour le push.
    //
    // La méthode n'échoue jamais (elle absorbe tout) ; le `.catch` est le filet
    // qui garantit qu'aucun rejet ne devienne un `unhandledRejection`.
    this.envoiEmailsEnCours = this.envoyerEmailsCommande({
      order: {
        orderNumber,
        deliveryDate,
        timeSlot: data.timeSlot ?? null,
        totalCents,
        deliveryFeeCents,
        deliveryFeeSurDevis: fee.surDevis,
        source,
      },
      clientId: ownerId,
      client,
      lignes: items.map((item) => ({
        // `||` : le mailer exige `designation: z.string().min(1)` et refuserait
        // l'email ENTIER pour un nom de produit vide.
        designation: productMap.get(item.productId)?.name || "Article",
        qty: item.quantity,
      })),
    }).catch((err: unknown) => {
      const raison = err instanceof Error ? err.message : String(err);
      console.error(`[orders] Emails de commande abandonnés (${orderNumber}) : ${raison}`);
    });

    // `deliveryFee` en plus des colonnes : l'appelant a besoin du LIBELLÉ et du
    // « sur devis » pour dire au client ce qu'il paie, sans réimplémenter le
    // barème côté mobile ou admin.
    return { ...order, deliveryFee: resumeFrais(order) };
  }

  // ---- Emails de commande (best effort) ---------------------------------------

  /**
   * Confirme la commande au client et la signale aux gestionnaires.
   *
   * **Ne lève JAMAIS.** Une commande enregistrée est un engagement pris : la
   * perdre parce que le mailer est indisponible serait le pire des échanges.
   * Chaque envoi est donc isolé, et l'échec ne laisse qu'une ligne de log — la
   * notification in-app, elle, est déjà partie et fait foi.
   *
   * Un client sans email (fiche créée par l'admin, rencontré au téléphone) n'est
   * pas une erreur : c'est le cas le plus courant, on saute simplement son envoi.
   *
   * **Appelée SANS `await`** par `create()` : le temps du mailer n'appartient pas
   * à la requête du client. Les tests s'y raccrochent par `attendreEmails()`.
   */
  private async envoyerEmailsCommande(input: {
    order: {
      orderNumber: string;
      deliveryDate: Date;
      timeSlot: string | null;
      totalCents: number;
      deliveryFeeCents: number;
      deliveryFeeSurDevis: boolean;
      source: string;
    };
    clientId: string;
    client: FicheClient | null;
    lignes: { designation: string; qty: number }[];
  }): Promise<void> {
    const { order, client, clientId, lignes } = input;

    try {
      const montants = {
        sousTotalCents: order.totalCents,
        livraisonCents: order.deliveryFeeCents,
        totalCents: order.totalCents + order.deliveryFeeCents,
        livraisonSurDevis: order.deliveryFeeSurDevis,
      };
      const commande = {
        orderNumber: order.orderNumber,
        dateLivraison: toMailDate(order.deliveryDate),
        ...(order.timeSlot ? { creneau: pourMail(order.timeSlot, 20) } : {}),
        lignes: lignes.map((l) => ({ designation: pourMail(l.designation, 300), qty: l.qty })),
        ...montants,
      };

      // `||` et NON `??` : `??` ne se déclenche que sur null/undefined, et le
      // schéma serveur accepte un `companyName` VIDE (`z.string().max(200)`,
      // sans `.min(1)`). Une chaîne vide traversait donc jusqu'au mailer, qui
      // exige `clientNom: z.string().min(1)` et refuse l'envoi ENTIER en 400 —
      // silencieusement, puisque l'échec d'email ne remonte jamais. Un seul
      // champ laissé vide sur une fiche éteignait la confirmation du client ET
      // l'alerte de l'exploitation.
      const nomClient = pourMail(client?.companyName || client?.name || "Client", 200) || "Client";

      // 1) Confirmation au client.
      //
      // `try/catch` PROPRE, distinct de celui des gestionnaires : les deux
      // envois n'ont aucune raison de tomber ensemble, et un bloc unique faisait
      // qu'une adresse client refusée privait aussi l'exploitation de son alerte.
      try {
        if (client?.email && (await emailAutorise(this.prisma, clientId, "ORDER_CREATED"))) {
          const envoi = await this.sendMail({
            to: client.email,
            subject: `Votre commande ${order.orderNumber} est enregistrée`,
            template: "order_confirmation_client",
            data: {
              clientNom: nomClient,
              ...commande,
            },
          });
          if (!envoi.ok) {
            console.error(`[orders] Email client échoué (${order.orderNumber}) : ${envoi.error}`);
          }
        }
      } catch (err) {
        const raison = err instanceof Error ? err.message : String(err);
        console.error(`[orders] Email client abandonné (${order.orderNumber}) : ${raison}`);
      }

      // 2) Signalement aux gestionnaires — sauf sur MANUAL : l'admin destinataire
      //    est celui qui vient de saisir la commande, se l'envoyer n'apprend rien.
      //    Même règle que la notification in-app juste au-dessus.
      if (order.source === "MANUAL") return;

      const admins = await this.prisma.user.findMany({
        where: {
          role: { in: ["ROLE_ADMIN", "ROLE_SUPER_ADMIN"] },
          isActive: true,
          deletedAt: null,
        },
        select: { id: true, email: true },
      });

      // UNE requête de préférences pour tous les gestionnaires, et non une par
      // admin : le `emailAutorise` unitaire dans la boucle était un N+1 sur le
      // chemin de création de commande.
      const destinataires = admins.filter((a): a is { id: string; email: string } =>
        Boolean(a.email),
      );
      const autorises = await emailsAutorises(
        this.prisma,
        destinataires.map((a) => a.id),
        "ORDER_CREATED",
      );

      // `allSettled` et non une boucle séquentielle : les envois sont
      // indépendants, les enchaîner faisait payer à la commande la somme des
      // timeouts (jusqu'à 10 s CHACUN) au lieu du plus lent.
      const envois = await Promise.allSettled(
        destinataires
          .filter((admin) => autorises.has(admin.id))
          .map((admin) =>
            this.sendMail({
              to: admin.email,
              // Sujet borné à 200 : au-delà, le mailer refuse tout l'envoi. Un nom
              // d'établissement long suffisait à dépasser la limite.
              subject: pourMail(`Nouvelle commande ${order.orderNumber} — ${nomClient}`, 200),
              template: "order_notification_owner",
              data: {
                ...commande,
                clientNom: nomClient,
                ...(client?.email ? { clientEmail: client.email } : {}),
                ...(client?.phone ? { clientTel: pourMail(client.phone, 20) } : {}),
                ...(client?.address ? { clientAdresse: pourMail(client.address, 500) } : {}),
                source: order.source,
              },
            }),
          ),
      );

      for (const envoi of envois) {
        const raison =
          envoi.status === "rejected"
            ? envoi.reason instanceof Error
              ? envoi.reason.message
              : String(envoi.reason)
            : envoi.value.ok
              ? null
              : envoi.value.error;
        if (raison) {
          console.error(`[orders] Email gestionnaire échoué (${order.orderNumber}) : ${raison}`);
        }
      }
    } catch (err) {
      // Filet de dernier recours : même une panne Prisma (lecture des
      // gestionnaires, des préférences) ne doit pas remonter jusqu'ici.
      const raison = err instanceof Error ? err.message : String(err);
      console.error(`[orders] Emails de commande abandonnés (${order.orderNumber}) : ${raison}`);
    }
  }

  async cancel(
    id: string,
    userId: string,
    input: CancelOrderInput,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const order = await this.prisma.order.findFirst({
      where: { id, userId, deletedAt: null },
    });

    if (!order) {
      throw new NotFoundError("Commande", id);
    }

    if (order.status === "CANCELLED" || order.status === "DELIVERED") {
      throw new AppError(400, "INVALID_STATUS", "Cette commande ne peut pas être annulée");
    }

    // Check >24h before delivery
    const hoursBeforeDelivery = (order.deliveryDate.getTime() - Date.now()) / (1000 * 60 * 60);

    if (hoursBeforeDelivery < 24) {
      throw new AppError(
        400,
        "CANCEL_TOO_LATE",
        "Annulation impossible : la livraison est prévue dans moins de 24h",
      );
    }

    await this.prisma.order.update({
      where: { id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledReason: input.reason,
      },
    });

    await createAuditLog({
      prisma: this.prisma,
      userId,
      action: "UPDATE",
      entity: "Order",
      entityId: id,
      changes: { status: "CANCELLED", reason: input.reason },
      ipAddress,
      userAgent,
    });

    // Annulation par le client : si une rotation avait déjà été ouverte, elle
    // est annulée avec la commande — et le linge ne revient en stock que s'il en
    // était réellement sorti.
    await new RotationsService(this.prisma).syncFromOrder(id, { adminId: userId });

    // La MÊME forme que `GET /orders/:id`. La ligne Prisma nue renvoyée
    // auparavant n'avait pas `items` : un écran qui écrasait son cache avec
    // cette réponse plantait au rendu suivant sur `order.items.map()`.
    return this.getById(id);
  }

  async updateStatus(
    id: string,
    input: UpdateOrderStatusInput,
    adminId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const order = await this.prisma.order.findFirst({
      where: { id, deletedAt: null },
      include: { user: { select: { id: true, name: true } } },
    });

    if (!order) {
      throw new NotFoundError("Commande", id);
    }

    const from = order.status as OrderStatus;
    const to = input.status as OrderStatus;
    const allowedTransitions = ORDER_TRANSITIONS[from] ?? [];

    if (!allowedTransitions.includes(to)) {
      throw new UnprocessableEntityError(
        `Transition de statut non autorisée : ${from} → ${to}`,
        "INVALID_TRANSITION",
      );
    }

    await this.prisma.order.update({
      where: { id },
      data: {
        status: to,
        ...(to === "CANCELLED"
          ? {
              cancelledAt: new Date(),
              cancelledReason: input.raison ?? null,
            }
          : {}),
      },
    });

    await createAuditLog({
      prisma: this.prisma,
      userId: adminId,
      action: "UPDATE",
      entity: "Order",
      entityId: id,
      changes: {
        previousStatus: from,
        newStatus: to,
        ...(input.raison ? { raison: input.raison } : {}),
      },
      ipAddress,
      userAgent,
    });

    // Notification client best-effort (F2)
    if (order.userId && (to === "CONFIRMED" || to === "CANCELLED")) {
      try {
        const notifService = new NotificationsService(this.prisma);
        const title =
          to === "CONFIRMED"
            ? `Votre commande #${order.orderNumber} a été confirmée`
            : `Votre commande #${order.orderNumber} a été refusée`;
        const body =
          to === "CANCELLED" && input.raison
            ? `Votre commande #${order.orderNumber} a été refusée : ${input.raison}`
            : title;

        await notifService.create(order.userId, "GENERAL", title, body);
      } catch {
        // Notification non bloquante — ignorer silencieusement
      }
    }

    // Le linge suit la commande : confirmée, elle entre au calendrier des
    // rotations (livraison + échéance de reprise) ; livrée, elle sort le linge
    // du parc ; annulée, elle le rend. `syncFromOrder` n'échoue jamais et le
    // cron de rattrapage repasse derrière — le statut vient d'être écrit, il ne
    // doit pas dépendre de la réussite de cet effet de bord.
    await new RotationsService(this.prisma).syncFromOrder(id, { adminId });

    // Même forme que `GET /orders/:id` — cf. `cancel()`.
    return this.getById(id);
  }

  // ---- Suppression douce (DELETE /orders/:id) ---------------------------------

  /**
   * Soft-delete d'une commande — PENDING ou CANCELLED uniquement.
   *
   * Au-delà, la commande est engagée dans la chaîne logistique et comptable :
   * une commande CONFIRMED a pu générer un arrêt de tournée, une DELIVERED est
   * adossée à une facture. La faire disparaître d'un clic désaccorderait la
   * facturation du réel. Ces états-là s'annulent (PATCH /:id/status → CANCELLED),
   * ce qui conserve la trace, puis se suppriment.
   */
  async softDelete(id: string, adminId: string, ipAddress?: string, userAgent?: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, status: true, orderNumber: true },
    });

    if (!order) {
      throw new NotFoundError("Commande", id);
    }

    if (!ORDER_DELETABLE.includes(order.status)) {
      throw new UnprocessableEntityError(
        `Une commande ${order.status} ne peut pas être supprimée — annulez-la d'abord (statut CANCELLED)`,
        "ORDER_NOT_DELETABLE",
      );
    }

    // La rotation d'une commande n'a aucune vie propre : elle décrit le linge
    // sorti POUR cette commande. La laisser derrière ferait subsister au
    // planning une ligne rattachée à une commande qui n'existe plus, et que rien
    // ne permettrait de rouvrir. Seuls PENDING et CANCELLED arrivent ici — la
    // garde ci-dessus l'impose — donc la rotation est forcément prévisionnelle
    // ou déjà annulée : son linge est déjà rendu, aucun mouvement de parc à
    // rejouer.
    const { count: rotations } = await this.prisma.rotation.updateMany({
      where: { orderId: id, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    await this.prisma.order.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await createAuditLog({
      prisma: this.prisma,
      userId: adminId,
      action: "DELETE",
      entity: "Order",
      entityId: id,
      changes: {
        orderNumber: order.orderNumber,
        previousStatus: order.status,
        ...(rotations > 0 ? { rotationsSupprimees: rotations } : {}),
      },
      ipAddress,
      userAgent,
    });

    return { id, deleted: true };
  }
}
