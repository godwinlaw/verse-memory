/* Application configuration.
 *
 * Defaults live here in source. Deploy-time overrides are injected as a global
 * by an optional `config.js` at the site root (loaded before the app module —
 * see index.html and config.example.js). This keeps environment-specific values
 * out of the codebase, per the 12-factor "config from environment" principle. */

const appOverrides = (typeof window !== "undefined" && window.__APP_CONFIG__) || {};

export const appConfig = {
  groupName: "Acts 2 Network - Berkeley",
  deadline: "2026-09-30",
  ...appOverrides,
};

/* Firebase web config, if provided at deploy time. Firebase web configuration
 * (apiKey, projectId, ...) is public by design and safe to expose to clients;
 * access is governed by Firebase Security Rules, not by hiding this object.
 * Null until a Firebase project is wired up. */
export const firebaseConfig = (typeof window !== "undefined" && window.__FIREBASE_CONFIG__) || null;
