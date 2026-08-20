/* Application configuration.
 *
 * Defaults live here in source. Deploy-time overrides are injected as a global
 * by an optional `config.js` at the site root (loaded before the app module —
 * see index.html and config.example.js). This keeps environment-specific values
 * out of the codebase, per the 12-factor "config from environment" principle. */

const appOverrides = (typeof window !== "undefined" && window.__APP_CONFIG__) || {};

export const appConfig = {
  groupName: "Acts 2 Network - Berkeley",
  deadline: "2026-10-31",
  /* The shortest time the opening splash stays up, in milliseconds. It sits
   * here rather than in App.js because it is a matter of taste — how long the
   * registration mark is worth watching — and so it can be retuned per deploy
   * without a code change. Retune this one; SPLASH_MAX_MS in App.js is the
   * failsafe above it and is not a preference. */
  splashMinMs: 2000,
  ...appOverrides,
};

/* Firebase web config. Firebase web configuration (apiKey, projectId, ...) is
 * public by design and safe to expose to clients; access is governed by
 * Firebase Security Rules, not by hiding this object. The default below points
 * at the project's Firebase; a deploy can override it via window.__FIREBASE_CONFIG__
 * (e.g. a separate staging project). Set to null to disable cloud sync. */
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyAjX1oxuaJXlRenLg_TvPZIT-MT2WZTe1A",
  authDomain: "verse-memory.firebaseapp.com",
  projectId: "verse-memory",
  storageBucket: "verse-memory.firebasestorage.app",
  messagingSenderId: "223583873519",
  appId: "1:223583873519:web:eb490a7c3f51a14897ae1a",
};

const firebaseOverride = typeof window !== "undefined" ? window.__FIREBASE_CONFIG__ : undefined;
export const firebaseConfig = firebaseOverride === undefined ? DEFAULT_FIREBASE_CONFIG : firebaseOverride;

export const isFirebaseConfigured = () => firebaseConfig != null;
