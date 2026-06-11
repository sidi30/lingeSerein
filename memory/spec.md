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

### F5 — Refonte catalogue produits (alignement KITS)

**Priorité :** Must Have
**Persona concerné :** Admin opérateur + Client mobile
**Job-to-be-done :** Quand je gère le catalogue, je veux que les produits en base correspondent exactement aux kits et articles unitaires affichés sur la vitrine, avec les prix corrects, pour que l'app mobile et les devis reflètent la réalité commerciale.

#### Contexte et contrainte structurelle

Le modèle actuel `Product` a une contrainte d'unicité `unique([operatorId, category, range])` qui correspond à l'ancien barème CONFORT/HOTEL/PRESTIGE. Le nouveau modèle commercial distingue des **kits** (Kit Bain, Kit Lit, Kit Complet) et des **articles unitaires** (6 types). Cette rupture conceptuelle impose une décision architecturale que l'architecte devra trancher (voir section Décisions ouvertes pour l'architecte).

#### Catalogue cible (source de vérité : apps/vitrine)

**Kits (prix par rotation) :**

| Référence interne | Nom commercial           | Composition                                         | Prix centimes                              |
| ----------------- | ------------------------ | --------------------------------------------------- | ------------------------------------------ |
| KIT_BAIN          | Kit Bain                 | Drap de bain 70×150 + Serviette 50×90 + Tapis 50×70 | 750                                        |
| KIT_LIT           | Kit Lit                  | Housse de couette + Drap housse + Taies             | 1650                                       |
| KIT_COMPLET       | Kit Complet (Bain + Lit) | Kit Bain + Kit Lit groupés                          | 2200 (= 750+1650−200, remise groupage −2€) |

**Articles unitaires (prix par pièce) :**

| Référence interne | Nom commercial        | Dimensions            | Prix centimes |
| ----------------- | --------------------- | --------------------- | ------------- |
| SERVIETTE         | Serviette de toilette | 50×90 cm              | 450           |
| DRAP_BAIN         | Grand drap de bain    | 70×150 cm             | 650           |
| TAPIS_BAIN        | Tapis de bain         | 50×70 cm              | 400           |
| PETITE_SERVIETTE  | Petite serviette      | 30×50 cm              | 250           |
| DRAP_HOUSSE       | Drap housse           | 90×200 ou 160×200 cm  | 750           |
| HOUSSE_COUETTE    | Housse de couette     | 160×200 ou 240×220 cm | 900           |

#### CRUD produits admin (nouveaux endpoints)

- `GET    /api/v1/products` — liste tous les produits (admin + mobile)
- `POST   /api/v1/products` — créer un produit (ROLE_ADMIN/SUPER_ADMIN uniquement)
- `PATCH  /api/v1/products/:id` — modifier nom, prix, description (ROLE_ADMIN/SUPER_ADMIN)
- `PATCH  /api/v1/products/:id/price` — modifier le prix uniquement (raccourci rapide)
- `DELETE /api/v1/products/:id` — désactiver (soft-delete, ROLE_ADMIN/SUPER_ADMIN)

#### Nouvelles pages admin

- `/produits` — liste des produits avec prix actuels, bouton "Modifier le prix"
- `/produits/:id/modifier` — formulaire édition prix + nom + description

#### Critères d'acceptation

**AC-F5-01 — Le catalogue mobile affiche les kits vitrine**

- **Given** le reseed a été appliqué (9 produits : 3 kits + 6 articles unitaires avec prix vitrine)
- **When** l'utilisateur mobile ouvre l'écran "Passer une commande"
- **Then** il voit au minimum Kit Bain à 7,50 €, Kit Lit à 16,50 €, Kit Complet à 22,00 €, et les 6 articles unitaires avec leurs prix corrects — toutes les valeurs provenant de l'API `/products` (aucune valeur codée en dur dans le mobile)

**AC-F5-02 — Modification du prix d'un produit par l'admin**

- **Given** l'admin est sur la page /produits et voit "Kit Bain — 7,50 €"
- **When** il clique "Modifier", change le prix à 8,00 € et valide
- **Then** `Product.priceCents` est mis à jour à 800 en base, la liste admin affiche "Kit Bain — 8,00 €", et la prochaine requête mobile sur `/products` retourne 800 centimes pour ce produit

**AC-F5-03 — Prix du produit visible dans une commande existante**

- **Given** une commande `OrderItem` a `unitCents = 750` (snapshot au moment de la commande)
- **When** le prix du Kit Bain est modifié à 800 centimes
- **Then** la commande existante conserve `unitCents = 750` (le snapshot historique est préservé) ; seules les nouvelles commandes utilisent le nouveau prix

**AC-F5-04 — Désactivation d'un produit**

- **Given** un produit existe et l'admin clique "Désactiver"
- **When** il confirme
- **Then** `Product.isActive = false` et `deletedAt` est renseigné, le produit disparaît de la liste mobile (`GET /products` ne retourne que `isActive=true`), mais les commandes/abonnements existants référençant ce produit restent intacts (référence par UUID)

**Règles métier :**

- Les prix sont en centimes (Int) — jamais de flottants
- La modification de prix n'affecte pas les `OrderItem.unitCents` existants (snapshot immuable)
- Un produit désactivé ne peut plus être commandé mais ses données historiques sont conservées
- Le catalogue est paramétrable par l'admin : les noms et prix peuvent évoluer sans redéploiement
- L'architecte doit décider du sort de l'enum `ProductCategory` et de la contrainte `unique([operatorId, category, range])` — voir section Décisions ouvertes

**Cas d'erreur à gérer :**

- Prix négatif → "Le prix doit être supérieur ou égal à 0"
- Nom vide → "Le nom du produit est obligatoire"
- Tentative de commander un produit désactivé → HTTP 422 "Ce produit n'est plus disponible"

---

### F6 — Abonnement Pack Sérénité avec engagement 3 mois

**Priorité :** Must Have
**Persona concerné :** Client mobile + Admin opérateur
**Job-to-be-done :** Quand un hôte veut s'abonner, je veux qu'il souscrive au Pack Sérénité (89 €/mois, 8 kits bain + 4 kits lit), qu'il comprenne l'engagement de 3 mois minimum avant de confirmer, et que l'API empêche toute résiliation avant la fin de cet engagement.

#### Modèle cible

Un seul plan public : **Pack Sérénité**

| Paramètre             | Valeur                    | Paramétrable admin           |
| --------------------- | ------------------------- | ---------------------------- |
| Nom                   | Pack Sérénité             | Non (nom commercial fixe V1) |
| Prix mensuel          | 89 €/mois (8900 centimes) | Oui                          |
| Kits bain inclus/mois | 8                         | Oui                          |
| Kits lit inclus/mois  | 4                         | Oui                          |
| Engagement minimum    | 3 mois                    | Oui                          |
| Préavis résiliation   | 30 jours                  | Oui (existant)               |
| Livraisons incluses   | Oui                       | Non                          |

#### Stockage de la configuration abonnement

Nouvelle table (ou extension `Operator`) `SubscriptionConfig` portée par l'opérateur :

```
SubscriptionConfig {
  id                    String  @id
  operatorId            String  @unique
  planName              String  @default("Pack Sérénité")
  priceCents            Int     @default(8900)
  kitBainQty            Int     @default(8)
  kitLitQty             Int     @default(4)
  minEngagementMonths   Int     @default(3)
  noticePeriodDays      Int     @default(30)
  isActive              Boolean @default(true)
  updatedAt             DateTime @updatedAt
}
```

L'architecte tranchera entre une table dédiée, une extension `Operator`, ou un stockage JSON dans `Operator.metadata` — la contrainte fonctionnelle est que ces valeurs sont paramétrables sans redéploiement.

#### Endpoints impactés

**Nouveaux :**

- `GET  /api/v1/subscriptions/config` — retourne la config publique du plan (priceCents, kitBainQty, kitLitQty, minEngagementMonths) — accessible aux clients authentifiés
- `GET  /api/v1/admin/subscriptions/config` — même chose pour l'admin
- `PATCH /api/v1/admin/subscriptions/config` — modifier la configuration (ROLE_ADMIN/SUPER_ADMIN)

**Modifiés :**

- `POST /api/v1/subscriptions` — souscrire. Enregistre `minEngagementMonths` au moment de la souscription (snapshot) dans `Subscription.minEngagementMonths`. Retourne la config complète dans la réponse.
- `DELETE /api/v1/subscriptions/:id` ou `POST /api/v1/subscriptions/:id/cancel` — résiliation. Bloquée si `now() < startDate + minEngagementMonths mois`. Retourne 422 avec date de résiliation autorisée la plus proche.

**Champs à ajouter sur `Subscription` :**

- `priceCents Int` — prix mensuel au moment de la souscription (snapshot, immuable)
- `minEngagementMonths Int @default(3)` — durée d'engagement minimale (snapshot)
- `committedUntil DateTime` — date jusqu'à laquelle la résiliation est bloquée (calculée à la souscription : `startDate + minEngagementMonths mois`)
- `kitBainQty Int @default(8)` — composition incluse (snapshot)
- `kitLitQty Int @default(4)` — composition incluse (snapshot)

#### Critères d'acceptation

**AC-F6-01 — Affichage de l'engagement avant souscription**

- **Given** l'utilisateur mobile est sur l'écran "Abonnement"
- **When** il consulte les détails du Pack Sérénité
- **Then** il voit clairement : "89 €/mois", "8 kits bain + 4 kits lit inclus", "Engagement minimum : 3 mois", "Résiliation possible après le [date J+3mois] avec 30 jours de préavis" — toutes ces valeurs provenant de `GET /subscriptions/config` (non codées en dur)

**AC-F6-02 — Souscription enregistre un snapshot**

- **Given** l'utilisateur confirme la souscription sur l'app mobile
- **When** `POST /subscriptions` est appelé
- **Then** une `Subscription` est créée avec `priceCents=8900`, `minEngagementMonths=3`, `committedUntil=startDate+3mois`, `kitBainQty=8`, `kitLitQty=4`, statut ACTIVE

**AC-F6-03 — Résiliation bloquée pendant l'engagement**

- **Given** un abonnement actif avec `committedUntil` dans 45 jours
- **When** l'utilisateur tente de résilier depuis l'app mobile
- **Then** l'API retourne HTTP 422 avec message "Résiliation non autorisée : votre engagement de 3 mois court jusqu'au [date committedUntil]. Vous pourrez résilier à partir du [date committedUntil]."

**AC-F6-04 — Résiliation autorisée après l'engagement**

- **Given** un abonnement actif avec `committedUntil` dépassée
- **When** l'utilisateur demande la résiliation depuis l'app mobile
- **Then** `Subscription.cancelledAt = now()`, `cancelEffectiveAt = now() + 30 jours` (préavis), statut reste ACTIVE jusqu'à `cancelEffectiveAt`, puis passe à CANCELLED

**AC-F6-05 — Affichage mobile du statut d'engagement**

- **Given** l'utilisateur a souscrit il y a 1 mois (engagement non terminé)
- **When** il consulte son espace abonnement
- **Then** il voit : "Engagement en cours jusqu'au [committedUntil]", le bouton "Résilier" est présent mais affiche "Résiliation indisponible jusqu'au [committedUntil]" si cliqué avant la date, sans appel API bloquant inutile

**AC-F6-06 — Modification de la config par l'admin**

- **Given** l'admin modifie `priceCents` à 9500 via `PATCH /admin/subscriptions/config`
- **When** un nouvel utilisateur souscrit ensuite
- **Then** son abonnement a `priceCents=9500` ; les abonnements existants conservent leur `priceCents` d'origine (snapshot immuable)

**AC-F6-07 — La vitrine affiche l'engagement 3 mois**

- **Given** la vitrine est mise à jour (hors scope technique de cette spec, mais exigence fonctionnelle notée)
- **When** un visiteur consulte la section tarifs
- **Then** le texte "Sans engagement · résiliable à tout moment" est remplacé par "Engagement 3 mois · résiliable ensuite avec 30 j de préavis" — cette mise à jour vitrine est incluse dans le scope de livraison

**Règles métier :**

- `committedUntil` est calculé à la souscription et stocké : `committedUntil = currentPeriodStart + minEngagementMonths mois` (calcul calendaire, pas 90 jours fixes)
- La modification de la config n'affecte pas les abonnements en cours (snapshots immuables)
- L'abonnement actuel PRESTIGE du client réel doit être migré (voir F8)
- Le plan `SubscriptionPlan` enum (ESSENTIELLE/CONFORT/PRESTIGE) n'est plus utilisé publiquement mais reste en base pour la migration ; l'architecte tranchera sur la dépréciation ou l'extension

**Cas d'erreur à gérer :**

- Souscription alors qu'un abonnement ACTIVE existe déjà → HTTP 409 "Vous avez déjà un abonnement actif"
- `minEngagementMonths < 0` dans la config admin → "La durée d'engagement minimale doit être supérieure ou égale à 0"
- `priceCents < 0` → "Le prix ne peut pas être négatif"

---

### F7 — Source de vérité partagée (@lingengo/shared)

**Priorité :** Must Have
**Persona concerné :** Développeur (qualité du code, cohérence)
**Job-to-be-done :** Quand les prix ou la composition des kits changent dans la config admin, je veux que la vitrine, le mobile et l'API utilisent les mêmes constantes, pour éviter les désynchronisations entre canaux.

#### État actuel à corriger

Dans `packages/shared/src/constants.ts` :

- `PRICE_PER_SET_CENTS` (barème CONFORT/HOTEL/PRESTIGE) → **à supprimer** ou déprécier (marqué `@deprecated`)
- `SUBSCRIPTION_PLANS` (ESSENTIELLE/CONFORT/PRESTIGE sans prix) → **à remplacer** par les constantes du nouveau modèle

#### Constantes cibles dans `@lingengo/shared`

```typescript
// Catalogue produits — valeurs par défaut (source de vérité pour seeding)
export const CATALOG_DEFAULTS = {
  KIT_BAIN_CENTS: 750,
  KIT_LIT_CENTS: 1650,
  KIT_COMPLET_CENTS: 2200, // 750 + 1650 - 200
  KIT_COMPLET_DISCOUNT_CENTS: 200, // remise groupage bain+lit
  SERVIETTE_CENTS: 450,
  DRAP_BAIN_CENTS: 650,
  TAPIS_BAIN_CENTS: 400,
  PETITE_SERVIETTE_CENTS: 250,
  DRAP_HOUSSE_CENTS: 750,
  HOUSSE_COUETTE_CENTS: 900,
} as const;

// Abonnement — valeurs par défaut (source de vérité pour seeding)
export const SUBSCRIPTION_DEFAULTS = {
  PRICE_CENTS: 8900, // 89 €/mois
  KIT_BAIN_QTY: 8,
  KIT_LIT_QTY: 4,
  MIN_ENGAGEMENT_MONTHS: 3,
  NOTICE_PERIOD_DAYS: 30,
} as const;

// Livraison — seuils par défaut
export const DELIVERY_DEFAULTS = {
  FREE_THRESHOLD_CENTS: 12000, // offerte dès 120 €
  FREE_MIN_KITS_ORANGE: 4, // offerte dès 4 kits à Orange
} as const;
```

#### Utilisation dans la vitrine

**Option A (recommandée par le PM) :** La vitrine importe `CATALOG_DEFAULTS` et `SUBSCRIPTION_DEFAULTS` depuis `@lingengo/shared` — les valeurs affichées dans `tarifs.tsx` et `devis/page.tsx` sont ainsi toujours synchronisées avec le seed. Si les prix changent en prod (via admin), la vitrine reste désynchronisée (les prix vitrine = valeurs de départ, pas les valeurs courantes de la DB) — ce comportement est acceptable en V1 avec une note d'avertissement dans le code.

**Option B :** La vitrine appelle l'API publique pour afficher les prix temps réel — scope élargi, V2.

L'architecte tranche entre A et B.

#### Critères d'acceptation

**AC-F7-01 — Suppression des constantes périmées**

- **Given** `packages/shared/src/constants.ts` a été mis à jour
- **When** `tsc --noEmit` est lancé sur le monorepo
- **Then** aucune référence à `PRICE_PER_SET_CENTS` ou `SUBSCRIPTION_PLANS` ne persiste dans le code (ou elles sont marquées `@deprecated` avec un commentaire explicite et aucun nouveau code ne les utilise)

**AC-F7-02 — Le seed utilise les constantes partagées**

- **Given** le fichier de seed de la DB (`packages/database/prisma/seed.ts` ou équivalent) est mis à jour
- **When** `prisma db seed` est exécuté sur une base vide
- **Then** 9 produits sont créés avec les prix de `CATALOG_DEFAULTS` et un `SubscriptionConfig` est créé avec les valeurs de `SUBSCRIPTION_DEFAULTS`

**AC-F7-03 — La vitrine affiche les prix corrects**

- **Given** `tarifs.tsx` et `devis/page.tsx` ont été mis à jour pour utiliser `CATALOG_DEFAULTS`
- **When** la vitrine est déployée
- **Then** Kit Bain affiché = 7,50 € (750 centimes), Kit Lit = 16,50 €, Kit Complet = 22,00 €, Pack Sérénité = 89 €/mois

**Règles métier :**

- Les constantes partagées servent uniquement de **valeurs par défaut** pour le seeding ; les prix en production sont ceux de la DB (paramétrables via admin)
- `@lingengo/shared` reste sans dépendance React (pas de composants, pas de PDF)
- Les nouvelles constantes ont des noms explicites en français pour les prix métier (non en anglais technique)

---

### F8 — Migration des données existantes

**Priorité :** Must Have (bloquant pour la mise en production)
**Persona concerné :** Admin opérateur (intégrité des données prod)
**Job-to-be-done :** Quand je déploie la refonte catalogue, je veux que le client réel existant (abonnement PRESTIGE) soit migré proprement, sans perte de données et sans rupture de service sur l'app mobile.

#### État prod connu

- 1 client réel avec `Subscription.plan = PRESTIGE`, statut ACTIVE
- Des commandes de démonstration (`Order`) avec `OrderItem` référençant les anciens produits
- Des `ClientStock` et `OperatorStock` par `ProductRange` (CONFORT/HOTEL/PRESTIGE)
- Des `StockMovement` par `productRange`

#### Stratégie de migration (à valider par l'architecte)

**Phase 1 — Migration Prisma additive (sans rupture) :**

1. Ajouter les nouvelles colonnes sur `Subscription` : `priceCents`, `minEngagementMonths`, `committedUntil`, `kitBainQty`, `kitLitQty`
2. Ajouter la table `SubscriptionConfig`
3. Créer les nouveaux produits (Kit Bain, Kit Lit, etc.) en DB sans supprimer les anciens

**Phase 2 — Migration des données :**

1. Script de migration : mapper le client PRESTIGE → Pack Sérénité (priceCents=8900, kitBainQty=8, kitLitQty=4)
2. Calculer `committedUntil` pour le client existant : soit `now() + 3 mois` (engagement imposé rétroactivement), soit exempter le client existant de l'engagement minimum (décision propriétaire)
3. Les commandes de démo existantes gardent leurs `OrderItem.productId` — si les anciens produits sont désactivés (pas supprimés), les références restent valides

**Phase 3 — Nettoyage (post-validation) :**

1. Désactiver (soft-delete) les anciens produits CONFORT/HOTEL/PRESTIGE
2. Déprécier l'enum `SubscriptionPlan` (ou le conserver pour compatibilité)

#### Critères d'acceptation

**AC-F8-01 — Migration sans perte sur le client réel**

- **Given** le script de migration est exécuté en production
- **When** le client réel se connecte à l'app mobile après migration
- **Then** il voit son abonnement actif avec les nouvelles informations (Pack Sérénité, prix, composition), ses commandes historiques sont toujours accessibles, et son stock actuel est inchangé

**AC-F8-02 — Rollback possible**

- **Given** la migration Phase 1 a été appliquée (colonnes additives)
- **When** un problème est détecté et la migration Phase 2 n'a pas encore tourné
- **Then** un rollback Prisma est possible sans perte de données (colonnes nullable avec défaut)

**AC-F8-03 — Décision engagement client existant documentée**

- **Given** le script de migration est écrit
- **When** il traite le client PRESTIGE existant
- **Then** le comportement est explicite dans le script : soit `committedUntil = null` (exempté, résiliation libre), soit `committedUntil = now() + 3 mois` (engagement imposé) — le propriétaire doit valider ce choix avant exécution en prod

**Règles métier :**

- Aucune donnée de commande historique ne doit être supprimée
- Le client réel ne doit pas subir d'interruption de service pendant la migration
- Les `StockMovement` et `ClientStock` existants (par `productRange`) restent valides — la refonte catalogue n'oblige pas à migrer le stock si l'architecte maintient la compatibilité des modèles de stock
- Le propriétaire doit valider manuellement le choix d'engagement du client existant (AC-F8-03)

---

## Navigation & structure des pages admin

### Nouvelles entrées sidebar (à ajouter à src/components/sidebar.tsx)

| Entrée       | Route         | Icône        | Badge            | Rôle minimum |
| ------------ | ------------- | ------------ | ---------------- | ------------ |
| Devis        | /devis        | FileText     | -                | ROLE_ADMIN   |
| Commandes    | /commandes    | ShoppingCart | newCount PENDING | ROLE_ADMIN   |
| Utilisateurs | /utilisateurs | Users        | -                | ROLE_ADMIN   |
| Réglages     | /reglages     | Settings     | -                | ROLE_ADMIN   |
| Produits     | /produits     | Package      | -                | ROLE_ADMIN   |

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
/produits                 → liste produits avec prix + bouton "Modifier"
/produits/[id]/modifier   → formulaire édition prix/nom/description
```

---

## Écrans mobiles impactés

| Écran actuel                      | Changement requis                                                                                        |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Écran catalogue / passer commande | Afficher kits (Kit Bain, Kit Lit, Kit Complet) + articles unitaires avec prix depuis `/products`         |
| Écran abonnement                  | Afficher Pack Sérénité (89 €/mois), composition (8+4), engagement 3 mois, `committedUntil`               |
| Écran stock                       | Compatible avec les nouveaux produits UUID — à vérifier si `ClientStock` par `productRange` reste valide |
| Écran commandes (historique)      | Afficher `product.name` depuis `OrderItem.product` — pas de changement de logique, juste les données     |
| Écran résiliation                 | Bloquer UI si `committedUntil` non atteinte, afficher date de résiliation autorisée                      |

---

## Exigences non-fonctionnelles

| Catégorie         | Exigence                                                                                          | Mesure                  |
| ----------------- | ------------------------------------------------------------------------------------------------- | ----------------------- |
| Performance       | Listes paginées (max 25 items/page), chargement page < 3s                                         | LCP Lighthouse > 90     |
| Performance PDF   | Génération PDF côté client en < 5s pour un devis de 20 lignes                                     | Mesure manuelle         |
| Sécurité          | Tous les endpoints /admin/\* requièrent ROLE_ADMIN ou ROLE_SUPER_ADMIN                            | Tests Fastify injection |
| Sécurité          | Mot de passe provisoire jamais loggué, affiché une seule fois                                     | Review code + audit     |
| Sécurité          | AuditLog sur toutes les mutations admin (quotes, users, settings, products, subscriptions/config) | Vérification en base    |
| Sécurité          | Blocage résiliation avant `committedUntil` côté API (pas seulement côté mobile)                   | Test automatisé         |
| Accessibilité     | WCAG 2.1 AA — formulaires avec labels, focus visible, messages d'erreur liés                      | Audit axe-core          |
| Mobile            | Interface admin responsive sur 768px minimum (tablette, usage terrain)                            | Tests visuels 768px     |
| Mobile app        | Écrans mobiles impactés utilisent l'API pour tous les prix (zéro valeur en dur)                   | Review code mobile      |
| Intégrité données | Prix en centimes (Int), jamais en flottants                                                       | Review code TypeScript  |
| RGPD              | Mot de passe provisoire non persisté en clair, logs sans données personnelles sensibles           | Audit code              |
| TypeScript        | Strict mode, zéro `any` explicite, Zod sur tous les inputs API                                    | tsc --noEmit            |
| Migration         | Phase 1 additive uniquement (nullable/default), rollback Prisma possible                          | Test sur staging        |

---

## Métriques de succès

- Temps moyen de création d'un devis (du clic "Nouveau" à l'enregistrement) < 3 minutes
- Taux de commandes PENDING traitées (confirmées ou refusées) dans les 24h > 90%
- Zéro création de compte utilisateur nécessitant un accès direct BDD après mise en production
- Nombre de devis convertis en commandes / total devis acceptés > 80%
- Page /devis charge en < 3s avec 200 devis en base
- Zéro désynchronisation entre prix vitrine et prix mobile au lancement (validated par QA)
- Zéro appel de résiliation bloqué par un bug (doit l'être uniquement par la règle métier engagement 3 mois)

---

## Hypothèses

- On assume que l'opérateur Linge Serein est une micro-entreprise (TVA non applicable par défaut, art. 293 B CGI)
- On assume que l'envoi du devis par email se fait manuellement en V1
- On assume que le modèle Operator a au moins un enregistrement en production
- La contrainte `unique([operatorId, category, range])` sur `Product` devra être levée ou adaptée pour accueillir les nouveaux types de produits (KITS) — décision architecturale
- On assume que les `StockMovement` et `ClientStock` continuent d'opérer par `ProductRange` en V1 (modèle stock non refactorisé dans cette spec) — si l'architecte juge une refonte nécessaire pour la cohérence, c'est hors scope V1
- On assume que le client réel avec abonnement PRESTIGE acceptera d'être migré vers Pack Sérénité — le propriétaire doit le confirmer avant exécution du script
- On assume que la décision d'engagement pour le client existant (exempté ou 3 mois imposés rétroactivement) sera validée par le propriétaire avant la migration prod
- On assume que `apps/vitrine` peut importer depuis `@lingengo/shared` (Turborepo, Next.js) — à vérifier par l'architecte si le build vitrine inclut déjà `@lingengo/shared` dans ses deps
- market.md absent — analyse marché non disponible

---

## Décisions ouvertes pour l'architecte

Ces points ont un impact fort sur le schéma Prisma et l'app mobile — le PM pose les contraintes fonctionnelles, l'architecte tranche :

1. **Sort de `ProductCategory` et `ProductRange`** : Le nouveau catalogue KITS ne correspond pas aux valeurs actuelles (SERVIETTES/DRAPS/etc. × CONFORT/HOTEL/PRESTIGE). Options : (a) étendre les enums avec KIT_BAIN/KIT_LIT/KIT_COMPLET/ARTICLE_UNITAIRE dans `ProductCategory` et supprimer `ProductRange` comme discriminant principal, (b) abandonner la contrainte `unique([operatorId, category, range])` et utiliser un simple `slug` unique, (c) refonte complète du modèle `Product` avec un champ `type: ProductType` (KIT | ARTICLE). Contrainte fonctionnelle : le mobile doit pouvoir distinguer kits et articles unitaires pour l'affichage.

2. **Stockage `SubscriptionConfig`** : Table dédiée, extension `Operator`, ou JSON dans `Operator`. Contrainte : paramétrable sans redéploiement, versionnable (snapshot à la souscription).

3. **`SubscriptionPlan` enum** : Déprécier ou conserver ? Le client réel a `plan = PRESTIGE` aujourd'hui. Si on conserve l'enum, la migration du client vers le nouveau modèle est plus simple (pas de suppression de valeur enum Postgres).

4. **Modèles de stock** (`ClientStock`, `OperatorStock` par `ProductRange`, `StockMovement` par `productRange`) : Sont-ils à migrer vers un modèle par `productId` ? Fonctionnellement, le stock en V1 reste agrégé par gamme (pas par article individuel). Si les kits ne correspondent à aucune `ProductRange` existante, il faudra soit étendre l'enum `ProductRange`, soit adapter le modèle stock.

5. **Vitrine et prix temps réel** : Option A (constantes partagées, désynchronisation acceptée) vs Option B (appel API, prix temps réel). Le PM recommande Option A pour la V1.

---

## Risques identifiés

| Risque                                                                                 | Probabilité | Impact | Mitigation                                                                                              |
| -------------------------------------------------------------------------------------- | ----------- | ------ | ------------------------------------------------------------------------------------------------------- |
| Contrainte `unique([operatorId, category, range])` incompatible avec le catalogue KITS | Haut        | Haut   | L'architecte doit trancher l'approche avant tout développement (voir Décisions ouvertes n°1)            |
| Migration prod du client réel introduit une rupture de service mobile                  | Moyen       | Haut   | Migration en phase (additive d'abord), test sur staging avec dump prod, rollback Prisma disponible      |
| Désynchronisation prix vitrine vs DB prod si l'Option B n'est pas choisie              | Moyen       | Moyen  | Option A avec avertissement visible dans le code + process de mise à jour synchronisée                  |
| Client réel refuse ou ignore le passage à l'engagement 3 mois imposé rétroactivement   | Faible      | Moyen  | Prévoir les deux cas dans le script de migration (exempté ou engagement imposé) — choix du propriétaire |
| `StockMovement` par `productRange` devient incohérent si les enums changent            | Moyen       | Moyen  | Ne pas modifier les enums de stock en V1 — extension additive uniquement                                |
| Scope creep sur la refonte stock (tentant de tout aligner sur les nouveaux produits)   | Haut        | Moyen  | Stock V1 = modèle conservé, seul le catalogue produit/abonnement est refactorisé                        |
| Génération PDF lente côté client pour gros devis                                       | Faible      | Moyen  | Limiter à 50 lignes par devis V1                                                                        |
| Sécurité : endpoint /admin/users exposant des données sensibles                        | Faible      | Haut   | Jamais retourner passwordHash, audit du DTO de réponse                                                  |
