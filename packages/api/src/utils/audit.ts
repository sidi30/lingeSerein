import type { PrismaClient, AuditAction, Prisma } from "@prisma/client";

interface AuditLogParams {
  prisma: PrismaClient;
  userId?: string;
  action: AuditAction;
  entity: string;
  entityId?: string;
  changes?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Écrit une entrée dans le journal d'audit.
 * Les données personnelles sont automatiquement exclues du champ `changes`.
 */
export async function createAuditLog(params: AuditLogParams): Promise<void> {
  const sanitizedChanges = (params.changes ? stripPii(params.changes) : {}) as Prisma.InputJsonValue;

  await params.prisma.auditLog.create({
    data: {
      userId: params.userId ?? null,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId ?? null,
      changes: sanitizedChanges,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
    },
  });
}

/** Champs considérés comme données personnelles — jamais dans les logs */
const PII_FIELDS = new Set([
  "email",
  "phone",
  "address",
  "passwordHash",
  "password",
  "mfaSecret",
  "mfaRecoveryCodes",
  "deliveryPin",
  "stripeCustomerId",
  "token",
  "refreshToken",
  "ipAddress",
]);

function stripPii(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (PII_FIELDS.has(key)) {
      result[key] = "[REDACTED]";
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      result[key] = stripPii(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}
