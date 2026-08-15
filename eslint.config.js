import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["src/**/*.js", "*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-empty": ["warn", { allowEmptyCatch: true }],
    },
  },
  {
    // config.js/config.example.js run as classic scripts and assign globals.
    files: ["config*.js"],
    languageOptions: { sourceType: "script", globals: { ...globals.browser } },
  },
  {
    ignores: ["data/**", "design/**", "node_modules/**"],
  },
];
