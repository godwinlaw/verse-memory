/* Firebase authentication + cloud sync.
 *
 * Access is restricted to Google accounts in the Acts 2 Network Workspace domain
 * (gpmail.org). Sign-in uses Google with the `hd` hint, but the real enforcement
 * is twofold: (1) we reject and sign out any non-gpmail.org account on the
 * client, and (2) Firestore security rules (deploy/firestore.rules) allow access
 * only to verified @gpmail.org identities. Never rely on the client alone.
 *
 * Once a member is signed in, their progress syncs across devices:
 *   • Firestore stores one document per user at users/{uid} = { progress, log }.
 *   • On sign-in we pull the remote doc and hand it back for merging.
 *   • Every local save is debounced and pushed to the user's doc.
 *
 * The Firebase modular SDK is imported from the gstatic CDN so the app keeps its
 * no-build, ES-module setup. If Firebase is unreachable/misconfigured the app
 * degrades to local-only (status "disabled").
 *
 * Setup checklist (Firebase console):
 *   1. Authentication → Sign-in method → enable "Google".
 *   2. Firestore Database → create, then deploy deploy/firestore.rules.
 *   3. (Recommended) In Google Cloud → OAuth consent screen, set User type to
 *      Internal so only gpmail.org Workspace users can consent.
 */

import { firebaseConfig, isFirebaseConfigured } from "./config.js";
import { registerRemoteSync } from "./storage.js";

const SDK_VERSION = "11.6.1";
const SDK = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
const PUSH_DEBOUNCE_MS = 800;

export const ALLOWED_DOMAIN = "gpmail.org";

let services = null; // memoized { app, auth, db, authMod, dbMod }

async function loadServices() {
  if (services) return services;
  const [appMod, authMod, dbMod] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`),
  ]);
  const app = appMod.initializeApp(firebaseConfig);
  services = { app, auth: authMod.getAuth(app), db: dbMod.getFirestore(app), authMod, dbMod };
  return services;
}

/* True only for a verified-looking address in the allowed Workspace domain. */
export function emailAllowed(email) {
  return typeof email === "string" && email.toLowerCase().endsWith("@" + ALLOWED_DOMAIN);
}

/* Begin observing auth state. Drives onChange({ status, user?, reason? }) where
 * status is one of: "signed-in", "signed-out", "denied", "disabled". For an
 * approved user it wires Firestore sync and hydrates remote progress via
 * onRemoteData({ progress, log }). No-op ("disabled") when Firebase is
 * unconfigured or unreachable, so the app can run local-only. */
export async function initAuth({ onChange = () => {}, onRemoteData } = {}) {
  if (!isFirebaseConfigured()) return onChange({ status: "disabled" });

  let s;
  try {
    s = await loadServices();
  } catch (e) {
    console.warn("Firebase unavailable (running local-only):", e);
    return onChange({ status: "disabled" });
  }

  const { onAuthStateChanged, signOut } = s.authMod;
  onAuthStateChanged(s.auth, async (user) => {
    if (!user) return onChange({ status: "signed-out" });

    if (!emailAllowed(user.email)) {
      onChange({ status: "denied", reason: user.email || "" });
      try { await signOut(s.auth); } catch (e) {}
      return;
    }

    try { await setupSync(s, user.uid, onRemoteData); } catch (e) { console.warn("sync setup failed:", e); }
    onChange({
      status: "signed-in",
      user: { uid: user.uid, email: user.email, name: user.displayName, photo: user.photoURL },
    });
  });
}

/* Start the Google sign-in popup, restricted to the gpmail.org domain. Resolves
 * to the user on success; the auth observer in initAuth then takes over. */
export async function signIn() {
  const s = await loadServices();
  const { GoogleAuthProvider, signInWithPopup, signOut } = s.authMod;
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ hd: ALLOWED_DOMAIN, prompt: "select_account" });
  const cred = await signInWithPopup(s.auth, provider);
  if (!emailAllowed(cred.user && cred.user.email)) {
    try { await signOut(s.auth); } catch (e) {}
    const err = new Error("not-allowed-domain");
    err.code = "not-allowed-domain";
    throw err;
  }
  return cred.user;
}

export async function signOutUser() {
  const s = await loadServices();
  await s.authMod.signOut(s.auth);
}

async function setupSync(s, uid, onRemoteData) {
  const { doc, getDoc, setDoc } = s.dbMod;
  const userDoc = doc(s.db, "users", uid);

  const push = debounce(({ progress, log }) => {
    setDoc(userDoc, { progress, log, updatedAt: Date.now() }, { merge: true }).catch(
      (e) => console.warn("Firebase push failed:", e),
    );
  }, PUSH_DEBOUNCE_MS);
  registerRemoteSync(push);

  if (onRemoteData) {
    const snap = await getDoc(userDoc);
    if (snap.exists()) {
      const data = snap.data() || {};
      onRemoteData({ progress: data.progress || {}, log: data.log || {} });
    }
  }
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
