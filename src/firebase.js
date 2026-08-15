/* Firebase cloud sync (optional).
 *
 * The app is fully functional offline against localStorage (storage.js). When a
 * Firebase project is configured (config.js), this module layers cloud sync on
 * top so a member's progress follows them across devices:
 *
 *   • Anonymous Auth gives each browser a stable user id (persisted locally).
 *   • Firestore stores one document per user at users/{uid} = { progress, log }.
 *   • On startup we pull the remote doc and hand it back for merging.
 *   • Every local save is debounced and pushed to the user's doc.
 *
 * The Firebase modular SDK is imported from the gstatic CDN so the app keeps its
 * no-build, ES-module setup. Any failure (offline, blocked, bad config) is
 * caught and simply leaves the app running on localStorage alone.
 *
 * Setup checklist (Firebase console):
 *   1. Authentication → Sign-in method → enable "Anonymous".
 *   2. Firestore Database → create, then deploy deploy/firestore.rules.
 */

import { firebaseConfig, isFirebaseConfigured } from "./config.js";
import { registerRemoteSync } from "./storage.js";

const SDK_VERSION = "11.6.1";
const SDK = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
const PUSH_DEBOUNCE_MS = 800;

/* Initialize cloud sync if configured. Safe no-op otherwise. `onRemoteData` is
 * called once with the user's stored { progress, log } after sign-in (if any).
 * Returns true if sync was activated. */
export async function initFirebaseSync({ onRemoteData } = {}) {
  if (!isFirebaseConfigured()) return false;

  try {
    const [{ initializeApp }, { getAuth, signInAnonymously, onAuthStateChanged }, firestore] =
      await Promise.all([
        import(`${SDK}/firebase-app.js`),
        import(`${SDK}/firebase-auth.js`),
        import(`${SDK}/firebase-firestore.js`),
      ]);
    const { getFirestore, doc, getDoc, setDoc } = firestore;

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);

    const uid = await currentUid(auth, signInAnonymously, onAuthStateChanged);
    const userDoc = doc(db, "users", uid);

    // Register the (debounced) push so future local saves sync to the cloud.
    const push = debounce(({ progress, log }) => {
      setDoc(userDoc, { progress, log, updatedAt: Date.now() }, { merge: true }).catch(
        (e) => console.warn("Firebase push failed:", e),
      );
    }, PUSH_DEBOUNCE_MS);
    registerRemoteSync(push);

    // Pull existing remote state so the caller can merge it with local.
    if (onRemoteData) {
      const snap = await getDoc(userDoc);
      if (snap.exists()) {
        const data = snap.data() || {};
        onRemoteData({ progress: data.progress || {}, log: data.log || {} });
      }
    }
    return true;
  } catch (e) {
    console.warn("Firebase sync disabled (running local-only):", e);
    return false;
  }
}

/* Resolve the current user id, signing in anonymously if needed. */
function currentUid(auth, signInAnonymously, onAuthStateChanged) {
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(
      auth,
      (user) => {
        if (user) {
          unsub();
          resolve(user.uid);
        }
      },
      reject,
    );
    if (!auth.currentUser) signInAnonymously(auth).catch(reject);
  });
}

function debounce(fn, ms) {
  let t = null;
  let lastArgs = null;
  return (...args) => {
    lastArgs = args;
    clearTimeout(t);
    t = setTimeout(() => fn(...lastArgs), ms);
  };
}
