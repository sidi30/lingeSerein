/**
 * Remplace les anciens comptes de démo par les comptes réels.
 *
 * - Supprime admin@lingengo.fr, livreur@lingengo.fr, client1/2/3@example.com
 *   ainsi que toutes leurs données liées (ordre FK respecté).
 * - Crée :
 *     sirtecnologie@gmail.com  / @Rayana2  → ROLE_ADMIN
 *     sidi@gmail.com           / @Rayana2  → ROLE_LIVREUR (PIN 123456)
 *     autressir@gmail.com      / @Rayana2  → ROLE_CLIENT
 * - Recrée un jeu de données minimal (abonnement, stock, commande, tournée)
 *   pour que les écrans mobiles ne soient pas vides.
 *
 * Usage : npx tsx packages/database/prisma/replace-users.ts
 * Idempotent : ré-exécutable sans erreur.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();
const BCRYPT_ROUNDS = 12;

const OLD_EMAILS = [
  "admin@lingengo.fr",
  "livreur@lingengo.fr",
  "client1@example.com",
  "client2@example.com",
  "client3@example.com",
];

const PASSWORD = "@Rayana2";

async function deleteOldUsers() {
  const oldUsers = await prisma.user.findMany({
    where: { email: { in: OLD_EMAILS } },
    select: { id: true, email: true },
  });

  if (oldUsers.length === 0) {
    console.log("  Anciens comptes : aucun trouvé (déjà supprimés)");
    return;
  }

  const ids = oldUsers.map((u) => u.id);
  console.log(`  Anciens comptes trouvés : ${oldUsers.map((u) => u.email).join(", ")}`);

  const orders = await prisma.order.findMany({
    where: { userId: { in: ids } },
    select: { id: true },
  });
  const orderIds = orders.map((o) => o.id);

  const subs = await prisma.subscription.findMany({
    where: { userId: { in: ids } },
    select: { id: true },
  });
  const subIds = subs.map((s) => s.id);

  await prisma.$transaction([
    prisma.deliveryStop.deleteMany({
      where: {
        OR: [{ clientId: { in: ids } }, { driverId: { in: ids } }, { orderId: { in: orderIds } }],
      },
    }),
    prisma.deliveryRound.deleteMany({ where: { driverId: { in: ids } } }),
    prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } }),
    prisma.invoice.deleteMany({ where: { userId: { in: ids } } }),
    prisma.order.deleteMany({ where: { id: { in: orderIds } } }),
    prisma.subscriptionProduct.deleteMany({ where: { subscriptionId: { in: subIds } } }),
    prisma.subscription.deleteMany({ where: { userId: { in: ids } } }),
    prisma.stockMovement.deleteMany({ where: { userId: { in: ids } } }),
    prisma.clientStock.deleteMany({ where: { userId: { in: ids } } }),
    prisma.notification.deleteMany({ where: { userId: { in: ids } } }),
    prisma.notificationSetting.deleteMany({ where: { userId: { in: ids } } }),
    prisma.consent.deleteMany({ where: { userId: { in: ids } } }),
    prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } }),
    // Audit logs : on garde la trace mais on détache l'utilisateur (userId nullable)
    prisma.auditLog.updateMany({ where: { userId: { in: ids } }, data: { userId: null } }),
    prisma.user.deleteMany({ where: { id: { in: ids } } }),
  ]);

  console.log(`  Anciens comptes supprimés : ${oldUsers.length} (+ données liées)`);
}

async function createNewUsers() {
  const operator = await prisma.operator.findFirst();
  if (!operator) {
    throw new Error("Aucun opérateur en base — lancer le seed d'abord");
  }

  const zone = await prisma.deliveryZone.findFirst({ where: { operatorId: operator.id } });

  const passwordHash = await bcrypt.hash(PASSWORD, BCRYPT_ROUNDS);
  const pinHash = await bcrypt.hash("123456", BCRYPT_ROUNDS);

  const verified = {
    isActive: true,
    isEmailVerified: true,
    emailVerifiedAt: new Date(),
    deletedAt: null,
    loginAttempts: 0,
    lockedUntil: null,
  };

  const admin = await prisma.user.upsert({
    where: { email: "sirtecnologie@gmail.com" },
    update: { passwordHash, role: "ROLE_ADMIN", ...verified },
    create: {
      operatorId: operator.id,
      email: "sirtecnologie@gmail.com",
      passwordHash,
      name: "Admin Linge Serein",
      phone: "+33600000001",
      role: "ROLE_ADMIN",
      ...verified,
    },
  });

  const driver = await prisma.user.upsert({
    where: { email: "sidi@gmail.com" },
    update: { passwordHash, role: "ROLE_LIVREUR", deliveryPin: pinHash, ...verified },
    create: {
      operatorId: operator.id,
      zoneId: zone?.id,
      email: "sidi@gmail.com",
      passwordHash,
      name: "Livreur Linge Serein",
      phone: "+33600000002",
      role: "ROLE_LIVREUR",
      deliveryPin: pinHash,
      ...verified,
    },
  });

  const client = await prisma.user.upsert({
    where: { email: "autressir@gmail.com" },
    update: { passwordHash, role: "ROLE_CLIENT", ...verified },
    create: {
      operatorId: operator.id,
      zoneId: zone?.id,
      email: "autressir@gmail.com",
      passwordHash,
      name: "Client Linge Serein",
      phone: "+33600000003",
      address: "12 avenue de la Republique, 84000 Avignon",
      accommodationType: "HOTEL",
      role: "ROLE_CLIENT",
      stockAlertThreshold: 30,
      preferredTimeSlot: "08:00-10:00",
      ...verified,
    },
  });

  console.log("  Comptes créés :");
  console.log(`    admin   → ${admin.email}`);
  console.log(`    livreur → ${driver.email} (PIN 123456)`);
  console.log(`    client  → ${client.email}`);

  return { operator, zone, admin, driver, client };
}

async function createDemoData(ctx: Awaited<ReturnType<typeof createNewUsers>>) {
  const { operator, zone, driver, client } = ctx;

  // Abonnement actif pour le client
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const sub = await prisma.subscription.upsert({
    where: { userId: client.id },
    update: { status: "ACTIVE" },
    create: {
      userId: client.id,
      plan: "PRESTIGE",
      status: "ACTIVE",
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    },
  });

  const product = await prisma.product.findFirst({
    where: { operatorId: operator.id, category: "SERVIETTES", range: "PRESTIGE" },
  });

  if (product) {
    await prisma.subscriptionProduct.upsert({
      where: { subscriptionId_productId: { subscriptionId: sub.id, productId: product.id } },
      update: {},
      create: { subscriptionId: sub.id, productId: product.id, quantity: 60 },
    });
  }

  // Stock client
  await prisma.clientStock.upsert({
    where: { userId_productRange: { userId: client.id, productRange: "PRESTIGE" } },
    update: {},
    create: {
      userId: client.id,
      productRange: "PRESTIGE",
      cleanSets: 40,
      dirtySets: 15,
      totalInCirculation: 60,
    },
  });

  // Commande confirmée à venir
  let order = await prisma.order.findFirst({
    where: { userId: client.id, status: "CONFIRMED" },
  });
  if (!order && product) {
    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + 3);
    order = await prisma.order.create({
      data: {
        userId: client.id,
        orderNumber: "LNG-2026-100001",
        status: "CONFIRMED",
        isRecurring: true,
        totalCents: product.priceCents * 10,
        deliveryDate,
        timeSlot: "08:00-10:00",
        items: {
          create: [
            {
              productId: product.id,
              quantity: 10,
              unitCents: product.priceCents,
              totalCents: product.priceCents * 10,
            },
          ],
        },
      },
    });
  }

  // Tournée du jour pour le livreur
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const existingRound = await prisma.deliveryRound.findFirst({
    where: { driverId: driver.id, date: today },
  });
  if (!existingRound) {
    await prisma.deliveryRound.create({
      data: {
        operatorId: operator.id,
        zoneId: zone?.id,
        driverId: driver.id,
        date: today,
        status: "PLANNED",
        notes: "Tournée du jour",
        stops: {
          create: [
            {
              clientId: client.id,
              driverId: driver.id,
              orderId: order?.id,
              stopOrder: 1,
              status: "PENDING",
              setsToDeliver: 10,
              specialInstructions: "Déposer à la réception",
            },
          ],
        },
      },
    });
    console.log("  Tournée du jour créée (1 stop)");
  } else {
    console.log("  Tournée du jour : déjà existante");
  }

  console.log("  Données démo : abonnement PRESTIGE, stock, commande, tournée");
}

async function main() {
  console.log("Remplacement des comptes utilisateurs...");
  await deleteOldUsers();
  const ctx = await createNewUsers();
  await createDemoData(ctx);
  console.log("\nTerminé !");
}

main()
  .catch((e) => {
    console.error("Échec :", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
