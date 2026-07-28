# ADR — Calendrier de rotations, notifications et stock

Décisions arrêtées pour le sprint « rotations ». **Source de vérité unique** : tout agent ou
développeur qui travaille sur ce sprint lit ce fichier avant d'écrire du code. En cas de doute
sur une règle, c'est ce document qui tranche — pas une reconstitution à partir du code d'un autre.

## 1. Problème

Le linge est **loué** : il part chez le client et doit revenir. Jusqu'ici rien ne suivait ce
cycle. Le numéro de passage d'un bon de livraison se saisissait à la main, aucune date de reprise
n'était calculée, aucun rappel ne partait, et le stock n'était décrémenté nulle part de façon
fiable.

## 2. Règles de détention (durée max du linge chez le client)

| Formule                                | Durée        | Fondement                                                                                                                                                                                   |
| -------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Location ponctuelle (articles et kits) | **7 jours**  | Seuil légal du renouvellement hebdomadaire para-hôtelier (BOFiP, TVA sur meublés de tourisme). Les clients hôtes doivent le respecter pour leur propre régime fiscal.                       |
| Abonnement Pack Sérénité               | **14 jours** | `SUBSCRIPTION_DEFAULTS.MAX_LINEN_KEEP_DAYS`, déjà contractuel (article 7 du contrat, `packages/ui/src/contract-pdf.tsx`). Deux passages par mois, le linge d'un passage revient au suivant. |

⚠️ **Le 7 jours n'est pas un réglage arbitraire.** Ne pas le « simplifier » ni l'aligner sur 14.
Le code qui le porte doit citer ce fondement en commentaire.

**Escalade retard : 3 jours** (`RETARD_ESCALADE_JOURS`). Au-delà de la date de reprise prévue +3,
la rotation devient facturable au barème de remplacement. La facturation reste une **décision
humaine** : le système signale, il ne facture pas tout seul.

## 3. Modèle

Le cycle se greffe sur la chaîne **devis → facture → bon de livraison**, déjà en production et
validée. On ne construit pas de système parallèle.

- `Rotation` — snapshot client (comme `Quote`/`Invoice` : le client n'est pas toujours dans
  `users`), liens optionnels `quoteId`/`invoiceId`/`deliveryStopId`, `formule`, `status`,
  `dateLivraison`, `dateReprisePrevue`, `dateRepriseReelle`, `passage`.
- `RotationLine` — `productSlug?`, `designation`, `qtyLivree`, `qtyReprise?`.
- `StockItem` — clé `(operatorId, productSlug)`. `disponible` est **calculé**
  (`totalOwned − inCirculation − dirtyPending − retired`), jamais stocké.
- États : `PLANIFIEE → LIVREE → REPRISE`, plus `EN_RETARD` et `ANNULEE`. Machine à transitions
  explicite, sur le modèle de `QUOTE_TRANSITIONS`.

**Résolution ligne → produit** : `resolveProductSlug(designation)` mappe une désignation de devis
vers un slug du catalogue. **On ne devine pas** : en cas d'échec, la fonction retourne `null` et
la ligne reste sans slug plutôt que d'imputer le mouvement au mauvais article.

## 4. Notifications

Timing retenu (aligné sur les pratiques logistiques : un rappel qui demande une **action** est
plus efficace qu'un rappel qui informe) :

| Quand                    | Destinataire | Contenu                                                                              |
| ------------------------ | ------------ | ------------------------------------------------------------------------------------ |
| **J-1 à 18h00**          | Client       | « Passage prévu demain. Préparez votre linge sale, ou contactez-nous pour décaler. » |
| **J-1 à 18h00**          | Gestionnaire | Récapitulatif des passages du lendemain : adresses et articles.                      |
| **Jour J à 07h00**       | Client       | Rappel du créneau.                                                                   |
| **Tous les jours 09h00** | Gestionnaire | Rotations passées en retard, escalade au-delà de J+3.                                |

**Idempotence obligatoire** : un cron qui tourne deux fois ne crée pas deux notifications.

Canal : respecter `NotificationSetting` (préférences par utilisateur et par type, déjà en base).

## 5. Contrat d'API (fait foi)

```
GET   /api/v1/rotations?from=&to=&status=&mine=
      → {success, data:[{id, clientNom, clientAdresse, formule, status,
                         dateLivraison, dateReprisePrevue, dateRepriseReelle, passage,
                         lignes:[{id, productSlug, designation, qtyLivree, qtyReprise}],
                         joursDeRetard}], meta}
GET   /api/v1/rotations/:id
POST  /api/v1/rotations/from-invoice/:invoiceId
PATCH /api/v1/rotations/:id/status   body {status}
PATCH /api/v1/rotations/:id/reprise  body {lignes:[{id, qtyReprise}], dateRepriseReelle?}
GET   /api/v1/stock
      → {success, data:[{productSlug, name, totalOwned, inCirculation,
                         dirtyPending, retired, disponible}]}
PATCH /api/v1/stock/item/:productSlug  body {totalOwned}
      // le segment `item` évite de capter /stock/me, /stock/clients, /stock/operator
PATCH /api/v1/deliveries/stops/:id/complete
      body {setsDelivered, dirtyPickedUp,
            signatureDataUrl?, signataireNom?, conforme?, reserves?}
      // route DÉJÀ DÉPLOYÉE : on l'ÉTEND, on n'en crée pas une nouvelle.
      // Les 4 derniers champs sont aujourd'hui acceptés puis jetés (zod non strict) :
      // le livreur croit avoir fait signer alors que rien n'est persisté.
POST  /api/v1/notifications/device-token  body {token, platform}
```

Les interfaces qui consomment ces routes doivent **se dégrader proprement** si une route répond
encore 404 : état vide et message, jamais d'écran blanc.

Précisions issues de l'implémentation :

- `from`/`to` filtrent sur la **date de reprise prévue**, pas sur la date de livraison. Une vue
  calendaire doit donc étendre sa borne haute de la durée de détention maximale (14 j), sinon une
  livraison de fin de mois dont la reprise tombe le mois suivant disparaît de la grille.
- `enRetard=true` **réécrit** la contrainte de date : ne jamais le combiner avec `from`/`to`.
- `disponible` peut être **négatif** (parc sur-engagé). C'est volontaire et non borné : à traiter
  à l'affichage, pas en tronquant la donnée.
- La signature de livraison ne peut pas réutiliser `DeliveryStop.signatureUrl` (`VarChar(500)`,
  validé comme URL) : une signature SVG data-URL pèse ~6,4 Ko. Colonne `TEXT` dédiée.
- `notification.data` doit être rempli par les producteurs (au minimum `{type, rotationId}`) :
  sans charge utile, le deep-link au tap côté mobile n'ouvre rien.

## 6. Email

L'API **ne sait pas envoyer d'email** (aucun SMTP, aucun client). Le service `apps/mailer` a un
SMTP fonctionnel en production (App Password Gmail configuré). Décision : **le mailer expose un
endpoint transactionnel interne**, l'API l'appelle avec `INTERNAL_INTAKE_SECRET` — le même motif
que l'intake de devis, en sens inverse. On n'ajoute pas un second SMTP dans l'API : cela
dupliquerait la configuration et les secrets.

## 7. Fondations existantes à réutiliser (ne pas réinventer)

- `DeliverySchedule` (jours de tournée par zone) : **déjà en base et seedé**, jamais lu. C'est la
  base du calendrier des passages — le raccorder.
- `NotificationsService.notifyAdmins()` : synchrone, éprouvé, alimente les badges admin.
- Enum `NotificationType` : contient déjà `DELIVERY_REMINDER`, `DELIVERY_CONFIRMED`, `STOCK_LOW`.
- `computeDevisTotals`, `countKits`, `normalizeInvoiceLines` : logique métier validée.

## 8. Dettes connues au démarrage du sprint

- Les queues BullMQ **n'ont aucun producteur** ; le worker de notification est du code mort et ses
  branches PUSH/EMAIL sont des `console.log`.
- Le stock est clé sur l'enum legacy `ProductRange` alors que le catalogue est passé aux slugs,
  avec `"CONFORT"` codé en dur pour toute reprise de linge sale
  (`deliveries.service.ts`), et `PICKUP_DIRTY` qui décrémente au lieu d'incrémenter
  (`stock.service.ts`).
- La page Planning admin plante dès qu'une tournée existe (rend l'objet `driver`, lit `r.stops`
  que l'API ne renvoie pas).
- `expo-notifications` absent du mobile ⇒ **rebuild EAS obligatoire** pour le push (l'OTA
  crasherait).

## 9. Périmètres du sprint (exclusifs en écriture)

| Lot                  | Périmètre                                              |
| -------------------- | ------------------------------------------------------ |
| Backend rotations    | `packages/shared`, `packages/database`, `packages/api` |
| Admin                | `apps/admin-web`                                       |
| Mobile               | `apps/mobile`                                          |
| Email transactionnel | `apps/mailer`                                          |

Un besoin de code partagé passe par le lot backend — jamais d'écriture croisée. Deux agents ayant
écrit simultanément dans `packages/shared` ont cassé le build deux fois : d'où cette règle.
