/**
 * Script de migration Phase 2 — Linge Serein V2
 * ------------------------------------------------
 * À exécuter MANUELLEMENT après que la Phase 1 (migrations SQL) soit appliquée en prod.
 * NE PAS inclure dans prisma migrate deploy ni dans un CI automatique.
 *
 * Prérequis :
 *   - DATABASE_URL pointant vers la base cible (prod ou staging)
 *   - MIGRATE_EXISTING_ENGAGEMENT=exempt|enforce  (AC-F8-03, choix propriétaire OBLIGATOIRE)
 *     * exempt  → committedUntil = null (client existant peut résilier immédiatement)
 *     * enforce → committedUntil = now() + 3 mois
 *
 * Usage :
 *   MIGRATE_EXISTING_ENGAGEMENT=exempt DATABASE_URL="postgresql://..." npx tsx prisma/migrate-v2-data.ts
 *
 * Étapes (idempotentes) :
 *   1. Valider le flag MIGRATE_EXISTING_ENGAGEMENT (refuse de tourner sans)
 *   2. Upsert des 9 produits canoniques depuis CATALOG_PRODUCTS (clé : slug)
 *   3. Soft-delete des anciens produits non canoniques (préserve les OrderItem)
 *   4. Créer SubscriptionConfig pour l'opérateur si absente
 *   5. Migrer le client réel PRESTIGE → snapshots Pack Sérénité
 *   6. Appliquer la décision engagement (committedUntil)
 *
 * ADR : ADR-V2-001 / ADR-V2-002 / ADR-V2-003 / ADR-V2-006 / ADR-V2-007 / F8
 */

import { PrismaClient } from "@prisma/client";
import { CATALOG_PRODUCTS, SUBSCRIPTION_DEFAULTS, addMonths } from "@lingengo/shared";

const prisma = new PrismaClient();

// ---- Validation du flag d'engagement ----------------------------------------

type EngagementChoice = "exempt" | "enforce";

function resolveEngagementChoice(): EngagementChoice {
  const raw = process.env["MIGRATE_EXISTING_ENGAGEMENT"];
  if (!raw) {
    console.error(
      "\n❌  MIGRATE_EXISTING_ENGAGEMENT non défini.\n" +
        "\n" +
        "   Ce flag est OBLIGATOIRE pour la migration prod (AC-F8-03).\n" +
        "   Le propriétaire doit valider le choix avant exécution.\n" +
        "\n" +
        "   Options :\n" +
        "     exempt  → committedUntil = null\n" +
        "               Le client existant peut résilier immédiatement (pas d'engagement rétroactif).\n" +
        "     enforce → committedUntil = now() + 3 mois\n" +
        "               L'engagement minimal de 3 mois est imposé rétroactivement.\n" +
        "\n" +
        "   Exemple :\n" +
        "     MIGRATE_EXISTING_ENGAGEMENT=exempt npx tsx prisma/migrate-v2-data.ts\n",
    );
    process.exit(1);
  }

  if (raw !== "exempt" && raw !== "enforce") {
    console.error(
      `\n❌  MIGRATE_EXISTING_ENGAGEMENT="${raw}" invalide. Valeurs acceptées : exempt | enforce\n`,
    );
    process.exit(1);
  }

  return raw as EngagementChoice;
}

// ---- Main -------------------------------------------------------------------

async function main() {
  console.log("=== Migration V2 Phase 2 — Linge Serein ===\n");

  const engagementChoice = resolveEngagementChoice();
  console.log(`  Flag MIGRATE_EXISTING_ENGAGEMENT = ${engagementChoice}\n`);

  // ---- Étape 1 : Récupérer l'opérateur ----------------------------------------
  const operator = await prisma.operator.findFirst({
    where: { isActive: true, deletedAt: null },
    orderBy: { createdAt: "asc" }, // prend le premier (mono-opérateur V1)
  });

  if (!operator) {
    throw new Error("Aucun opérateur actif trouvé. Vérifiez que le seed de base a été appliqué.");
  }

  console.log(`  Opérateur : ${operator.name} (${operator.id})`);

  // Récupérer le ServiceType LOCATION (requis pour tous les produits)
  const serviceLocation = await prisma.serviceType.findUnique({
    where: { kind: "LOCATION" },
  });

  if (!serviceLocation) {
    throw new Error(
      "ServiceType LOCATION introuvable. Vérifiez que le seed de base a été appliqué.",
    );
  }

  // ---- Étape 2 : Upsert des 9 produits canoniques (clé = slug) ---------------
  console.log("\n  [Étape 2] Upsert des 9 produits canoniques...");
  const canonicalSlugs = new Set(CATALOG_PRODUCTS.map((p) => p.slug));

  for (const def of CATALOG_PRODUCTS) {
    const existing = await prisma.product.findFirst({
      where: { slug: def.slug },
    });

    if (existing) {
      // Mise à jour des données (idempotent)
      await prisma.product.update({
        where: { id: existing.id },
        data: {
          kind: def.kind as "KIT" | "ARTICLE",
          name: def.name,
          description: def.description,
          priceCents: def.priceCents,
          category: def.category ?? null,
          range: null,
          isActive: true,
          deletedAt: null,
          serviceTypeId: serviceLocation.id,
        },
      });
      console.log(`    UPDATED  ${def.slug} (${def.name})`);
    } else {
      await prisma.product.create({
        data: {
          operatorId: operator.id,
          serviceTypeId: serviceLocation.id,
          slug: def.slug,
          kind: def.kind as "KIT" | "ARTICLE",
          name: def.name,
          description: def.description,
          priceCents: def.priceCents,
          category: def.category ?? null,
          range: null,
          isActive: true,
          attributes: {},
        },
      });
      console.log(`    CREATED  ${def.slug} (${def.name})`);
    }
  }

  // ---- Étape 3 : Soft-delete des anciens produits non canoniques --------------
  console.log("\n  [Étape 3] Soft-delete des anciens produits non canoniques...");

  // On ne supprime que les produits sans slug canonique pour cet opérateur.
  // On préserve les OrderItem (référence UUID intacte — AC-F8-01).
  const legacyProducts = await prisma.product.findMany({
    where: {
      operatorId: operator.id,
      deletedAt: null,
      slug: null, // les anciens produits n'ont pas de slug
    },
  });

  let softDeletedCount = 0;
  for (const product of legacyProducts) {
    // Double garde : ne pas toucher un produit qui serait déjà un slug canonique
    if (product.slug && canonicalSlugs.has(product.slug as string)) {
      continue;
    }
    await prisma.product.update({
      where: { id: product.id },
      data: { isActive: false, deletedAt: new Date() },
    });
    console.log(`    SOFT-DELETED  ${product.id} — "${product.name}"`);
    softDeletedCount++;
  }
  if (softDeletedCount === 0) {
    console.log("    (aucun ancien produit à désactiver)");
  }

  // ---- Étape 4 : Créer SubscriptionConfig si absente -------------------------
  console.log("\n  [Étape 4] SubscriptionConfig...");

  const existingConfig = await prisma.subscriptionConfig.findUnique({
    where: { operatorId: operator.id },
  });

  if (!existingConfig) {
    await prisma.subscriptionConfig.create({
      data: {
        operatorId: operator.id,
        planName: SUBSCRIPTION_DEFAULTS.PLAN_NAME,
        priceCents: SUBSCRIPTION_DEFAULTS.PRICE_CENTS,
        kitBainQty: SUBSCRIPTION_DEFAULTS.KIT_BAIN_QTY,
        kitLitQty: SUBSCRIPTION_DEFAULTS.KIT_LIT_QTY,
        minEngagementMonths: SUBSCRIPTION_DEFAULTS.MIN_ENGAGEMENT_MONTHS,
        noticePeriodDays: SUBSCRIPTION_DEFAULTS.NOTICE_PERIOD_DAYS,
        isActive: true,
      },
    });
    console.log("    CREATED SubscriptionConfig (Pack Sérénité par défaut)");
  } else {
    console.log("    SKIP — SubscriptionConfig déjà existante");
  }

  // ---- Étape 5 & 6 : Migrer les abonnements actifs → snapshots Pack Sérénité -
  console.log("\n  [Étape 5+6] Migration des abonnements actifs → snapshots Pack Sérénité...");

  const activeSubscriptions = await prisma.subscription.findMany({
    where: {
      status: { in: ["ACTIVE", "PAUSED"] },
      // Migrer uniquement les abonnements sans snapshot (priceCents null = non migré)
      priceCents: null,
    },
    include: { user: { select: { id: true, email: true } } },
  });

  if (activeSubscriptions.length === 0) {
    console.log("    (aucun abonnement actif à migrer, ou déjà migré)");
  }

  for (const sub of activeSubscriptions) {
    const now = new Date();
    let committedUntil: Date | null;

    if (engagementChoice === "enforce") {
      // Engagement 3 mois imposé rétroactivement à partir d'aujourd'hui
      committedUntil = addMonths(now, SUBSCRIPTION_DEFAULTS.MIN_ENGAGEMENT_MONTHS);
    } else {
      // Exempté : résiliation libre immédiate
      committedUntil = null;
    }

    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        priceCents: SUBSCRIPTION_DEFAULTS.PRICE_CENTS,
        kitBainQty: SUBSCRIPTION_DEFAULTS.KIT_BAIN_QTY,
        kitLitQty: SUBSCRIPTION_DEFAULTS.KIT_LIT_QTY,
        minEngagementMonths: SUBSCRIPTION_DEFAULTS.MIN_ENGAGEMENT_MONTHS,
        committedUntil,
        // plan est intentionnellement conservé (PRESTIGE, etc.) pour la traçabilité historique.
        // ADR-V2-003 : on ne met pas plan=null sur les anciens abonnements.
      },
    });

    const commitStr = committedUntil
      ? committedUntil.toISOString().split("T")[0]
      : "null (exempté)";

    console.log(
      `    MIGRATED  sub ${sub.id} user=${sub.user.email}` +
        ` priceCents=8900 committedUntil=${commitStr}`,
    );
  }

  // ---- Stock : ADR-V2-004 — aucune écriture sur ClientStock/OperatorStock ----
  console.log("\n  [Stock] Inchangé (ADR-V2-004) — aucune migration de stock.");

  console.log("\n=== Migration V2 Phase 2 terminée avec succès ===\n");
}

main()
  .catch((e: unknown) => {
    console.error("\n❌ Migration Phase 2 échouée :", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
