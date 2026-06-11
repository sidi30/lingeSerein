import type { PrismaClient } from "@prisma/client";
import { NotFoundError, UnprocessableEntityError } from "../utils/errors.js";
import { createAuditLog } from "../utils/audit.js";
import type {
  CreateZoneInput,
  UpdateZoneInput,
  UpdateOperatorInput,
  UpdateStockThresholdsInput,
} from "../schemas/settings.schema.js";

// Normalise et dédoublonne les codes postaux
function normalizePostalCodes(codes: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const code of codes) {
    const normalized = code.trim();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}

export class SettingsService {
  constructor(private readonly prisma: PrismaClient) {}

  // ---- Zones de livraison ----

  async listZones(operatorId: string) {
    const zones = await this.prisma.deliveryZone.findMany({
      where: { operatorId, isActive: true },
      orderBy: { name: "asc" },
    });

    // Calcul du userCount par zone
    const zoneCounts = await this.prisma.user.groupBy({
      by: ["zoneId"],
      where: { zoneId: { in: zones.map((z) => z.id) }, deletedAt: null },
      _count: { id: true },
    });

    const countMap = new Map(zoneCounts.map((c) => [c.zoneId!, c._count.id]));

    return zones.map((z) => ({
      ...z,
      userCount: countMap.get(z.id) ?? 0,
    }));
  }

  async createZone(
    data: CreateZoneInput,
    operatorId: string,
    adminId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const normalizedCodes = normalizePostalCodes(data.postalCodes);

    // Vérifier l'unicité des codes postaux à travers toutes les zones de l'opérateur
    await this.checkPostalCodeUniqueness(normalizedCodes, operatorId, null);

    const zone = await this.prisma.deliveryZone.create({
      data: {
        operatorId,
        name: data.name,
        postalCodes: normalizedCodes,
        deliveryFeeCents: data.deliveryFeeCents,
      },
    });

    const zoneWithCount = { ...zone, userCount: 0 };

    await createAuditLog({
      prisma: this.prisma,
      userId: adminId,
      action: "CREATE",
      entity: "DeliveryZone",
      entityId: zone.id,
      changes: {
        name: zone.name,
        postalCodesCount: normalizedCodes.length,
        deliveryFeeCents: zone.deliveryFeeCents,
      },
      ipAddress,
      userAgent,
    });

    return zoneWithCount;
  }

  async updateZone(
    id: string,
    operatorId: string,
    data: UpdateZoneInput,
    adminId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const zone = await this.prisma.deliveryZone.findFirst({
      where: { id, operatorId },
    });

    if (!zone) {
      throw new NotFoundError("Zone", id);
    }

    let normalizedCodes: string[] | undefined;
    if (data.postalCodes !== undefined) {
      normalizedCodes = normalizePostalCodes(data.postalCodes);
      // Exclure la zone courante du contrôle d'unicité
      await this.checkPostalCodeUniqueness(normalizedCodes, operatorId, id);
    }

    const updated = await this.prisma.deliveryZone.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(normalizedCodes !== undefined ? { postalCodes: normalizedCodes } : {}),
        ...(data.deliveryFeeCents !== undefined ? { deliveryFeeCents: data.deliveryFeeCents } : {}),
      },
    });

    const userCount = await this.prisma.user.count({
      where: { zoneId: id, deletedAt: null },
    });

    await createAuditLog({
      prisma: this.prisma,
      userId: adminId,
      action: "UPDATE",
      entity: "DeliveryZone",
      entityId: id,
      changes: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(normalizedCodes !== undefined ? { postalCodesCount: normalizedCodes.length } : {}),
        ...(data.deliveryFeeCents !== undefined ? { deliveryFeeCents: data.deliveryFeeCents } : {}),
      },
      ipAddress,
      userAgent,
    });

    return { ...updated, userCount };
  }

  async deleteZone(
    id: string,
    operatorId: string,
    adminId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const zone = await this.prisma.deliveryZone.findFirst({
      where: { id, operatorId },
    });

    if (!zone) {
      throw new NotFoundError("Zone", id);
    }

    // Vérifier si des utilisateurs y sont rattachés
    const userCount = await this.prisma.user.count({
      where: { zoneId: id, deletedAt: null },
    });

    if (userCount > 0) {
      throw new UnprocessableEntityError(
        `Cette zone ne peut pas être supprimée : ${userCount} utilisateur(s) y sont rattachés. Réaffectez-les d'abord.`,
        "ZONE_HAS_USERS",
      );
    }

    await this.prisma.deliveryZone.delete({ where: { id } });

    await createAuditLog({
      prisma: this.prisma,
      userId: adminId,
      action: "DELETE",
      entity: "DeliveryZone",
      entityId: id,
      changes: {},
      ipAddress,
      userAgent,
    });

    return { id, deleted: true };
  }

  // ---- Opérateur ----

  async getOperator(operatorId: string) {
    const operator = await this.prisma.operator.findUnique({
      where: { id: operatorId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        siret: true,
        legalMentions: true,
        isActive: true,
      },
    });

    if (!operator) {
      throw new NotFoundError("Opérateur", operatorId);
    }

    return operator;
  }

  async updateOperator(
    operatorId: string,
    data: UpdateOperatorInput,
    adminId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const existing = await this.prisma.operator.findUnique({
      where: { id: operatorId },
    });

    if (!existing) {
      throw new NotFoundError("Opérateur", operatorId);
    }

    const updated = await this.prisma.operator.update({
      where: { id: operatorId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.address !== undefined ? { address: data.address } : {}),
        ...(data.siret !== undefined ? { siret: data.siret } : {}),
        ...(data.legalMentions !== undefined ? { legalMentions: data.legalMentions } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        siret: true,
        legalMentions: true,
        isActive: true,
      },
    });

    // Audit sans PII (email strippé par stripPii dans createAuditLog)
    await createAuditLog({
      prisma: this.prisma,
      userId: adminId,
      action: "UPDATE",
      entity: "Operator",
      entityId: operatorId,
      changes: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.siret !== undefined ? { siret: data.siret } : {}),
        // email/phone/address strippés automatiquement par stripPii
        ...(data.email !== undefined ? { email: data.email } : {}),
      },
      ipAddress,
      userAgent,
    });

    return updated;
  }

  // ---- Seuils d'alerte stock ----

  async getStockThresholds(operatorId: string) {
    const products = await this.prisma.product.findMany({
      where: { operatorId, isActive: true, deletedAt: null },
      select: {
        id: true,
        name: true,
        range: true,
        category: true,
        stockAlertThreshold: true,
      },
      orderBy: [{ range: "asc" }, { name: "asc" }],
    });

    return products.map((p) => ({
      productId: p.id,
      name: p.name,
      range: p.range,
      category: p.category,
      stockAlertThreshold: p.stockAlertThreshold,
    }));
  }

  async updateStockThresholds(
    data: UpdateStockThresholdsInput,
    operatorId: string,
    adminId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    // Valider tous les productIds avant d'écrire
    const productIds = data.thresholds.map((t) => t.productId);
    const existingProducts = await this.prisma.product.findMany({
      where: { id: { in: productIds }, operatorId, isActive: true, deletedAt: null },
      select: { id: true },
    });

    if (existingProducts.length !== productIds.length) {
      const foundIds = new Set(existingProducts.map((p) => p.id));
      const missing = productIds.find((id) => !foundIds.has(id));
      throw new NotFoundError("Produit", missing);
    }

    // Mise à jour en parallèle
    await Promise.all(
      data.thresholds.map((t) =>
        this.prisma.product.update({
          where: { id: t.productId },
          data: { stockAlertThreshold: t.stockAlertThreshold },
        }),
      ),
    );

    // Audit par produit
    for (const threshold of data.thresholds) {
      await createAuditLog({
        prisma: this.prisma,
        userId: adminId,
        action: "UPDATE",
        entity: "Product",
        entityId: threshold.productId,
        changes: { stockAlertThreshold: threshold.stockAlertThreshold },
        ipAddress,
        userAgent,
      });
    }

    // Retourner l'état à jour
    return this.getStockThresholds(operatorId);
  }

  // ---- Helpers privés ----

  private async checkPostalCodeUniqueness(
    codes: string[],
    operatorId: string,
    excludeZoneId: string | null,
  ) {
    const allZones = await this.prisma.deliveryZone.findMany({
      where: {
        operatorId,
        ...(excludeZoneId ? { id: { not: excludeZoneId } } : {}),
      },
      select: { id: true, name: true, postalCodes: true },
    });

    for (const zone of allZones) {
      for (const code of codes) {
        if (zone.postalCodes.includes(code)) {
          throw new UnprocessableEntityError(
            `Le code postal ${code} est déjà attribué à la zone ${zone.name}`,
            "POSTAL_CODE_TAKEN",
          );
        }
      }
    }
  }
}
