import type { PrismaClient, Prisma, NotificationType, NotificationChannel } from "@prisma/client";
import { NotFoundError } from "../utils/errors.js";

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
}
