/* Firebase authentication + cloud sync.
 *
 * Access is restricted to Google accounts in the Acts 2 Network Workspace
 * domains (see ALLOWED_DOMAINS below). Enforcement is twofold: (1) the client
 * rejects and signs out any account outside those domains, and (2) Firestore
 * security rules (deploy/firestore.rules) allow access only to verified
 * identities in them. Only the second is security, never rely on the client.
 *
 * Once a member is signed in, their progress syncs across devices:
 *   • Firestore stores one document per user at
 *     users/{uid} = { name, email, progress, log, profile }.
 *   • On sign-in we pull the remote doc and hand it back for merging.
 *   • Every local save is debounced and folded into the user's doc, the push
 *     reads before it writes, using the same merges as the pull, so a device
 *     holding an older copy of a verse cannot write it over a newer one.
 *   • The same push also writes standings/{uid}, a small summary of that record
 *     for the leaderboard to read instead of the record itself (see
 *     standings.summarize, and fetchRoster below for why).
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
import { registerRemoteSync, mergeProgress, mergeLog } from "./storage.js";
import { cleanDisplayName, mergeProfile } from "./profile.js";
import { rowFromSummary, summarize } from "./standings.js";

const SDK_VERSION = "11.6.1";
const SDK = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
const PUSH_DEBOUNCE_MS = 800;

/* A push needs the network, see mergeIntoRemote, which reads before it writes.
 * Offline that read simply fails, so a save made on a dropped connection is
 * tried again a few times before the member is told sync is not working. */
const PUSH_RETRIES = 3;
const PUSH_RETRY_MS = 4000;

/* Google Workspace domains permitted to sign in (Acts 2 Network).
 *
 * This list is only half the gate. The authoritative check is in
 * deploy/firestore.rules, adding or removing a domain means editing BOTH and
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

/* Google Analytics, wired as the same kind of optional overlay as sync above:
 * a build with no measurementId (or one where the CDN or the browser itself
 * refuses the SDK, private browsing, an ad/tracker blocker) simply sends no
 * events, and nothing else in the app is allowed to depend on it. Memoized on
 * its own rather than folded into loadServices() so a member who never gets a
 * signed-in session (and so never needs auth/Firestore) still doesn't pay for
 * this import, and so a browser that refuses Analytics doesn't take auth down
 * with it. */
let analyticsPromise = null;

async function loadAnalytics() {
  if (!firebaseConfig || !firebaseConfig.measurementId) return null;
  if (!analyticsPromise) {
    analyticsPromise = (async () => {
      try {
        const [{ app }, analyticsMod] = await Promise.all([loadServices(), import(`${SDK}/firebase-analytics.js`)]);
        if (!(await analyticsMod.isSupported())) return null;
        return { mod: analyticsMod, instance: analyticsMod.getAnalytics(app) };
      } catch (e) {
        console.warn("Firebase Analytics unavailable:", e);
        return null;
      }
    })();
  }
  return analyticsPromise;
}

/* Start Analytics eagerly (rather than waiting for the first logAnalyticsEvent)
 * so the SDK's own automatic page_view/session_start events fire for every
 * member, not only those who go on to log a custom event. Fire-and-forget: the
 * app's boot never waits on this and nothing reads its result. */
export function initAnalytics() {
  loadAnalytics();
}

/* Log a custom Analytics event. Never throws and resolves silently wherever
 * Analytics did not start (see loadAnalytics), callers do not need to know
 * whether Analytics is configured, reachable, or supported in this browser. */
export async function logAnalyticsEvent(name, params) {
  const analytics = await loadAnalytics();
  if (!analytics) return;
  analytics.mod.logEvent(analytics.instance, name, params);
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
 * treat a member whose record it could not read as a member with no record,
 * that is what asks a returning member to sign up again, and what lets the
 * empty profile they then fill in overwrite the real one (see App.render). */
export async function initAuth({ onChange = () => {}, onRemoteData, onSyncChange = () => {} } = {}) {
  /* Two very different situations used to report the same "disabled", and the
   * app then treated both as "run local-only, and hand this member the sign-up
   * form". Only one of them is a decision:
   *
   *   "unconfigured", this build has no Firebase (window.__FIREBASE_CONFIG__ =
   *     null, or a local dev copy). There is no account to sign in to, so a
   *     private record on this device is exactly right and nothing is said.
   *   "unreachable" , there IS a Firebase, but the SDK could not be fetched
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
   * memoizes on success, so a retry that gets through must not leave a second
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
    const pulled = await runPull(pull);
    onSyncChange(pulled);
    /* Deliberately after the read. It is a pending write until the server
     * acknowledges it, and a pending write is part of the local view that
     * pullRemote must not be shown (see there). Nothing depends on it landing
     * first, it exists so the leaderboard has a name for a member who has not
     * filled in a profile. */
    writeIdentity(s, user);
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
 * deploy/firestore.rules are behind ALLOWED_DOMAINS and need redeploying, the
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
 * storage seam. Never throws, a failed write is reported through onPushError so
 * the app can say sync is not working, and the local save stands regardless. */
function registerPush(s, user) {
  const { doc, setDoc } = s.dbMod;
  const userDoc = doc(s.db, "users", user.uid);
  const boardDoc = doc(s.db, "standings", user.uid);
  const identity = { name: cleanDisplayName(user.displayName), email: user.email || "" };

  /* An ordinary save folds into the stored record (see mergeIntoRemote). A wipe
   * (storage.clearProgressAndLog) cannot: folding an emptied map into a stored
   * one deletes nothing, and the next sign-in would pull every wiped verse
   * back. So it writes the document whole, identity included, since nothing
   * outside this payload survives.
   *
   * `pendingReplace` is what survives the debounce. Pushes are coalesced, and a
   * wipe followed by any ordinary save within the window would otherwise go up
   * as that save, a merge, deleting nothing. Once a wipe is waiting, whatever
   * finally fires is a replacement; the payload is read fresh from storage each
   * time, so it is still the current record that gets written. */
  let pendingReplace = false;

  const send = (payload, attempt) => {
    const record = { progress: payload.progress, log: payload.log, profile: payload.profile || {} };
    const replace = pendingReplace;
    pendingReplace = false;
    const write = replace
      ? setDoc(userDoc, { ...identity, ...record, updatedAt: Date.now() }).then(() =>
          setDoc(boardDoc, summarize({ name: identity.name, ...record })),
        )
      : mergeIntoRemote(s, userDoc, boardDoc, record, identity.name);
    write.catch((e) => {
      /* A wipe is an ordinary offline-queued write, so only the merging path is
       * worth retrying: it reads first, and a read is what a dropped connection
       * refuses. The local save stands either way, and the next visit's pull
       * folds it back up (App.hydrateRemote saves what it merged). */
      if (!replace && attempt < PUSH_RETRIES) {
        setTimeout(() => send(payload, attempt + 1), PUSH_RETRY_MS * (attempt + 1));
        return;
      }
      console.warn("Firebase push failed:", e);
      pushError({ status: "error", code: (e && e.code) || "unavailable" });
    });
  };

  const push = debounce((payload) => send(payload, 0), PUSH_DEBOUNCE_MS);
  registerRemoteSync((payload) => {
    if (payload.replace) pendingReplace = true;
    push(payload);
  });
}

/* An ordinary push: fold this device's record into the stored one, in a
 * transaction, rather than writing over it.
 *
 * A push used to be `setDoc(…, { merge: true })` of whatever this device held.
 * That merge is per field, not per record: it leaves alone the keys the payload
 * does not mention, but every key it does mention it overwrites, however old
 * this device's copy of it is. So a device that still had a verse as `learning`
 * pushed that over the commit another device had just made, and because
 * nothing demotes a verse, the two devices then disagreed for good: the one
 * that committed it kept saying committed (reconcile carries `memorized`
 * forward on the way in), while every other device pulled the rollback and
 * pushed it straight back up. A verse committed on one device never reached the
 * others.
 *
 * Reading first is the whole fix, and it uses the same merges the pull does, so
 * the two directions cannot settle a record differently. A transaction is what
 * makes read-then-write safe: Firestore reruns it if the document changed
 * underneath, so two devices saving at once cannot lose one another's work. */
function mergeIntoRemote(s, userDoc, boardDoc, record, name) {
  const { runTransaction } = s.dbMod;
  return runTransaction(s.db, async (tx) => {
    const snap = await tx.get(userDoc);
    const cloud = (snap.exists() && snap.data()) || {};
    const merged = {
      progress: mergeProgress(record.progress, cloud.progress),
      log: mergeLog(record.log, cloud.log),
      profile: mergeProfile(record.profile, cloud.profile),
      updatedAt: Date.now(),
    };
    tx.set(userDoc, mergeable(merged), { merge: true });
    /* The summary is written from the *merged* record, not from this device's
     * payload, otherwise a device that had not caught up yet would publish a
     * board row missing the verses another device committed. It is written
     * whole rather than merged, because it is a derived statement about the
     * record as a whole: folding an old `fresh` into a new one would leave
     * verses on the board that are no longer committed. */
    tx.set(boardDoc, summarize({ name, ...merged }));
  });
}

/* Record the member's identity so the leaderboard can show a name for them
 * before they have filled in a profile. Never throws. */
function writeIdentity(s, user) {
  const { doc, setDoc } = s.dbMod;
  const identity = { name: cleanDisplayName(user.displayName), email: user.email || "" };
  setDoc(doc(s.db, "users", user.uid), identity, { merge: true }).catch((e) =>
    console.warn("Firebase identity write failed:", e),
  );
}

/* The merged record with the empty slices left out.
 *
 * `merge: true` is not "leave everything else alone", it means "write the
 * fields in this payload". For a map with contents that comes to the same
 * thing, because the mask reaches the leaves and the keys not mentioned
 * survive. An **empty** map has no leaves, so the mask names the field itself
 * and the stored map is replaced by nothing.
 *
 * Folding into the stored record (mergeIntoRemote) already keeps a device that
 * has not pulled yet from erasing anything, since `{}` merged into a stored map
 * is that map. This stays because it is the narrower statement and does not
 * depend on the read having succeeded: a slice with nothing in it has nothing
 * to say, so it is simply not sent.
 *
 * The wipe path is untouched: `replace` is a deliberate full write (see
 * storage.clearProgressAndLog), and emptying the record is the whole point of
 * it. */
function mergeable(record) {
  const out = { updatedAt: record.updatedAt };
  for (const key of ["progress", "log", "profile"]) {
    if (record[key] && Object.keys(record[key]).length > 0) out[key] = record[key];
  }
  return out;
}

/* Where a failed push is reported. Set by the app so a write the member cannot
 * see failing does not pass silently. */
let pushError = () => {};

export function onPushError(fn) {
  pushError = fn || (() => {});
}

/* The pull half: read the member's document and hand it over for merging.
 * Throws on a refused or unreachable read, runPull turns that into a status. */
async function pullRemote(s, user, onRemoteData) {
  if (!onRemoteData) return;
  const { doc, getDocFromServer } = s.dbMod;
  /* From the server, deliberately, not getDoc.
   *
   * getDoc answers from Firestore's local view when it can, and that view
   * includes this client's own pending writes. The identity write below is one,
   * so on a cold client the read could come back as a document holding nothing
   * but { name, email }: no progress, no profile. Indistinguishable, to
   * everything downstream, from a member who has never used the app, which is
   * how a new browser asked for a profile that was sitting on the server, and
   * then saved that emptiness over the local copy.
   *
   * There is no cache fallback on purpose. If the server cannot be reached, the
   * honest answer is that the record is unknown, which is what the sync gate is
   * for (see views/sync-gate.js), an answer read off a half-built local view
   * is worse than no answer. */
  const snap = await getDocFromServer(doc(s.db, "users", user.uid));
  const data = snap.exists() ? snap.data() || {} : {};
  onRemoteData({ progress: data.progress || {}, log: data.log || {}, profile: data.profile || {} });
}

/* Read the leaderboard's roster. One row per member, in the shape
 * viewmodel/leaderboard.js ranks: { uid, name, count, freshnessScore, streak }
 * plus the three profile fields it filters and groups by.
 *
 * It reads the `standings` collection, the small per-member summaries the push
 * above keeps, rather than the members' records themselves. That is the whole
 * point of those summaries: this is the one read in the app whose cost grows
 * with the size of the group, and it used to pull every verse of every member's
 * progress and every day of their log to arrive at three numbers each. See
 * standings.summarize for the shape and why freshness is still computed here
 * rather than stored.
 *
 * Falling back to the full scan when `standings` is empty is for exactly one
 * day: the one this ships on, before any member has pushed. A member's summary
 * is written by their first save, and a sign-in that pulls saves what it
 * merged, so the collection fills as members open the app, and the board is
 * whole again once each of them has. Note that a member who has not been back
 * since then would have been on the board with stale figures anyway.
 *
 * Resolves to [] when Firebase is unconfigured or the read is refused (e.g.
 * before sign-in), so the UI degrades to a solo board rather than erroring. */
export async function fetchRoster(now = Date.now()) {
  if (!isFirebaseConfigured()) return [];
  let s;
  try {
    s = await loadServices();
  } catch {
    return [];
  }
  const { collection, getDocs } = s.dbMod;
  try {
    const snap = await getDocs(collection(s.db, "standings"));
    const rows = [];
    snap.forEach((d) => rows.push({ uid: d.id, ...rowFromSummary(d.data() || {}, now) }));
    return rows.length ? rows : await fetchRosterFromRecords(s, now);
  } catch (e) {
    console.warn("Roster fetch failed:", e);
    return [];
  }
}

/* The old read, kept only as the fallback fetchRoster describes: every member's
 * whole record, summarised on arrival. Throws like any other failed read, so
 * fetchRoster's own catch reports it. */
async function fetchRosterFromRecords(s, now) {
  const { collection, getDocs } = s.dbMod;
  const snap = await getDocs(collection(s.db, "users"));
  const rows = [];
  snap.forEach((d) => {
    const data = d.data() || {};
    const summary = summarize({
      name: data.name || data.email || "",
      profile: data.profile,
      progress: data.progress,
      log: data.log,
      now,
    });
    rows.push({ uid: d.id, ...rowFromSummary(summary, now) });
  });
  return rows;
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
