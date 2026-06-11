/**
 * ProductsService V2
 * ADR-V2-001 : unicité par slug (plus de contrainte category+range).
 * ADR-V2-008 : updatePrice() raccourci.
 */

import type { PrismaClient, Prisma } from "@prisma/client";
import { NotFoundError, ConflictError, AppError } from "../utils/errors.js";
import { createAuditLog } from "../utils/audit.js";
import type {
  CreateProductInput,
  UpdateProductInput,
  PriceUpdateInput,
  ListProductsQuery,
} from "../schemas/products.schema.js";

/** Génère un slug à partir du nom si aucun n'est fourni */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // retire les diacritiques
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export class ProductsService {
  constructor(private readonly prisma: PrismaClient) {}

  // ---- list -------------------------------------------------------------------

  async list(query: ListProductsQuery) {
    const { page, limit, kind, category, includeInactive } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      // includeInactive (admin) : lister aussi les produits désactivés/soft-deleted
      ...(includeInactive ? {} : { isActive: true, deletedAt: null }),
      ...(kind ? { kind } : {}),
      ...(category ? { category } : {}),
    };

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "asc" }, // les 9 produits dans l'ordre de création
        include: { serviceType: { select: { kind: true, name: true } } },
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data: products,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ---- getById ----------------------------------------------------------------

  async getById(id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: { serviceType: { select: { kind: true, name: true } } },
    });

    if (!product) {
      throw new NotFoundError("Produit", id);
    }

    return product;
  }

  // ---- create -----------------------------------------------------------------

  async create(
    data: CreateProductInput,
    operatorId: string,
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    // Résoudre le ServiceType : fourni, sinon défaut LOCATION (catalogue V2)
    let serviceTypeId = data.serviceTypeId;
    if (!serviceTypeId) {
      const locationType = await this.prisma.serviceType.findUnique({
        where: { kind: "LOCATION" },
        select: { id: true },
      });
      if (!locationType) {
        throw new AppError(
          500,
          "SERVICE_TYPE_MISSING",
          "Aucun type de service LOCATION n'est configuré. Lancez le seed.",
        );
      }
      serviceTypeId = locationType.id;
    }

    // Résoudre le slug : fourni ou généré depuis le nom
    const slug = data.slug ?? slugify(data.name);

    // Vérifier l'unicité du slug (ADR-V2-001 — la contrainte composite est retirée)
    if (slug) {
      const existingSlug = await this.prisma.product.findFirst({
        where: { slug, deletedAt: null },
      });
      if (existingSlug) {
        throw new ConflictError(`Un produit avec le slug "${slug}" existe déjà`);
      }
    }

    const product = await this.prisma.product.create({
      data: {
        operatorId,
        serviceTypeId,
        slug: slug || null,
        kind: data.kind,
        category: data.category ?? null,
        range: data.range ?? null,
        name: data.name,
        description: data.description ?? null,
        priceCents: data.priceCents,
        attributes: (data.attributes ?? {}) as Prisma.InputJsonValue,
        imageUrl: data.imageUrl ?? null,
      },
      include: { serviceType: { select: { kind: true, name: true } } },
    });

    await createAuditLog({
      prisma: this.prisma,
      userId,
      action: "CREATE",
      entity: "Product",
      entityId: product.id,
      changes: { slug, kind: data.kind, priceCents: data.priceCents },
      ipAddress,
      userAgent,
    });

    return product;
  }

  // ---- update (PUT /:id) ------------------------------------------------------

  async update(
    id: string,
    data: UpdateProductInput,
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    // Réactivation : si isActive=true est demandé, on autorise l'update d'un produit
    // soft-deleted (sinon il serait introuvable). Sinon, on reste sur les produits actifs.
    const isReactivation = data.isActive === true;
    const existing = await this.prisma.product.findFirst({
      where: isReactivation ? { id } : { id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundError("Produit", id);
    }

    // Vérifier l'unicité du slug si fourni et différent
    if (data.slug && data.slug !== existing.slug) {
      const slugConflict = await this.prisma.product.findFirst({
        where: { slug: data.slug, deletedAt: null, id: { not: id } },
      });
      if (slugConflict) {
        throw new ConflictError(`Un produit avec le slug "${data.slug}" existe déjà`);
      }
    }

    const product = await this.prisma.product.update({
      where: { id },
      data: {
        ...(data.slug !== undefined ? { slug: data.slug } : {}),
        ...(data.kind !== undefined ? { kind: data.kind } : {}),
        ...(data.serviceTypeId !== undefined ? { serviceTypeId: data.serviceTypeId } : {}),
        ...(data.category !== undefined ? { category: data.category } : {}),
        ...(data.range !== undefined ? { range: data.range } : {}),
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.priceCents !== undefined ? { priceCents: data.priceCents } : {}),
        ...(data.attributes !== undefined
          ? { attributes: data.attributes as Prisma.InputJsonValue }
          : {}),
        ...(data.imageUrl !== undefined ? { imageUrl: data.imageUrl } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        // Réactivation : remettre deletedAt à null pour ressortir le produit
        ...(isReactivation ? { deletedAt: null } : {}),
      },
      include: { serviceType: { select: { kind: true, name: true } } },
    });

    await createAuditLog({
      prisma: this.prisma,
      userId,
      action: "UPDATE",
      entity: "Product",
      entityId: id,
      changes: data as Record<string, unknown>,
      ipAddress,
      userAgent,
    });

    return product;
  }

  // ---- updatePrice (PATCH /:id/price) — ADR-V2-008 ---------------------------

  async updatePrice(
    id: string,
    data: PriceUpdateInput,
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const existing = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundError("Produit", id);
    }

    const product = await this.prisma.product.update({
      where: { id },
      data: { priceCents: data.priceCents },
      include: { serviceType: { select: { kind: true, name: true } } },
    });

    // Audit : ne logue que le changement de prix (AC-F5-03 : OrderItem.unitCents non touché)
    await createAuditLog({
      prisma: this.prisma,
      userId,
      action: "UPDATE",
      entity: "Product",
      entityId: id,
      changes: {
        previousPriceCents: existing.priceCents,
        priceCents: data.priceCents,
      },
      ipAddress,
      userAgent,
    });

    return product;
  }

  // ---- softDelete (DELETE /:id) -----------------------------------------------

  async softDelete(id: string, userId: string, ipAddress?: string, userAgent?: string) {
    const existing = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundError("Produit", id);
    }

    await this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    await createAuditLog({
      prisma: this.prisma,
      userId,
      action: "DELETE",
      entity: "Product",
      entityId: id,
      ipAddress,
      userAgent,
    });
  }
}
