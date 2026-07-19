import type { PrismaClient, Prisma, NotificationType, NotificationChannel } from "@prisma/client";
import { NotFoundError } from "../utils/errors.js";

/** Sections de l'admin portant un badge de non-lus. */
export const NOTIFICATION_SECTIONS = ["devis", "commandes", "utilisateurs", "stock"] as const;
export type NotificationSection = (typeof NOTIFICATION_SECTIONS)[number];

/**
 * Quels types alimentent quel badge. Source de vérité unique : `SECTION_BY_TYPE`
 * en est dérivé, pour qu'ajouter un type ne puisse pas désynchroniser les deux
 * sens de la correspondance.
 */
const TYPES_BY_SECTION: Record<NotificationSection, NotificationType[]> = {
  devis: ["QUOTE_CREATED"],
  commandes: ["ORDER_CREATED"],
  utilisateurs: ["USER_CREATED"],
  stock: ["STOCK_LOW"],
};

const SECTION_BY_TYPE = Object.fromEntries(
  NOTIFICATION_SECTIONS.flatMap((section) => TYPES_BY_SECTION[section].map((t) => [t, section])),
) as Partial<Record<NotificationType, NotificationSection>>;

export class NotificationsService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;

    const where: Prisma.NotificationWhereInput = { userId };

    const [notifications, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);

    return {
      data: notifications,
      unreadCount,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async markAsRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
    });

    if (!notification) {
      throw new NotFoundError("Notification", id);
    }

    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async markAllAsRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });

    return { count: result.count };
  }

  async getSettings(userId: string) {
    return this.prisma.notificationSetting.findMany({
      where: { userId },
    });
  }

  async updateSettings(
    userId: string,
    settings: Array<{ type: NotificationType; channel: NotificationChannel; enabled: boolean }>,
  ) {
    const ops = settings.map((s) =>
      this.prisma.notificationSetting.upsert({
        where: { userId_type: { userId, type: s.type } },
        create: {
          userId,
          type: s.type,
          channel: s.channel,
          enabled: s.enabled,
        },
        update: {
          channel: s.channel,
          enabled: s.enabled,
        },
      }),
    );

    return this.prisma.$transaction(ops);
  }

  /** Create a notification (used by other services and admin) */
  async create(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    data: Record<string, unknown> = {},
  ) {
    return this.prisma.notification.create({
      data: {
        userId,
        type,
        title,
        body,
        data: data as Prisma.InputJsonValue,
        sentAt: new Date(),
      },
    });
  }

  /**
   * Diffuse une notification à TOUS les administrateurs actifs.
   * Utilisé aux points de création (devis, commande, compte) : l'événement
   * concerne l'exploitation, pas un utilisateur en particulier.
   *
   * Volontairement « best effort » : une notification qui échoue ne doit
   * JAMAIS faire échouer la création du devis ou de la commande sous-jacente.
   */
  async notifyAdmins(
    type: NotificationType,
    title: string,
    body: string,
    data: Record<string, unknown> = {},
  ): Promise<number> {
    try {
      const admins = await this.prisma.user.findMany({
        where: { role: { in: ["ROLE_ADMIN", "ROLE_SUPER_ADMIN"] }, isActive: true },
        select: { id: true },
      });
      if (admins.length === 0) return 0;

      const result = await this.prisma.notification.createMany({
        data: admins.map((a) => ({
          userId: a.id,
          type,
          title,
          body,
          data: data as Prisma.InputJsonValue,
          sentAt: new Date(),
        })),
      });
      return result.count;
    } catch {
      return 0;
    }
  }

  /**
   * Compteurs de non-lus par SECTION de l'admin (et non par type brut) :
   * c'est ce que consomment les badges du menu latéral.
   * Une seule requête groupée plutôt qu'un COUNT par section.
   */
  async unreadCountsBySection(userId: string): Promise<Record<NotificationSection, number>> {
    const rows = await this.prisma.notification.groupBy({
      by: ["type"],
      where: { userId, readAt: null },
      _count: { _all: true },
    });

    const counts: Record<NotificationSection, number> = {
      devis: 0,
      commandes: 0,
      utilisateurs: 0,
      stock: 0,
    };
    for (const row of rows) {
      const section = SECTION_BY_TYPE[row.type];
      if (section) counts[section] += row._count._all;
    }
    return counts;
  }

  /**
   * Marque comme lues toutes les notifications non lues d'une section.
   * Appelé quand l'admin ouvre la page correspondante — comportement « dossier
   * de boîte mail » : on ouvre, le compteur retombe à zéro.
   */
  async markSectionAsRead(userId: string, section: NotificationSection) {
    const types = TYPES_BY_SECTION[section];
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null, type: { in: types } },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }
}
