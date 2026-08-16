/* Deploy-time configuration override (optional).
 *
 * Copy this file to `config.js` (which is gitignored) and edit the values for
 * your deployment. index.html loads it as a classic script before the app, so
 * these globals are available to src/config.js at startup. If config.js is
 * absent, the app falls back to the defaults in src/config.js.
 *
 * Firebase web configuration is public by design (access is controlled by
 * Firebase Security Rules), so it is safe to commit a real config.js if you
 * prefer — it is gitignored only to keep environment specifics out of source. */

window.__APP_CONFIG__ = {
  groupName: "Acts 2 Network - Berkeley",
  deadline: "2026-10-31", // YYYY-MM-DD, the memorization goal date
};

// Cloud sync uses the default Firebase project baked into src/config.js. Leave
// this unset to use it. Override only to point at a different project, or set
// it to null to disable cloud sync entirely for this deployment.
//
// window.__FIREBASE_CONFIG__ = {
//   apiKey: "...",
//   authDomain: "your-project.firebaseapp.com",
//   projectId: "your-project",
//   storageBucket: "your-project.firebasestorage.app",
//   messagingSenderId: "...",
//   appId: "...",
// };
// window.__FIREBASE_CONFIG__ = null; // disable cloud sync
