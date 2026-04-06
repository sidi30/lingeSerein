import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 12;

async function main() {
  console.log("Seeding database...");

  // ---- Operator ----
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

  // ---- Delivery Zones ----
  // No unique field beyond id, so we use findFirst + conditional create
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

  // ---- Service Types ----
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

  const serviceVente = await prisma.serviceType.upsert({
    where: { kind: "VENTE" },
    update: {},
    create: {
      kind: "VENTE",
      name: "Vente de linge",
      description: "Achat de linge hotelier de qualite professionnelle",
      isActive: true,
    },
  });

  const serviceEntretien = await prisma.serviceType.upsert({
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

  // ---- Products ----
  // Unique constraint: @@unique([operatorId, category, range])
  // 6 products: SERVIETTES x 3 ranges + TAPIS_BAIN x 3 ranges
  const confortServiettes = await prisma.product.upsert({
    where: {
      operatorId_category_range: {
        operatorId: operator.id,
        category: "SERVIETTES",
        range: "CONFORT",
      },
    },
    update: {},
    create: {
      operatorId: operator.id,
      serviceTypeId: serviceLocation.id,
      category: "SERVIETTES",
      range: "CONFORT",
      name: "Set serviettes Confort - Coton 500g",
      description: "Set de serviettes gamme Confort, coton 500g/m2",
      priceCents: 600,
      attributes: { grammage: 500, matiere: "Coton", dimensions: "50x100cm + 70x140cm" },
      isActive: true,
    },
  });

  const hotelServiettes = await prisma.product.upsert({
    where: {
      operatorId_category_range: {
        operatorId: operator.id,
        category: "SERVIETTES",
        range: "HOTEL",
      },
    },
    update: {},
    create: {
      operatorId: operator.id,
      serviceTypeId: serviceLocation.id,
      category: "SERVIETTES",
      range: "HOTEL",
      name: "Set serviettes Hotel - Coton peigne 550g",
      description: "Set de serviettes gamme Hotel, coton peigne 550g/m2",
      priceCents: 900,
      attributes: { grammage: 550, matiere: "Coton peigne", dimensions: "50x100cm + 70x140cm" },
      isActive: true,
    },
  });

  const prestigeServiettes = await prisma.product.upsert({
    where: {
      operatorId_category_range: {
        operatorId: operator.id,
        category: "SERVIETTES",
        range: "PRESTIGE",
      },
    },
    update: {},
    create: {
      operatorId: operator.id,
      serviceTypeId: serviceLocation.id,
      category: "SERVIETTES",
      range: "PRESTIGE",
      name: "Set serviettes Prestige - Coton egyptien 600g",
      description: "Set de serviettes gamme Prestige, coton egyptien 600g/m2",
      priceCents: 1400,
      attributes: { grammage: 600, matiere: "Coton egyptien", dimensions: "50x100cm + 70x140cm" },
      isActive: true,
    },
  });

  const confortTapis = await prisma.product.upsert({
    where: {
      operatorId_category_range: {
        operatorId: operator.id,
        category: "TAPIS_BAIN",
        range: "CONFORT",
      },
    },
    update: {},
    create: {
      operatorId: operator.id,
      serviceTypeId: serviceVente.id,
      category: "TAPIS_BAIN",
      range: "CONFORT",
      name: "Tapis de bain Confort - Coton 500g",
      description: "Tapis de bain gamme Confort, coton 500g/m2",
      priceCents: 600,
      attributes: { grammage: 500, matiere: "Coton", dimensions: "50x80cm" },
      isActive: true,
    },
  });

  const hotelTapis = await prisma.product.upsert({
    where: {
      operatorId_category_range: {
        operatorId: operator.id,
        category: "TAPIS_BAIN",
        range: "HOTEL",
      },
    },
    update: {},
    create: {
      operatorId: operator.id,
      serviceTypeId: serviceVente.id,
      category: "TAPIS_BAIN",
      range: "HOTEL",
      name: "Tapis de bain Hotel - Coton peigne 550g",
      description: "Tapis de bain gamme Hotel, coton peigne 550g/m2",
      priceCents: 900,
      attributes: { grammage: 550, matiere: "Coton peigne", dimensions: "50x80cm" },
      isActive: true,
    },
  });

  const prestigeTapis = await prisma.product.upsert({
    where: {
      operatorId_category_range: {
        operatorId: operator.id,
        category: "TAPIS_BAIN",
        range: "PRESTIGE",
      },
    },
    update: {},
    create: {
      operatorId: operator.id,
      serviceTypeId: serviceEntretien.id,
      category: "TAPIS_BAIN",
      range: "PRESTIGE",
      name: "Tapis de bain Prestige - Coton egyptien 600g",
      description: "Tapis de bain gamme Prestige, coton egyptien 600g/m2",
      priceCents: 1400,
      attributes: { grammage: 600, matiere: "Coton egyptien", dimensions: "50x80cm" },
      isActive: true,
    },
  });

  console.log("  Products: 6 (SERVIETTES x3 + TAPIS_BAIN x3)");

  // ---- Delivery Schedules ----
  // Zone 1: Monday (1) + Thursday (4)
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

  // Zone 2: Tuesday (2) + Friday (5)
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

  // ---- Users ----
  const adminHash = await bcrypt.hash("Admin123!", BCRYPT_ROUNDS);
  const driverHash = await bcrypt.hash("Livreur123!", BCRYPT_ROUNDS);
  const clientHash = await bcrypt.hash("Client123!", BCRYPT_ROUNDS);
  const driverPinHash = await bcrypt.hash("123456", BCRYPT_ROUNDS);

  const adminUser = await prisma.user.upsert({
    where: { email: "admin@lingengo.fr" },
    update: {},
    create: {
      operatorId: operator.id,
      email: "admin@lingengo.fr",
      passwordHash: adminHash,
      name: "Sophie Martin",
      phone: "+33600000001",
      role: "ROLE_ADMIN",
      isActive: true,
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });

  const driverUser = await prisma.user.upsert({
    where: { email: "livreur@lingengo.fr" },
    update: {},
    create: {
      operatorId: operator.id,
      zoneId: zone1.id,
      email: "livreur@lingengo.fr",
      passwordHash: driverHash,
      name: "Marc Dupont",
      phone: "+33600000002",
      role: "ROLE_LIVREUR",
      isActive: true,
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
      deliveryPin: driverPinHash,
    },
  });

  const client1 = await prisma.user.upsert({
    where: { email: "client1@example.com" },
    update: {},
    create: {
      operatorId: operator.id,
      zoneId: zone1.id,
      email: "client1@example.com",
      passwordHash: clientHash,
      name: "Pierre Leclerc",
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
      passwordHash: clientHash,
      name: "Marie Bonnet",
      phone: "+33600000004",
      address: "8 chemin des Oliviers, 84100 Orange",
      accommodationType: "GITE",
      role: "ROLE_CLIENT",
      isActive: true,
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
      passwordHash: clientHash,
      name: "Jean-Luc Rousseau",
      phone: "+33600000005",
      address: "22 route de Bonnieux, 84400 Apt",
      accommodationType: "AIRBNB",
      role: "ROLE_CLIENT",
      isActive: true,
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
      stockAlertThreshold: 30,
      preferredTimeSlot: "08:00-10:00",
      notes: "Airbnb 2 logements - Luberon",
    },
  });

  console.log("  Users: admin, livreur, 3 clients");

  // ---- Subscriptions ----
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const sub1 = await prisma.subscription.upsert({
    where: { userId: client1.id },
    update: {},
    create: {
      userId: client1.id,
      plan: "PRESTIGE",
      status: "ACTIVE",
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    },
  });

  const sub2 = await prisma.subscription.upsert({
    where: { userId: client2.id },
    update: {},
    create: {
      userId: client2.id,
      plan: "CONFORT",
      status: "ACTIVE",
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    },
  });

  const sub3 = await prisma.subscription.upsert({
    where: { userId: client3.id },
    update: {},
    create: {
      userId: client3.id,
      plan: "ESSENTIELLE",
      status: "ACTIVE",
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    },
  });

  console.log("  Subscriptions: PRESTIGE, CONFORT, ESSENTIELLE");

  // ---- Subscription Products ----
  await prisma.subscriptionProduct.upsert({
    where: { subscriptionId_productId: { subscriptionId: sub1.id, productId: prestigeServiettes.id } },
    update: {},
    create: { subscriptionId: sub1.id, productId: prestigeServiettes.id, quantity: 60 },
  });

  await prisma.subscriptionProduct.upsert({
    where: { subscriptionId_productId: { subscriptionId: sub2.id, productId: hotelServiettes.id } },
    update: {},
    create: { subscriptionId: sub2.id, productId: hotelServiettes.id, quantity: 40 },
  });

  await prisma.subscriptionProduct.upsert({
    where: { subscriptionId_productId: { subscriptionId: sub3.id, productId: confortServiettes.id } },
    update: {},
    create: { subscriptionId: sub3.id, productId: confortServiettes.id, quantity: 20 },
  });

  console.log("  Subscription Products linked");

  // ---- Client Stock ----
  const clientStockData = [
    { userId: client1.id, productRange: "PRESTIGE" as const, cleanSets: 40, dirtySets: 15, totalInCirculation: 60 },
    { userId: client2.id, productRange: "HOTEL" as const, cleanSets: 25, dirtySets: 10, totalInCirculation: 40 },
    { userId: client3.id, productRange: "CONFORT" as const, cleanSets: 5, dirtySets: 12, totalInCirculation: 20 },
  ];

  for (const cs of clientStockData) {
    await prisma.clientStock.upsert({
      where: { userId_productRange: { userId: cs.userId, productRange: cs.productRange } },
      update: {},
      create: cs,
    });
  }

  console.log("  Client Stock entries");

  // ---- Operator Stock ----
  const opStockData = [
    { operatorId: operator.id, productRange: "CONFORT" as const, cleanAvailable: 200, dirtyPending: 50, inCirculation: 120, retired: 10 },
    { operatorId: operator.id, productRange: "HOTEL" as const, cleanAvailable: 150, dirtyPending: 30, inCirculation: 80, retired: 5 },
    { operatorId: operator.id, productRange: "PRESTIGE" as const, cleanAvailable: 100, dirtyPending: 20, inCirculation: 60, retired: 2 },
  ];

  for (const os of opStockData) {
    await prisma.operatorStock.upsert({
      where: { operatorId_productRange: { operatorId: os.operatorId, productRange: os.productRange } },
      update: {},
      create: os,
    });
  }

  console.log("  Operator Stock entries");

  // ---- Sample Orders ----
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
      totalCents: 1400 * 10,
      deliveryDate: deliveryDate1,
      timeSlot: "08:00-10:00",
      items: {
        create: [
          { productId: prestigeServiettes.id, quantity: 10, unitCents: 1400, totalCents: 1400 * 10 },
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
      isRecurring: true,
      totalCents: 900 * 8,
      deliveryDate: deliveryDate2,
      timeSlot: "10:00-12:00",
      items: {
        create: [
          { productId: hotelServiettes.id, quantity: 8, unitCents: 900, totalCents: 900 * 8 },
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
      totalCents: 600 * 5,
      deliveryDate: new Date(),
      timeSlot: "08:00-10:00",
      items: {
        create: [
          { productId: confortServiettes.id, quantity: 5, unitCents: 600, totalCents: 600 * 5 },
        ],
      },
    },
  });

  console.log(`  Orders: ${order1.orderNumber}, ${order2.orderNumber}, ${order3.orderNumber}`);

  // ---- Sample Notifications ----
  // Notifications have no unique constraint, so check if any exist for idempotency
  const existingNotifCount = await prisma.notification.count();
  if (existingNotifCount === 0) {
    await prisma.notification.createMany({
      data: [
        {
          userId: client1.id,
          type: "DELIVERY_REMINDER",
          channel: "BOTH",
          title: "Livraison prevue demain",
          body: "Votre livraison de 10 sets Prestige est prevue demain entre 08h00 et 10h00.",
          sentAt: new Date(),
        },
        {
          userId: client3.id,
          type: "STOCK_LOW",
          channel: "PUSH",
          title: "Stock bas",
          body: "Votre stock de sets Confort est bas (25%). Pensez a planifier une livraison.",
          sentAt: new Date(),
        },
        {
          userId: client2.id,
          type: "SUBSCRIPTION_RENEWED",
          channel: "EMAIL",
          title: "Abonnement renouvele",
          body: "Votre abonnement Confort a ete renouvele avec succes pour le mois en cours.",
          sentAt: new Date(),
        },
        {
          userId: adminUser.id,
          type: "GENERAL",
          channel: "EMAIL",
          title: "Nouveau client inscrit",
          body: "Jean-Luc Rousseau vient de s'inscrire avec un abonnement Essentielle.",
          sentAt: new Date(),
        },
      ],
    });
  }

  console.log("  Notifications: 4 created");

  // ---- Delivery Rounds & Stops ----
  // Create rounds for today and next days so the driver always has data
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const dayAfter = new Date(today);
  dayAfter.setDate(today.getDate() + 2);

  // Helper to get a date N days ago
  const daysAgo = (n: number) => {
    const d = new Date(today);
    d.setDate(today.getDate() - n);
    return d;
  };

  // Round 1: Today — IN_PROGRESS, 3 stops (1 completed, 2 pending)
  const existingRound1 = await prisma.deliveryRound.findFirst({
    where: { driverId: driverUser.id, date: today },
  });
  if (!existingRound1) {
    const round1 = await prisma.deliveryRound.create({
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
              setsToDeliver: 10,
              setsDelivered: 10,
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
              setsToDeliver: 8,
              specialInstructions: "Portail code 4521 — déposer dans le local linge à gauche",
            },
            {
              clientId: client3.id,
              driverId: driverUser.id,
              stopOrder: 3,
              status: "PENDING",
              setsToDeliver: 5,
              specialInstructions: "Appeler 10 min avant arrivée",
            },
          ],
        },
      },
    });
    console.log(`  Delivery Round today: ${round1.id} (IN_PROGRESS, 3 stops)`);
  } else {
    console.log("  Delivery Round today: already exists");
  }

  // Round 2: Tomorrow — PLANNED, 2 stops
  const existingRound2 = await prisma.deliveryRound.findFirst({
    where: { driverId: driverUser.id, date: tomorrow },
  });
  if (!existingRound2) {
    const round2 = await prisma.deliveryRound.create({
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
              setsToDeliver: 8,
              specialInstructions: "Portail code 4521",
            },
            {
              clientId: client1.id,
              driverId: driverUser.id,
              stopOrder: 2,
              status: "PENDING",
              setsToDeliver: 15,
              specialInstructions: "Livraison exceptionnelle — événement weekend",
            },
          ],
        },
      },
    });
    console.log(`  Delivery Round tomorrow: ${round2.id} (PLANNED, 2 stops)`);
  } else {
    console.log("  Delivery Round tomorrow: already exists");
  }

  // Round 3: Day after tomorrow — PLANNED, 1 stop (Luberon)
  const existingRound3 = await prisma.deliveryRound.findFirst({
    where: { driverId: driverUser.id, date: dayAfter },
  });
  if (!existingRound3) {
    const round3 = await prisma.deliveryRound.create({
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
              setsToDeliver: 5,
              specialInstructions: "2 logements — répartir 3 + 2 sets",
            },
          ],
        },
      },
    });
    console.log(`  Delivery Round J+2: ${round3.id} (PLANNED, 1 stop)`);
  } else {
    console.log("  Delivery Round J+2: already exists");
  }

  // Round 4: Yesterday — COMPLETED (historical data)
  const yesterday = daysAgo(1);
  const existingRound4 = await prisma.deliveryRound.findFirst({
    where: { driverId: driverUser.id, date: yesterday },
  });
  if (!existingRound4) {
    const round4 = await prisma.deliveryRound.create({
      data: {
        operatorId: operator.id,
        zoneId: zone1.id,
        driverId: driverUser.id,
        date: yesterday,
        status: "COMPLETED",
        startedAt: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 8, 0),
        completedAt: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 11, 30),
        notes: "Tournée matinale terminée",
        stops: {
          create: [
            {
              clientId: client1.id,
              driverId: driverUser.id,
              stopOrder: 1,
              status: "COMPLETED",
              setsToDeliver: 10,
              setsDelivered: 10,
              dirtyPickedUp: 10,
              qrCodeScanned: true,
              completedAt: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 8, 40),
            },
            {
              clientId: client2.id,
              driverId: driverUser.id,
              stopOrder: 2,
              status: "COMPLETED",
              setsToDeliver: 6,
              setsDelivered: 6,
              dirtyPickedUp: 5,
              qrCodeScanned: true,
              completedAt: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 9, 15),
            },
          ],
        },
      },
    });
    console.log(`  Delivery Round yesterday: ${round4.id} (COMPLETED, 2 stops)`);
  } else {
    console.log("  Delivery Round yesterday: already exists");
  }

  // ---- Stock Movements (for client mobile history) ----
  const existingMovements = await prisma.stockMovement.count();
  if (existingMovements === 0) {
    await prisma.stockMovement.createMany({
      data: [
        { userId: client1.id, productRange: "PRESTIGE", type: "DELIVERY", quantity: 10, reason: "Livraison #LNG-2026-000001" },
        { userId: client1.id, productRange: "PRESTIGE", type: "PICKUP_DIRTY", quantity: -8, reason: "Récupération linge sale" },
        { userId: client2.id, productRange: "HOTEL", type: "DELIVERY", quantity: 6, reason: "Livraison régulière" },
        { userId: client2.id, productRange: "HOTEL", type: "PICKUP_DIRTY", quantity: -5, reason: "Récupération linge sale" },
        { userId: client3.id, productRange: "CONFORT", type: "WASH_COMPLETE", quantity: 8, reason: "Lot lavé — retour en stock" },
        { userId: client3.id, productRange: "CONFORT", type: "ADJUSTMENT", quantity: -3, reason: "Ajustement inventaire" },
      ],
    });
    console.log("  Stock Movements: 6 entries");
  }

  console.log("\nSeed completed successfully!");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
