/**
 * Passage groupé — « nous passons déjà dans votre commune ».
 *
 * Le tarif de livraison ne baisse pas. Ce qui baisse, c'est le coût réel d'une
 * course DÉJÀ prévue : quand le camion s'arrête à Avignon un jeudi, servir un
 * deuxième client d'Avignon le même jour ne coûte presque rien de plus. On le
 * propose donc aux autres clients de la commune, avec une remise de 50 % sur la
 * livraison — et une reprise du linge sale gratuite, parce que le sale rentre de
 * toute façon dans le camion et qu'il faut encourager sa restitution rapide.
 *
 * Trois garde-fous, tous délibérés :
 *  1. une proposition n'existe QUE si une tournée est réellement planifiée ce
 *     jour-là dans cette commune — sinon la remise devient un tarif permanent
 *     déguisé, et le barème public ne veut plus rien dire ;
 *  2. un client n'est pas sollicité plus d'une fois par semaine, même si trois
 *     tournées passent chez lui : c'est de la sollicitation commerciale, pas un
 *     rappel de contrat ;
 *  3. la préférence de notification du client est respectée par `notify`, et le
 *     type `PASSAGE_OPPORTUNITY` lui est propre — couper la publicité ne coupe
 *     pas les rappels de reprise.
 */

import type { PrismaClient, Prisma, PassageResponseKind } from "@prisma/client";
import {
  DELIVERY_ZONE_CENTS,
  PASSAGE_GROUPE,
  communeParInsee,
  jourCalendaire,
  passageGroupeFeeCents,
} from "@lingengo/shared";
import { NotFoundError, UnprocessableEntityError } from "../utils/errors.js";
import { notify } from "../utils/notify.js";
import { zoneTarifaire } from "./orders.service.js";

/** Un client sollicitable pour un passage donné. */
interface ClientCible {
  id: string;
  name: string;
  communeInsee: string | null;
  postalCode: string | null;
}

export interface OpportuniteView {
  id: string;
  communeInsee: string;
  communeNom: string;
  /** Jour du passage, au format `AAAA-MM-JJ`. */
  date: string;
  expiresAt: string;
  /** Ce que coûterait la livraison au client, remise comprise. */
  livraisonCents: number;
  /** Tarif plein du palier, pour que l'économie soit visible. */
  livraisonPleinTarifCents: number;
  repriseCents: number;
  /** Réponse déjà donnée par le client, s'il en a donné une. */
  reponse: { kind: PassageResponseKind; message: string | null } | null;
}

export class PassagesService {
  constructor(private readonly prisma: PrismaClient) {}

  // ---- Ouverture des créneaux (cron de la veille) ----

  /**
   * Ouvre une proposition par (tournée, commune) pour les tournées du lendemain,
   * et prévient les clients de ces communes.
   *
   * @param now instant de référence — injecté par les tests et par un rattrapage manuel.
   */
  async ouvrirPourLendemain(now: Date = new Date()) {
    const demain = new Date(jourCalendaire(now).getTime() + 86_400_000);

    const tournees = await this.prisma.deliveryRound.findMany({
      where: { date: demain, status: { in: ["PLANNED", "IN_PROGRESS"] } },
      include: {
        stops: { select: { clientId: true, client: { select: { communeInsee: true } } } },
      },
    });

    let opportunites = 0;
    let notifies = 0;

    for (const tournee of tournees) {
      // Les communes réellement desservies par la tournée, déduites des clients
      // de ses arrêts. Un arrêt dont le client n'a pas de commune confirmée est
      // IGNORÉ : deviner la commune reviendrait à promettre un passage là où
      // personne n'a prévu d'aller.
      const communes = new Set<string>();
      const dejaServis = new Set<string>();
      for (const stop of tournee.stops) {
        dejaServis.add(stop.clientId);
        const insee = stop.client?.communeInsee?.trim();
        if (insee) communes.add(insee);
      }

      for (const insee of communes) {
        const commune = communeParInsee(insee);
        if (!commune) continue;

        // Le camion est parti : au-delà de l'heure de départ, la proposition
        // n'engage plus rien. On la borne au matin du jour du passage.
        const expiresAt = new Date(demain.getTime() + 8 * 60 * 60 * 1000);

        const opportunite = await this.prisma.passageOpportunity.upsert({
          where: { roundId_communeInsee: { roundId: tournee.id, communeInsee: insee } },
          update: {},
          create: {
            operatorId: tournee.operatorId,
            roundId: tournee.id,
            communeInsee: insee,
            communeNom: commune.nom,
            date: demain,
            expiresAt,
          },
        });
        opportunites += 1;

        const cibles = await this.clientsSollicitables(insee, dejaServis, now);
        for (const client of cibles) {
          const zone = zoneTarifaire(client);
          if (zone === "HORS_ZONE") continue;

          const plein = DELIVERY_ZONE_CENTS[zone];
          const remise = passageGroupeFeeCents(zone);
          const euros = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
          const result = await notify(this.prisma, {
            userId: client.id,
            type: "PASSAGE_OPPORTUNITY",
            channel: "BOTH",
            title: `Nous passons à ${commune.nom} demain`,
            body:
              plein > 0
                ? `Besoin de linge propre ? La livraison vous est facturée ${euros(remise)} € au lieu ` +
                  `de ${euros(plein)} €. La reprise de votre linge sale est gratuite.`
                : `Besoin de linge propre ? La livraison est incluse, et la reprise de votre linge ` +
                  `sale est gratuite.`,
            data: { type: "PASSAGE_OPPORTUNITY", opportunityId: opportunite.id },
          });
          if (result.notificationId) notifies += 1;
        }
      }
    }

    return { tournees: tournees.length, opportunites, notifies };
  }

  /**
   * Clients d'une commune à qui la proposition est adressée.
   *
   * Exclut ceux que la tournée sert déjà (ils ont leur créneau), les comptes
   * inactifs, et ceux sollicités récemment — le plafond est ce qui sépare une
   * offre utile d'un harcèlement commercial.
   */
  private async clientsSollicitables(
    communeInsee: string,
    dejaServis: Set<string>,
    now: Date,
  ): Promise<ClientCible[]> {
    const clients = await this.prisma.user.findMany({
      where: {
        role: "ROLE_CLIENT",
        isActive: true,
        deletedAt: null,
        communeInsee,
      },
      select: { id: true, name: true, communeInsee: true, postalCode: true },
    });

    const candidats = clients.filter((c) => !dejaServis.has(c.id));
    if (candidats.length === 0) return [];

    const depuis = new Date(
      now.getTime() - PASSAGE_GROUPE.MIN_JOURS_ENTRE_SOLLICITATIONS * 86_400_000,
    );
    const recentes = await this.prisma.notification.findMany({
      where: {
        type: "PASSAGE_OPPORTUNITY",
        createdAt: { gte: depuis },
        userId: { in: candidats.map((c) => c.id) },
      },
      select: { userId: true },
    });
    const dejaSollicites = new Set(recentes.map((n) => n.userId));

    return candidats.filter((c) => !dejaSollicites.has(c.id));
  }

  // ---- Côté client ----

  /** Propositions encore ouvertes pour ce client, la plus proche d'abord. */
  async mine(userId: string, now: Date = new Date()): Promise<OpportuniteView[]> {
    const client = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { communeInsee: true, postalCode: true },
    });
    const insee = client?.communeInsee?.trim();
    if (!insee) return [];

    const opportunites = await this.prisma.passageOpportunity.findMany({
      where: { communeInsee: insee, expiresAt: { gt: now } },
      orderBy: { date: "asc" },
      include: { responses: { where: { userId } } },
    });

    const zone = zoneTarifaire(client ?? {});
    const plein = zone === "HORS_ZONE" ? 0 : DELIVERY_ZONE_CENTS[zone];
    return opportunites.map((o) => {
      const reponse = o.responses[0];
      return {
        id: o.id,
        communeInsee: o.communeInsee,
        communeNom: o.communeNom,
        date: o.date.toISOString().slice(0, 10),
        expiresAt: o.expiresAt.toISOString(),
        livraisonCents: zone === "HORS_ZONE" ? 0 : passageGroupeFeeCents(zone),
        livraisonPleinTarifCents: plein,
        repriseCents: PASSAGE_GROUPE.REPRISE_CENTS,
        reponse: reponse ? { kind: reponse.kind, message: reponse.message } : null,
      };
    });
  }

  /**
   * Enregistre (ou corrige) la réponse d'un client.
   *
   * Répondre deux fois CORRIGE la réponse : le livreur ne doit jamais avoir à
   * arbitrer entre deux intentions contradictoires du même client.
   */
  async repondre(
    opportunityId: string,
    userId: string,
    input: {
      kind: PassageResponseKind;
      message?: string | null;
      source?: "MOBILE" | "TELEPHONE" | "ADMIN";
    },
    now: Date = new Date(),
  ) {
    const opportunite = await this.prisma.passageOpportunity.findUnique({
      where: { id: opportunityId },
    });
    if (!opportunite) throw new NotFoundError("Proposition de passage introuvable");

    if (opportunite.expiresAt <= now) {
      throw new UnprocessableEntityError(
        "Ce passage est déjà parti : la proposition n'est plus valable.",
        "PASSAGE_EXPIRED",
      );
    }

    const client = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { communeInsee: true },
    });
    // La proposition vaut pour une COMMUNE : y répondre depuis une autre commune
    // reviendrait à s'attribuer une remise sur une tournée qui ne passe pas chez
    // soi. L'admin, lui, saisit au nom du client (source TELEPHONE/ADMIN).
    if (input.source !== "TELEPHONE" && input.source !== "ADMIN") {
      if ((client?.communeInsee ?? "") !== opportunite.communeInsee) {
        throw new UnprocessableEntityError(
          "Cette proposition ne concerne pas votre commune.",
          "PASSAGE_WRONG_COMMUNE",
        );
      }
    }

    const data = {
      kind: input.kind,
      message: input.message?.trim() || null,
      source: input.source ?? "MOBILE",
    };

    return this.prisma.passageResponse.upsert({
      where: { opportunityId_userId: { opportunityId, userId } },
      update: data,
      create: { opportunityId, userId, ...data },
    });
  }

  /**
   * La remise s'applique-t-elle à ce client, pour cette date de livraison ?
   *
   * Interrogée au moment de créer la commande : c'est le seul point où le prix
   * est décidé, et la réponse ne doit dépendre que de faits vérifiables en base
   * — un passage planifié, la bonne commune, la bonne date, et un client qui a
   * dit oui. Sans réponse enregistrée, pas de remise : sinon toute commande
   * passée un jour de tournée serait remisée à l'insu de l'exploitant.
   */
  async remiseApplicable(
    userId: string,
    dateLivraison: Date,
    now: Date = new Date(),
  ): Promise<{ applicable: boolean; opportunityId: string | null }> {
    const client = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { communeInsee: true },
    });
    const insee = client?.communeInsee?.trim();
    if (!insee) return { applicable: false, opportunityId: null };

    const jour = jourCalendaire(dateLivraison);
    const opportunite = await this.prisma.passageOpportunity.findFirst({
      where: {
        communeInsee: insee,
        date: jour,
        expiresAt: { gt: now },
        responses: { some: { userId, kind: { in: ["LIVRAISON", "LIVRAISON_ET_REPRISE"] } } },
      },
      select: { id: true },
    });

    return { applicable: Boolean(opportunite), opportunityId: opportunite?.id ?? null };
  }

  // ---- Côté exploitation ----

  /** Propositions d'une période, avec les réponses — la feuille de route du livreur. */
  async list(params: { from?: string; to?: string }, operatorId: string) {
    const where: Prisma.PassageOpportunityWhereInput = {
      operatorId,
      ...(params.from || params.to
        ? {
            date: {
              ...(params.from ? { gte: jourCalendaire(params.from) } : {}),
              ...(params.to ? { lte: jourCalendaire(params.to) } : {}),
            },
          }
        : {}),
    };

    const opportunites = await this.prisma.passageOpportunity.findMany({
      where,
      orderBy: { date: "asc" },
      include: {
        responses: {
          include: { user: { select: { id: true, name: true, phone: true, address: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return opportunites.map((o) => ({
      id: o.id,
      communeInsee: o.communeInsee,
      communeNom: o.communeNom,
      date: o.date.toISOString().slice(0, 10),
      expiresAt: o.expiresAt.toISOString(),
      // Ce qui intéresse le livreur : qui a dit oui, et pour quoi faire.
      reponses: o.responses.map((r) => ({
        id: r.id,
        userId: r.userId,
        clientNom: r.user.name,
        kind: r.kind,
        source: r.source,
        message: r.message,
        createdAt: r.createdAt.toISOString(),
      })),
      interesses: o.responses.filter((r) => r.kind !== "AUCUN").length,
    }));
  }
}
