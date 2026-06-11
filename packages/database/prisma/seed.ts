/**
 * Seed V2 — Linge Serein
 * -----------------------
 * Ce seed est idempotent (upsert sur toutes les entités à clé stable).
 * Il reflète le nouveau modèle commercial V2 :
 *   - 9 produits canoniques (3 kits + 6 articles unitaires) depuis CATALOG_PRODUCTS
 *   - SubscriptionConfig Pack Sérénité (SUBSCRIPTION_DEFAULTS)
 *   - Abonnement démo client réel = Pack Sérénité (priceCents 8900, minEngagementMonths 3)
 *   - ClientStock / OperatorStock conservés par ProductRange (ADR-V2-004)
 *   - Orders démo adaptées aux nouveaux produits KIT_*
 *
 * Prérequis : SEED_USERS_PASSWORD doit être défini dans l'environnement.
 * Comptes réels (jamais modifier) :
 *   sirtecnologie@gmail.com (admin), sidi@gmail.com (livreur), autressir@gmail.com (client)
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { CATALOG_PRODUCTS, SUBSCRIPTION_DEFAULTS, addMonths } from "@lingengo/shared";

const prisma = new PrismaClient();
const BCRYPT_ROUNDS = 12;

async function main() {
  console.log("Seeding database (V2)...");

  // ---- Mot de passe seed -----------------------------------------------------
  const seedPassword = process.env["SEED_USERS_PASSWORD"];
  if (!seedPassword) {
    throw new Error("SEED_USERS_PASSWORD manquant — export la variable avant de lancer le seed.");
  }
  const realUserHash = await bcrypt.hash(seedPassword, BCRYPT_ROUNDS);
  const driverPinHash = await bcrypt.hash("123456", BCRYPT_ROUNDS);

  // ---- Operator ---------------------------------------------------------------
  const operator = await prisma.operator.upsert({
    where: { email: "contact@lingengo-vaucluse.fr" },
    update: {},
    create: {
      name: "Linge Serein Vaucluse",
      email: "contact@lingengo-vaucluse.fr",
      phone: "+33490000001",
      address: "12 avenue de la Republique, 84000 Avignon",
      isActive: true,
    },
  });

  console.log(`  Operator: ${operator.name}`);

  // ---- Delivery Zones ---------------------------------------------------------
  let zone1 = await prisma.deliveryZone.findFirst({
    where: { operatorId: operator.id, name: "Avignon & environs" },
  });
  if (!zone1) {
    zone1 = await prisma.deliveryZone.create({
      data: {
        operatorId: operator.id,
        name: "Avignon & environs",
        postalCodes: ["84000", "84100", "84130", "84140"],
        isActive: true,
      },
    });
  }

  let zone2 = await prisma.deliveryZone.findFirst({
    where: { operatorId: operator.id, name: "Luberon" },
  });
  if (!zone2) {
    zone2 = await prisma.deliveryZone.create({
      data: {
        operatorId: operator.id,
        name: "Luberon",
        postalCodes: ["84400", "84480", "84560", "84580"],
        isActive: true,
      },
    });
  }

  console.log(`  Delivery Zones: ${zone1.name}, ${zone2.name}`);

  // ---- Service Types ----------------------------------------------------------
  const serviceLocation = await prisma.serviceType.upsert({
    where: { kind: "LOCATION" },
    update: {},
    create: {
      kind: "LOCATION",
      name: "Location de linge",
      description: "Service de location de linge hotelier avec livraison et recuperation",
      isActive: true,
    },
  });

  await prisma.serviceType.upsert({
    where: { kind: "VENTE" },
    update: {},
    create: {
      kind: "VENTE",
      name: "Vente de linge",
      description: "Achat de linge hotelier de qualite professionnelle",
      isActive: true,
    },
  });

  await prisma.serviceType.upsert({
    where: { kind: "ENTRETIEN" },
    update: {},
    create: {
      kind: "ENTRETIEN",
      name: "Entretien de linge",
      description: "Service de blanchisserie et entretien du linge",
      isActive: true,
    },
  });

  console.log("  Service Types: LOCATION, VENTE, ENTRETIEN");

  // ---- Products V2 : 9 produits canoniques ------------------------------------
  // Clé d'upsert : slug (unique, ignoré par Postgres pour les NULL — les anciens
  // produits sans slug restent intacts et peuvent être soft-deletés par migrate-v2-data.ts).
  const productMap: Record<string, string> = {}; // slug -> id

  for (const def of CATALOG_PRODUCTS) {
    // L'upsert Prisma sur slug nullable nécessite findFirst + create/update
    // car Prisma ne supporte pas upsert sur un champ nullable unique.
    let product = await prisma.product.findFirst({
      where: { slug: def.slug },
    });

    if (product) {
      product = await prisma.product.update({
        where: { id: product.id },
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
          operatorId: operator.id,
        },
      });
    } else {
      product = await prisma.product.create({
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
    }

    productMap[def.slug] = product.id;
  }

  console.log("  Products: 9 canoniques (3 kits + 6 articles)");

  // ---- SubscriptionConfig Pack Sérénité ---------------------------------------
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
    console.log("  SubscriptionConfig: Pack Sérénité créée");
  } else {
    console.log("  SubscriptionConfig: déjà existante");
  }

  // ---- Delivery Schedules -----------------------------------------------------
  for (const day of [1, 4]) {
    await prisma.deliverySchedule.upsert({
      where: { zoneId_dayOfWeek: { zoneId: zone1.id, dayOfWeek: day } },
      update: {},
      create: {
        zoneId: zone1.id,
        dayOfWeek: day,
        timeStart: "08:00",
        timeEnd: "12:00",
        isActive: true,
      },
    });
  }
  for (const day of [2, 5]) {
    await prisma.deliverySchedule.upsert({
      where: { zoneId_dayOfWeek: { zoneId: zone2.id, dayOfWeek: day } },
      update: {},
      create: {
        zoneId: zone2.id,
        dayOfWeek: day,
        timeStart: "08:00",
        timeEnd: "12:00",
        isActive: true,
      },
    });
  }

  console.log("  Delivery Schedules: Mon+Thu (zone 1), Tue+Fri (zone 2)");

  // ---- Users ------------------------------------------------------------------
  const adminUser = await prisma.user.upsert({
    where: { email: "sirtecnologie@gmail.com" },
    update: {},
    create: {
      operatorId: operator.id,
      email: "sirtecnologie@gmail.com",
      passwordHash: realUserHash,
      name: "Admin Linge Serein",
      phone: "+33600000001",
      role: "ROLE_ADMIN",
      isActive: true,
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });

  const driverUser = await prisma.user.upsert({
    where: { email: "sidi@gmail.com" },
    update: {},
    create: {
      operatorId: operator.id,
      zoneId: zone1.id,
      email: "sidi@gmail.com",
      passwordHash: realUserHash,
      name: "Livreur Linge Serein",
      phone: "+33600000002",
      role: "ROLE_LIVREUR",
      isActive: true,
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
      deliveryPin: driverPinHash,
    },
  });

  const client1 = await prisma.user.upsert({
    where: { email: "autressir@gmail.com" },
    update: {},
    create: {
      operatorId: operator.id,
      zoneId: zone1.id,
      email: "autressir@gmail.com",
      passwordHash: realUserHash,
      name: "Client Linge Serein",
      phone: "+33600000003",
      address: "45 rue de la Balance, 84000 Avignon",
      accommodationType: "HOTEL",
      role: "ROLE_CLIENT",
      isActive: true,
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
      stockAlertThreshold: 30,
      preferredTimeSlot: "08:00-10:00",
      notes: "Hotel 3 etoiles - centre-ville Avignon",
    },
  });

  const client2 = await prisma.user.upsert({
    where: { email: "client2@example.com" },
    update: {},
    create: {
      operatorId: operator.id,
      zoneId: zone1.id,
      email: "client2@example.com",
      passwordHash: realUserHash,
      name: "Marie Bonnet",
      phone: "+33600000004",
      address: "8 chemin des Oliviers, 84100 Orange",
      accommodationType: "GITE",
      role: "ROLE_CLIENT",
      isActive: false,
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
      stockAlertThreshold: 25,
      preferredTimeSlot: "10:00-12:00",
      notes: "Gite rural - 3 chambres",
    },
  });

  const client3 = await prisma.user.upsert({
    where: { email: "client3@example.com" },
    update: {},
    create: {
      operatorId: operator.id,
      zoneId: zone2.id,
      email: "client3@example.com",
      passwordHash: realUserHash,
      name: "Jean-Luc Rousseau",
      phone: "+33600000005",
      address: "22 route de Bonnieux, 84400 Apt",
      accommodationType: "AIRBNB",
      role: "ROLE_CLIENT",
      isActive: false,
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
      stockAlertThreshold: 30,
      preferredTimeSlot: "08:00-10:00",
      notes: "Airbnb 2 logements - Luberon",
    },
  });

  console.log("  Users: admin, livreur, 3 clients");

  // ---- Subscriptions V2 — Pack Sérénité ---------------------------------------
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  // committedUntil = currentPeriodStart + 3 mois (calendaire avec clamp fin de mois — ADR-V2-006)
  const committedUntil = addMonths(periodStart, SUBSCRIPTION_DEFAULTS.MIN_ENGAGEMENT_MONTHS);

  // Client réel : abonnement Pack Sérénité avec snapshots complets
  const sub1 = await prisma.subscription.upsert({
    where: { userId: client1.id },
    update: {},
    create: {
      userId: client1.id,
      plan: null, // ADR-V2-003 : null pour Pack Sérénité
      status: "ACTIVE",
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      priceCents: SUBSCRIPTION_DEFAULTS.PRICE_CENTS,
      minEngagementMonths: SUBSCRIPTION_DEFAULTS.MIN_ENGAGEMENT_MONTHS,
      committedUntil,
      kitBainQty: SUBSCRIPTION_DEFAULTS.KIT_BAIN_QTY,
      kitLitQty: SUBSCRIPTION_DEFAULTS.KIT_LIT_QTY,
    },
  });

  // Fixtures démo — Pack Sérénité aussi pour la cohérence
  const sub2 = await prisma.subscription.upsert({
    where: { userId: client2.id },
    update: {},
    create: {
      userId: client2.id,
      plan: null,
      status: "ACTIVE",
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      priceCents: SUBSCRIPTION_DEFAULTS.PRICE_CENTS,
      minEngagementMonths: SUBSCRIPTION_DEFAULTS.MIN_ENGAGEMENT_MONTHS,
      committedUntil,
      kitBainQty: SUBSCRIPTION_DEFAULTS.KIT_BAIN_QTY,
      kitLitQty: SUBSCRIPTION_DEFAULTS.KIT_LIT_QTY,
    },
  });

  const sub3 = await prisma.subscription.upsert({
    where: { userId: client3.id },
    update: {},
    create: {
      userId: client3.id,
      plan: null,
      status: "ACTIVE",
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      priceCents: SUBSCRIPTION_DEFAULTS.PRICE_CENTS,
      minEngagementMonths: SUBSCRIPTION_DEFAULTS.MIN_ENGAGEMENT_MONTHS,
      committedUntil,
      kitBainQty: SUBSCRIPTION_DEFAULTS.KIT_BAIN_QTY,
      kitLitQty: SUBSCRIPTION_DEFAULTS.KIT_LIT_QTY,
    },
  });

  console.log("  Subscriptions: Pack Sérénité (x3) avec snapshots engagement");

  // ---- Subscription Products V2 — Kit Bain + Kit Lit --------------------------
  const kitBainId = productMap["kit-bain"];
  const kitLitId = productMap["kit-lit"];

  if (!kitBainId || !kitLitId) {
    throw new Error("Produits kit-bain ou kit-lit introuvables après le seed.");
  }

  for (const [subId, bainQty, litQty] of [
    [sub1.id, SUBSCRIPTION_DEFAULTS.KIT_BAIN_QTY, SUBSCRIPTION_DEFAULTS.KIT_LIT_QTY],
    [sub2.id, SUBSCRIPTION_DEFAULTS.KIT_BAIN_QTY, SUBSCRIPTION_DEFAULTS.KIT_LIT_QTY],
    [sub3.id, SUBSCRIPTION_DEFAULTS.KIT_BAIN_QTY, SUBSCRIPTION_DEFAULTS.KIT_LIT_QTY],
  ] as [string, number, number][]) {
    await prisma.subscriptionProduct.upsert({
      where: { subscriptionId_productId: { subscriptionId: subId, productId: kitBainId } },
      update: { quantity: bainQty },
      create: { subscriptionId: subId, productId: kitBainId, quantity: bainQty },
    });
    await prisma.subscriptionProduct.upsert({
      where: { subscriptionId_productId: { subscriptionId: subId, productId: kitLitId } },
      update: { quantity: litQty },
      create: { subscriptionId: subId, productId: kitLitId, quantity: litQty },
    });
  }

  console.log("  Subscription Products: Kit Bain (x8) + Kit Lit (x4) par abonnement");

  // ---- Client Stock (par ProductRange, ADR-V2-004 — inchangé) -----------------
  const clientStockData: Array<{
    userId: string;
    productRange: "PRESTIGE" | "HOTEL" | "CONFORT";
    cleanSets: number;
    dirtySets: number;
    totalInCirculation: number;
  }> = [
    {
      userId: client1.id,
      productRange: "PRESTIGE",
      cleanSets: 40,
      dirtySets: 15,
      totalInCirculation: 60,
    },
    {
      userId: client2.id,
      productRange: "HOTEL",
      cleanSets: 25,
      dirtySets: 10,
      totalInCirculation: 40,
    },
    {
      userId: client3.id,
      productRange: "CONFORT",
      cleanSets: 5,
      dirtySets: 12,
      totalInCirculation: 20,
    },
  ];

  for (const cs of clientStockData) {
    await prisma.clientStock.upsert({
      where: { userId_productRange: { userId: cs.userId, productRange: cs.productRange } },
      update: {},
      create: cs,
    });
  }

  console.log("  Client Stock entries (PRESTIGE / HOTEL / CONFORT — ADR-V2-004)");

  // ---- Operator Stock ----------------------------------------------------------
  const opStockData: Array<{
    operatorId: string;
    productRange: "CONFORT" | "HOTEL" | "PRESTIGE";
    cleanAvailable: number;
    dirtyPending: number;
    inCirculation: number;
    retired: number;
  }> = [
    {
      operatorId: operator.id,
      productRange: "CONFORT",
      cleanAvailable: 200,
      dirtyPending: 50,
      inCirculation: 120,
      retired: 10,
    },
    {
      operatorId: operator.id,
      productRange: "HOTEL",
      cleanAvailable: 150,
      dirtyPending: 30,
      inCirculation: 80,
      retired: 5,
    },
    {
      operatorId: operator.id,
      productRange: "PRESTIGE",
      cleanAvailable: 100,
      dirtyPending: 20,
      inCirculation: 60,
      retired: 2,
    },
  ];

  for (const os of opStockData) {
    await prisma.operatorStock.upsert({
      where: {
        operatorId_productRange: { operatorId: os.operatorId, productRange: os.productRange },
      },
      update: {},
      create: os,
    });
  }

  console.log("  Operator Stock entries");

  // ---- Sample Orders (adaptées aux nouveaux produits KIT_*) -------------------
  const kitCompletId = productMap["kit-complet"];
  if (!kitCompletId) {
    throw new Error("Produit kit-complet introuvable après le seed.");
  }

  const deliveryDate1 = new Date();
  deliveryDate1.setDate(deliveryDate1.getDate() + 3);

  const order1 = await prisma.order.upsert({
    where: { orderNumber: "LNG-2026-000001" },
    update: {},
    create: {
      userId: client1.id,
      orderNumber: "LNG-2026-000001",
      status: "CONFIRMED",
      isRecurring: true,
      totalCents: SUBSCRIPTION_DEFAULTS.PRICE_CENTS, // 8900 centimes (1 mois)
      deliveryDate: deliveryDate1,
      timeSlot: "08:00-10:00",
      items: {
        create: [
          {
            productId: kitBainId,
            quantity: SUBSCRIPTION_DEFAULTS.KIT_BAIN_QTY, // 8
            unitCents: 750,
            totalCents: 750 * SUBSCRIPTION_DEFAULTS.KIT_BAIN_QTY,
          },
          {
            productId: kitLitId,
            quantity: SUBSCRIPTION_DEFAULTS.KIT_LIT_QTY, // 4
            unitCents: 1650,
            totalCents: 1650 * SUBSCRIPTION_DEFAULTS.KIT_LIT_QTY,
          },
        ],
      },
    },
  });

  const deliveryDate2 = new Date();
  deliveryDate2.setDate(deliveryDate2.getDate() + 5);

  const order2 = await prisma.order.upsert({
    where: { orderNumber: "LNG-2026-000002" },
    update: {},
    create: {
      userId: client2.id,
      orderNumber: "LNG-2026-000002",
      status: "PENDING",
      isRecurring: false,
      totalCents: 2200 * 2, // 2 Kit Complet
      deliveryDate: deliveryDate2,
      timeSlot: "10:00-12:00",
      items: {
        create: [
          {
            productId: kitCompletId,
            quantity: 2,
            unitCents: 2200,
            totalCents: 2200 * 2,
          },
        ],
      },
    },
  });

  const order3 = await prisma.order.upsert({
    where: { orderNumber: "LNG-2026-000003" },
    update: {},
    create: {
      userId: client3.id,
      orderNumber: "LNG-2026-000003",
      status: "DELIVERED",
      isRecurring: false,
      totalCents: 750 * 3, // 3 Kit Bain
      deliveryDate: new Date(),
      timeSlot: "08:00-10:00",
      items: {
        create: [
          {
            productId: kitBainId,
            quantity: 3,
            unitCents: 750,
            totalCents: 750 * 3,
          },
        ],
      },
    },
  });

  console.log(`  Orders: ${order1.orderNumber}, ${order2.orderNumber}, ${order3.orderNumber}`);

  // ---- Notifications ----------------------------------------------------------
  const existingNotifCount = await prisma.notification.count();
  if (existingNotifCount === 0) {
    await prisma.notification.createMany({
      data: [
        {
          userId: client1.id,
          type: "DELIVERY_REMINDER",
          channel: "BOTH",
          title: "Livraison prevue demain",
          body: "Votre livraison Pack Serénité est prévue demain entre 08h00 et 10h00.",
          sentAt: new Date(),
        },
        {
          userId: client3.id,
          type: "STOCK_LOW",
          channel: "PUSH",
          title: "Stock bas",
          body: "Votre stock de kits est bas. Pensez a planifier une livraison.",
          sentAt: new Date(),
        },
        {
          userId: client2.id,
          type: "SUBSCRIPTION_RENEWED",
          channel: "EMAIL",
          title: "Abonnement renouvele",
          body: "Votre abonnement Pack Sérénité a été renouvelé avec succès pour le mois en cours.",
          sentAt: new Date(),
        },
        {
          userId: adminUser.id,
          type: "GENERAL",
          channel: "EMAIL",
          title: "Nouveau client inscrit",
          body: "Jean-Luc Rousseau vient de s'inscrire au Pack Sérénité.",
          sentAt: new Date(),
        },
      ],
    });
  }

  console.log("  Notifications: 4");

  // ---- Delivery Rounds --------------------------------------------------------
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const dayAfter = new Date(today);
  dayAfter.setDate(today.getDate() + 2);

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  // Round 1 : Aujourd'hui — IN_PROGRESS
  const existingRound1 = await prisma.deliveryRound.findFirst({
    where: { driverId: driverUser.id, date: today },
  });
  if (!existingRound1) {
    await prisma.deliveryRound.create({
      data: {
        operatorId: operator.id,
        zoneId: zone1.id,
        driverId: driverUser.id,
        date: today,
        status: "IN_PROGRESS",
        startedAt: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 8, 15),
        notes: "Tournée matin — Avignon centre + Orange",
        stops: {
          create: [
            {
              clientId: client1.id,
              driverId: driverUser.id,
              orderId: order1.id,
              stopOrder: 1,
              status: "COMPLETED",
              setsToDeliver: 12,
              setsDelivered: 12,
              dirtyPickedUp: 8,
              qrCodeScanned: true,
              completedAt: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 8, 45),
              specialInstructions: "Déposer à la réception — demander Mme Leclerc",
            },
            {
              clientId: client2.id,
              driverId: driverUser.id,
              stopOrder: 2,
              status: "PENDING",
              setsToDeliver: 2,
              specialInstructions: "Portail code 4521 — déposer dans le local linge à gauche",
            },
            {
              clientId: client3.id,
              driverId: driverUser.id,
              stopOrder: 3,
              status: "PENDING",
              setsToDeliver: 3,
              specialInstructions: "Appeler 10 min avant arrivée",
            },
          ],
        },
      },
    });
  }

  // Round 2 : Demain — PLANNED
  const existingRound2 = await prisma.deliveryRound.findFirst({
    where: { driverId: driverUser.id, date: tomorrow },
  });
  if (!existingRound2) {
    await prisma.deliveryRound.create({
      data: {
        operatorId: operator.id,
        zoneId: zone1.id,
        driverId: driverUser.id,
        date: tomorrow,
        status: "PLANNED",
        notes: "Tournée matin — secteur Orange",
        stops: {
          create: [
            {
              clientId: client2.id,
              driverId: driverUser.id,
              stopOrder: 1,
              status: "PENDING",
              setsToDeliver: 2,
              specialInstructions: "Portail code 4521",
            },
            {
              clientId: client1.id,
              driverId: driverUser.id,
              stopOrder: 2,
              status: "PENDING",
              setsToDeliver: 12,
              specialInstructions: "Livraison exceptionnelle — événement weekend",
            },
          ],
        },
      },
    });
  }

  // Round 3 : J+2 — PLANNED (Luberon)
  const existingRound3 = await prisma.deliveryRound.findFirst({
    where: { driverId: driverUser.id, date: dayAfter },
  });
  if (!existingRound3) {
    await prisma.deliveryRound.create({
      data: {
        operatorId: operator.id,
        zoneId: zone2.id,
        driverId: driverUser.id,
        date: dayAfter,
        status: "PLANNED",
        notes: "Tournée Luberon",
        stops: {
          create: [
            {
              clientId: client3.id,
              driverId: driverUser.id,
              stopOrder: 1,
              status: "PENDING",
              setsToDeliver: 3,
              specialInstructions: "2 logements — répartir 2 + 1 kits",
            },
          ],
        },
      },
    });
  }

  // Round 4 : Hier — COMPLETED (historique)
  const existingRound4 = await prisma.deliveryRound.findFirst({
    where: { driverId: driverUser.id, date: yesterday },
  });
  if (!existingRound4) {
    await prisma.deliveryRound.create({
      data: {
        operatorId: operator.id,
        zoneId: zone1.id,
        driverId: driverUser.id,
        date: yesterday,
        status: "COMPLETED",
        startedAt: new Date(
          yesterday.getFullYear(),
          yesterday.getMonth(),
          yesterday.getDate(),
          8,
          0,
        ),
        completedAt: new Date(
          yesterday.getFullYear(),
          yesterday.getMonth(),
          yesterday.getDate(),
          11,
          30,
        ),
        notes: "Tournée matinale terminée",
        stops: {
          create: [
            {
              clientId: client1.id,
              driverId: driverUser.id,
              stopOrder: 1,
              status: "COMPLETED",
              setsToDeliver: 12,
              setsDelivered: 12,
              dirtyPickedUp: 10,
              qrCodeScanned: true,
              completedAt: new Date(
                yesterday.getFullYear(),
                yesterday.getMonth(),
                yesterday.getDate(),
                8,
                40,
              ),
            },
            {
              clientId: client2.id,
              driverId: driverUser.id,
              stopOrder: 2,
              status: "COMPLETED",
              setsToDeliver: 2,
              setsDelivered: 2,
              dirtyPickedUp: 2,
              qrCodeScanned: true,
              completedAt: new Date(
                yesterday.getFullYear(),
                yesterday.getMonth(),
                yesterday.getDate(),
                9,
                15,
              ),
            },
          ],
        },
      },
    });
  }

  console.log(
    "  Delivery Rounds: today (IN_PROGRESS), tomorrow (PLANNED), J+2 (PLANNED), yesterday (COMPLETED)",
  );

  // ---- Stock Movements --------------------------------------------------------
  const existingMovements = await prisma.stockMovement.count();
  if (existingMovements === 0) {
    await prisma.stockMovement.createMany({
      data: [
        {
          userId: client1.id,
          productRange: "PRESTIGE",
          type: "DELIVERY",
          quantity: 12,
          reason: "Livraison #LNG-2026-000001",
        },
        {
          userId: client1.id,
          productRange: "PRESTIGE",
          type: "PICKUP_DIRTY",
          quantity: -8,
          reason: "Récupération linge sale",
        },
        {
          userId: client2.id,
          productRange: "HOTEL",
          type: "DELIVERY",
          quantity: 6,
          reason: "Livraison régulière",
        },
        {
          userId: client2.id,
          productRange: "HOTEL",
          type: "PICKUP_DIRTY",
          quantity: -5,
          reason: "Récupération linge sale",
        },
        {
          userId: client3.id,
          productRange: "CONFORT",
          type: "WASH_COMPLETE",
          quantity: 8,
          reason: "Lot lavé — retour en stock",
        },
        {
          userId: client3.id,
          productRange: "CONFORT",
          type: "ADJUSTMENT",
          quantity: -3,
          reason: "Ajustement inventaire",
        },
      ],
    });
    console.log("  Stock Movements: 6 entries");
  }

  console.log("\nSeed V2 completed successfully!");
}

main()
  .catch((e: unknown) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
