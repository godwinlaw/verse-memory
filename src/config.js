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
  /* Where a recorded recitation is sent to be transcribed — the route in
   * worker/transcribe.js, which on this deploy is "/api/transcribe".
   *
   * Empty means not configured, and not configured is the default on purpose:
   * with nothing here Speak mode listens exactly the way it always has, through
   * the browser's own streaming recognizer, and no audio leaves the device by
   * this path. Setting it turns on record-then-transcribe (src/transcriber.js),
   * which is the shape that survives a phone — Chrome for Android ignores
   * `continuous` entirely, so the streaming path was never really working there
   * (docs/research/asr.md §1). It sits with the other tunables because it is a
   * per-deploy fact: a build with no Worker behind it should leave it empty
   * rather than point at a route that will 404 on every verse. */
  transcribeUrl: "",
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
  measurementId: "G-3YYWC1KY57",
};

const firebaseOverride = typeof window !== "undefined" ? window.__FIREBASE_CONFIG__ : undefined;
export const firebaseConfig = firebaseOverride === undefined ? DEFAULT_FIREBASE_CONFIG : firebaseOverride;

export const isFirebaseConfigured = () => firebaseConfig != null;
