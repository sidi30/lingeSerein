import type { PrismaClient, Prisma } from "@prisma/client";
import { NotFoundError, ConflictError } from "../utils/errors.js";
import { createAuditLog } from "../utils/audit.js";
import type { CreateProductInput, UpdateProductInput, ListProductsQuery } from "../schemas/products.schema.js";

export class ProductsService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(query: ListProductsQuery) {
    const { page, limit, category, range } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      isActive: true,
      deletedAt: null,
      ...(category ? { category } : {}),
      ...(range ? { range } : {}),
    };

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
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

  async create(
    data: CreateProductInput,
    operatorId: string,
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    // Check uniqueness constraint
    const existing = await this.prisma.product.findFirst({
      where: {
        operatorId,
        category: data.category,
        range: data.range,
        deletedAt: null,
      },
    });

    if (existing) {
      throw new ConflictError(
        `Un produit ${data.category} / ${data.range} existe déjà pour cet opérateur`,
      );
    }

    const product = await this.prisma.product.create({
      data: {
        operatorId,
        serviceTypeId: data.serviceTypeId,
        category: data.category,
        range: data.range,
        name: data.name,
        description: data.description,
        priceCents: data.priceCents,
        attributes: (data.attributes ?? {}) as Prisma.InputJsonValue,
        imageUrl: data.imageUrl,
      },
    });

    await createAuditLog({
      prisma: this.prisma,
      userId,
      action: "CREATE",
      entity: "Product",
      entityId: product.id,
      changes: { category: data.category, range: data.range, priceCents: data.priceCents },
      ipAddress,
      userAgent,
    });

    return product;
  }

  async update(
    id: string,
    data: UpdateProductInput,
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
      data: {
        ...(data.serviceTypeId !== undefined ? { serviceTypeId: data.serviceTypeId } : {}),
        ...(data.category !== undefined ? { category: data.category } : {}),
        ...(data.range !== undefined ? { range: data.range } : {}),
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.priceCents !== undefined ? { priceCents: data.priceCents } : {}),
        ...(data.attributes !== undefined ? { attributes: data.attributes as Prisma.InputJsonValue } : {}),
        ...(data.imageUrl !== undefined ? { imageUrl: data.imageUrl } : {}),
      },
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

  async softDelete(
    id: string,
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
