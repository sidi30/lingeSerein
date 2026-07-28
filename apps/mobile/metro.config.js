const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// On AJOUTE la racine du monorepo aux dossiers surveillés au lieu de remplacer
// la liste : `getDefaultConfig` y place des entrées dont Metro a besoin, et les
// écraser cassait la résolution de façon difficile à diagnostiquer.
config.watchFolders = [...new Set([...(config.watchFolders ?? []), monorepoRoot])];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

module.exports = config;
