/* Firebase authentication + cloud sync.
 *
 * Access is restricted to Google accounts in the Acts 2 Network Workspace
 * domains (see ALLOWED_DOMAINS below). Enforcement is twofold: (1) the client
 * rejects and signs out any account outside those domains, and (2) Firestore
 * security rules (deploy/firestore.rules) allow access only to verified
 * identities in them. Only the second is security — never rely on the client.
 *
 * Once a member is signed in, their progress syncs across devices:
 *   • Firestore stores one document per user at
 *     users/{uid} = { name, email, progress, log, profile }.
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
 *   3. Add the app's domain under Authentication → Settings → Authorized
 *      domains.
 *
 * Note: because sign-in spans two Workspace domains, Google's single-domain `hd`
 * hint is not used and the OAuth consent screen cannot be locked to one
 * Workspace. Domain membership is enforced by emailAllowed() and the rules.
 */

import { firebaseConfig, isFirebaseConfigured } from "./config.js";
import { registerRemoteSync } from "./storage.js";
import { cleanDisplayName } from "./profile.js";

const SDK_VERSION = "11.6.1";
const SDK = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
const PUSH_DEBOUNCE_MS = 800;

/* Google Workspace domains permitted to sign in (Acts 2 Network).
 *
 * This list is only half the gate. The authoritative check is in
 * deploy/firestore.rules — adding or removing a domain means editing BOTH and
 * redeploying the rules; changing this file alone is insecure and ineffective. */
export const ALLOWED_DOMAINS = ["gpmail.org", "acts2.network"];

/* The domain named on the sign-in screen. Accounts in any ALLOWED_DOMAINS entry
 * can sign in; naming one keeps the prompt short. */
export const PRIMARY_DOMAIN = "acts2.network";

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

/* True only for an address in one of the allowed Workspace domains. Matches the
 * exact domain after the final "@" (case-insensitive), so look-alikes like
 * "evilgpmail.org" or "gpmail.org.evil.com" are rejected. */
export function emailAllowed(email) {
  if (typeof email !== "string") return false;
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  return ALLOWED_DOMAINS.includes(email.slice(at + 1).toLowerCase());
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
      try {
        await signOut(s.auth);
      } catch {}
      return;
    }

    try {
      await setupSync(s, user, onRemoteData);
    } catch (e) {
      console.warn("sync setup failed:", e);
    }
    onChange({
      status: "signed-in",
      user: { uid: user.uid, email: user.email, name: cleanDisplayName(user.displayName), photo: user.photoURL },
    });
  });
}

/* Start the Google sign-in popup. Google's `hd` hint only accepts a single
 * domain, so with multiple allowed domains we don't set it and instead enforce
 * membership via emailAllowed() below and the Firestore rules. Resolves to the
 * user on success; the auth observer in initAuth then takes over. */
export async function signIn() {
  const s = await loadServices();
  const { GoogleAuthProvider, signInWithPopup, signOut } = s.authMod;
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const cred = await signInWithPopup(s.auth, provider);
  if (!emailAllowed(cred.user && cred.user.email)) {
    try {
      await signOut(s.auth);
    } catch {}
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

async function setupSync(s, user, onRemoteData) {
  const { doc, getDoc, setDoc } = s.dbMod;
  const userDoc = doc(s.db, "users", user.uid);
  const identity = { name: cleanDisplayName(user.displayName), email: user.email || "" };

  // Record the member's identity so the leaderboard can show a name for them.
  setDoc(userDoc, identity, { merge: true }).catch((e) => console.warn("Firebase identity write failed:", e));

  /* An ordinary save merges, so a slice left out of the payload is left alone.
   * A wipe (storage.clearProgressAndLog) cannot: setDoc's merge folds maps
   * together key by key, so an emptied `progress` would delete nothing and the
   * next sign-in would pull every wiped verse back. So it writes the document
   * whole — identity included, since nothing outside this payload survives.
   *
   * `pendingReplace` is what survives the debounce. Pushes are coalesced, and a
   * wipe followed by any ordinary save within the window would otherwise go up
   * as that save — a merge, deleting nothing. Once a wipe is waiting, whatever
   * finally fires is a replacement; the payload is read fresh from storage each
   * time, so it is still the current record that gets written. */
  let pendingReplace = false;
  const push = debounce(({ progress, log, profile }) => {
    const record = { progress, log, profile: profile || {}, updatedAt: Date.now() };
    const write = pendingReplace
      ? setDoc(userDoc, { ...identity, ...record })
      : setDoc(userDoc, record, { merge: true });
    pendingReplace = false;
    write.catch((e) => console.warn("Firebase push failed:", e));
  }, PUSH_DEBOUNCE_MS);
  registerRemoteSync((payload) => {
    if (payload.replace) pendingReplace = true;
    push(payload);
  });

  if (onRemoteData) {
    const snap = await getDoc(userDoc);
    if (snap.exists()) {
      const data = snap.data() || {};
      onRemoteData({ progress: data.progress || {}, log: data.log || {}, profile: data.profile || {} });
    }
  }
}

/* Read every registered member for the leaderboard. Returns one row per user
 * ({ uid, name, email, profile, progress, log }); the caller derives committed
 * counts and streaks. Firestore rules permit any signed-in Acts member to read
 * the users collection for exactly this. Resolves to [] when Firebase is
 * unconfigured or the read is refused (e.g. before sign-in), so the UI degrades
 * to a solo board rather than erroring. */
export async function fetchRoster() {
  if (!isFirebaseConfigured()) return [];
  let s;
  try {
    s = await loadServices();
  } catch {
    return [];
  }
  const { collection, getDocs } = s.dbMod;
  try {
    const snap = await getDocs(collection(s.db, "users"));
    const rows = [];
    snap.forEach((d) => {
      const data = d.data() || {};
      rows.push({
        uid: d.id,
        name: data.name || "",
        email: data.email || "",
        profile: data.profile || {},
        progress: data.progress || {},
        log: data.log || {},
      });
    });
    return rows;
  } catch (e) {
    console.warn("Roster fetch failed:", e);
    return [];
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
