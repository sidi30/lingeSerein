# Architecture — Linge Serein Admin Web (F1–F4)

**Version:** 1.0
**Date:** 2026-06-11
**Architecte:** architect-agent
**Périmètre:** F1 Devis, F2 Demandes mobiles, F3 Utilisateurs, F4 Réglages
**Statut:** Accepted

---

## Vue d'ensemble

On étend le monorepo Turborepo existant sans rien casser : tous les changements de schéma Prisma sont **additifs** (nouveaux modèles `Quote`/`QuoteLine`, nouveaux champs nullable sur `Order`), les nouveaux endpoints suivent strictement les conventions Fastify 5 + Zod + service-layer + AuditLog déjà en place, et la logique de calcul/PDF des devis (aujourd'hui dupliquée dans `apps/vitrine`) est factorisée dans les packages partagés (`@lingengo/shared` pour le calcul pur, `@lingengo/ui` pour le rendu react-pdf). L'objectif est zéro régression sur l'app mobile et les routes existantes, et un contrat d'API exhaustif pour que `backend` et `frontend` avancent en parallèle.

**Contrainte structurante découверte à l'audit :** les routes ne sont PAS préfixées `/admin/*`. Elles sont montées par module sous `/api/v1/<module>` (`app.ts` : `register(orderRoutes, { prefix: "/api/v1/orders" })`). Le « /admin/quotes » de la spec est conceptuel. **Décision : on garde la convention réelle** → les nouveaux modules sont `/api/v1/quotes`, `/api/v1/users`, `/api/v1/settings`. Le préfixe `/admin` n'existe pas et ne sera pas introduit (éviterait un schéma de routing à deux niveaux non justifié). La protection « admin only » est portée par `requireRole("ROLE_ADMIN","ROLE_SUPER_ADMIN")` en `preHandler`, exactement comme `clients` aujourd'hui.

---

## Inventaire de l'existant (ancrage des décisions)

| Élément                                 | État réel                                                                                                                                                                   | Conséquence                                                                                                                                        |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Routing API                             | `/api/v1/<module>`, jamais `/admin/*`                                                                                                                                       | Nouveaux modules `quotes`, `users`, `settings` sous `/api/v1`                                                                                      |
| Envelope réponse                        | `{ success: true, data }` ; listes : `{ success: true, data, pagination }` (spread, pas de nesting)                                                                         | Respecter à l'identique ; `pagination = { page, limit, total, totalPages }`                                                                        |
| Erreurs                                 | `AppError(statusCode, code, message, details?)`, sous-classes `ValidationError` (**400**), `ConflictError` (409), `ForbiddenError`, `NotFoundError`, `TooManyRequestsError` | `ValidationError` = 400. La spec demande **422** pour transitions de statut invalides → on ajoute `UnprocessableEntityError(422, "UNPROCESSABLE")` |
| Validation                              | `schema.safeParse()` dans la route, `throw new ValidationError(flatten().fieldErrors)`                                                                                      | Reproduire ce pattern partout                                                                                                                      |
| Service layer                           | `class XService { constructor(prisma) }`, méthodes pures, audit dans le service                                                                                             | Idem pour `QuotesService`, `UsersService`, `SettingsService`                                                                                       |
| Audit                                   | `createAuditLog({ prisma, userId, action, entity, entityId, changes, ipAddress, userAgent })` ; `changes` auto-strip PII (email/phone/address/passwordHash/token...)        | Réutiliser tel quel ; `AuditAction` enum = CREATE/UPDATE/DELETE (pas de valeur custom → on mappe sur ces 3)                                        |
| Notifications                           | `NotificationsService.create(userId, type, title, body)` ; `NotificationType` enum n'a pas de valeur `ORDER_*` → on utilise `GENERAL`                                       | F2 confirme/refuse via `type: "GENERAL"`                                                                                                           |
| RBAC                                    | `requireRole(...roles)` middleware ; `request.user = { sub, role }`                                                                                                         | Idem                                                                                                                                               |
| Prisma                                  | UUID `@db.Uuid` partout, `@map snake_case`, soft-delete `deletedAt`, prix `Int` centimes                                                                                    | `Quote.id` en UUID (PAS cuid comme la spec le suggère — cohérence du schéma prime)                                                                 |
| `Order`                                 | a déjà `cancelledReason`, `deletedAt`, **pas** de `source`                                                                                                                  | Ajouter `source` (enum) nullable + default                                                                                                         |
| `idParamSchema`                         | `z.string().uuid("ID invalide")` (shared)                                                                                                                                   | Tous les `:id` sont des UUID                                                                                                                       |
| Pagination                              | `paginationSchema` shared : page≥1 default 1, limit 1..100 default 20 ; spec veut **25/page**                                                                               | On garde limit default **20** (existant) ; le front passe `limit=25` explicitement                                                                 |
| Client admin                            | `apps/admin-web/src/lib/api.ts` : `api.get/post/patch/delete`, **unwrap auto de `data`**, bearer token localStorage, 401 → redirect login                                   | Le front consomme `data` directement ; pour les listes l'unwrap renvoie `data` (array) — voir ADR-011                                              |
| `@lingengo/shared`                      | zod-only (dep unique `zod`), exporte schemas/types/constants, consommé par api + mobile                                                                                     | Hôte idéal pour `computeDevisTotals` + schemas devis. **Pas de React** → pas de PDF ici                                                            |
| `@lingengo/ui`                          | composants React/shadcn                                                                                                                                                     | Hôte du composant react-pdf partagé                                                                                                                |
| `apps/vitrine/src/lib/devis-pdf.tsx`    | `DevisData`, `computeDevisTotals`, `DevisDocument`, `downloadDevisPdf` — source de vérité actuelle du PDF                                                                   | À extraire (ADR-006)                                                                                                                               |
| `apps/admin-web/src/app/devis/page.tsx` | **simulateur de marge** (hors `(dashboard)`), sans rapport avec la feature devis de la spec                                                                                 | À ignorer / déplacer ; la vraie feature devis vit sous `(dashboard)/devis` (ADR-009)                                                               |

---

## Architecture Decision Records

### ADR-001 — Modèle Quote : tables relationnelles `Quote` + `QuoteLine` (pas de JSONB)

**Statut:** Accepted

**Contexte:**
Un devis a N lignes ordonnées, des totaux dérivés, un cycle de vie (statuts), et doit être requêtable (liste filtrée par statut/client/date, recherche). La spec propose deux modèles relationnels. L'alternative serait de stocker les lignes en colonne `Json`.

**Décision:**
Deux modèles Prisma `Quote` et `QuoteLine` (1-N), ids en **UUID `@db.Uuid`** (cohérence avec tout le schéma — on dévie de `cuid()` de la spec), prix en centimes `Int`, `@map` snake_case, soft-delete `deletedAt`.

```prisma
enum QuoteStatus {
  BROUILLON
  ENVOYE
  ACCEPTE
  REFUSE
  EXPIRE
}

model Quote {
  id                 String      @id @default(uuid()) @db.Uuid
  numero             String      @unique @db.VarChar(20)          // LSQ-YYYY-NNNN
  operatorId         String      @map("operator_id") @db.Uuid
  status             QuoteStatus @default(BROUILLON)
  clientNom          String      @map("client_nom") @db.VarChar(200)
  clientEmail        String?     @map("client_email") @db.VarChar(320)
  clientTel          String?     @map("client_tel") @db.VarChar(20)
  clientAdresse      String?     @map("client_adresse") @db.Text
  userId             String?     @map("user_id") @db.Uuid          // client lié optionnel
  remisePct          Int         @default(0) @map("remise_pct")    // centièmes de % : 1000 = 10%
  livraisonCents     Int         @default(0) @map("livraison_cents")
  tvaApplicable      Boolean     @default(false) @map("tva_applicable")
  notes              String?     @db.Text
  validiteJours      Int         @default(30) @map("validite_jours")
  dateEnvoi          DateTime?   @map("date_envoi")
  dateReponse        DateTime?   @map("date_reponse")
  convertedToOrderId String?     @unique @map("converted_to_order_id") @db.Uuid
  createdBy          String      @map("created_by") @db.Uuid       // admin créateur
  createdAt          DateTime    @default(now()) @map("created_at")
  updatedAt          DateTime    @updatedAt @map("updated_at")
  deletedAt          DateTime?   @map("deleted_at")

  operator  Operator     @relation(fields: [operatorId], references: [id])
  user      User?        @relation("QuoteClient", fields: [userId], references: [id])
  creator   User         @relation("QuoteCreator", fields: [createdBy], references: [id])
  order     Order?       @relation("QuoteOrder", fields: [convertedToOrderId], references: [id])
  lignes    QuoteLine[]

  @@index([operatorId])
  @@index([status])
  @@index([userId])
  @@index([numero])
  @@index([createdAt])
  @@map("quotes")
}

model QuoteLine {
  id          String @id @default(uuid()) @db.Uuid
  quoteId     String @map("quote_id") @db.Uuid
  designation String @db.VarChar(300)
  qty         Int
  unitCents   Int    @map("unit_cents")
  position    Int                                  // ordre d'affichage 0..n

  quote Quote @relation(fields: [quoteId], references: [id], onDelete: Cascade)

  @@index([quoteId])
  @@map("quote_lines")
}
```

Relations inverses à ajouter sur `Operator` (`quotes Quote[]`), `User` (`quotesAsClient`, `quotesCreated`), `Order` (`quote Quote?` côté inverse via `@relation("QuoteOrder")`).

**Alternatives considérées:**

- **Lignes en `Json` (JSONB)** — Avantages : moins de tables, un seul write. Inconvénients : pas d'intégrité, agrégats impossibles en SQL, typage TS faible, incohérent avec `OrderItem` (relationnel). → Rejetée : devis = entité métier durable, pas un blob.
- **`id` en `cuid()` (comme la spec)** — Inconvénient : casse l'homogénéité (tout le schéma est UUID `@db.Uuid`, `idParamSchema` valide `uuid()`). → Rejetée : l'uniformité prime sur le texte de la spec.

**Conséquences:**

- ✅ Filtres/recherche/tri natifs en SQL, intégrité référentielle, typage Prisma fort.
- ✅ Cohérent avec `Order`/`OrderItem`.
- ⚠️ Migration ajoute 2 tables + 1 enum + colonnes inverses (additif, non bloquant).

---

### ADR-002 — Numérotation séquentielle `LSQ-YYYY-NNNN` concurrence-safe

**Statut:** Accepted

**Contexte:**
`numero` doit être unique, séquentiel **par année**, format `LSQ-2026-0001`. Le pattern Order existant utilise `randomBytes` (non séquentiel) — inacceptable ici car la spec exige une séquence lisible et croissante. Risque : deux créations concurrentes → même numéro → violation `@unique` ou trou.

**Décision:**
Génération **dans une transaction Prisma `Serializable`** avec compteur dérivé du `count` annuel + retry sur collision unique (P2002). Algorithme dans `QuotesService.generateNumero(tx)`:

1. `count = tx.quote.count({ where: { numero: { startsWith: 'LSQ-{year}-' } } })` (inclut soft-deleted pour ne jamais réutiliser un numéro).
2. `numero = 'LSQ-{year}-' + String(count + 1).padStart(4, '0')`.
3. Insert. Si `P2002` sur `numero` → retry (max 5) en recomptant.
   La création complète du devis (numero + lignes) se fait dans **une seule** `prisma.$transaction(async (tx) => {...}, { isolationLevel: 'Serializable' })`.

**Alternatives considérées:**

- **Séquence Postgres dédiée par année** — robuste mais nécessite SQL brut hors Prisma migrate + reset annuel manuel. → Rejetée : complexité pour un volume de ~500 devis/an.
- **`randomBytes` (pattern Order)** — non séquentiel, illisible. → Rejetée : viole AC-F1-01.
- **Compteur en Redis (INCR)** — rapide mais désynchronisable de la DB (source de vérité doit rester Postgres). → Rejetée : risque de divergence après restore DB.

**Conséquences:**

- ✅ Séquence lisible, garantie unique par contrainte DB + transaction.
- ✅ Volume faible → `count` + Serializable sans coût mesurable.
- ⚠️ Sous très forte concurrence le retry pourrait boucler ; borné à 5 tentatives puis `AppError 409 QUOTE_NUMBER_RACE` (cas quasi impossible à ce volume).

---

### ADR-003 — Machine à états des statuts de devis (transitions contrôlées)

**Statut:** Accepted

**Contexte:**
AC-F1-03/04 : transitions valides uniquement, sinon **422**. Modifications libres en BROUILLON, corrections en ENVOYE, lecture seule sur ACCEPTE/REFUSE/EXPIRE.

**Décision:**
Table de transitions autorisées centralisée dans `@lingengo/shared` (réutilisable front pour griser les boutons) :

```ts
export const QUOTE_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  BROUILLON: ["ENVOYE"],
  ENVOYE: ["ACCEPTE", "REFUSE", "EXPIRE"],
  ACCEPTE: [], // terminal (conversion = action séparée, pas une transition)
  REFUSE: [],
  EXPIRE: [],
};
export const QUOTE_EDITABLE: QuoteStatus[] = ["BROUILLON", "ENVOYE"];
```

`PATCH /quotes/:id/status` valide `from -> to` ; transition interdite → `UnprocessableEntityError(422, "INVALID_TRANSITION", "Transition de statut non autorisée : {from} → {to}")`. Effets de bord : `ENVOYE` ⇒ set `dateEnvoi=now()` ; `ACCEPTE`/`REFUSE` ⇒ set `dateReponse=now()`. `PATCH /quotes/:id` (contenu) refusé si statut ∉ `QUOTE_EDITABLE` → 422 `"Ce devis ne peut plus être modifié"`.

**Alternatives considérées:**

- **Pas de garde, statut libre** — viole AC-F1-04. → Rejetée.
- **Lib state-machine (xstate)** — surdimensionné pour 5 états. → Rejetée.

**Conséquences:**

- ✅ Une seule source de vérité partagée front/back.
- ✅ Le front peut désactiver les boutons sans dupliquer la logique.
- ⚠️ Ajout d'un nouveau code HTTP 422 dans `errors.ts` (voir ADR-010).

---

### ADR-004 — Conversion devis → commande (ACCEPTE requis, client lié requis)

**Statut:** Accepted

**Contexte:**
AC-F1-05/06 : convertir un devis ACCEPTE en `Order`. Si pas de `userId` → modale front (pas de conversion). Le devis stocke des lignes libres (`designation`+`unitCents`) tandis que `OrderItem` exige un `productId` réel. Conflit de modèle à résoudre.

**Décision:**
`POST /quotes/:id/convert` :

- Refuse si `status != ACCEPTE` → 422 `"Seul un devis accepté peut être converti"`.
- Refuse si `userId == null` → 422 `"CLIENT_REQUIRED"` (le front affiche la modale de sélection/création client puis ré-appelle `PATCH /quotes/:id` pour lier le `userId` avant de reconvertir).
- Mapping lignes → `OrderItem` : le `productId` n'est pas dérivable d'une désignation libre. **Décision V1 : le `body` du convert porte un mapping `lines[].productId`** fourni par le front (qui aura présenté un sélecteur produit par ligne), `unitCents`/`quantity` repris du devis. `totalCents = somme(qty*unitCents)`, `deliveryDate` fourni dans le body (obligatoire), `source = QUOTE_CONVERSION`.
- Transaction : create `Order` + `OrderItem[]`, set `Quote.convertedToOrderId`, audit `UPDATE` sur Quote + `CREATE` sur Order. Pas de mouvement de stock (règle métier : stock géré à la livraison).
- Réponse : `{ orderId, orderNumber }` → le front redirige vers `/commandes/:orderId`.

**Alternatives considérées:**

- **Auto-créer des `Product` à la volée depuis les désignations** — pollue le catalogue. → Rejetée.
- **`OrderItem` à `productId` nullable** — casse l'invariant order existant et l'app mobile. → Rejetée.
- **Conversion sans produits (snapshot texte)** — `Order` n'a pas de lignes libres. → Rejetée pour V1, mapping explicite retenu.

**Conséquences:**

- ✅ Réutilise le modèle Order intact, zéro impact mobile.
- ✅ Traçabilité bidirectionnelle (`convertedToOrderId` ↔ `source=QUOTE_CONVERSION`).
- ⚠️ Le front doit présenter un mapping ligne→produit à la conversion (UX documentée dans le contrat de `/quotes/:id/convert`). Acceptable : faible volume, devis souvent déjà alignés sur le catalogue.

---

### ADR-005 — `Order.source` : nouvel enum, migration additive

**Statut:** Accepted

**Contexte:**
F2 (AC-F2-06) : filtrer les commandes par origine (app mobile vs conversion devis). `Order` n'a pas de champ `source`.

**Décision:**
Ajout d'un enum + colonne nullable avec default, **migration additive** :

```prisma
enum OrderSource {
  MOBILE
  QUOTE_CONVERSION
  MANUAL
}
// dans Order :
source OrderSource @default(MOBILE) @map("source")
```

Les commandes existantes (créées via l'app mobile) prennent `MOBILE` par default → backfill implicite correct. `POST /orders` (mobile) reste inchangé (default MOBILE). La conversion (ADR-004) écrit `QUOTE_CONVERSION`. `MANUAL` réservé futur (création admin directe, hors scope V1 mais l'enum l'anticipe).

**Alternatives considérées:**

- **Champ `String` libre** — pas de typage, pas de filtre sûr. → Rejetée.
- **Déduire la source via `convertedFromQuote` (relation inverse)** — possible mais requête plus lourde et pas de distinction MANUAL future. → Rejetée au profit d'un enum explicite.

**Conséquences:**

- ✅ Migration non bloquante (default sur lignes existantes).
- ✅ Filtre `GET /orders?source=MOBILE` trivial et indexable.
- ⚠️ Default `MOBILE` : si un jour des orders non-mobiles existaient déjà, ils seraient mal classés. Vérifié : à ce jour `POST /orders` n'est appelé que par le mobile (`requireRole ROLE_CLIENT`). OK.

---

### ADR-006 — Partage logique devis : `computeDevisTotals` → `@lingengo/shared`, rendu PDF → `@lingengo/ui`

**Statut:** Accepted

**Contexte:**
La logique de devis (types `DevisData`/`DevisLine`, `computeDevisTotals`, `DevisDocument` react-pdf, `downloadDevisPdf`) vit aujourd'hui uniquement dans `apps/vitrine/src/lib/devis-pdf.tsx`. L'admin doit produire le **même** PDF (AC-F1-02). Dupliquer = dérive garantie. `@lingengo/shared` n'a que `zod` en dep (pas de React) ; `@lingengo/ui` est le package React/shadcn.

**Décision:** scission par nature de dépendance :

1. **`@lingengo/shared`** reçoit le **calcul pur + types + schemas** : `DevisLine`, `DevisData`, `computeDevisTotals(d): { sousTotal, remise, totalHT, tva, totalTTC }` (cents Int), et la fonction `quoteToDevisData(quote)` qui mappe une entité `Quote` API → `DevisData`. Aucune dépendance React. Consommable par api (calcul du `totalCents`/affichage), admin et vitrine.
2. **`@lingengo/ui`** reçoit le **rendu react-pdf** : `DevisDocument`, `downloadDevisPdf` (déplacés depuis la vitrine), important `computeDevisTotals` depuis `@lingengo/shared`. `@react-pdf/renderer` devient une dep de `@lingengo/ui`.
3. **`apps/vitrine`** réimporte depuis les packages (suppression de la duplication locale) — refactor non destructif fait par l'agent frontend.
4. **`apps/admin-web`** importe `DevisDocument`/`downloadDevisPdf` depuis `@lingengo/ui` et `computeDevisTotals` depuis `@lingengo/shared`.

**Alternatives considérées:**

- **Tout dans `@lingengo/shared`** — impossible proprement : ajouterait React + react-pdf à un package zod-only consommé par l'API Fastify (bloat serveur, risque de bundling). → Rejetée.
- **Tout dans `@lingengo/ui`** — l'API (Node) ne peut pas importer un package React juste pour `computeDevisTotals`. → Rejetée.
- **Duplication assumée** — dérive de branding/calcul. → Rejetée (risque identifié dans la spec).

**Conséquences:**

- ✅ Une seule implémentation du calcul (côté serveur ET clients) et du PDF.
- ✅ `@lingengo/shared` reste léger et utilisable par l'API.
- ⚠️ Le branding societé (`SOCIETE` hardcodé dans le PDF) devra être alimenté par les infos `Operator` (F4) — V1 : on garde le hardcode + on passe `operator` en prop optionnelle au `DevisDocument` (rétrocompatible). ⚠️ Le `logoSrc` se charge via `fetch('/images/logo_full.png')` — admin-web doit servir cet asset (à fournir par l'agent frontend).

---

### ADR-007 — Structure des modules API (3 nouveaux modules)

**Statut:** Accepted

**Contexte:**
Convention existante : un dossier `routes/<module>/index.ts` + `services/<module>.service.ts` + `schemas/<module>.schema.ts`, enregistré dans `app.ts` avec `prefix: "/api/v1/<module>"`.

**Décision:** trois nouveaux modules, mêmes conventions :

```
packages/api/src/
├── routes/
│   ├── quotes/index.ts        → prefix /api/v1/quotes
│   ├── users/index.ts         → prefix /api/v1/users
│   └── settings/index.ts      → prefix /api/v1/settings   (sous-ressources zones/operator/stock-thresholds)
├── services/
│   ├── quotes.service.ts      (QuotesService : list, getById, create, update, updateStatus, duplicate, convert, softDelete, expireOverdue)
│   ├── users.service.ts       (UsersService : list, getById, create, update, deactivate, reactivate, resetPassword)
│   └── settings.service.ts    (SettingsService : listZones, createZone, updateZone, deleteZone, getOperator, updateOperator, getStockThresholds, updateStockThresholds)
├── schemas/
│   ├── quotes.schema.ts
│   ├── users.schema.ts
│   └── settings.schema.ts
└── jobs/
    └── quote-expiry.worker.ts (cron quotidien — voir ADR-008)
```

Enregistrement dans `app.ts` après `clientRoutes` :

```ts
await app.register(quoteRoutes, { prefix: "/api/v1/quotes" });
await app.register(userRoutes, { prefix: "/api/v1/users" });
await app.register(settingsRoutes, { prefix: "/api/v1/settings" });
```

Toutes les routes en `preHandler: [app.authenticate, requireRole("ROLE_ADMIN","ROLE_SUPER_ADMIN")]`. F2 réutilise et **étend** le module `orders` existant (pas de nouveau module) : ajout de `?source` au list, `newCount`, enrichissement `getById` (historique statuts), `raison` au PATCH status + notification.

**Alternatives considérées:**

- **Module `admin` monolithique** — casse la convention par-domaine, mauvaise lisibilité. → Rejetée.
- **`users` fusionné dans `clients`** — `clients` ne gère que ROLE_CLIENT et n'a pas de create/rôles ; mélanger porterait confusion. → Rejetée, module `users` distinct.

**Conséquences:**

- ✅ Cohérence totale avec l'arborescence existante.
- ✅ F2 isolée dans `orders` → pas de duplication.
- ⚠️ `settings` regroupe 3 sous-ressources hétérogènes (zones/operator/stock) — acceptable, c'est l'écran « Réglages » unique.

---

### ADR-008 — Expiration automatique des devis : job cron + filet au chargement

**Statut:** Accepted

**Contexte:**
AC-F1-09 : un devis `ENVOYE` dont `dateEnvoi + validiteJours` est dépassé passe `EXPIRE`, via cron quotidien « ou au chargement de la liste ». Infra jobs existante (`jobs/queue.ts`, workers BullMQ + Redis).

**Décision:**

1. **Job cron quotidien** `quote-expiry.worker.ts` (répétable, schedule ~03:00) : `UPDATE quotes SET status=EXPIRE WHERE status=ENVOYE AND deletedAt IS NULL AND (dateEnvoi + validiteJours days) < now()`. Audit `UPDATE` (action système, `userId=null`) groupé.
2. **Filet idempotent** dans `QuotesService.list()` : avant de répondre, un `updateMany` ciblé sur les devis expirés de la page courante (peu coûteux, garantit l'AC même si le cron n'a pas tourné). Implémenté via la même méthode `expireOverdue()` réutilisée par le worker et la liste.

**Alternatives considérées:**

- **Cron seul** — fenêtre jusqu'à 24h où un devis affiché serait encore `ENVOYE` alors qu'expiré. → Insuffisant pour l'AC « au chargement ».
- **Calcul à la volée sans persistance** — le statut en base resterait `ENVOYE`, incohérent pour les filtres. → Rejetée.

**Conséquences:**

- ✅ Statut toujours cohérent à l'affichage et en base.
- ✅ Réutilise l'infra BullMQ existante.
- ⚠️ Léger `updateMany` à chaque list (borné, sur peu de lignes) — acceptable au volume cible.

---

### ADR-009 — Structure des pages admin (App Router, groupe `(dashboard)`)

**Statut:** Accepted

**Contexte:**
Pages existantes sous `apps/admin-web/src/app/(dashboard)/<section>/page.tsx` (+ `[id]/page.tsx`), React Query 5, client `api`, composants `@lingengo/ui`. Un `app/devis/page.tsx` orphelin (simulateur de marge) existe **hors** du groupe dashboard.

**Décision:** nouvelles routes dans le groupe `(dashboard)` :

```
src/app/(dashboard)/
├── devis/page.tsx                 # liste + filtres + "Nouveau devis"
├── devis/nouveau/page.tsx         # formulaire création (réutilise computeDevisTotals + downloadDevisPdf)
├── devis/[id]/page.tsx            # détail/édition + actions statut + PDF + convertir
├── commandes/[id]/page.tsx        # NOUVEAU détail commande (F2)
├── utilisateurs/page.tsx          # liste + filtres rôle/statut + "Nouvel utilisateur"
├── utilisateurs/nouveau/page.tsx  # formulaire création
├── utilisateurs/[id]/page.tsx     # fiche + désactiver/réactiver/reset-password
└── reglages/page.tsx              # tabbed : Zones | Opérateur | Alertes stock
```

Le `app/devis/page.tsx` orphelin (simulateur) est **déplacé** vers `(dashboard)/simulateur/page.tsx` (ou supprimé si non utilisé) par l'agent frontend — il ne doit pas entrer en collision de route avec la nouvelle `(dashboard)/devis`. Sidebar (`src/components/sidebar.tsx`) : ajout des 4 entrées (Devis, Commandes, Utilisateurs, Réglages) avec badge `newCount` sur Commandes.

**Alternatives considérées:**

- **Garder devis hors `(dashboard)`** — incohérent (pas de layout/sidebar), collision de segment `devis`. → Rejetée.

**Conséquences:**

- ✅ Layout/sidebar/auth hérités du groupe `(dashboard)`.
- ⚠️ Collision potentielle `app/devis` (orphelin) vs `app/(dashboard)/devis` : Next.js résout le segment `devis` une seule fois → **conflit réel**, le déplacement de l'orphelin est obligatoire (risque tracé).

---

### ADR-010 — Codes HTTP : ajout `UnprocessableEntityError` (422)

**Statut:** Accepted

**Contexte:**
La spec exige 422 pour : transition de statut invalide (F1), devis non modifiable (F1), conversion invalide (F1), suppression de zone rattachée (F4). Or `ValidationError` existant = **400**. Mélanger « payload mal formé » (400) et « état métier interdit » (422) nuit à la clarté du contrat.

**Décision:** ajouter dans `utils/errors.ts` :

```ts
export class UnprocessableEntityError extends AppError {
  constructor(message: string, code = "UNPROCESSABLE_ENTITY") {
    super(422, code, message);
  }
}
```

Usage : codes machine spécifiques (`INVALID_TRANSITION`, `QUOTE_NOT_EDITABLE`, `QUOTE_NOT_ACCEPTED`, `CLIENT_REQUIRED`, `ZONE_HAS_USERS`). Validation Zod reste **400** (`VALIDATION_ERROR`).

**Alternatives considérées:**

- **Tout en 400** — la spec demande explicitement 422 (AC-F1-04). → Rejetée.
- **409 Conflict** — sémantiquement « conflit de ressource », pas « entité non traitable ». → 422 plus juste.

**Conséquences:**

- ✅ Contrat clair : 400 = payload, 409 = unicité (email/numero), 422 = règle métier/état, 403 = permission.
- ⚠️ Le client admin (`api.ts`) propage déjà `status` dans `ApiError` → le front discrimine sur `error.code`.

---

### ADR-011 — Convention de réponse des listes (unwrap client)

**Statut:** Accepted

**Contexte:**
L'API renvoie `{ success, data, pagination }` pour les listes (spread, le service renvoie `{ data, pagination }` et la route fait `reply.send({ success: true, ...result })`). Le client `api.ts` **unwrap automatiquement `json.data`** → côté front, `api.get('/quotes')` renvoie directement le tableau, et `pagination` serait **perdu** par l'unwrap actuel.

**Décision:** pour les endpoints paginés, le contrat expose la **réponse HTTP brute** `{ success, data: T[], pagination }`. Côté admin-web, les hooks de liste appellent une variante qui **ne perd pas** `pagination`. Deux options laissées à l'agent frontend, la première recommandée :

- **(reco)** ajouter `api.getRaw<{data,pagination}>(endpoint, params)` qui retourne l'enveloppe complète sans unwrap (utilisé pour toutes les listes paginées).
- ou imbriquer `pagination` dans `data` côté API pour ces endpoints — **non retenu** car ça dévierait de la convention des listes existantes (clients/orders).
  Le contrat `api-contracts.json` documente la **réponse serveur** (`success`+`data`+`pagination`) ; l'adaptation client est une note d'implémentation front.

**Conséquences:**

- ✅ Cohérence avec `orders`/`clients` (mêmes shapes de liste).
- ⚠️ Le helper `api.ts` doit gagner un `getRaw` (sinon `pagination` inaccessible) — note transmise à l'agent frontend.

---

### ADR-012 — Sécurité création/modification utilisateurs & mot de passe provisoire

**Statut:** Accepted

**Contexte:**
F3 : création de comptes avec rôles, mot de passe provisoire 12 car. affiché une fois, jamais loggué/persisté en clair, hash bcrypt. Garde-fous : ADMIN ne peut ni créer ni modifier un SUPER_ADMIN ; un admin ne peut pas se désactiver lui-même ; reset password invalide les RefreshToken.

**Décision:**

- Génération : `crypto.randomBytes` → alphabet alphanumérique `[A-Za-z0-9]`, 12 caractères, hash `bcrypt` (réutiliser `utils/crypto.ts`).
- Le mot de passe en clair n'est **présent que dans la réponse HTTP** de `POST /users` et `POST /users/:id/reset-password` (`data.temporaryPassword`), **jamais** dans les logs ni l'audit (`createAuditLog` strip déjà `password`/`passwordHash`, et on ne lui passe pas le clair).
- RBAC métier dans le service : si `body.role == "ROLE_SUPER_ADMIN"` → `ForbiddenError` 403 ; si la cible est `ROLE_SUPER_ADMIN` et l'acteur n'est pas SUPER*ADMIN → 403 ; si `targetId == request.user.sub` sur deactivate → 403 ; `ROLE_SUPER_ADMIN` non créable via UI (réservé accès DB). Rôles acceptés en entrée : `CLIENT|LIVREUR|ADMIN` (valeurs courtes mappées vers `ROLE*\_`, ou `ROLE\_\_`directement — le schéma Zod accepte les`ROLE\_\*`).
- `reset-password` et `deactivate` ⇒ `revokedAt=now()` sur toutes les `RefreshToken` actives de la cible.
- Réponse `GET /users` / `GET /users/:id` : **DTO sans `passwordHash`/`mfaSecret`/`mfaRecoveryCodes`/`deliveryPin`** (select explicite Prisma).
- `email` unique → collision ⇒ `ConflictError` 409 `"Cet email est déjà enregistré dans le système"`.

**Conséquences:**

- ✅ Conforme exigences sécurité/RGPD de la spec.
- ✅ Réutilise bcrypt + audit + RefreshToken existants.
- ⚠️ Le mot de passe transite en clair dans le body de réponse HTTPS (inévitable pour l'afficher une fois) — jamais stocké/loggué côté serveur ; le front ne doit pas le persister.

---

### ADR-013 — F2 : badge `newCount`, historique de statuts, notification client

**Statut:** Accepted

**Contexte:**
F2 enrichit `orders` : badge des PENDING, vue détail avec historique chronologique des changements de statut (who/when/raison), confirmation/refus avec notification client, `raison` obligatoire si CANCELLED.

**Décision:**

- **`newCount`** (AC-F2-01) : approche simple validée par la spec → `GET /orders` ajoute dans la réponse `meta.newCount = count(status=PENDING, deletedAt=null)` (filtré par operator). Pas de table « marque-lu » en V1. Le badge sidebar consomme ce champ.
- **Historique de statuts** (AC-F2-02) : **réutilise `AuditLog`** (déjà écrit à chaque `updateStatus`). `GET /orders/:id` renvoie en plus `statusHistory: AuditLog[]` filtré `entity="Order" AND entityId=:id AND action="UPDATE"`, projeté en `{ at, by: { id, name }, from, to, raison }` (lu depuis `changes`). **Pas de nouvelle table** → on stocke désormais `previousStatus/newStatus/raison` dans `changes` (déjà le cas pour status, ajout de `raison`). Pour que `by.name` soit dispo, jointure `AuditLog.user`.
- **Notification** (AC-F2-03/05) : sur CONFIRMED/CANCELLED, appel `NotificationsService.create(order.userId, "GENERAL", title, body)`. CONFIRMED → `"Votre commande #{orderNumber} a été confirmée"`. CANCELLED → `"Votre commande #{orderNumber} a été refusée : {raison}"`. Si le client n'a pas de réglage notif → ignoré silencieusement (pas d'erreur — comportement actuel du service). Pas de push V1.
- **`raison`** : ajout au `updateOrderStatusSchema` (`raison: string optionnel`), **requis si `status==CANCELLED`** (refine Zod → 400 si manquant), persisté dans `Order.cancelledReason` (champ existant) + `cancelledAt`.
- **Filtre source** (AC-F2-06) : `GET /orders?source=MOBILE|QUOTE_CONVERSION|MANUAL` (ADR-005).
- **Garde** : status déjà CONFIRMED/CANCELLED → transition rejouée interdite, `UnprocessableEntityError 422` (« Cette commande a déjà été traitée »). On introduit une machine à états orders minimale : `PENDING→{CONFIRMED,CANCELLED}`, `CONFIRMED→{IN_DELIVERY,CANCELLED}`, `IN_DELIVERY→{DELIVERED,CANCELLED}`, terminaux `DELIVERED/CANCELLED`.

**Alternatives considérées:**

- **Nouvelle table `OrderStatusHistory`** — duplique ce que `AuditLog` capture déjà. → Rejetée (la spec dit explicitement « AuditLog présent », et exposer l'historique via audit évite une table).
- **`newCount` avec `lastVisitedOrders` côté session** — la spec l'autorise mais le « simple count PENDING » est explicitement accepté en V1 (hypothèse spec). → Count simple retenu.

**Conséquences:**

- ✅ Zéro nouvelle table pour F2 ; réutilise audit + notifications.
- ✅ Notification non bloquante (best-effort).
- ⚠️ `newCount` = total PENDING (pas « depuis dernière visite ») — assumé en V1 (hypothèse spec). ⚠️ L'historique dépend de la qualité des `changes` audit → on standardise le shape `{ previousStatus, newStatus, raison }`.

---

### ADR-014 — F4 Réglages : zones, opérateur, seuils de stock

**Statut:** Accepted

**Contexte:**
F4 : CRUD `DeliveryZone` (`postalCodes String[]` existe), édition `Operator` (existe : name/email/phone/address ; manquent SIRET + mentions légales), seuils d'alerte stock (aujourd'hui `User.stockAlertThreshold` en **%**, default 30 ; la spec parle de seuils « par produit » en **unités**, default 3).

**Décision:**

- **Zones** : CRUD sur `DeliveryZone`. `postalCodes` normalisés API-side (trim, regex `^\d{5}$`, dédoublonnage). Unicité d'un code postal **à travers toutes les zones** validée en API (pas de contrainte DB sur array) → collision ⇒ 422 `"Le code postal {cp} est déjà attribué à la zone {nom}"`. `DELETE` bloqué si `User.zoneId` y pointe ⇒ 422 `ZONE_HAS_USERS` avec le compte. Tarif livraison saisi en € côté UI, **converti en centimes** avant POST/PATCH — stocké où ? `DeliveryZone` n'a **pas** de champ tarif aujourd'hui → **ajout migration additive** `deliveryFeeCents Int @default(0) @map("delivery_fee_cents")`.
- **Opérateur** : `Operator` existe mais sans `siret`/`legalMentions` → **ajout additif** `siret String? @db.VarChar(14)` et `legalMentions String? @db.Text`. `GET/PATCH /settings/operator` agit sur l'opérateur courant (mono-opérateur V1, `request.user` → operatorId).
- **Seuils stock** : divergence modèle. **Décision V1 pragmatique** : on expose les seuils **par produit** via `Product` → **ajout additif** `stockAlertThreshold Int @default(3) @map("stock_alert_threshold")` sur `Product` (unités). `GET /settings/stock-thresholds` liste `{ productId, name, range, stockAlertThreshold }` ; `PATCH` = bulk update `[{ productId, threshold }]`. On **ne touche pas** à `User.stockAlertThreshold` (%) qui sert au stock client — sémantique différente, on ne la réutilise pas.

**Alternatives considérées:**

- **Réutiliser `User.stockAlertThreshold`** pour les seuils produits — confusion %/unités et cible (user vs produit). → Rejetée.
- **Tarif zone en colonne `Operator`** — le tarif est par zone (AC-F4-01). → Rejetée, colonne sur `DeliveryZone`.
- **Mentions légales en `Json`** — texte simple suffit. → `Text`.

**Conséquences:**

- ✅ 3 colonnes additives (`DeliveryZone.deliveryFeeCents`, `Operator.siret`, `Operator.legalMentions`, `Product.stockAlertThreshold`) — toutes nullable/default, migration non bloquante.
- ✅ Les infos opérateur (SIRET/mentions) alimenteront le PDF devis (ADR-006, prop `operator`).
- ⚠️ Unicité code postal validée applicativement (scan des zones de l'opérateur) — coût négligeable au volume.

---

## Modèle de données — résumé des changements (tous additifs)

| Action             | Cible                                                                   | Détail                                     |
| ------------------ | ----------------------------------------------------------------------- | ------------------------------------------ |
| Nouvel enum        | `QuoteStatus`                                                           | BROUILLON, ENVOYE, ACCEPTE, REFUSE, EXPIRE |
| Nouvel enum        | `OrderSource`                                                           | MOBILE, QUOTE_CONVERSION, MANUAL           |
| Nouveau modèle     | `Quote`                                                                 | voir ADR-001                               |
| Nouveau modèle     | `QuoteLine`                                                             | voir ADR-001                               |
| Colonne            | `Order.source`                                                          | `OrderSource @default(MOBILE)`             |
| Colonne            | `DeliveryZone.deliveryFeeCents`                                         | `Int @default(0)`                          |
| Colonne            | `Operator.siret`                                                        | `String? @db.VarChar(14)`                  |
| Colonne            | `Operator.legalMentions`                                                | `String? @db.Text`                         |
| Colonne            | `Product.stockAlertThreshold`                                           | `Int @default(3)`                          |
| Relations inverses | `Operator.quotes`, `User.quotesAsClient`/`quotesCreated`, `Order.quote` | requis par les relations Quote             |

**Règles d'intégrité :**

- `Quote.userId` nullable (client libre) ; conversion exige non-null (ADR-004).
- `Quote.convertedToOrderId` unique (un devis → au plus une commande).
- `QuoteLine` cascade delete avec `Quote`.
- Suppression devis : soft-delete (`deletedAt`), permise **uniquement** statut BROUILLON.
- Suppression zone : interdite si `User.zoneId` référencé.

---

## Sécurité (STRIDE synthétique)

| Menace          | Mitigation                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------ |
| Spoofing        | JWT access 15m + refresh 7j (existant), `app.authenticate` sur toutes les routes                                   |
| Tampering       | Validation Zod `safeParse` sur tout input ; prix en `Int` centimes                                                 |
| Repudiation     | `createAuditLog` (CREATE/UPDATE/DELETE) sur quotes, users, settings, orders status                                 |
| Info disclosure | DTO users sans `passwordHash`/`mfaSecret`/`deliveryPin` ; audit strip PII ; mdp provisoire jamais loggué           |
| DoS             | `rate-limit` global existant (100/IP, 1000/token, 60s)                                                             |
| EoP             | `requireRole(ADMIN,SUPER_ADMIN)` partout ; ADMIN ne peut pas créer/modifier SUPER_ADMIN ; pas d'auto-désactivation |

---

## Hypothèses techniques

- `Operator` a au moins un enregistrement ; `request.user` permet de dériver `operatorId` (sinon : prendre le premier operator actif — à confirmer côté backend selon le contenu du JWT).
- Le mapping ligne devis → produit à la conversion est assuré par l'UI (ADR-004).
- `apps/admin-web` peut servir `/images/logo_full.png` pour le PDF (asset à fournir).
- Volume cible : ~500 devis, ~2000 users → pas d'index complexe au-delà de ceux déclarés.
- L'agent frontend ajoutera `api.getRaw` pour préserver `pagination` (ADR-011) et déplacera le simulateur orphelin (ADR-009).

---

---

# Architecture — Linge Serein V2 (F5–F8 : catalogue KITS, abonnement engagé, source partagée, migration prod)

**Version:** 2.0
**Date:** 2026-06-11
**Architecte:** architect-agent
**Périmètre:** F5 refonte catalogue (3 kits + 6 unités), F6 Pack Sérénité (engagement 3 mois), F7 source de vérité `@lingengo/shared`, F8 migration données prod (client réel PRESTIGE)
**Statut:** Accepted

---

## Vue d'ensemble V2

La prod tourne, contient 1 client réel (PRESTIGE ACTIVE) + données démo, et l'entrypoint exécute `prisma migrate deploy`. **Toute évolution de schéma est strictement additive et non destructive en phase 1** — aucune colonne supprimée, aucune valeur d'enum retirée, aucune contrainte durcie sur des lignes existantes. Les nouvelles migrations s'empilent **après** `20260611000001_add_quotes_users_settings_f1_f4` (qui peut ne pas encore être appliquée en prod : `migrate deploy` les jouera dans l'ordre lexicographique des timestamps). On tranche les 5 décisions ouvertes en privilégiant la **simplicité de migration** et le **zéro impact mobile/stock**.

**Synthèse des verdicts :**

| #   | Décision ouverte                                                                    | Verdict                                                                                                                                                                                                                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `ProductCategory`/`ProductRange` + `unique([operatorId,category,range])`            | **ADR-V2-001** : ajouter `Product.slug` (unique), enum additif `ProductKind {KIT, ARTICLE}`, **drop de la contrainte composite** (seule opération « non additive » — justifiée et sûre, voir ADR). `category`/`range` rendus **nullable**. `ProductRange` enum étendu (additif) avec `KIT_BAIN`/`KIT_LIT`/`KIT_COMPLET` pour préserver la compatibilité stock. |
| 2   | Stockage `SubscriptionConfig`                                                       | **ADR-V2-002** : **table dédiée** `SubscriptionConfig` (1 ligne / opérateur, `operatorId @unique`).                                                                                                                                                                                                                                                            |
| 3   | `SubscriptionPlan` enum                                                             | **ADR-V2-003** : **conservé** (zéro suppression de valeur enum Postgres). `plan` devient **nullable** ; nouveau modèle = champs snapshot sur `Subscription`, `plan` legacy laissé tel quel pour le client existant.                                                                                                                                            |
| 4   | Modèles de stock (`ClientStock`/`OperatorStock`/`StockMovement` par `ProductRange`) | **ADR-V2-004** : **inchangés en V1**. L'extension additive de `ProductRange` (ADR-V2-001) suffit à garder le stock cohérent. Aucune migration de stock.                                                                                                                                                                                                        |
| 5   | Vitrine prix temps réel                                                             | **ADR-V2-005** : **Option A** (constantes `@lingengo/shared`, désynchro assumée, avertissement dans le code).                                                                                                                                                                                                                                                  |

---

## Architecture Decision Records — V2

### ADR-V2-001 — Catalogue KITS : `slug` unique + `kind ProductKind`, contrainte composite levée, `category`/`range` nullable

**Statut:** Accepted

**Contexte:**
9 produits cibles : 3 kits (KIT_BAIN, KIT_LIT, KIT_COMPLET) + 6 articles unitaires (SERVIETTE, DRAP_BAIN, TAPIS_BAIN, PETITE_SERVIETTE, DRAP_HOUSSE, HOUSSE_COUETTE). Le modèle `Product` actuel impose **trois NOT NULL** structurants : `serviceTypeId`, `category ProductCategory`, `range ProductRange`, plus `@@unique([operatorId, category, range])`. Problèmes :

- Un « Kit Bain » n'a pas de `category`/`range` naturels dans les enums existants.
- 6 articles unitaires ne peuvent **pas** coexister sous la contrainte composite (ex. 2 produits « SERVIETTES » ne pourraient différer que par `range` ; on aurait des collisions et des `range` artificiels).
- Le mobile doit distinguer kit vs article pour l'affichage (AC-F5-01).
  La spec propose 3 options (étendre enums / slug unique / `type ProductType`). On combine **slug + kind**, c'est la plus sûre à migrer et la plus lisible côté mobile.

**Décision:**

1. **Nouvel enum additif** `ProductKind { KIT, ARTICLE }`. Colonne `Product.kind ProductKind @default(ARTICLE)` (NOT NULL avec default → backfill implicite des 6 produits démo existants en ARTICLE, acceptable et corrigé par le reseed).
2. **Nouvelle colonne** `Product.slug String? @unique @db.VarChar(60)` — identifiant métier stable (`kit-bain`, `kit-lit`, `kit-complet`, `serviette`, `drap-bain`, `tapis-bain`, `petite-serviette`, `drap-housse`, `housse-couette`). **Nullable** pour que les lignes existantes (sans slug) restent valides ; l'unicité Postgres ignore les NULL. Le seed/reseed renseigne les slugs des 9 produits canoniques.
3. **`category` et `range` rendus NULLABLE** (`ProductCategory?`, `ProductRange?`) — additif au sens « relâchement de contrainte », non destructif (aucune donnée existante n'est NOT NULL-violée ; les 6 produits actuels gardent leurs valeurs). Les nouveaux kits ont `category=null, range=null`. Les 6 articles unitaires reçoivent une `category` indicative (mapping ci-dessous) mais ne **dépendent plus** de `range` pour leur identité.
4. **Suppression de `@@unique([operatorId, category, range])`** — seule opération non strictement additive de toute la V2. Elle est **sûre** : on ne supprime pas de données, on retire une garantie d'unicité désormais inadaptée. L'unicité métier est portée par `slug`. `DROP INDEX "products_operator_id_category_range_key"` (Postgres : `ALTER TABLE products DROP CONSTRAINT ...`). Les index simples `@@index([category])`, `@@index([range])` sont conservés.
5. **`serviceTypeId` reste NOT NULL** : tous les produits (kits et unités) sont rattachés au `ServiceType` LOCATION existant — pas de nouvelle contrainte, on réutilise le seed.

Mapping `category` indicatif des 6 articles (purement descriptif, non unique) :

| slug             | kind    | category   | priceCents |
| ---------------- | ------- | ---------- | ---------- |
| kit-bain         | KIT     | null       | 750        |
| kit-lit          | KIT     | null       | 1650       |
| kit-complet      | KIT     | null       | 2200       |
| serviette        | ARTICLE | SERVIETTES | 450        |
| drap-bain        | ARTICLE | SERVIETTES | 650        |
| tapis-bain       | ARTICLE | TAPIS_BAIN | 400        |
| petite-serviette | ARTICLE | SERVIETTES | 250        |
| drap-housse      | ARTICLE | LINGE_LIT  | 750        |
| housse-couette   | ARTICLE | LINGE_LIT  | 900        |

`ProductRange` est par ailleurs **étendu (additif)** avec `KIT_BAIN`, `KIT_LIT`, `KIT_COMPLET` — non pour `Product` (qui n'en a plus besoin) mais pour garder `StockMovement`/`ClientStock`/`OperatorStock` capables de tracer le stock des kits sans refonte (voir ADR-V2-004). Ajouter une valeur d'enum Postgres est additif et non bloquant.

**Alternatives considérées:**

- **(b) slug seul, sans `kind`** — le mobile devrait inférer kit/article via le slug (`startsWith('kit-')`), fragile. → Rejetée : `kind` explicite est trivial et robuste pour l'affichage.
- **(c) refonte complète `Product` (`type ProductType`, drop `category`/`range`)** — casse `StockMovement`/`ClientStock`/`OperatorStock` (FK conceptuelle sur `ProductRange`) et oblige une migration de stock hors scope V1. → Rejetée.
- **(a) étendre les enums et garder la contrainte composite** — impose des `range` artificiels aux articles et ne résout pas la collision de 6 articles. → Rejetée.
- **Garder `category`/`range` NOT NULL et inventer des valeurs** — pollue la sémantique, force des valeurs fausses pour les kits. → Rejetée au profit du nullable.

**Conséquences:**

- ✅ Migration quasi-additive : 1 enum, 2 colonnes, 2 relâchements NOT NULL, 1 drop de contrainte (justifié). Aucune perte de données. Rollback simple (re-NOT NULL impossible tant que des NULL existent, mais la phase 1 est conçue pour ne pas être rollback-bloquante — voir plan).
- ✅ Mobile : `Product.kind` + `slug` exposés → distinction kit/article directe, zéro valeur en dur.
- ✅ Stock V1 intact (ADR-V2-004).
- ⚠️ `ProductsService.create` (qui check encore `unique([operator,category,range])` et exige `category`/`range`) **doit être réécrit** : check d'unicité sur `slug`, `category`/`range` optionnels, `kind` requis. Idem `products.schema.ts`. (Tâche backend.)
- ⚠️ Le drop de contrainte doit précéder tout reseed des 9 produits (sinon collision sur les anciens `category,range`).

---

### ADR-V2-002 — `SubscriptionConfig` : table dédiée par opérateur

**Statut:** Accepted

**Contexte:**
F6 exige une config abonnement **paramétrable sans redéploiement** (prix 8900, kitBainQty 8, kitLitQty 4, minEngagementMonths 3, noticePeriodDays 30) et **versionnable par snapshot** à la souscription. Trois options : table dédiée, colonnes sur `Operator`, JSON `Operator.metadata`.

**Décision:** **table dédiée** `SubscriptionConfig`, 1 ligne par opérateur (`operatorId @unique`), typée fortement (chaque paramètre = colonne Int/String typée, pas de JSON) :

```prisma
model SubscriptionConfig {
  id                  String   @id @default(uuid()) @db.Uuid
  operatorId          String   @unique @map("operator_id") @db.Uuid
  planName            String   @default("Pack Sérénité") @map("plan_name") @db.VarChar(100)
  priceCents          Int      @default(8900) @map("price_cents")
  kitBainQty          Int      @default(8) @map("kit_bain_qty")
  kitLitQty           Int      @default(4) @map("kit_lit_qty")
  minEngagementMonths Int      @default(3) @map("min_engagement_months")
  noticePeriodDays    Int      @default(30) @map("notice_period_days")
  isActive            Boolean  @default(true) @map("is_active")
  createdAt           DateTime @default(now()) @map("created_at")
  updatedAt           DateTime @updatedAt @map("updated_at")

  operator Operator @relation(fields: [operatorId], references: [id])
  @@map("subscription_configs")
}
```

Relation inverse `Operator.subscriptionConfig SubscriptionConfig?`. La config est lue par `GET /subscriptions/config` (client) et `GET/PATCH /admin/.../config`. Le **snapshot** à la souscription copie ces valeurs dans des champs de `Subscription` (ADR-V2-006).

**Alternatives considérées:**

- **Colonnes sur `Operator`** — pollue un modèle déjà chargé avec une préoccupation purement « offre commerciale » ; couplage fort. → Rejetée.
- **JSON `Operator.metadata`** — perte du typage Prisma, validation Zod manuelle à chaque lecture, pas d'index, pas de defaults DB. La spec demande explicitement « versionnable / typé ». → Rejetée.

**Conséquences:**

- ✅ Typage fort, defaults DB, audit propre (`entity=SubscriptionConfig`), prêt multi-opérateur.
- ✅ `GET /subscriptions/config` trivial (un `findUnique` par operatorId), avec **auto-provisioning** : si aucune ligne, le service en crée une avec les defaults (idempotent) — couvre le cas prod où la table vient d'être créée.
- ⚠️ Migration ajoute 1 table + 1 relation inverse. Le seed (ADR-V2-007) crée la ligne par défaut.

---

### ADR-V2-003 — `SubscriptionPlan` : conservé, `plan` rendu nullable, snapshot porté par `Subscription`

**Statut:** Accepted

**Contexte:**
Le client réel a `Subscription.plan = PRESTIGE` (NOT NULL aujourd'hui). Le nouveau modèle est mono-plan (« Pack Sérénité ») et paramétrable ; il n'a plus besoin de l'enum publiquement. Supprimer une valeur d'enum Postgres (`DROP VALUE`) est **impossible** proprement et casserait la ligne du client réel.

**Décision:**

- **Conserver `SubscriptionPlan`** (ESSENTIELLE/CONFORT/PRESTIGE) **intact** — zéro `DROP TYPE`/`DROP VALUE`. Marqué `@deprecated` dans la doc, plus utilisé publiquement.
- **`Subscription.plan` rendu NULLABLE** (`SubscriptionPlan?`) : additif (relâchement NOT NULL), non destructif. Les abonnements existants gardent leur valeur (`PRESTIGE`, etc.). Les **nouvelles** souscriptions Pack Sérénité écrivent `plan = null` (ou conservent une valeur sentinelle — on choisit `null` : le plan n'a plus de sens, l'offre est décrite par les champs snapshot).
- La **source de vérité du nouveau modèle** = champs snapshot sur `Subscription` (ADR-V2-006), pas l'enum.

**Alternatives considérées:**

- **Ajouter une valeur `PACK_SERENITE` à l'enum** — additif et possible, mais réintroduit un discriminant enum dont le modèle veut justement se passer (offre = config paramétrable). → Rejetée ; `null` + champs snapshot suffit.
- **Supprimer l'enum / migrer le client** — destructif, casse la migration prod, rollback impossible. → Rejetée frontalement (contrainte « jamais destructif en phase 1 »).

**Conséquences:**

- ✅ Migration prod sûre : aucune valeur d'enum touchée, le client PRESTIGE reste lisible.
- ✅ `createSubscriptionSchema` peut rendre `plan` optionnel/retiré (tâche backend) ; `POST /subscriptions` ne requiert plus `plan`.
- ⚠️ `listSubscriptionsQuerySchema` garde le filtre `plan` (compat admin) ; les nouvelles souscriptions y apparaissent avec `plan=null`.

---

### ADR-V2-004 — Stock inchangé : `ProductRange` étendu (additif), aucune migration de stock

**Statut:** Accepted

**Contexte:**
`ClientStock`, `OperatorStock` (`@@unique` par `ProductRange`) et `StockMovement.productRange` opèrent par gamme. La spec et les risques imposent explicitement : **ne pas refondre le stock en V1** (scope creep = risque haut). Mais les kits n'ont pas de `ProductRange` existante.

**Décision:**

- **Aucune modification** des modèles `ClientStock`/`OperatorStock`/`StockMovement`.
- **Extension additive de l'enum `ProductRange`** avec `KIT_BAIN`, `KIT_LIT`, `KIT_COMPLET` (en plus de CONFORT/HOTEL/PRESTIGE conservés). Cela permet, si/quand le stock des kits sera tracé, de réutiliser les modèles existants sans changement de schéma. En V1, **on ne crée aucun mouvement de stock kit** (le stock reste géré sur les gammes historiques pour le client réel migré).
- Le client réel migré garde son `ClientStock` PRESTIGE intact (AC-F8-01). Aucune réécriture.

**Alternatives considérées:**

- **Migrer le stock vers `productId`** — refonte lourde, hors scope V1, risque de rupture mobile (écran stock lit `productRange`). → Rejetée.
- **Ne pas étendre `ProductRange`** — bloquerait toute évolution stock kit future et forcerait un cast. → L'extension additive est gratuite et anticipe proprement.

**Conséquences:**

- ✅ Zéro migration de stock, zéro impact écran stock mobile (lit toujours `productRange`).
- ✅ Enum prêt pour une V2 stock-par-kit sans nouvelle migration structurelle.
- ⚠️ Incohérence assumée V1 : un kit commandé ne génère pas de mouvement de stock par kit (le stock physique reste suivi à la gamme). Documenté comme dette V1 (déjà dans les hypothèses spec).

---

### ADR-V2-005 — Vitrine : Option A (constantes partagées, désynchro assumée)

**Statut:** Accepted

**Contexte:**
La vitrine (`tarifs.tsx`) hardcode aujourd'hui prix et texte « Sans engagement ». F7 veut une source de vérité ; F6 veut « Engagement 3 mois ». Option A = importer `CATALOG_DEFAULTS`/`SUBSCRIPTION_DEFAULTS` de `@lingengo/shared` (valeurs de seed, désynchro possible avec la DB si l'admin change un prix). Option B = appel API public temps réel (scope V2).

**Décision:** **Option A**. La vitrine ajoute `@lingengo/shared` à ses dépendances (workspace) et remplace les valeurs hardcodées de `tarifs.tsx` (et `devis-generator.tsx` si présent) par les constantes partagées. Un **commentaire d'avertissement** explicite indique que ces prix = valeurs par défaut de seed, non les prix DB temps réel. Le texte « Sans engagement · résiliable à tout moment » → « Engagement 3 mois · résiliable ensuite avec 30 j de préavis » (AC-F6-07).

**Vérification deps :** `apps/vitrine/package.json` **ne dépend pas encore** de `@lingengo/shared`. L'agent vitrine doit l'ajouter (`"@lingengo/shared": "workspace:*"`). `@lingengo/shared` est zod-only (pas de React/PDF) → import safe dans un Server Component Next.

**Alternatives considérées:**

- **Option B (API temps réel)** — élargit le scope (endpoint public CORS, cache, états de chargement) pour un bénéfice marginal en V1 (les prix changent rarement). → Rejetée pour V1 (recommandation PM).

**Conséquences:**

- ✅ Une seule source de constantes pour seed + vitrine ; cohérence au lancement (AC-F7-03).
- ⚠️ Si l'admin change un prix en prod, la vitrine reste sur la valeur de seed jusqu'au prochain déploiement → comportement documenté, acceptable V1.

---

### ADR-V2-006 — Snapshot d'engagement sur `Subscription` + blocage résiliation côté API

**Statut:** Accepted

**Contexte:**
F6 : la souscription doit figer prix + composition + engagement (immuables même si la config change ensuite, AC-F6-06), et la résiliation doit être **bloquée côté API** (pas seulement mobile, exigence sécurité) tant que `committedUntil` n'est pas atteinte.

**Décision:** ajout de **5 colonnes additives** sur `Subscription`, toutes nullable ou avec default (rollback-safe) :

```prisma
priceCents          Int?      @map("price_cents")            // snapshot prix mensuel
minEngagementMonths Int       @default(3) @map("min_engagement_months")
committedUntil      DateTime? @map("committed_until")        // startDate + minEngagementMonths (calendaire)
kitBainQty          Int       @default(8) @map("kit_bain_qty")
kitLitQty           Int       @default(4) @map("kit_lit_qty")
```

Logique service (`SubscriptionsService`) :

- **`create`** (`POST /subscriptions`) : lit `SubscriptionConfig` (auto-provisionnée), écrit le snapshot `priceCents/minEngagementMonths/kitBainQty/kitLitQty`, calcule `committedUntil = currentPeriodStart + minEngagementMonths mois` (calcul **calendaire** via `setMonth`, pas 90j fixes). `plan = null` (ADR-V2-003). Retourne la config complète. 409 si abonnement ACTIVE existant.
- **`cancel`** (`PATCH /subscriptions/me/cancel`) : si `committedUntil != null && now() < committedUntil` → **`UnprocessableEntityError(422, "ENGAGEMENT_ACTIVE", "Résiliation non autorisée : votre engagement court jusqu'au {date}. Vous pourrez résilier à partir du {date}.")`**. Sinon, comportement existant (`cancelledAt=now`, `cancelEffectiveAt=now+noticePeriodDays`). `UnprocessableEntityError` 422 doit être **ajouté à `packages/api/src/utils/errors.ts`** (déjà prévu ADR-010 du périmètre F1-F4 — vérifier qu'il existe, sinon l'ajouter).
- **`getByUserId`** (`GET /subscriptions/me`) : renvoie les champs snapshot → le mobile calcule l'état d'engagement sans valeur en dur (AC-F6-05).

**Alternatives considérées:**

- **Recalculer l'engagement à la volée depuis la config** — viole l'immuabilité (AC-F6-06 : la config peut changer). → Rejetée, snapshot obligatoire.
- **`committedUntil` = 90 jours fixes** — la spec exige un calcul calendaire (3 mois ≠ 90j). → Rejetée.

**Conséquences:**

- ✅ Blocage résiliation garanti côté serveur (testable, exigence sécu).
- ✅ Snapshots immuables : changer la config n'altère pas les abonnements en cours.
- ⚠️ `priceCents` nullable : les abonnements existants (client réel) auront `priceCents=null` jusqu'à la migration de données (Phase 2) qui le renseigne à 8900.

---

### ADR-V2-007 — Source de vérité partagée + seed/reseed des 9 produits & config

**Statut:** Accepted

**Contexte:**
F7 : `packages/shared/src/constants.ts` contient `PRICE_PER_SET_CENTS` et `SUBSCRIPTION_PLANS` (barème périmé CONFORT/HOTEL/PRESTIGE). Le seed crée 6 produits SERVIETTES/TAPIS × ranges et 3 subscriptions par enum. Il faut une source unique consommée par seed + vitrine.

**Décision:**

1. **`@lingengo/shared`** gagne `CATALOG_DEFAULTS`, `SUBSCRIPTION_DEFAULTS`, `DELIVERY_DEFAULTS` (valeurs exactes de la spec F7) + une table `CATALOG_PRODUCTS` (les 9 produits canoniques avec `slug`, `kind`, `name`, `category|null`, `priceCents`, `description`) consommée par le seed. `PRICE_PER_SET_CENTS` et `SUBSCRIPTION_PLANS` sont **marqués `@deprecated`** (conservés pour ne pas casser un import résiduel, mais aucun nouveau code ne les utilise — AC-F7-01). Pas de dépendance React (contrainte respectée).
2. **`packages/database/prisma/seed.ts`** réécrit pour : upsert des **9 produits** (clé d'upsert = `slug`) avec les valeurs de `CATALOG_PRODUCTS`, création/upsert du **`SubscriptionConfig`** par défaut (`SUBSCRIPTION_DEFAULTS`). Les 6 anciens produits seed (SERVIETTES/TAPIS × ranges) sont **soft-deleted** (`isActive=false, deletedAt`) plutôt que supprimés (préserve les `OrderItem` de démo). Le seed reste **idempotent**.
3. **`apps/vitrine`** importe `CATALOG_DEFAULTS`/`SUBSCRIPTION_DEFAULTS` (ADR-V2-005).

**Conséquences:**

- ✅ Une source unique pour seed + vitrine ; `db seed` sur base vide → 9 produits + config (AC-F7-02).
- ✅ `@lingengo/shared` reste léger (zod-only).
- ⚠️ Le seed doit tourner **après** le drop de contrainte (ADR-V2-001) sinon l'upsert des 9 produits par slug coexiste avec d'anciennes lignes sous l'ex-contrainte composite — sans la contrainte, aucune collision.

---

### ADR-V2-008 — Endpoints config abonnement + CRUD prix produit (raccourci)

**Statut:** Accepted

**Contexte:**
F5 demande `PATCH /products/:id/price` (raccourci) en plus du CRUD existant. F6 demande `GET /subscriptions/config` (client), `GET/PATCH` admin config. Les routes existent partiellement : `products` a déjà GET/POST/PUT/DELETE ; `subscriptions` a `/me`, `/me/pause|resume|cancel`, POST, GET (admin liste).

**Décision:**

- **`PATCH /products/:id/price`** (nouveau, admin) : body `{ priceCents: int >= 0 }`. Met à jour `priceCents` uniquement, audit `UPDATE`. N'affecte pas les `OrderItem.unitCents` (snapshot immuable — déjà le cas, aucune cascade). Le `PUT /products/:id` existant reste pour l'édition complète (renommer en cohérence, ou garder PUT — voir note implémentation : la spec dit `PATCH /products/:id`, l'existant est `PUT` ; **on garde `PUT` pour l'édition complète et on ajoute `PATCH /:id/price`** ; le contrat documente les deux).
- **`GET /subscriptions/config`** (auth client) : renvoie la config publique `{ planName, priceCents, kitBainQty, kitLitQty, minEngagementMonths, noticePeriodDays }` de l'opérateur du user. **Auto-provisionne** la ligne si absente (defaults).
- **`GET /subscriptions/config/admin`** + **`PATCH /subscriptions/config/admin`** (ROLE_ADMIN/SUPER_ADMIN) : lecture/écriture de la config. Validation Zod : `priceCents>=0`, `minEngagementMonths>=0`, `kitBainQty>=0`, `kitLitQty>=0`, `noticePeriodDays>=0`. Audit `UPDATE entity=SubscriptionConfig`. **Note routing :** pour rester dans le module `subscriptions` (prefix `/api/v1/subscriptions`), les paths réels sont `/config`, `/config/admin`. La spec écrit `/admin/subscriptions/config` ; conformément à ADR-007 (pas de préfixe `/admin`), on monte sous `/api/v1/subscriptions/config/admin`. Le contrat documente le path réel.

**Conséquences:**

- ✅ Réutilise les modules existants, conventions inchangées.
- ✅ `PATCH /:id/price` = raccourci rapide pour l'écran admin « Modifier le prix ».
- ⚠️ Divergence de nommage avec la spec (`/admin/subscriptions/config` → `/subscriptions/config/admin`) — assumée et tracée (cohérence routing prime, ADR-007).

---

## Modèle de données — changements V2 (additifs sauf 1 drop de contrainte justifié)

| Action               | Cible                              | Détail                                           | Additif ?                                |
| -------------------- | ---------------------------------- | ------------------------------------------------ | ---------------------------------------- |
| Nouvel enum          | `ProductKind`                      | `KIT`, `ARTICLE`                                 | ✅                                       |
| Extension enum       | `ProductRange`                     | + `KIT_BAIN`, `KIT_LIT`, `KIT_COMPLET`           | ✅ (ADD VALUE)                           |
| Colonne              | `Product.kind`                     | `ProductKind @default(ARTICLE)`                  | ✅                                       |
| Colonne              | `Product.slug`                     | `String? @unique @db.VarChar(60)`                | ✅                                       |
| Relâchement NOT NULL | `Product.category`                 | `ProductCategory` → `ProductCategory?`           | ✅ (relâche)                             |
| Relâchement NOT NULL | `Product.range`                    | `ProductRange` → `ProductRange?`                 | ✅ (relâche)                             |
| **Drop contrainte**  | `Product`                          | **DROP `@@unique([operatorId,category,range])`** | ⚠️ **non additif** (justifié ADR-V2-001) |
| Nouveau modèle       | `SubscriptionConfig`               | voir ADR-V2-002                                  | ✅                                       |
| Relation inverse     | `Operator.subscriptionConfig`      | `SubscriptionConfig?`                            | ✅                                       |
| Relâchement NOT NULL | `Subscription.plan`                | `SubscriptionPlan` → `SubscriptionPlan?`         | ✅ (relâche)                             |
| Colonne              | `Subscription.priceCents`          | `Int?`                                           | ✅                                       |
| Colonne              | `Subscription.minEngagementMonths` | `Int @default(3)`                                | ✅                                       |
| Colonne              | `Subscription.committedUntil`      | `DateTime?`                                      | ✅                                       |
| Colonne              | `Subscription.kitBainQty`          | `Int @default(8)`                                | ✅                                       |
| Colonne              | `Subscription.kitLitQty`           | `Int @default(4)`                                | ✅                                       |

**Règle d'or :** le seul `DROP CONSTRAINT` est isolé et placé **avant** tout reseed produit. Aucune donnée détruite. Tout le reste est `ADD COLUMN`/`ADD VALUE`/`DROP NOT NULL`, rollback-compatible.

---

## Plan de migration (3 phases de la spec F8)

Les migrations Prisma s'empilent après `20260611000001`. Nommage lexicographique croissant (`migrate deploy` les applique dans l'ordre).

### Phase 1 — Migration Prisma additive (sans rupture) — `20260612000001_catalog_kits_subscription_engagement`

**Contenu (SQL, dans l'ordre) :**

1. `CREATE TYPE "ProductKind" AS ENUM ('KIT', 'ARTICLE');`
2. `ALTER TYPE "ProductRange" ADD VALUE IF NOT EXISTS 'KIT_BAIN'; ... 'KIT_LIT'; ... 'KIT_COMPLET';`
   ⚠️ **Postgres : `ALTER TYPE ... ADD VALUE` ne peut pas s'exécuter dans le même bloc transactionnel qu'une utilisation de la valeur.** Prisma exécute chaque migration en transaction → mettre les `ADD VALUE` **dans leur propre migration** OU s'assurer qu'aucune ligne de la même migration n'utilise la nouvelle valeur (c'est le cas ici : on n'insère aucune ligne `KIT_*` dans la migration). Si `migrate deploy` échoue sur le bloc transactionnel, **scinder** les `ADD VALUE` dans une migration dédiée préalable `20260612000000_extend_product_range`. **Recommandation : migration dédiée `20260612000000` pour les `ADD VALUE`**, puis `20260612000001` pour le reste.
3. `ALTER TABLE "products" ADD COLUMN "kind" "ProductKind" NOT NULL DEFAULT 'ARTICLE';`
4. `ALTER TABLE "products" ADD COLUMN "slug" VARCHAR(60);` puis `CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");`
5. `ALTER TABLE "products" ALTER COLUMN "category" DROP NOT NULL;`
6. `ALTER TABLE "products" ALTER COLUMN "range" DROP NOT NULL;`
7. `ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_operator_id_category_range_key";`
8. `CREATE TABLE "subscription_configs" (...);` + FK `operator_id` + `CREATE UNIQUE INDEX` sur `operator_id`.
9. `ALTER TABLE "subscriptions" ALTER COLUMN "plan" DROP NOT NULL;`
10. `ALTER TABLE "subscriptions" ADD COLUMN "price_cents" INTEGER;`
11. `ALTER TABLE "subscriptions" ADD COLUMN "min_engagement_months" INTEGER NOT NULL DEFAULT 3;`
12. `ALTER TABLE "subscriptions" ADD COLUMN "committed_until" TIMESTAMP(3);`
13. `ALTER TABLE "subscriptions" ADD COLUMN "kit_bain_qty" INTEGER NOT NULL DEFAULT 8;`
14. `ALTER TABLE "subscriptions" ADD COLUMN "kit_lit_qty" INTEGER NOT NULL DEFAULT 4;`

**Garanties Phase 1 :** aucune donnée modifiée, aucune valeur d'enum retirée. Rollback Prisma possible (les colonnes ajoutées sont nullable/default ; le drop NOT NULL et le drop constraint sont réversibles tant qu'on n'a pas inséré de NULL — donc **avant** le reseed de Phase 2). **AC-F8-02 satisfait.**

### Phase 2 — Migration des données (script, post-déploiement Phase 1) — `packages/database/prisma/migrate-v2-data.ts`

Script idempotent exécuté **manuellement** après validation (pas un `migrate deploy` auto, car il porte une décision propriétaire — AC-F8-03). Étapes :

1. **Drop constraint déjà fait en Phase 1** → reseed produits possible.
2. **Upsert des 9 produits canoniques** (clé `slug`) depuis `CATALOG_PRODUCTS` (`@lingengo/shared`), `kind`, `category|null`, `range=null`, `serviceTypeId=LOCATION`, `priceCents`, `isActive=true`.
3. **Soft-delete des anciens produits** non canoniques (les 6 SERVIETTES/TAPIS × ranges) : `isActive=false, deletedAt=now()`. **Conserve les `OrderItem`** (référence par UUID intacte — AC-F8-01).
4. **Créer `SubscriptionConfig`** pour l'opérateur si absent (defaults `SUBSCRIPTION_DEFAULTS`).
5. **Migrer le client réel PRESTIGE → Pack Sérénité** : sur sa `Subscription` ACTIVE, set `priceCents=8900, kitBainQty=8, kitLitQty=4, minEngagementMonths=3`. **`plan` laissé tel quel (`PRESTIGE`) ou mis à `null`** — on choisit de **laisser `PRESTIGE`** (trace historique, non destructif) ; le nouveau modèle est porté par les snapshots.
6. **Décision engagement client existant (AC-F8-03)** — exposée par un flag d'environnement explicite `MIGRATE_EXISTING_ENGAGEMENT` :
   - `MIGRATE_EXISTING_ENGAGEMENT=exempt` → `committedUntil = null` (résiliation libre immédiate).
   - `MIGRATE_EXISTING_ENGAGEMENT=enforce` → `committedUntil = now() + 3 mois`.
   - **Défaut si non fourni : le script s'arrête et demande le choix** (refuse de deviner). Le propriétaire valide avant exécution prod.
7. **Stock inchangé** (ADR-V2-004) : aucune écriture sur `ClientStock`/`OperatorStock`/`StockMovement`.

### Phase 3 — Nettoyage (post-validation, optionnel, non bloquant)

À exécuter **seulement** après confirmation que tout fonctionne en prod (jours/semaines après) :

1. Les anciens produits sont déjà soft-deleted (Phase 2.3) → rien à supprimer physiquement.
2. `SubscriptionPlan` enum **conservé** (ADR-V2-003) — pas de `DROP VALUE`. Aucune action destructive.
3. `PRICE_PER_SET_CENTS`/`SUBSCRIPTION_PLANS` dans `@lingengo/shared` : suppression définitive possible une fois confirmé qu'aucun import résiduel n'existe (`tsc --noEmit` vert sans eux). Jusque-là, `@deprecated`.

**Aucune opération destructive en Phase 3 n'est requise pour la V1.** La phase est documentée mais peut rester vide.

---

## Découpage du travail (frontières de fichiers pour paralléliser)

### gwani-backend (`packages/api`, `packages/database`, `packages/shared`)

- `packages/database/prisma/schema.prisma` : appliquer tous les changements V2 (ADR-V2-001/002/003/004/006). **(fait par l'architecte ci-dessous — le backend vérifie + génère les migrations.)**
- `packages/database/prisma/migrations/20260612000000_extend_product_range/` + `20260612000001_catalog_kits_subscription_engagement/` : créer les 2 migrations SQL (Phase 1).
- `packages/database/prisma/migrate-v2-data.ts` : script Phase 2 (idempotent, flag `MIGRATE_EXISTING_ENGAGEMENT`).
- `packages/database/prisma/seed.ts` : reseed 9 produits par slug + `SubscriptionConfig` (ADR-V2-007).
- `packages/shared/src/constants.ts` : ajouter `CATALOG_DEFAULTS`, `SUBSCRIPTION_DEFAULTS`, `DELIVERY_DEFAULTS`, `CATALOG_PRODUCTS` ; `@deprecated` sur `PRICE_PER_SET_CENTS`/`SUBSCRIPTION_PLANS`. **(squelette posé par l'architecte ci-dessous.)**
- `packages/api/src/schemas/products.schema.ts` : `kind`/`slug` ajoutés, `category`/`range` optionnels, `priceUpdateSchema`.
- `packages/api/src/services/products.service.ts` : check unicité sur `slug` (plus `category,range`), gérer `kind`/`slug`, `updatePrice()`.
- `packages/api/src/routes/products/index.ts` : ajouter `PATCH /:id/price`.
- `packages/api/src/schemas/subscriptions.schema.ts` : retirer `plan` requis de create, ajouter `subscriptionConfigSchema`/`updateConfigSchema`.
- `packages/api/src/services/subscriptions.service.ts` : `getConfig()` (auto-provision), `updateConfig()`, snapshot dans `create()`, blocage engagement dans `cancel()`.
- `packages/api/src/routes/subscriptions/index.ts` : `GET /config`, `GET /config/admin`, `PATCH /config/admin`.
- `packages/api/src/utils/errors.ts` : vérifier/ajouter `UnprocessableEntityError(422)`.
- **Frontière :** ne touche pas aux modules `quotes/users/settings` (F1-F4) ni au stock.

### apps/mobile

- `apps/mobile/lib/api.ts` : étendre `interface Product` avec `kind` + `slug` ; étendre `interface Subscription` avec `priceCents/minEngagementMonths/committedUntil/kitBainQty/kitLitQty` ; ajouter `useSubscriptionConfig()` (`GET /subscriptions/config`) ; adapter `useCreateOrder`/`useMySubscription`.
- `apps/mobile/app/(tabs)/` écran catalogue/commande : afficher kits vs articles via `kind`, prix depuis `/products` (zéro valeur en dur — AC-F5-01).
- `apps/mobile/app/(tabs)/` écran abonnement : afficher Pack Sérénité depuis `useSubscriptionConfig()`, composition (8+4), engagement, `committedUntil` (AC-F6-01/05).
- Écran résiliation : bloquer l'UI si `committedUntil` non atteinte, afficher la date (AC-F6-05) ; gérer le 422 `ENGAGEMENT_ACTIVE`.
- **Frontière :** ne touche pas à l'écran stock (inchangé, lit toujours `productRange`).

### admin-web (`apps/admin-web`)

- `src/app/(dashboard)/produits/page.tsx` : liste 9 produits + bouton « Modifier le prix » (PATCH `/products/:id/price`) ; afficher `kind` (badge Kit/Article).
- `src/app/(dashboard)/produits/[id]/modifier/page.tsx` : **nouveau** formulaire édition prix/nom/description.
- `src/app/(dashboard)/abonnements/page.tsx` : section « Configuration Pack Sérénité » (GET/PATCH `/subscriptions/config/admin`) — prix, kitBainQty, kitLitQty, minEngagementMonths, noticePeriodDays.
- `src/lib/api.ts` : hooks produits (price update) + config abonnement.
- **Frontière :** ne touche pas aux pages devis/utilisateurs/reglages/commandes (F1-F4 livrées).

### vitrine (`apps/vitrine`)

- `package.json` : ajouter `"@lingengo/shared": "workspace:*"`.
- `src/components/tarifs.tsx` : remplacer prix hardcodés par `CATALOG_DEFAULTS`/`SUBSCRIPTION_DEFAULTS` ; remplacer « Sans engagement · résiliable à tout moment » → « Engagement 3 mois · résiliable ensuite avec 30 j de préavis » (AC-F6-07) ; commentaire d'avertissement (valeurs de seed, pas DB temps réel).
- `src/components/devis-generator.tsx` (si présent) : aligner les prix sur `CATALOG_DEFAULTS`.
- **Frontière :** Server Components Next, pas de React dans `@lingengo/shared` → import safe.

---

## Hypothèses techniques V2

- `prisma migrate deploy` joue `20260611000001` (F1-F4) puis `20260612000000`/`20260612000001` (V2) dans l'ordre. Si `20260611000001` n'est pas encore en prod, l'enchaînement reste correct (timestamps croissants).
- Le `ADD VALUE` sur `ProductRange` est isolé dans `20260612000000` pour éviter le problème transactionnel Postgres (valeur enum ajoutée non utilisable dans la même transaction).
- Le script Phase 2 est exécuté **manuellement** avec `MIGRATE_EXISTING_ENGAGEMENT` validé par le propriétaire (AC-F8-03) — jamais auto au déploiement.
- Le reseed (9 produits) tourne **après** le drop de la contrainte composite (Phase 1).
- Le client réel garde son `ClientStock` PRESTIGE et `plan=PRESTIGE` (trace) ; son abonnement reçoit les snapshots Pack Sérénité.
- `@lingengo/shared` reste zod-only (importable par API Fastify ET vitrine Next Server Component).
