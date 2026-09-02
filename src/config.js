/* Application configuration.
 *
 * Defaults live here in source. Deploy-time overrides are injected as a global
 * by an optional `config.js` at the site root (loaded before the app module,
 * see index.html and config.example.js). This keeps environment-specific values
 * out of the codebase, per the 12-factor "config from environment" principle. */

const appOverrides = (typeof window !== "undefined" && window.__APP_CONFIG__) || {};

/* What the app currently offers.
 *
 * Every flag here names a piece of the app that is built, tested and shipped,
 * but not shown, switched off rather than taken out, so bringing one back is
 * this line and nothing else. That is the difference between this table and a
 * deletion: the screen, its view-model, its copy and its tests all stay, and a
 * deploy can turn any of them on through `window.__APP_CONFIG__.features`
 * without a code change.
 *
 * What is on and what is off:
 *
 *   leaderboard   ON , the Stats screen and its entry in the header. A member
 *                 is only *named* on it if they say so: see profile.js,
 *                 shareRanking, which is off until it is chosen;
 *   profileSetup  ON , the sign-up form (ministry group, gender, class) and
 *                 the identity fields it shares with Settings. It is back
 *                 because the board slices by those three, and a board that
 *                 cannot group anybody is not much of a board;
 *   guide         OFF, the long-form explainer, its entry, and the board's
 *                 link to it;
 *   welcome       OFF, the one-time nudge that followed sign-up. It exists to
 *                 point a new member at the guide, so it stays off with it:
 *                 finishing the form lands on the board;
 *   boardEpigraph OFF, the verse printed across the top of the board.
 *
 * `profileSetup` reaches furthest, so it is worth saying what it carries with
 * it: the identity fields on Settings, and the sync gate that stops a member
 * whose cloud record could not be read from filling in a fresh profile over
 * the real one. */
const DEFAULT_FEATURES = {
  leaderboard: true,
  guide: false,
  profileSetup: true,
  welcome: false,
  boardEpigraph: false,
};

export const appConfig = {
  groupName: "Acts 2 Network - Berkeley",
  deadline: "2026-10-31",
  /* The shortest time the opening splash stays up, in milliseconds. It sits
   * here rather than in App.js because it is a matter of taste, how long the
   * registration mark is worth watching, and so it can be retuned per deploy
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
