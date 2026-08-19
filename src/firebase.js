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
 * onRemoteData({ progress, log, profile }). No-op ("disabled") when Firebase is
 * unconfigured or unreachable, so the app can run local-only.
 *
 * `onSyncChange({ status, code? })` is the second channel, and it exists because
 * a failed pull used to be indistinguishable from an empty one. Status is
 * "pulling" while the member's document is being read, "synced" once it has
 * been, and "error" if the read was refused or unreachable. The app must not
 * treat a member whose record it could not read as a member with no record —
 * that is what asks a returning member to sign up again, and what lets the
 * empty profile they then fill in overwrite the real one (see App.render). */
export async function initAuth({ onChange = () => {}, onRemoteData, onSyncChange = () => {} } = {}) {
  /* Two very different situations used to report the same "disabled", and the
   * app then treated both as "run local-only, and hand this member the sign-up
   * form". Only one of them is a decision:
   *
   *   "unconfigured" — this build has no Firebase (window.__FIREBASE_CONFIG__ =
   *     null, or a local dev copy). There is no account to sign in to, so a
   *     private record on this device is exactly right and nothing is said.
   *   "unreachable"  — there IS a Firebase, but the SDK could not be fetched
   *     from the gstatic CDN: a blocked network, an extension, a dropped
   *     connection. The member has an account and a record; the app simply
   *     could not get to it. Handing them the sign-up form here is how a
   *     member with 41 committed verses is asked to start over. */
  if (!isFirebaseConfigured()) return onChange({ status: "disabled", reason: "unconfigured" });

  let s;
  try {
    s = await loadServices();
  } catch (e) {
    console.warn("Firebase unavailable (running local-only):", e);
    return onChange({ status: "disabled", reason: "unreachable" });
  }

  /* initAuth is retryable (see App.retryConnection), and loadServices only
   * memoizes on success — so a retry that gets through must not leave a second
   * observer behind the first. */
  if (observing) return;
  observing = true;

  const { onAuthStateChanged, signOut } = s.authMod;
  onAuthStateChanged(s.auth, async (user) => {
    pull = null;
    if (!user) {
      onSyncChange({ status: "idle" });
      return onChange({ status: "signed-out" });
    }

    if (!emailAllowed(user.email)) {
      onChange({ status: "denied", reason: user.email || "" });
      try {
        await signOut(s.auth);
      } catch {}
      return;
    }

    /* The push seam is wired before the pull is attempted and never throws, so a
     * member whose first read failed still has somewhere for their work to go
     * once the read is retried. */
    registerPush(s, user);
    onSyncChange({ status: "pulling" });
    // Held so retrySync() can run the same read again without a fresh sign-in.
    pull = () => pullRemote(s, user, onRemoteData);
    onChange({
      status: "signed-in",
      user: { uid: user.uid, email: user.email, name: cleanDisplayName(user.displayName), photo: user.photoURL },
    });
    onSyncChange(await runPull(pull));
  });
}

/* The member's document, read and handed to onRemoteData. Kept apart from the
 * push wiring above so it can be attempted again on its own. */
let pull = null;

/* Whether the auth observer is already running, so retrying the SDK load after a
 * blocked CDN cannot register it twice. */
let observing = false;

/* Read the record once, reporting what happened rather than throwing. A refused
 * read ("permission-denied") almost always means the Firestore rules in
 * deploy/firestore.rules are behind ALLOWED_DOMAINS and need redeploying — the
 * code is passed through so the app can say so. */
async function runPull(fn) {
  try {
    await fn();
    return { status: "synced" };
  } catch (e) {
    console.warn("Firebase pull failed:", e);
    return { status: "error", code: (e && e.code) || "unavailable" };
  }
}

/* Try the pull again, for a member sitting in front of the "could not reach your
 * record" screen. Resolves to the same { status, code? } initAuth reports. */
export async function retrySync() {
  if (!pull) return { status: "error", code: "signed-out" };
  return runPull(pull);
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

/* The push half of sync: a debounced write of the whole record, wired into the
 * storage seam. Never throws — a failed write is reported through onPushError so
 * the app can say sync is not working, and the local save stands regardless. */
function registerPush(s, user) {
  const { doc, setDoc } = s.dbMod;
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
    write.catch((e) => {
      console.warn("Firebase push failed:", e);
      pushError({ status: "error", code: (e && e.code) || "unavailable" });
    });
  }, PUSH_DEBOUNCE_MS);
  registerRemoteSync((payload) => {
    if (payload.replace) pendingReplace = true;
    push(payload);
  });
}

/* Where a failed push is reported. Set by the app so a write the member cannot
 * see failing does not pass silently. */
let pushError = () => {};

export function onPushError(fn) {
  pushError = fn || (() => {});
}

/* The pull half: read the member's document and hand it over for merging.
 * Throws on a refused or unreachable read — runPull turns that into a status. */
async function pullRemote(s, user, onRemoteData) {
  if (!onRemoteData) return;
  const { doc, getDoc } = s.dbMod;
  const snap = await getDoc(doc(s.db, "users", user.uid));
  const data = snap.exists() ? snap.data() || {} : {};
  onRemoteData({ progress: data.progress || {}, log: data.log || {}, profile: data.profile || {} });
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
