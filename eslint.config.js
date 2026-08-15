import js from "@eslint/js";
import globals from "globals";

export default [
  {
    // Build output, generated data, and the vendored design export are not ours
    // to lint. `dist/` in particular is a copy of src/ and would double-report.
    ignores: ["dist/**", "data/**", "design/**", "node_modules/**", ".wrangler/**"],
  },
  js.configs.recommended,
  {
    // Browser application code: ES modules against the DOM.
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser },
    },
  },
  {
    // Node tooling: build scripts and the node:test suite.
    files: ["scripts/**/*.mjs", "test/**/*.mjs", "eslint.config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
    },
  },
  {
    // config.js / config.example.js run as classic scripts and assign globals.
    files: ["config*.js"],
    languageOptions: { sourceType: "script", globals: { ...globals.browser } },
  },
  {
    rules: {
      // `catch {}` with no binding is preferred; where a binding exists but is
      // unused (older browsers), name it `_` rather than leaving it dangling.
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-var": "error",
      "prefer-const": "error",
    },
  },
];
