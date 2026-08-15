/* Firebase seam (optional cloud sync).
 *
 * This app runs fully offline against localStorage (see storage.js). Firebase is
 * an optional backend for syncing progress across devices and powering a real
 * leaderboard. It stays dormant until a Firebase project is configured via the
 * global `window.__FIREBASE_CONFIG__` (see config.example.js).
 *
 * To finish wiring it up:
 *   1. Provide firebase config in your deploy-time config.js.
 *   2. Load the Firebase SDK (or import the modular SDK) before the app.
 *   3. Implement the Firestore reads/writes where marked TODO below and call
 *      registerRemoteSync(pushProgress) so saves fan out to the cloud.
 */

import { firebaseConfig } from "./config.js";
import { registerRemoteSync } from "./storage.js";

/* Returns true if a Firebase project is configured for this deployment. */
export function isConfigured() {
  return firebaseConfig != null;
}

/* Initialize cloud sync if configured. Safe no-op otherwise, so the app runs
 * unchanged with no backend. Returns whether sync was activated. */
export function initFirebaseSync() {
  if (!isConfigured()) return false;

  // TODO(firebase): once the Firebase SDK and project config are in place,
  // initialize the app + Firestore here, load any existing remote progress,
  // and register the push handler so local saves sync to the cloud:
  //
  //   const app = initializeApp(firebaseConfig);
  //   const db = getFirestore(app);
  //   registerRemoteSync(({ progress, log }) => setDoc(userDoc(db), { progress, log }, { merge: true }));
  //
  // Kept as a documented seam until the project is provisioned.
  void registerRemoteSync;
  return false;
}
