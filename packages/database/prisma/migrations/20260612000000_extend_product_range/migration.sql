-- Migration: 20260612000000_extend_product_range
-- ISOLATION OBLIGATOIRE : ALTER TYPE ... ADD VALUE ne peut pas s'exécuter dans
-- le même bloc transactionnel qu'une utilisation de la valeur ajoutée (contrainte Postgres).
-- Prisma exécute chaque migration dans sa propre transaction. Cette migration est donc
-- isolée intentionnellement pour garantir que les ADD VALUE soient committés avant
-- que la migration suivante (20260612000001) les utilise.
-- ADR-V2-001 / ADR-V2-004 : extension additive de ProductRange pour le stock des kits.

-- Ajouter les valeurs kit à l'enum ProductRange (extension additive, aucune valeur retirée)
ALTER TYPE "ProductRange" ADD VALUE IF NOT EXISTS 'KIT_BAIN';
ALTER TYPE "ProductRange" ADD VALUE IF NOT EXISTS 'KIT_LIT';
ALTER TYPE "ProductRange" ADD VALUE IF NOT EXISTS 'KIT_COMPLET';
