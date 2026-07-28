-- Migration: 20260728100000_rotation_notification_types
--
-- Objectif : ajouter les types de notification du calendrier de rotations.
--
-- SEULE cette migration touche l'enum, et elle ne fait QUE cela. Motif : sous
-- PostgreSQL < 12, `ALTER TYPE ... ADD VALUE` ne peut pas être exécuté dans un
-- bloc transactionnel, et jusqu'à PG 14 la valeur ajoutée n'est pas utilisable
-- par les instructions de la MÊME transaction. Or Prisma enveloppe chaque
-- fichier de migration dans une transaction. Mélanger ces ALTER TYPE avec la
-- création des tables ferait donc échouer la migration selon la version du
-- serveur — d'où l'isolement dans un fichier dédié, appliqué AVANT celui qui
-- crée les tables (20260728100100_rotations_stock_by_slug).
--
-- Purement additif : ajouter une valeur d'enum ne réécrit pas la table et ne
-- pose pas de verrou exclusif. Aucune ligne existante n'est touchée.
--
-- Effet sur les badges "non lus" de l'admin : AUCUN. NotificationsService
-- (packages/api/src/services/notifications.service.ts) mappe les types vers des
-- sections via SECTION_BY_TYPE et ignore silencieusement les types absents de
-- la table (`if (section)`). Les compteurs devis / commandes / utilisateurs /
-- stock restent donc strictement inchangés — ces quatre nouveaux types
-- n'alimentent aucune section et ne peuvent pas gonfler un badge existant.
--
-- IF NOT EXISTS rend la migration rejouable sans erreur.
--
-- Rollback : Postgres ne sait pas retirer proprement une valeur d'enum
-- (DROP VALUE n'existe pas). Ces valeurs sont donc définitives — voir
-- docs/runbook-migration.md.

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ROTATION_REMINDER';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ROTATION_TODAY';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ROTATION_OVERDUE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ROTATION_PICKED_UP';
