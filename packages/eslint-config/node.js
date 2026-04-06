const base = require("./index.js");
const globals = require("globals");

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  ...base,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
