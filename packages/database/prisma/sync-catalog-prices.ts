/**
 * Synchronisation du catalogue en base sur CATALOG_PRODUCTS — Linge Serein
 * ------------------------------------------------------------------------
 * À exécuter MANUELLEMENT après un changement de tarif dans
 * `packages/shared/src/constants.ts` (CATALOG_DEFAULTS / CATALOG_PRODUCTS).
 * NE PAS inclure dans `prisma migrate deploy` ni dans un CI automatique.
 *
 * Pourquoi ce script existe : les prix de PRODUCTION vivent dans la table
 * `products` (paramétrables via l'admin). Modifier les constantes partagées met à
 * jour la vitrine, les PDF et les devis, mais PAS la base — donc ni l'app mobile,
 * ni le catalogue de l'admin, ni les commandes. Le seed complet, lui, recrée des
 * données de démonstration : il ne doit jamais tourner en prod.
 *
 * Ce script ne touche QUE les 9 produits canoniques (clé : slug) : nom,
 * description, prix, catégorie, kind. Il ne crée aucun client, aucune commande, et
 * ne supprime rien. Les commandes passées gardent leur prix historique
 * (`OrderItem.unitCents` est un snapshot, jamais relu depuis `products`).
 *
 * Usage :
 *   DATABASE_URL="postgresql://..." npx tsx prisma/sync-catalog-prices.ts          # simulation
 *   DATABASE_URL="postgresql://..." npx tsx prisma/sync-catalog-prices.ts --apply  # écriture
 *
 * Sans `--apply`, le script affiche les écarts et n'écrit RIEN.
 */

import { PrismaClient } from "@prisma/client";
import { CATALOG_PRODUCTS } from "@lingengo/shared";

const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");

function euros(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

async function main() {
  console.log(
    `\n🧾  Synchronisation du catalogue — mode ${APPLY ? "ÉCRITURE (--apply)" : "SIMULATION"}\n`,
  );

  let updated = 0;
  let missing = 0;
  let unchanged = 0;

  for (const def of CATALOG_PRODUCTS) {
    const product = await prisma.product.findFirst({ where: { slug: def.slug } });

    if (!product) {
      // Le produit n'existe pas : c'est le rôle du seed / de migrate-v2-data.ts de
      // le créer. On le signale plutôt que de l'insérer à l'aveugle en prod.
      console.log(`  ⚠️  ${def.slug} — ABSENT de la base (à créer via migrate-v2-data.ts)`);
      missing++;
      continue;
    }

    const diffs: string[] = [];
    if (product.priceCents !== def.priceCents) {
      diffs.push(`prix ${euros(product.priceCents)} → ${euros(def.priceCents)}`);
    }
    if (product.name !== def.name) diffs.push(`nom "${product.name}" → "${def.name}"`);
    if (product.description !== def.description) diffs.push("description");
    if (product.kind !== def.kind) diffs.push(`kind ${product.kind} → ${def.kind}`);

    if (diffs.length === 0) {
      unchanged++;
      continue;
    }

    console.log(`  ${APPLY ? "✅" : "→ "} ${def.slug} : ${diffs.join(" · ")}`);

    if (APPLY) {
      await prisma.product.update({
        where: { id: product.id },
        data: {
          kind: def.kind as "KIT" | "ARTICLE",
          name: def.name,
          description: def.description,
          priceCents: def.priceCents,
          category: def.category ?? null,
        },
      });
    }
    updated++;
  }

  console.log(
    `\n  ${updated} produit(s) ${APPLY ? "mis à jour" : "à mettre à jour"} · ` +
      `${unchanged} déjà conforme(s) · ${missing} absent(s)\n`,
  );

  if (!APPLY && updated > 0) {
    console.log("  Relancer avec --apply pour écrire ces changements.\n");
  }
}

main()
  .catch((e) => {
    console.error("\n❌  Échec de la synchronisation :", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
