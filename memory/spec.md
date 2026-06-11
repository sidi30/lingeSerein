# Spec Produit — Linge Serein Admin Web

**Version:** 1.0
**Date:** 2026-06-11
**Statut:** READY_FOR_ARCH

---

## Vision

Ce produit existe pour les opérateurs B2B de Linge Serein (admins, livreurs) afin de piloter intégralement l'activité de location de linge — devis, commandes mobiles clients, utilisateurs, et paramètres opérationnels — parce que la croissance du parc d'hôtes Airbnb/gîtes en Vaucluse rend le suivi manuel (localStorage, emails) non scalable.

---

## Utilisateurs cibles

### Persona principal : Admin opérateur

- **Rôle :** Gérant ou collaborateur back-office de Linge Serein (ROLE_ADMIN ou ROLE_SUPER_ADMIN)
- **Problème :** Créer et envoyer des devis professionnels, traiter les commandes passées depuis l'app mobile, créer des comptes pour les livreurs et clients, et ajuster les zones/tarifs de livraison
- **Frustration actuelle :** Les devis sont générés depuis la vitrine avec persistance localStorage uniquement (pas de base, pas d'historique, pas d'envoi), les commandes mobiles sont visibles en liste brute sans vue détail exploitable, la création de comptes livreurs/clients n'existe pas en interface, et la configuration des zones est faite directement en base
- **Succès pour lui :** Il crée un devis en 2 minutes, le convertit en commande en un clic, voit immédiatement les nouvelles demandes mobiles avec badge, crée un compte livreur sans toucher à la base de données, et gère les zones depuis une page dédiée

### Persona secondaire : Livreur

- **Rôle :** ROLE_LIVREUR, accède uniquement au planning de tournées et aux détails de livraison
- **Problème :** Pas de compte dédié créable depuis l'interface admin aujourd'hui
- **Frustration actuelle :** Dépend de l'admin pour toute modification de compte, pas d'onboarding autonome
- **Succès pour lui :** Son compte est créé par l'admin avec mot de passe provisoire, il se connecte et voit immédiatement ses tournées

---

## Périmètre V1 (MVP)

### Inclus

- F1 — Gestion des devis (modèle Prisma, CRUD API admin, page liste/création/édition/PDF/statuts, conversion → commande)
- F2 — Demandes mobiles renforcées (vue détail commande, badge nouvelles demandes, confirmer/refuser avec raison, notification client)
- F3 — Gestion des utilisateurs (CRUD admin avec rôles CLIENT/LIVREUR/ADMIN, mot de passe provisoire, désactivation/réactivation, reset password)
- F4 — Réglages administration (zones de livraison CRUD, infos opérateur, seuils alerte stock)

### Exclus (V2+)

- Envoi d'email automatique du devis PDF (V1 : génération PDF téléchargeable uniquement) — nécessite intégration mailer dédiée
- Signature électronique du devis côté client — complexité légale et technique disproportionnée pour MVP
- Portail client self-service pour consulter ses devis — hors périmètre admin
- Paiement en ligne intégré au devis — V2 avec Stripe
- Conversion automatique devis → facture Factur-X — le modèle Invoice existe mais l'automatisation est V2
- Import/export CSV de devis — V2
- Multi-opérateur (Operator table) — architecture présente mais hors scope admin V1
- Application mobile livreur — apps/mobile géré séparément
- ROLE_SUPER_ADMIN créable depuis l'interface — réservé accès BDD directe
- Notifications push mobiles déclenchées par l'admin — V2 (infrastructure Notification existe)
- Historique d'audit visible en UI — AuditLog présent en base, exposition UI V2
- Mode offline admin — non pertinent pour usage back-office

---

## Features

### F1 — Gestion des devis

**Priorité :** Must Have
**Persona concerné :** Admin opérateur
**Job-to-be-done :** Quand un hôte me contacte pour connaître les tarifs, je veux créer un devis structuré et générer un PDF aux couleurs de Linge Serein, pour pouvoir l'envoyer par email manuellement et suivre son statut jusqu'à acceptation.

#### Modèle de données (nouveau modèle Prisma `Quote`)

```
Quote {
  id            String        @id @default(cuid())
  numero        String        @unique  // format LSQ-YYYY-NNNN séquentiel
  statut        QuoteStatus   // BROUILLON | ENVOYE | ACCEPTE | REFUSE | EXPIRE
  clientNom     String
  clientEmail   String?
  clientTel     String?
  clientAdresse String?
  userId        String?       // lien optionnel vers User (client existant)
  user          User?         @relation(...)
  lignes        QuoteLine[]
  remisePct     Int           @default(0)    // en centièmes de % (ex: 1000 = 10%)
  livraisonCents Int          @default(0)
  tvaApplicable Boolean       @default(false)
  notes         String?
  validiteJours Int           @default(30)
  dateEnvoi     DateTime?
  dateReponse   DateTime?
  convertedToOrderId String?  // lien si converti en commande
  operatorId    String
  createdBy     String        // userId de l'admin créateur
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt
}

QuoteLine {
  id           String  @id @default(cuid())
  quoteId      String
  quote        Quote   @relation(...)
  designation  String
  qty          Int
  unitCents    Int     // prix unitaire en centimes
  position     Int     // ordre d'affichage
}

QuoteStatus: BROUILLON | ENVOYE | ACCEPTE | REFUSE | EXPIRE
```

#### API endpoints (nouveaux)

- `POST   /admin/quotes` — créer un devis
- `GET    /admin/quotes` — liste paginée (filtres: statut, search clientNom/email, dateRange)
- `GET    /admin/quotes/:id` — détail complet
- `PATCH  /admin/quotes/:id` — modifier (brouillon/envoyé seulement)
- `PATCH  /admin/quotes/:id/status` — changer statut (transitions valides uniquement)
- `POST   /admin/quotes/:id/duplicate` — dupliquer (nouveau numéro, statut BROUILLON)
- `POST   /admin/quotes/:id/convert` — convertir en Order (ACCEPTE requis)
- `DELETE /admin/quotes/:id` — supprimer (BROUILLON uniquement, soft-delete)

#### Critères d'acceptation

**AC-F1-01 — Création d'un devis avec numéro séquentiel**

- **Given** l'admin est authentifié et sur la page /devis/nouveau
- **When** il remplit les champs client (nom obligatoire), ajoute au moins une ligne (désignation, quantité, prix unitaire en centimes), et clique "Enregistrer"
- **Then** un devis est créé en base avec statut BROUILLON, un numéro au format LSQ-2026-0001 est attribué automatiquement, l'admin est redirigé vers /devis/:id, et le devis apparaît en tête de la liste /devis

**AC-F1-02 — Génération PDF aux couleurs Linge Serein**

- **Given** un devis existe (tout statut sauf supprimé)
- **When** l'admin clique "Télécharger PDF"
- **Then** un fichier PDF est généré côté client (react-pdf, même rendu que le générateur vitrine), nommé `LS-Devis-[numero].pdf`, incluant : logo/couleurs marque (vert #1B5E20 + lavande #7B6FA6), données client, tableau des lignes avec sous-total par ligne, remise si > 0, frais de livraison, total HT, mention TVA non applicable (art. 293 B CGI) si tvaApplicable=false ou montant TVA 20% si true, total TTC, durée de validité, notes, et le statut BROUILLON en filigrane si applicable

**AC-F1-03 — Changement de statut avec transitions contrôlées**

- **Given** un devis en statut BROUILLON
- **When** l'admin clique "Marquer comme envoyé"
- **Then** le statut passe à ENVOYE, dateEnvoi est renseignée avec l'horodatage courant, et les statuts disponibles suivants sont : ACCEPTE, REFUSE (BROUILLON n'est plus accessible)

**AC-F1-04 — Transition statut invalide bloquée**

- **Given** un devis en statut ACCEPTE
- **When** une requête PATCH /admin/quotes/:id/status tente de repasser à BROUILLON
- **Then** l'API retourne HTTP 422 avec message "Transition de statut non autorisée : ACCEPTE → BROUILLON"

**AC-F1-05 — Conversion devis accepté en commande**

- **Given** un devis en statut ACCEPTE avec userId renseigné (client lié)
- **When** l'admin clique "Convertir en commande"
- **Then** une Order est créée avec les OrderItems correspondant aux lignes du devis, le champ convertedToOrderId du devis est renseigné, et l'admin est redirigé vers /commandes/:orderId

**AC-F1-06 — Conversion impossible sans client lié**

- **Given** un devis en statut ACCEPTE sans userId (client libre, non lié à un User)
- **When** l'admin clique "Convertir en commande"
- **Then** une modale s'affiche demandant de sélectionner ou créer un compte client avant de continuer ; la conversion n'est pas effectuée

**AC-F1-07 — Duplication d'un devis**

- **Given** un devis existant (tout statut)
- **When** l'admin clique "Dupliquer"
- **Then** un nouveau devis est créé en statut BROUILLON avec toutes les lignes, remise, livraison, notes identiques, un nouveau numéro séquentiel, sans dateEnvoi ni dateReponse, et l'admin est redirigé vers le nouveau devis en mode édition

**AC-F1-08 — Filtre et recherche sur la liste des devis**

- **Given** l'admin est sur /devis
- **When** il saisit "Dupont" dans le champ de recherche ou sélectionne le filtre statut "ENVOYE"
- **Then** la liste se met à jour immédiatement (debounce 300ms) pour n'afficher que les devis correspondants, avec le nombre de résultats affiché

**AC-F1-09 — Expiration automatique des devis**

- **Given** un devis en statut ENVOYE dont dateEnvoi + validiteJours est dépassée
- **When** un job cron quotidien s'exécute (ou au chargement de la liste)
- **Then** le statut passe automatiquement à EXPIRE

**Règles métier :**

- Le numéro de devis est généré côté serveur, format LSQ-YYYY-NNNN, séquentiel par année, non modifiable
- remisePct est stocké en centièmes de pourcentage (1000 = 10%) pour éviter les flottants
- Un devis BROUILLON peut être modifié librement ; ENVOYE peut être modifié (corrections mineures) ; ACCEPTE/REFUSE/EXPIRE sont en lecture seule
- La suppression (DELETE) n'est permise que sur les devis BROUILLON ; les autres sont archivés (soft-delete)
- La conversion en commande ne consomme pas de stock au moment de la conversion (le stock est géré lors de la livraison, comme pour les orders normales)
- TVA non applicable par défaut (micro-entreprise art. 293 B CGI) — toggle explicite pour activer

**Cas d'erreur à gérer :**

- Nom client vide → "Le nom du client est obligatoire"
- Aucune ligne → "Le devis doit contenir au moins une ligne"
- Quantité = 0 ou négative → "La quantité doit être supérieure à 0"
- Prix unitaire négatif → "Le prix unitaire ne peut pas être négatif"
- Tentative de modifier un devis ACCEPTE/REFUSE/EXPIRE → HTTP 422 "Ce devis ne peut plus être modifié"
- Conversion sans userId → modale de sélection client (voir AC-F1-06)

---

### F2 — Demandes mobiles renforcées

**Priorité :** Must Have
**Persona concerné :** Admin opérateur
**Job-to-be-done :** Quand un client soumet une commande depuis l'app mobile, je veux voir instantanément la demande avec tous ses détails, la confirmer ou la refuser avec un motif, pour que le client soit informé et que je puisse organiser la livraison.

#### API endpoints (modifications/additions)

- `GET  /admin/orders` — déjà existant, ajouter champ `newCount` (PENDING depuis dernière visite) dans la réponse
- `GET  /admin/orders/:id` — déjà existant, enrichir avec items détaillés + historique de statuts + infos client complètes
- `PATCH /admin/orders/:id/status` — déjà existant, ajouter champ optionnel `raison` (string, requis si statut = CANCELLED)

#### Critères d'acceptation

**AC-F2-01 — Badge nouvelles demandes dans la sidebar**

- **Given** l'admin est connecté et il y a 3 commandes en statut PENDING créées depuis sa dernière visite sur /commandes
- **When** il charge n'importe quelle page de l'admin
- **Then** la sidebar affiche un badge rouge avec le chiffre "3" à côté du lien "Commandes", visible sans survol

**AC-F2-02 — Vue détail complète d'une commande mobile**

- **Given** l'admin clique sur une commande de la liste /commandes
- **When** la page /commandes/:id se charge
- **Then** il voit : identité client (nom, email, téléphone, zone), liste des items commandés (désignation produit + quantité + prix unitaire + sous-total), date de livraison demandée + créneau horaire, notes spéciales du client, statut actuel avec historique chronologique des changements de statut (who + when + raison), et les actions disponibles selon le statut courant

**AC-F2-03 — Confirmation d'une commande PENDING**

- **Given** une commande est en statut PENDING et l'admin est sur /commandes/:id
- **When** l'admin clique "Confirmer la commande"
- **Then** le statut passe à CONFIRMED, une notification est envoyée au client via le système Notification existant avec le message "Votre commande #[ref] a été confirmée", le bouton "Confirmer" disparaît et l'historique affiche la transition avec l'horodatage et l'identité de l'admin

**AC-F2-04 — Refus d'une commande avec raison obligatoire**

- **Given** une commande est en statut PENDING et l'admin est sur /commandes/:id
- **When** l'admin clique "Refuser" sans renseigner de raison et confirme
- **Then** une erreur de validation s'affiche "La raison du refus est obligatoire" et la commande reste en statut PENDING

**AC-F2-05 — Refus d'une commande avec raison valide**

- **Given** une commande est en statut PENDING et l'admin a renseigné "Créneau indisponible sur votre zone"
- **When** il confirme le refus
- **Then** le statut passe à CANCELLED, la raison est persistée, une notification est envoyée au client avec le message "Votre commande #[ref] a été refusée : Créneau indisponible sur votre zone", et l'historique affiche la raison

**AC-F2-06 — Filtrage des commandes par source mobile**

- **Given** l'admin est sur /commandes
- **When** il sélectionne le filtre "Source : Application mobile"
- **Then** seules les commandes créées via l'app mobile sont affichées (distinguées des commandes créées par conversion de devis)

**Règles métier :**

- La raison de refus est obligatoire pour le statut CANCELLED, optionnelle pour les autres transitions
- Le badge "nouvelles demandes" se base sur les commandes PENDING ; il se réinitialise à 0 à chaque visite de /commandes (persisté côté serveur via un champ `lastVisitedOrders` sur la session admin ou via un endpoint dédié)
- Les notifications utilisent le système Notification existant (table Notification en base) ; elles ne déclenchent pas de push V1
- Les commandes issues de conversion de devis sont marquées avec une source distincte (`source: QUOTE_CONVERSION`) vs `source: MOBILE`

**Cas d'erreur à gérer :**

- Commande déjà CONFIRMED/CANCELLED → actions de changement de statut masquées, message "Cette commande a déjà été traitée"
- Client sans compte notification → la notification est silencieusement ignorée (pas d'erreur bloquante)

---

### F3 — Gestion des utilisateurs

**Priorité :** Must Have
**Persona concerné :** Admin opérateur
**Job-to-be-done :** Quand j'intègre un nouveau livreur ou enregistre un nouveau client professionnel, je veux créer son compte depuis l'interface admin avec le bon rôle et un mot de passe provisoire, pour qu'il puisse se connecter immédiatement sans que je touche à la base de données.

#### API endpoints (nouveaux)

- `POST  /admin/users` — créer un utilisateur (CLIENT/LIVREUR/ADMIN)
- `GET   /admin/users` — liste paginée (filtres: role, statut actif/inactif, search nom/email)
- `GET   /admin/users/:id` — détail (sans passwordHash)
- `PATCH /admin/users/:id` — modifier (nom, email, téléphone, zoneId, rôle — hors SUPER_ADMIN)
- `PATCH /admin/users/:id/deactivate` — désactiver (soft-delete / deletedAt)
- `PATCH /admin/users/:id/reactivate` — réactiver (deletedAt = null)
- `POST  /admin/users/:id/reset-password` — générer et retourner un nouveau mot de passe provisoire

#### Critères d'acceptation

**AC-F3-01 — Création d'un compte livreur**

- **Given** l'admin est sur /utilisateurs/nouveau et sélectionne le rôle LIVREUR
- **When** il remplit nom, email, et clique "Créer le compte"
- **Then** un User est créé en base avec ROLE_LIVREUR, un mot de passe provisoire de 12 caractères aléatoires (alphanumérique) est généré, l'admin voit une modale affichant "Compte créé — Mot de passe provisoire : [mdp]" avec bouton "Copier", et le mot de passe n'est affiché qu'une seule fois

**AC-F3-02 — Email unique**

- **Given** l'admin tente de créer un utilisateur avec un email déjà utilisé dans le système
- **When** il soumet le formulaire
- **Then** l'API retourne HTTP 409 et l'interface affiche "Cet email est déjà enregistré dans le système"

**AC-F3-03 — ADMIN ne peut pas créer SUPER_ADMIN**

- **Given** l'utilisateur connecté a le rôle ROLE_ADMIN (non SUPER_ADMIN)
- **When** une requête POST /admin/users inclut `role: "ROLE_SUPER_ADMIN"`
- **Then** l'API retourne HTTP 403 avec message "Vous n'avez pas l'autorisation de créer un Super Admin"

**AC-F3-04 — ADMIN ne peut pas modifier un SUPER_ADMIN**

- **Given** l'utilisateur connecté a le rôle ROLE_ADMIN
- **When** il tente une requête PATCH /admin/users/:id sur un utilisateur ROLE_SUPER_ADMIN
- **Then** l'API retourne HTTP 403 avec message "Vous ne pouvez pas modifier un Super Admin"

**AC-F3-05 — Désactivation d'un compte**

- **Given** un utilisateur actif existe et l'admin clique "Désactiver" sur sa fiche
- **When** il confirme dans la modale de confirmation
- **Then** le champ deletedAt de l'utilisateur est renseigné, l'utilisateur ne peut plus se connecter (API auth vérifie deletedAt), et dans la liste il apparaît avec un badge "Inactif" et un bouton "Réactiver"

**AC-F3-06 — Réactivation d'un compte**

- **Given** un utilisateur avec deletedAt renseigné
- **When** l'admin clique "Réactiver" et confirme
- **Then** deletedAt est remis à null, l'utilisateur peut se reconnecter, et le badge passe à "Actif"

**AC-F3-07 — Reset mot de passe**

- **Given** l'admin est sur la fiche d'un utilisateur
- **When** il clique "Réinitialiser le mot de passe" et confirme
- **Then** un nouveau mot de passe provisoire de 12 caractères est généré, stocké haché en base, et affiché une seule fois à l'admin dans une modale avec bouton "Copier" ; toutes les RefreshToken de cet utilisateur sont invalidées

**AC-F3-08 — Liste filtrée par rôle**

- **Given** l'admin est sur /utilisateurs
- **When** il sélectionne le filtre "Rôle : Livreur"
- **Then** seuls les utilisateurs ROLE_LIVREUR sont affichés, avec pagination

**Règles métier :**

- Mot de passe provisoire : minimum 12 caractères, mélange lettres + chiffres, généré par crypto.randomBytes côté serveur
- Le mot de passe provisoire n'est jamais stocké en clair ; seul le hash bcrypt est persisté
- Un ROLE_ADMIN peut créer/modifier/désactiver des ROLE_CLIENT, ROLE_LIVREUR, ROLE_ADMIN (autres admins sauf lui-même pour son propre rôle)
- Un admin ne peut pas se désactiver lui-même
- L'email doit être unique (contrainte DB existante) et validé par Zod (format email RFC 5321)
- zoneId est optionnel à la création, modifiable ensuite (pertinent pour livreurs)

**Cas d'erreur à gérer :**

- Email invalide (format) → "Format d'email invalide"
- Nom vide → "Le nom est obligatoire"
- Admin tente de désactiver son propre compte → HTTP 403 "Vous ne pouvez pas désactiver votre propre compte"
- Rôle non reconnu → HTTP 400 "Rôle invalide. Valeurs acceptées : CLIENT, LIVREUR, ADMIN"

---

### F4 — Réglages administration

**Priorité :** Should Have
**Persona concerné :** Admin opérateur
**Job-to-be-done :** Quand les zones de livraison ou les seuils d'alerte changent, je veux les mettre à jour depuis une page dédiée sans intervention technique, pour maintenir la configuration à jour en autonomie.

#### API endpoints (nouveaux)

- `GET   /admin/settings/zones` — liste des DeliveryZone
- `POST  /admin/settings/zones` — créer une zone
- `PATCH /admin/settings/zones/:id` — modifier (nom, codes postaux, tarif livraison)
- `DELETE /admin/settings/zones/:id` — supprimer (bloqué si des users y sont rattachés)
- `GET   /admin/settings/operator` — infos opérateur courant
- `PATCH /admin/settings/operator` — modifier infos (nom, email contact, téléphone, adresse, SIRET, mentions légales)
- `GET   /admin/settings/stock-thresholds` — seuils d'alerte par produit
- `PATCH /admin/settings/stock-thresholds` — modifier seuils (bulk update)

#### Critères d'acceptation

**AC-F4-01 — Ajout d'une zone de livraison**

- **Given** l'admin est sur /reglages onglet "Zones de livraison"
- **When** il clique "Nouvelle zone", saisit un nom ("Zone Orange"), des codes postaux séparés par virgule ("84100,84290,84150"), un tarif en euros (12.00), et valide
- **Then** la zone est créée en base dans la table DeliveryZone avec postalCodes stocké en tableau, le tarif en centimes (1200), et apparaît immédiatement dans la liste

**AC-F4-02 — Modification des codes postaux d'une zone**

- **Given** une zone "Zone Orange" avec postalCodes ["84100", "84290"]
- **When** l'admin modifie la liste pour ajouter "84150" et valide
- **Then** postalCodes est mis à jour en base, la modification est reflétée immédiatement dans la liste, et un AuditLog est créé pour l'action

**AC-F4-03 — Suppression de zone bloquée si rattachée**

- **Given** une DeliveryZone a des User.zoneId qui y pointent
- **When** l'admin clique "Supprimer" sur cette zone
- **Then** l'API retourne HTTP 422 avec message "Cette zone ne peut pas être supprimée : 3 utilisateur(s) y sont rattachés. Réaffectez-les d'abord."

**AC-F4-04 — Mise à jour des informations opérateur**

- **Given** l'admin est sur /reglages onglet "Informations opérateur"
- **When** il modifie l'email de contact et clique "Enregistrer"
- **Then** les données Operator sont mises à jour en base et un message de succès "Informations enregistrées" apparaît pendant 3 secondes

**AC-F4-05 — Modification des seuils d'alerte stock**

- **Given** l'admin est sur /reglages onglet "Alertes stock"
- **When** il modifie le seuil du produit "Kit Bain" à 5 unités et sauvegarde
- **Then** le seuil est persisté et les alertes du dashboard utilisent ce nouveau seuil lors du prochain calcul

**Règles métier :**

- Les codes postaux sont normalisés (trim, 5 chiffres, dédoublonnage) avant persistance
- Le tarif de livraison est saisi en euros dans l'UI et converti en centimes avant envoi à l'API
- Un même code postal ne peut appartenir qu'à une seule zone (contrainte de validation côté API, pas nécessairement contrainte DB unique sur tableau)
- Les infos opérateur (SIRET, mentions légales) alimentent les futurs PDF de devis/factures
- Les seuils d'alerte stock sont par défaut à 3 unités si non configurés

**Cas d'erreur à gérer :**

- Code postal invalide (non numérique, < 5 chiffres) → "Code postal invalide : [valeur]"
- Code postal déjà utilisé dans une autre zone → "Le code postal [84100] est déjà attribué à la zone [Nom Zone]"
- Tarif de livraison négatif → "Le tarif ne peut pas être négatif"
- Seuil d'alerte négatif → "Le seuil d'alerte doit être supérieur ou égal à 0"

---

## Navigation & structure des pages admin

### Nouvelles entrées sidebar (à ajouter à src/components/sidebar.tsx)

| Entrée       | Route         | Icône        | Badge            | Rôle minimum |
| ------------ | ------------- | ------------ | ---------------- | ------------ |
| Devis        | /devis        | FileText     | -                | ROLE_ADMIN   |
| Commandes    | /commandes    | ShoppingCart | newCount PENDING | ROLE_ADMIN   |
| Utilisateurs | /utilisateurs | Users        | -                | ROLE_ADMIN   |
| Réglages     | /reglages     | Settings     | -                | ROLE_ADMIN   |

### Nouvelles routes (app/(dashboard)/)

```
/devis                    → liste paginée + filtres + bouton "Nouveau devis"
/devis/nouveau            → formulaire création (même logique que générateur vitrine)
/devis/[id]               → vue détail/édition + actions statut + bouton PDF + bouton convertir
/commandes/[id]           → vue détail (nouvelle page, existait pas)
/utilisateurs             → liste paginée + filtres rôle/statut + bouton "Nouvel utilisateur"
/utilisateurs/nouveau     → formulaire création
/utilisateurs/[id]        → fiche utilisateur + actions désactiver/reset-password
/reglages                 → page tabbed : Zones | Opérateur | Alertes stock
```

---

## Exigences non-fonctionnelles

| Catégorie         | Exigence                                                                                | Mesure                  |
| ----------------- | --------------------------------------------------------------------------------------- | ----------------------- |
| Performance       | Listes paginées (max 25 items/page), chargement page < 3s                               | LCP Lighthouse > 90     |
| Performance PDF   | Génération PDF côté client en < 5s pour un devis de 20 lignes                           | Mesure manuelle         |
| Sécurité          | Tous les endpoints /admin/\* requièrent ROLE_ADMIN ou ROLE_SUPER_ADMIN                  | Tests Fastify injection |
| Sécurité          | Mot de passe provisoire jamais loggué, affiché une seule fois                           | Review code + audit     |
| Sécurité          | AuditLog sur toutes les mutations admin/quotes, admin/users, admin/settings             | Vérification en base    |
| Accessibilité     | WCAG 2.1 AA — formulaires avec labels, focus visible, messages d'erreur liés            | Audit axe-core          |
| Mobile            | Interface admin responsive sur 768px minimum (tablette, usage terrain)                  | Tests visuels 768px     |
| Intégrité données | Prix en centimes (Int), jamais en flottants                                             | Review code TypeScript  |
| RGPD              | Mot de passe provisoire non persisté en clair, logs sans données personnelles sensibles | Audit code              |
| TypeScript        | Strict mode, zéro `any` explicite, Zod sur tous les inputs API                          | tsc --noEmit            |

---

## Métriques de succès

- Temps moyen de création d'un devis (du clic "Nouveau" à l'enregistrement) < 3 minutes
- Taux de commandes PENDING traitées (confirmées ou refusées) dans les 24h > 90%
- Zéro création de compte utilisateur nécessitant un accès direct BDD après mise en production
- Nombre de devis convertis en commandes / total devis acceptés > 80% (mesure de l'adoption du workflow)
- Page /devis charge en < 3s avec 200 devis en base

---

## Hypothèses

- On assume que l'opérateur Linge Serein est une micro-entreprise (TVA non applicable par défaut, art. 293 B CGI) — le toggle TVA permet de passer en régime normal si statut change
- On assume que l'envoi du devis par email se fait manuellement (l'admin télécharge le PDF et l'envoie depuis son client mail) en V1
- On assume que le modèle Operator existe déjà en base avec au moins un enregistrement (l'app est mono-opérateur en V1)
- On assume que la table DeliveryZone existe déjà avec le champ postalCodes (tableau de strings) — à vérifier au moment du schéma Prisma
- On assume que le champ `source` n'existe pas encore sur le modèle Order et devra être ajouté (enum: MOBILE | QUOTE_CONVERSION | MANUAL)
- On assume que le badge "nouvelles demandes" peut être implémenté via un comptage simple côté API sans système de "marque-lu" complexe en V1 (simple count des PENDING)
- On assume que les livreurs n'ont pas accès à l'interface admin-web (apps/admin-web) — leur interface est apps/mobile
- On assume que react-pdf (@react-pdf/renderer) est déjà disponible dans le workspace (utilisé dans apps/vitrine) et sera partagé via le package @lingengo/ui ou importé directement dans apps/admin-web
- On assume un volume max de 500 devis et 2000 utilisateurs en V1 (pas de besoin de sharding ou index complexes)
- market.md absent — analyse marché non disponible ; les priorités sont basées sur les besoins opérationnels exprimés

---

## Risques identifiés

| Risque                                                                       | Probabilité | Impact | Mitigation                                                                            |
| ---------------------------------------------------------------------------- | ----------- | ------ | ------------------------------------------------------------------------------------- |
| Génération PDF lente côté client pour gros devis                             | Faible      | Moyen  | Limiter à 50 lignes par devis V1, ajouter loading state                               |
| Migration Prisma bloquante (ajout Quote, modification Order)                 | Moyen       | Haut   | Migration additive uniquement (nouveaux champs nullable), tester sur base de staging  |
| Réutilisation de logique devis depuis apps/vitrine (composants non packagés) | Moyen       | Moyen  | Extraire computeDevisTotals dans @lingengo/ui ou packages/shared avant implémentation |
| Scope creep sur F4 Réglages (demandes d'ajout de configs)                    | Haut        | Moyen  | Spec signée, V2 explicitement documentée pour toute config non listée                 |
| Sécurité : endpoint /admin/users exposant des données sensibles              | Faible      | Haut   | Jamais retourner passwordHash, audit du DTO de réponse, test unitaire dédié           |
| Conflit de nommage routes /admin/\* avec routes existantes                   | Faible      | Moyen  | Vérifier le router Fastify existant avant implémentation                              |
