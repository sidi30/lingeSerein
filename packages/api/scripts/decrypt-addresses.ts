/**
 * Déchiffre définitivement les adresses stockées en base.
 *
 *   npx tsx scripts/decrypt-addresses.ts              # RAPPORT SEUL (défaut)
 *   npx tsx scripts/decrypt-addresses.ts --apply      # écrit réellement
 *
 * CONTEXTE — pourquoi on supprime ce chiffrement :
 * `encrypt()` n'avait qu'un seul appelant (l'inscription mobile) et `decrypt()`
 * n'était appelé NULLE PART. Résultat en production : l'adresse d'un client venu
 * de l'app s'affichait en base64 illisible dans l'admin ET sur l'écran de tournée
 * du livreur, tandis que celle d'un client saisi ailleurs restait en clair. Deux
 * formats coexistaient dans la même colonne, sans marqueur.
 * Le chiffrement ne protégeait rien de toute façon : la clé vit sur le même
 * serveur que la base, et `phone` n'a jamais été chiffré malgré son commentaire.
 *
 * SÉCURITÉ DE LA MANŒUVRE :
 * AES-GCM est authentifié — une clé erronée fait ÉCHOUER le déchiffrement, elle
 * ne produit pas silencieusement du charabia. On peut donc distinguer de façon
 * fiable "chiffré" de "en clair". En cas de valeur qui ressemble à du chiffré
 * mais refuse de se déchiffrer (clé rotée ?), le script S'ARRÊTE : réécrire là
 * figerait du base64 pour toujours.
 */
import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "node:fs";
import { decrypt } from "../src/utils/crypto.js";

const APPLY = process.argv.includes("--apply");
const REPORT_PATH = process.env["REPORT_PATH"] ?? "/tmp/decrypt-addresses-report.json";

const key = process.env["ENCRYPTION_KEY"];
if (!key) {
  console.error("ENCRYPTION_KEY absente — impossible de déchiffrer quoi que ce soit.");
  process.exit(1);
}

/**
 * Une valeur chiffrée est du base64 strict dont le contenu décodé dépasse
 * iv(16) + authTag(16). Une adresse en clair ("12 rue de la République") contient
 * des espaces et des accents : elle ne passe pas ce filtre.
 */
function looksEncrypted(value: string): boolean {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  return Buffer.from(value, "base64").length > 32;
}

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: { address: { not: null } },
    select: { id: true, name: true, address: true },
  });

  const chiffrees: { id: string; name: string; avant: string; apres: string }[] = [];
  const enClair: { id: string; name: string }[] = [];
  const echecs: { id: string; name: string; extrait: string }[] = [];

  for (const u of users) {
    const addr = u.address!;
    if (!looksEncrypted(addr)) {
      enClair.push({ id: u.id, name: u.name });
      continue;
    }
    try {
      chiffrees.push({ id: u.id, name: u.name, avant: addr, apres: decrypt(addr, key!) });
    } catch {
      echecs.push({ id: u.id, name: u.name, extrait: addr.slice(0, 24) + "…" });
    }
  }

  console.log(`\nAdresses non nulles      : ${users.length}`);
  console.log(`  déjà en clair          : ${enClair.length}`);
  console.log(`  chiffrées, déchiffrables : ${chiffrees.length}`);
  console.log(`  ÉCHECS de déchiffrement  : ${echecs.length}`);

  if (echecs.length > 0) {
    console.error("\nARRÊT — des valeurs ressemblent à du chiffré mais ne se déchiffrent pas.");
    console.error("Cela signifie que ENCRYPTION_KEY n'est pas celle qui a servi à les écrire.");
    console.error("Les réécrire figerait du base64 illisible définitivement.");
    for (const e of echecs) console.error(`  - ${e.name} (${e.id}) : ${e.extrait}`);
    process.exit(2);
  }

  // Rapport AVANT/APRÈS : c'est la trace qui permet de revenir en arrière
  // valeur par valeur, indépendamment du dump complet de la base.
  writeFileSync(REPORT_PATH, JSON.stringify({ chiffrees, enClair }, null, 2), "utf-8");
  console.log(`\nRapport écrit : ${REPORT_PATH}`);

  for (const c of chiffrees) {
    console.log(`  ${c.name} : "${c.apres}"`);
  }

  if (!APPLY) {
    console.log("\nMODE RAPPORT — rien n'a été modifié. Relancer avec --apply pour écrire.");
    return;
  }

  for (const c of chiffrees) {
    await prisma.user.update({ where: { id: c.id }, data: { address: c.apres } });
  }
  console.log(`\n${chiffrees.length} adresse(s) déchiffrée(s) et réécrite(s) en clair.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
