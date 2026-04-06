const baseConfig = require("@lingengo/eslint-config");

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  ...baseConfig,
  {
    ignores: [
      "dist/",
      ".next/",
      ".expo/",
      "out/",
      "node_modules/",
      "apps/vitrine/**",
      "apps/mobile/**",
      "packages/eslint-config/**",
      "*.config.js",
      "*.config.mjs",
    ],
  },
];
