-- Types de notification alimentant les badges "non lus" du menu de l'admin.
--
-- Purement additif : ajouter une valeur d'enum ne réécrit pas la table et ne
-- pose pas de verrou exclusif, contrairement à un changement de colonne. Les
-- lignes existantes ne sont pas touchées.
--
-- IF NOT EXISTS rend la migration rejouable sans erreur (utile si elle a été
-- appliquée à la main sur un environnement avant d'être committée).
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'QUOTE_CREATED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ORDER_CREATED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'USER_CREATED';
