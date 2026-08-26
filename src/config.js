/* Application configuration.
 *
 * Defaults live here in source. Deploy-time overrides are injected as a global
 * by an optional `config.js` at the site root (loaded before the app module —
 * see index.html and config.example.js). This keeps environment-specific values
 * out of the codebase, per the 12-factor "config from environment" principle. */

const appOverrides = (typeof window !== "undefined" && window.__APP_CONFIG__) || {};

/* What the app currently offers.
 *
 * Every flag here names a piece of the app that is built, tested and shipped,
 * but not shown — switched off rather than taken out, so bringing one back is
 * this line and nothing else. That is the difference between this table and a
 * deletion: the screen, its view-model, its copy and its tests all stay, and a
 * deploy can turn any of them on through `window.__APP_CONFIG__.features`
 * without a code change.
 *
 * They are off together for a reason. The group is starting on the app with
 * nothing in it but the verses — no standings to compare against, no manual to
 * read first, and no form to fill in before the first passage — so what a new
 * member meets is the board and the set. The three that ask a member for
 * something before they get anything are the ones switched off:
 *
 *   leaderboard   the Stats screen and its entry in the header;
 *   guide         the long-form explainer, its entry, and the board's link to it;
 *   profileSetup  the sign-up form (ministry group, gender, class) and the
 *                 identity fields it shares with Settings — the profile exists
 *                 to slice the leaderboard, so it goes with it;
 *   welcome       the one-time nudge toward the guide, which followed that form;
 *   boardEpigraph the verse printed across the top of the board.
 *
 * `profileSetup` reaches furthest, so it is worth saying what it does not do:
 * a profile already filled in is left alone and still syncs, and Settings is
 * still reachable from the header — it simply stops being something a member
 * has to get past before the app. */
const DEFAULT_FEATURES = {
  leaderboard: false,
  guide: false,
  profileSetup: false,
  welcome: false,
  boardEpigraph: false,
};

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
  /* Merged rather than replaced, so a deploy naming one flag does not silently
   * take the defaults for all the others with it. */
  features: { ...DEFAULT_FEATURES, ...(appOverrides.features || {}) },
};

/* The flags on their own, since that is all any reader of them wants. */
export const features = appConfig.features;

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
