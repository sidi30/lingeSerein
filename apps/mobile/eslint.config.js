const reactConfig = require("@lingengo/eslint-config/react");

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  ...reactConfig,
  {
    rules: {
      // React Native rend du <Text>, pas du HTML : les apostrophes n'ont pas
      // d'ambiguïté d'entité. Règle DOM non pertinente ici.
      "react/no-unescaped-entities": "off",
      // Aligné sur la config racine du monorepo.
      "@typescript-eslint/no-non-null-assertion": "warn",
    },
  },
  {
    ignores: [
      "dist/",
      ".expo/",
      "node_modules/",
      "expo-env.d.ts",
      "babel.config.js",
      "metro.config.js",
      "*.config.js",
    ],
  },
];
