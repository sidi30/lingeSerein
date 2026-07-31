import type { PrismaClient, Prisma } from "@prisma/client";
import {
  NotFoundError,
  AppError,
  ForbiddenError,
  UnprocessableEntityError,
} from "../utils/errors.js";
import { createAuditLog } from "../utils/audit.js";
import { RotationsService } from "./rotations.service.js";
import { notify, emailAutorise } from "../utils/notify.js";
import {
  sendTransactionalMail,
  toMailDate,
  type SendMailInput,
  type SendMailResult,
} from "../utils/mailer.js";
import type {
  CreateRoundInput,
  ListRoundsQuery,
  CompleteStopInput,
} from "../schemas/deliveries.schema.js";

/**
 * Ce que le livreur doit connaître d'un client pour honorer un arrêt.
 *
 * `companyName` est le nom de l'ÉTABLISSEMENT (hôtel, gîte, chambre d'hôtes) ;
 * `name` est celui du contact. Le livreur sonne à une enseigne, pas à un nom de
 * famille : sans `companyName`, il cherchait « M. Durand » sur une façade qui
 * affiche « Hôtel du Pont ».
 *
 * `city` et `postalCode` accompagnent `address` parce que `User.address` est un
 * champ libre qui, en pratique, ne porte souvent que la rue (« 12 rue des
 * Teinturiers ») : la commune vit dans sa propre colonne. Renvoyer `address`
 * seule donnait une adresse ininterprétable par un GPS dès que le client avait
 * saisi son adresse proprement, en colonnes séparées.
 *
 * Constante partagée, et non copiée : ce `select` apparaissait à l'identique dans
 * quatre méthodes, et un champ ajouté à l'une manquait aux trois autres — l'écran
 * du livreur perdait alors l'information selon le chemin par lequel il arrivait.
 */
const CLIENT_ARRET_SELECT = {
  id: true,
  name: true,
  companyName: true,
  address: true,
  city: true,
  postalCode: true,
  phone: true,
} as const;

/** Profondeur d'historique servie au livreur sur `listMyRounds`. */
const FENETRE_PASSEE_JOURS = 7;
/** Horizon de planification servi au livreur sur `listMyRounds`. */
const FENETRE_FUTURE_JOURS = 30;

/** Date lisible dans une notification : « lundi 3 août ». */
function formatDateFr(date: Date): string {
  return date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

/**
 * Prépare une valeur texte libre pour le mailer, qui valide en `.strict()` : il
 * refuse tout caractère de CONTRÔLE (sa protection contre l'injection d'en-têtes)
 * et borne la longueur de chaque champ.
 *
 * Un nom de livreur collé depuis un tableur avec un retour à la ligne suffisait à
 * faire échouer TOUT l'email en 400 — silencieusement pour l'utilisateur, la
 * tournée étant créée dans tous les cas. On replie donc les blancs sur une espace
 * simple plutôt que de laisser le mailer refuser.
 *
 * Volontairement redéfini ici plutôt qu'importé d'`orders.service.ts` : un service
 * qui importe le helper privé d'un autre service crée un couplage que rien ne
 * justifie, et cette fonction tient en une ligne.
 */
function pourMail(valeur: string, maxLongueur: number): string {
  return (
    valeur
      // Les blancs deviennent une espace : un libellé sur deux lignes reste lisible.
      .replace(/\s+/g, " ")
      // Les AUTRES caractères de contrôle, que la classe des blancs ne couvre
      // pas, n'ont aucune représentation utile et feraient refuser l'envoi
      // entier — même règle que dans `orders.service.ts`.
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .slice(0, maxLongueur)
  );
}

export interface DeliveriesDeps {
  /**
   * Transport d'email — injectable pour les tests, qui ne doivent joindre aucun
   * mailer. En production, c'est le client HTTP interne de `utils/mailer.ts`.
   * Même convention que `OrdersDeps`.
   */
  sendMail?: (input: SendMailInput) => Promise<SendMailResult>;
}

export class DeliveriesService {
  private readonly sendMail: (input: SendMailInput) => Promise<SendMailResult>;

  constructor(
    private readonly prisma: PrismaClient,
    deps: DeliveriesDeps = {},
  ) {
    this.sendMail = deps.sendMail ?? sendTransactionalMail;
  }

  async listRounds(query: ListRoundsQuery) {
    const { page, limit, status, driverId, from, to } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.DeliveryRoundWhereInput = {
      ...(status ? { status } : {}),
      ...(driverId ? { driverId } : {}),
      ...(from || to
        ? {
            date: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    };

    const [rounds, total] = await Promise.all([
      this.prisma.deliveryRound.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: "desc" },
        include: {
          driver: { select: { id: true, name: true } },
          zone: { select: { id: true, name: true } },
          stops: {
            orderBy: { stopOrder: "asc" },
            select: {
              id: true,
              stopOrder: true,
              status: true,
              setsToDeliver: true,
              client: { select: CLIENT_ARRET_SELECT },
            },
          },
          _count: { select: { stops: true } },
        },
      }),
      this.prisma.deliveryRound.count({ where }),
    ]);

    return {
      // `driverName` aplati et `stops` inclus : la page Planning de l'admin rendait
      // `{r.driver}` (un objet — « Objects are not valid as a React child ») et lisait
      // `r.stops.length` sur une propriété que cette route ne renvoyait pas. L'écran
      // ne plantait que dès la première tournée créée, l'état vide masquant le défaut.
      // `driver` est conservé pour ne casser aucun appelant existant.
      data: rounds.map((r) => ({
        ...r,
        driverName: r.driver?.name ?? null,
        zoneName: r.zone?.name ?? null,
        stopsCount: r._count.stops,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async createRound(
    data: CreateRoundInput,
    operatorId: string,
    adminId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const round = await this.prisma.deliveryRound.create({
      data: {
        operatorId,
        zoneId: data.zoneId,
        driverId: data.driverId,
        date: new Date(data.date),
        notes: data.notes,
        stops: {
          create: data.stops.map((stop) => ({
            orderId: stop.orderId,
            clientId: stop.clientId,
            driverId: data.driverId,
            stopOrder: stop.stopOrder,
            setsToDeliver: stop.setsToDeliver,
            specialInstructions: stop.specialInstructions,
          })),
        },
      },
      include: {
        stops: { include: { client: { select: CLIENT_ARRET_SELECT } } },
        // `email` : sans lui, impossible d'écrire au livreur — c'était la seule
        // raison pour laquelle la relation était relue juste après. `zone` sert
        // au courrier (« Avignon centre ») et aligne cette réponse sur celle de
        // `listRounds`, qui l'expose déjà.
        driver: { select: { id: true, name: true, email: true } },
        zone: { select: { id: true, name: true } },
      },
    });

    await createAuditLog({
      prisma: this.prisma,
      userId: adminId,
      action: "CREATE",
      entity: "DeliveryRound",
      entityId: round.id,
      changes: { date: data.date, stopsCount: data.stops.length, driverId: data.driverId },
      ipAddress,
      userAgent,
    });

    // Le livreur découvrait ses tournées en ouvrant l'application le jour même —
    // et encore, seulement si elles étaient datées du jour. Une affectation faite
    // la veille au soir ne déclenchait STRICTEMENT rien. Effet de bord, donc hors
    // du chemin critique : une notification perdue ne doit pas annuler une
    // tournée correctement enregistrée.
    await this.notifierAffectationLivreur({
      roundId: round.id,
      driverId: round.driverId,
      driverNom: round.driver?.name ?? null,
      driverEmail: round.driver?.email ?? null,
      zoneName: round.zone?.name ?? null,
      date: round.date,
      stopsCount: round.stops.length,
    });

    return round;
  }

  /**
   * Prévient un livreur qu'une tournée vient de lui être affectée.
   *
   * **Ne lève jamais.** Extraite en méthode dédiée parce qu'une réaffectation
   * (changement de `driverId` sur une tournée existante) devra emprunter
   * exactement le même chemin : aucune route ne le permet aujourd'hui, mais le
   * jour où elle existera, c'est un appel, pas une réimplémentation.
   *
   * `DELIVERY_REMINDER` : l'enum `NotificationType` n'a pas de valeur
   * « affectation », et c'est bien la sémantique la plus proche — on annonce au
   * livreur une livraison à venir. Aucune migration.
   *
   * Deux canaux, deux `try/catch` SÉPARÉS et non un seul englobant : la
   * notification in-app et l'email n'ont aucune raison de tomber ensemble, et un
   * bloc unique aurait fait qu'une panne Redis prive aussi le livreur de son
   * courrier — alors que c'est justement le canal de secours.
   */
  private async notifierAffectationLivreur(params: {
    roundId: string;
    driverId: string;
    driverNom: string | null;
    driverEmail: string | null;
    zoneName: string | null;
    date: Date;
    stopsCount: number;
  }): Promise<void> {
    try {
      await notify(this.prisma, {
        userId: params.driverId,
        type: "DELIVERY_REMINDER",
        channel: "BOTH",
        title: "Nouvelle tournée à votre nom",
        body:
          `Tournée du ${formatDateFr(params.date)} — ${params.stopsCount} arrêt(s). ` +
          `Retrouvez-la dans « Mes tournées ».`,
        // Même convention que `rotation.worker.ts` : `type` + identifiant de
        // l'entité, plus un `path`. Le chemin vise l'écran de tournée (`/tournee`)
        // et non `/tournee/<id>` : cette route n'existe pas côté mobile, et un
        // deep-link vers un écran inexistant n'ouvre rien du tout.
        data: {
          type: "DELIVERY_REMINDER",
          roundId: params.roundId,
          date: params.date.toISOString(),
          stopsCount: params.stopsCount,
          path: "/tournee",
        } as Prisma.InputJsonValue,
      });
    } catch (err) {
      const raison = err instanceof Error ? err.message : String(err);
      console.error(
        `[deliveries] Notification d'affectation abandonnée (tournée ${params.roundId}) : ${raison}`,
      );
    }

    // ---- Email ----
    //
    // Un livreur qui n'ouvre pas l'application de la soirée ne verra ni la
    // notification ni le badge : l'email est le seul canal qui le rattrape.
    try {
      // Un livreur créé par l'admin sans adresse (compte « hors ligne ») n'a
      // rien à recevoir — ce n'est pas une erreur, on sort en silence.
      if (!params.driverEmail) return;

      // La préférence du destinataire fait autorité, comme dans les crons de
      // rotation : un livreur qui a coupé l'email sur ce type ne doit pas en
      // recevoir un par ce chemin-là.
      if (!(await emailAutorise(this.prisma, params.driverId, "DELIVERY_REMINDER"))) return;

      const envoi = await this.sendMail({
        to: params.driverEmail,
        // Sujet entièrement construit ici (date normalisée + entier) : aucune
        // donnée libre venant de la base, donc rien à assainir et aucun risque
        // de dépasser la borne de longueur du mailer.
        subject: `Nouvelle tournée le ${toMailDate(params.date)} — ${params.stopsCount} arrêt(s)`,
        template: "round_assigned_driver",
        data: {
          // `livreurNom` et `zone` viennent de champs libres de la base : le
          // mailer refuse en 400 tout caractère de contrôle (sa protection
          // contre l'injection d'en-têtes) et borne les longueurs. Un nom
          // collé depuis un tableur avec un retour à la ligne suffisait à faire
          // échouer TOUT l'email.
          // Repli sur « Livreur » et non chaîne vide : le mailer exige
          // `livreurNom: z.string().min(1)` et refuse l'envoi ENTIER en 400. Un
          // livreur dont le nom est vide (ou fait de seuls caractères que
          // `pourMail` retire) n'aurait jamais reçu sa tournée, sans autre trace
          // qu'une ligne de log.
          livreurNom: pourMail(params.driverNom ?? "", 200) || "Livreur",
          // ⚠️ `toMailDate` et NON `toISOString` : le mailer exige AAAA-MM-JJ
          // strict, et `toISOString` convertit en UTC — une tournée créée le
          // soir en heure d'été serait annoncée la veille de sa date réelle.
          datePassage: toMailDate(params.date),
          stopsCount: params.stopsCount,
          ...(params.zoneName ? { zone: pourMail(params.zoneName, 200) } : {}),
        },
      });

      if (!envoi.ok) {
        console.error(
          `[deliveries] Email d'affectation échoué (tournée ${params.roundId}) : ${envoi.error}`,
        );
      }
    } catch (err) {
      // `sendTransactionalMail` absorbe déjà ses erreurs réseau, mais une panne
      // Prisma sur la lecture des préférences passerait par ici : la tournée est
      // créée, elle ne doit pas être annulée pour un courrier.
      const raison = err instanceof Error ? err.message : String(err);
      console.error(
        `[deliveries] Email d'affectation abandonné (tournée ${params.roundId}) : ${raison}`,
      );
    }
  }

  async getRoundById(id: string, userId?: string, userRole?: string) {
    const round = await this.prisma.deliveryRound.findUnique({
      where: { id },
      include: {
        stops: {
          orderBy: { stopOrder: "asc" },
          include: {
            client: { select: CLIENT_ARRET_SELECT },
            order: { select: { id: true, orderNumber: true } },
          },
        },
        driver: { select: { id: true, name: true } },
        zone: { select: { id: true, name: true } },
      },
    });

    if (!round) {
      throw new NotFoundError("Tournée", id);
    }

    // Driver can only see their own rounds
    if (userRole === "ROLE_LIVREUR" && round.driverId !== userId) {
      throw new ForbiddenError("Vous ne pouvez accéder qu'à vos propres tournées");
    }

    return round;
  }

  async getTodayRound(driverId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const round = await this.prisma.deliveryRound.findFirst({
      where: {
        driverId,
        date: { gte: today, lt: tomorrow },
        // COMPLETED incluse : sans elle, la tournée s'évanouissait à l'instant
        // même où le livreur la clôturait, et son écran retombait sur « Aucune
        // tournée aujourd'hui » — impossible de relire ce qu'il venait de faire.
        status: { in: ["PLANNED", "IN_PROGRESS", "COMPLETED"] },
      },
      include: {
        stops: {
          orderBy: { stopOrder: "asc" },
          include: {
            client: { select: CLIENT_ARRET_SELECT },
            order: { select: { id: true, orderNumber: true } },
          },
        },
        zone: { select: { id: true, name: true } },
      },
    });

    return round;
  }

  /**
   * Les tournées DU LIVREUR COURANT, à venir et récentes.
   *
   * `getTodayRound` était sa seule fenêtre sur le planning, et elle ne montre que
   * la journée en cours : une tournée créée pour demain lui était littéralement
   * invisible, d'où le « je n'ai rien reçu, je ne vois rien » remonté par
   * l'exploitation. Cette méthode ouvre la fenêtre sans toucher à `/today`, dont
   * l'application dépend.
   *
   * ⚠️ `driverId` est un PARAMÈTRE DISTINCT, et le type de `query` l'exclut
   * explicitement (`Omit<…, "driverId">`). Ce n'est pas de la cosmétique : tant
   * que le filtre voyage dans le même objet que la requête HTTP, il suffit d'un
   * `...query` distrait pour qu'un `?driverId=` de l'appelant écrase le périmètre
   * et lui ouvre les tournées d'un collègue. Ici, le compilateur refuse.
   *
   * Fenêtre par défaut : les 7 derniers jours (relire une tournée close, vérifier
   * ce qu'on a livré) et les 30 prochains (s'organiser). Bornes explicites plutôt
   * qu'illimitées : un livreur en poste depuis deux ans n'a pas à télécharger
   * deux ans d'historique pour savoir ce qu'il fait demain.
   */
  async listMyRounds(driverId: string, query: Omit<ListRoundsQuery, "driverId">) {
    const { page, limit, status, from, to } = query;
    const skip = (page - 1) * limit;

    const debutParDefaut = new Date();
    debutParDefaut.setHours(0, 0, 0, 0);
    debutParDefaut.setDate(debutParDefaut.getDate() - FENETRE_PASSEE_JOURS);

    const finParDefaut = new Date();
    finParDefaut.setHours(23, 59, 59, 999);
    finParDefaut.setDate(finParDefaut.getDate() + FENETRE_FUTURE_JOURS);

    const where: Prisma.DeliveryRoundWhereInput = {
      driverId,
      ...(status ? { status } : {}),
      date: {
        gte: from ? new Date(from) : debutParDefaut,
        lte: to ? new Date(to) : finParDefaut,
      },
    };

    const [rounds, total] = await Promise.all([
      this.prisma.deliveryRound.findMany({
        where,
        skip,
        take: limit,
        // Croissant, contrairement à la liste admin : le livreur veut savoir ce
        // qui l'attend, pas ce qu'il a déjà fait.
        orderBy: { date: "asc" },
        include: {
          zone: { select: { id: true, name: true } },
          stops: {
            orderBy: { stopOrder: "asc" },
            include: {
              client: { select: CLIENT_ARRET_SELECT },
              order: { select: { id: true, orderNumber: true } },
            },
          },
          _count: { select: { stops: true } },
        },
      }),
      this.prisma.deliveryRound.count({ where }),
    ]);

    return {
      // Mêmes champs aplatis que `listRounds` : l'écran mobile n'a pas à
      // connaître deux formes de tournée selon la route qui la lui a servie.
      data: rounds.map((r) => ({
        ...r,
        zoneName: r.zone?.name ?? null,
        stopsCount: r._count.stops,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async completeStop(
    stopId: string,
    data: CompleteStopInput,
    driverId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const stop = await this.prisma.deliveryStop.findUnique({
      where: { id: stopId },
      include: { round: true },
    });

    if (!stop) {
      throw new NotFoundError("Arrêt de livraison", stopId);
    }

    if (stop.driverId !== driverId) {
      throw new ForbiddenError("Cet arrêt ne vous est pas attribué");
    }

    if (stop.status === "COMPLETED") {
      throw new AppError(400, "ALREADY_COMPLETED", "Cet arrêt a déjà été complété");
    }

    // ---- Ventilation par gamme, calculée AVANT d'ouvrir la transaction ----
    //
    // Ancien comportement, corrigé précédemment : la gamme était celle du PREMIER
    // article de la commande (`items.take(1)`) pour la livraison, et « CONFORT »
    // CODÉE EN DUR pour toute reprise de linge sale. Une commande mixte imputait
    // donc tout son volume à une seule gamme, et 100 % du linge sale repris était
    // compté sur CONFORT — y compris pour un client qui n'en a jamais eu.
    //
    // Règle retenue : on n'écrit un mouvement que sur une gamme RÉELLEMENT
    // connue, article par article. Quand la commande est absente (l'admin crée
    // ses arrêts à partir du seul `clientId`), aucune gamme n'est inventée : on
    // n'écrit pas de mouvement legacy plutôt que d'en écrire un faux. La
    // comptabilité qui fait foi est de toute façon celle par slug.
    const order = stop.orderId
      ? await this.prisma.order.findUnique({
          where: { id: stop.orderId },
          include: { items: { include: { product: true } } },
        })
      : null;

    const itemsAvecGamme = (order?.items ?? []).filter((i) => i.product?.range);

    const parGamme = new Map<string, number>();
    for (const item of itemsAvecGamme) {
      const range = item.product.range as string;
      parGamme.set(range, (parGamme.get(range) ?? 0) + item.quantity);
    }

    // Le livreur saisit un total de linge sale, sans ventilation par article. On
    // l'impute à la gamme MAJORITAIRE de la commande — approximation assumée et
    // bornée à un cas où la gamme est au moins connue.
    let gammeMajoritaire = "";
    let meilleur = -1;
    for (const [range, quantite] of parGamme) {
      if (quantite > meilleur) {
        gammeMajoritaire = range;
        meilleur = quantite;
      }
    }

    // ---- Une seule transaction pour TOUTES les écritures ----
    //
    // Ces écritures ne sont pas indépendantes : un arrêt COMPLETED sans ses
    // mouvements de stock est un mensonge comptable — le linge est chez le
    // client, le parc dit qu'il est en stock, et personne ne s'en aperçoit
    // puisque l'arrêt s'affiche comme livré. Enchaînées hors transaction, une
    // coupure réseau ou un redémarrage entre deux lignes produisait exactement
    // cet état. Elles tombent ou passent ensemble.
    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedStop = await tx.deliveryStop.update({
        where: { id: stopId },
        data: {
          status: "COMPLETED",
          setsDelivered: data.setsDelivered,
          dirtyPickedUp: data.dirtyPickedUp,
          qrCodeScanned: data.qrCodeScanned,
          photoUrl: data.photoUrl,
          signatureUrl: data.signatureUrl,
          // Preuve de remise capturée sur mobile. Ces quatre champs étaient
          // auparavant acceptés par le schéma puis jetés faute d'être écrits :
          // le livreur faisait signer le client et rien n'était conservé.
          signatureData: data.signatureDataUrl,
          signataireNom: data.signataireNom,
          conforme: data.conforme,
          reserves: data.reserves,
          completedAt: new Date(),
        },
        // Même forme que les arrêts renvoyés par `getRoundById` / `getTodayRound` :
        // la ligne nue renvoyée auparavant n'avait ni `client` ni `order`, et
        // l'écran d'arrêt perdait l'adresse et le numéro de commande sitôt la
        // livraison validée.
        include: {
          client: { select: CLIENT_ARRET_SELECT },
          order: { select: { id: true, orderNumber: true } },
        },
      });

      // La tournée démarre au premier arrêt validé.
      if (stop.round.status === "PLANNED") {
        await tx.deliveryRound.update({
          where: { id: stop.roundId },
          data: { status: "IN_PROGRESS", startedAt: new Date() },
        });
      }

      if (data.setsDelivered > 0) {
        for (const [range, quantity] of parGamme) {
          await tx.stockMovement.create({
            data: {
              userId: stop.clientId,
              productRange: range as Prisma.StockMovementCreateInput["productRange"],
              type: "DELIVERY",
              quantity,
              reason: `Livraison tournée ${stop.roundId}`,
            },
          });
        }
      }

      // Quantité négative : le linge quitte le client.
      if (data.dirtyPickedUp > 0 && gammeMajoritaire) {
        await tx.stockMovement.create({
          data: {
            userId: stop.clientId,
            productRange: gammeMajoritaire as Prisma.StockMovementCreateInput["productRange"],
            type: "PICKUP_DIRTY",
            quantity: -data.dirtyPickedUp,
            reason: `Récupération tournée ${stop.roundId}`,
          },
        });
      }

      // ---- Stock par slug (comptabilité qui fait foi) ----
      await this.syncStockItemsFromStop(tx, stop.id, stop.round.operatorId, data.dirtyPickedUp);

      // Dans la transaction : une trace d'audit survivant à une écriture annulée
      // décrirait une livraison qui n'a pas eu lieu.
      await createAuditLog({
        prisma: tx,
        userId: driverId,
        action: "UPDATE",
        entity: "DeliveryStop",
        entityId: stopId,
        changes: {
          status: "COMPLETED",
          setsDelivered: data.setsDelivered,
          dirtyPickedUp: data.dirtyPickedUp,
        },
        ipAddress,
        userAgent,
      });

      return updatedStop;
    });

    // ---- Notification du client — APRÈS le commit, jamais dedans ----
    //
    // C'est un effet de bord RÉSEAU (Expo, Redis). Placé dans la transaction, il
    // en allongerait la durée de plusieurs secondes et, pire, un push refusé
    // ferait ANNULER une livraison pourtant réellement effectuée : le livreur
    // repartirait avec un arrêt encore « à faire », le linge déjà déposé. Le
    // try/catch interne garantit que rien ne remonte ici.
    await this.notifierLivraisonAuClient({
      clientId: stop.clientId,
      stopId,
      roundId: stop.roundId,
      orderId: stop.orderId,
      setsDelivered: data.setsDelivered,
      dirtyPickedUp: data.dirtyPickedUp,
    });

    // Un arrêt validé EST la livraison : la commande la reflète, et sa rotation
    // sort alors le linge du parc avec la bonne date de départ.
    await this.cloturerCommandeLivree(stop.orderId, driverId);

    return updated;
  }

  /**
   * Passe la commande d'un arrêt validé en DELIVERED, puis aligne sa rotation.
   *
   * Le maillon manquait : le livreur validait son arrêt et la commande restait
   * CONFIRMED ou IN_DELIVERY pour toujours. Personne ne s'en apercevait côté
   * client — l'arrêt, lui, affichait bien « livré » — mais rien ne déclenchait la
   * sortie de stock ni le compte à rebours de reprise.
   *
   * L'écriture est directe et ne passe pas par `ORDER_TRANSITIONS` : cette table
   * garde les changements de statut décidés à la main dans l'admin. Ici le fait
   * physique a déjà eu lieu — refuser de l'enregistrer parce que la commande
   * était restée en CONFIRMED laisserait la base en désaccord avec le terrain.
   * Une commande ANNULÉE reste annulée : livrée par erreur, c'est un incident
   * d'exploitation qui se règle à la main, pas en écrasant l'annulation.
   *
   * **Ne lève jamais** : l'arrêt est déjà validé en base quand on arrive ici.
   */
  private async cloturerCommandeLivree(orderId: string | null, driverId: string): Promise<void> {
    if (!orderId) return;

    try {
      const order = await this.prisma.order.findFirst({
        where: { id: orderId, deletedAt: null },
        select: { id: true, status: true },
      });

      if (!order || order.status === "CANCELLED") return;

      if (order.status !== "DELIVERED") {
        await this.prisma.order.update({
          where: { id: orderId },
          data: { status: "DELIVERED" },
        });

        await createAuditLog({
          prisma: this.prisma,
          userId: driverId,
          action: "UPDATE",
          entity: "Order",
          entityId: orderId,
          changes: {
            previousStatus: order.status,
            newStatus: "DELIVERED",
            parArretDeTournee: true,
          },
        });
      }

      await new RotationsService(this.prisma).syncFromOrder(orderId, { adminId: driverId });
    } catch (err) {
      const raison = err instanceof Error ? err.message : String(err);
      console.error(`[deliveries] Clôture de la commande ${orderId} échouée : ${raison}`);
    }
  }

  /**
   * Prévient le client que son passage vient d'avoir lieu.
   *
   * `deliveries.service.ts` n'émettait AUCUNE notification : le client ne savait
   * jamais que son linge était arrivé, sinon en allant le constater. C'est le
   * premier reproche remonté par l'exploitation.
   *
   * **Ne lève jamais.** L'arrêt est déjà validé en base quand on arrive ici ;
   * faire échouer la requête du livreur parce qu'Expo est indisponible reviendrait
   * à lui demander de re-valider une livraison déjà enregistrée — et le second
   * appel se heurterait à `ALREADY_COMPLETED`, le bloquant pour de bon.
   *
   * `channel: "BOTH"` : la préférence de l'utilisateur reste prioritaire, `notify`
   * s'en charge. `DELIVERY_CONFIRMED` existe déjà dans l'enum `NotificationType`,
   * aucune migration n'est nécessaire.
   */
  private async notifierLivraisonAuClient(params: {
    clientId: string;
    stopId: string;
    roundId: string;
    orderId: string | null;
    setsDelivered: number;
    dirtyPickedUp: number;
  }): Promise<void> {
    try {
      const details: string[] = [];
      if (params.setsDelivered > 0) {
        details.push(`${params.setsDelivered} ensemble(s) déposé(s)`);
      }
      if (params.dirtyPickedUp > 0) {
        details.push(`${params.dirtyPickedUp} ensemble(s) repris`);
      }

      await notify(this.prisma, {
        userId: params.clientId,
        type: "DELIVERY_CONFIRMED",
        channel: "BOTH",
        title: "Votre linge a été livré",
        body:
          details.length > 0
            ? `Passage effectué : ${details.join(", ")}. Merci de votre confiance.`
            : "Votre passage a bien été effectué. Merci de votre confiance.",
        // Charge utile du deep-link, même convention que `rotation.worker.ts` :
        // `type` + identifiant de l'entité, plus un `path` prêt à l'emploi
        // (`invoice.worker.ts`). Sans elle, le tap sur la notification n'ouvre
        // aucun écran. `path` n'est posé que si la commande est connue : un
        // chemin vers une page inexistante est pire qu'une absence de chemin,
        // il ouvre un écran vide.
        data: {
          type: "DELIVERY_CONFIRMED",
          deliveryStopId: params.stopId,
          roundId: params.roundId,
          ...(params.orderId ? { orderId: params.orderId, path: `/orders/${params.orderId}` } : {}),
          setsDelivered: params.setsDelivered,
          dirtyPickedUp: params.dirtyPickedUp,
        } as Prisma.InputJsonValue,
      });
    } catch (err) {
      const raison = err instanceof Error ? err.message : String(err);
      console.error(
        `[deliveries] Notification client abandonnée (arrêt ${params.stopId}) : ${raison}`,
      );
    }
  }

  /**
   * Répercute la reprise de linge sale d'un arrêt sur le stock PAR SLUG.
   *
   * N'agit que si une `Rotation` est rattachée à l'arrêt : elle seule porte le
   * détail des articles réellement sortis. Sans rotation, le total saisi par le
   * livreur n'est ventilable sur aucun produit — et un stock faux serait pire
   * qu'un stock incomplet, puisqu'il ferait croire à un parc disponible qui ne
   * l'est pas.
   *
   * La rotation n'est PAS clôturée ici : la reprise détaillée (quantité par
   * ligne) reste à saisir via `PATCH /rotations/:id/reprise`. On se contente de
   * signaler que le linge est physiquement revenu.
   *
   * Prend le client de transaction de l'appelant : cette écriture fait partie de
   * la validation de l'arrêt, elle n'a pas de sens toute seule.
   */
  private async syncStockItemsFromStop(
    tx: Prisma.TransactionClient,
    stopId: string,
    operatorId: string,
    dirtyPickedUp: number,
  ): Promise<void> {
    if (dirtyPickedUp <= 0) return;

    const rotation = await tx.rotation.findFirst({
      where: {
        deliveryStopId: stopId,
        deletedAt: null,
        status: { notIn: ["REPRISE", "ANNULEE"] },
      },
      include: { lignes: true },
    });

    if (!rotation) return;

    const totalLivre = rotation.lignes.reduce((n, l) => n + l.qtyLivree, 0);
    if (totalLivre === 0) return;

    // Le livreur annonce un total repris sans ventilation. On le répartit au
    // prorata de ce qui était sorti — le seul arbitrage défendable, et de toute
    // façon rectifié à la saisie détaillée de la reprise.
    //
    // Écrit sur le `tx` de l'appelant, sans ouvrir sa propre transaction : ces
    // upserts doivent tomber avec la validation de l'arrêt, pas survivre seuls.
    for (const ligne of rotation.lignes) {
      if (!ligne.productSlug) continue;
      const part = Math.round((ligne.qtyLivree / totalLivre) * dirtyPickedUp);
      if (part <= 0) continue;

      await tx.stockItem.upsert({
        where: { operatorId_productSlug: { operatorId, productSlug: ligne.productSlug } },
        create: { operatorId, productSlug: ligne.productSlug, dirtyPending: part },
        update: { dirtyPending: { increment: part } },
      });
    }
  }

  async completeRound(roundId: string, driverId: string, ipAddress?: string, userAgent?: string) {
    const round = await this.prisma.deliveryRound.findUnique({
      where: { id: roundId },
      include: { stops: true },
    });

    if (!round) {
      throw new NotFoundError("Tournée", roundId);
    }

    if (round.driverId !== driverId) {
      throw new ForbiddenError("Cette tournée ne vous est pas attribuée");
    }

    if (round.status === "COMPLETED") {
      throw new AppError(400, "ALREADY_COMPLETED", "Cette tournée est déjà terminée");
    }

    // Relevé AVANT la transaction : la clôture va basculer ces arrêts en SKIPPED,
    // après quoi plus rien ne distingue « sauté à l'instant » de « déjà sauté ».
    // Ce sont exactement les clients qui attendaient un passage qui n'aura pas eu
    // lieu — donc les seuls à prévenir. Dédoublonnés : un même client peut avoir
    // deux arrêts dans la tournée, il n'a pas à recevoir deux messages.
    const clientsNonServis = [
      ...new Set(round.stops.filter((s) => s.status === "PENDING").map((s) => s.clientId)),
    ];

    // Même exigence que `completeStop` : sauter les arrêts restants et clôturer
    // la tournée forment un seul geste. Séparés, un échec entre les deux laissait
    // des arrêts SKIPPED dans une tournée toujours EN COURS — le livreur ne
    // pouvait ni les reprendre ni la terminer.
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.deliveryStop.updateMany({
        where: { roundId, status: "PENDING" },
        data: { status: "SKIPPED" },
      });

      const updatedRound = await tx.deliveryRound.update({
        where: { id: roundId },
        data: { status: "COMPLETED", completedAt: new Date() },
        // Alignée sur `getRoundById` : sans `stops`, l'écran de tournée se vidait
        // au moment même où le livreur la terminait.
        include: {
          stops: {
            orderBy: { stopOrder: "asc" },
            include: {
              client: { select: CLIENT_ARRET_SELECT },
              order: { select: { id: true, orderNumber: true } },
            },
          },
          driver: { select: { id: true, name: true } },
          zone: { select: { id: true, name: true } },
        },
      });

      await createAuditLog({
        prisma: tx,
        userId: driverId,
        action: "UPDATE",
        entity: "DeliveryRound",
        entityId: roundId,
        changes: { status: "COMPLETED" },
        ipAddress,
        userAgent,
      });

      return updatedRound;
    });

    // ---- Clôture de tournée : QUI prévenir, et pourquoi pas tout le monde ----
    //
    // Aucune notification aux clients LIVRÉS : chacun a déjà reçu la sienne au
    // moment exact de son arrêt, avec ses quantités. Un second message à la
    // fermeture de la tournée n'apporterait rien de neuf et arriverait plusieurs
    // heures après les faits — c'est du bruit, et le bruit finit par faire
    // désactiver les notifications, y compris celles qui comptent.
    //
    // En revanche les clients dont l'arrêt vient d'être SAUTÉ n'étaient prévenus
    // par personne : ils attendaient un passage, la tournée s'est close sans eux
    // et rien ne le leur disait. Ce n'est pas un doublon, c'est le seul message
    // qu'ils recevront. `DELIVERY_DELAYED` (et non `DELIVERY_CANCELLED`) : le
    // passage est reporté, la commande n'est pas annulée.
    //
    // Hors transaction et sans propager l'erreur, pour la même raison que dans
    // `completeStop` : la tournée est clôturée, rien ne doit pouvoir revenir
    // dessus.
    for (const clientId of clientsNonServis) {
      try {
        await notify(this.prisma, {
          userId: clientId,
          type: "DELIVERY_DELAYED",
          channel: "BOTH",
          title: "Votre passage n'a pas pu être effectué",
          body:
            "Nous n'avons pas pu effectuer votre passage aujourd'hui. " +
            "Notre équipe vous recontacte pour convenir d'une nouvelle date.",
          data: {
            type: "DELIVERY_DELAYED",
            roundId,
            path: "/orders",
          } as Prisma.InputJsonValue,
        });
      } catch (err) {
        const raison = err instanceof Error ? err.message : String(err);
        console.error(
          `[deliveries] Notification de report abandonnée (client ${clientId}) : ${raison}`,
        );
      }
    }

    return updated;
  }

  // ---- Suppression d'une tournée (DELETE /deliveries/rounds/:id) --------------

  /**
   * Supprime une tournée et ses arrêts — uniquement si RIEN n'a été livré.
   *
   * Un arrêt COMPLETED porte des preuves de remise : quantités livrées, linge
   * sale repris, signature du client. Ces éléments font foi en cas de litige et
   * ont déjà bougé le stock. Supprimer la tournée les effacerait sans rien
   * corriger des mouvements déjà passés — d'où le refus, quel que soit le statut
   * de la tournée elle-même.
   *
   * Suppression DURE : `DeliveryRound` n'a pas de `deletedAt`, et une tournée
   * sans aucun arrêt livré n'est que de la planification. Les rotations qui
   * pointaient vers ces arrêts survivent (`Rotation.deliveryStopId` est
   * `onDelete: SetNull`) : le linge dehors reste suivi.
   */
  async deleteRound(roundId: string, adminId: string, ipAddress?: string, userAgent?: string) {
    const round = await this.prisma.deliveryRound.findUnique({
      where: { id: roundId },
      select: {
        id: true,
        status: true,
        date: true,
        stops: { select: { id: true, status: true } },
      },
    });

    if (!round) {
      throw new NotFoundError("Tournée", roundId);
    }

    const completed = round.stops.filter((s) => s.status === "COMPLETED").length;

    if (completed > 0) {
      throw new UnprocessableEntityError(
        `Cette tournée compte ${completed} arrêt(s) déjà livré(s) : leurs preuves de remise ` +
          `(signature, quantités) ne peuvent pas être effacées`,
        "ROUND_HAS_COMPLETED_STOPS",
      );
    }

    // Les arrêts d'abord : la relation est obligatoire côté arrêt, la tournée ne
    // peut pas partir tant qu'ils pointent dessus.
    await this.prisma.$transaction([
      this.prisma.deliveryStop.deleteMany({ where: { roundId } }),
      this.prisma.deliveryRound.delete({ where: { id: roundId } }),
    ]);

    await createAuditLog({
      prisma: this.prisma,
      userId: adminId,
      action: "DELETE",
      entity: "DeliveryRound",
      entityId: roundId,
      changes: { previousStatus: round.status, stopsDeleted: round.stops.length },
      ipAddress,
      userAgent,
    });

    return { id: roundId, deleted: true, stopsDeleted: round.stops.length };
  }
}
