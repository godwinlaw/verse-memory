/* A stand-in for the Firebase SDK, served over the wire.
 *
 * src/firebase.js loads the modular SDK from the gstatic CDN by dynamic import,
 * which is exactly the seam a browser test can take over: the three modules are
 * fulfilled from the strings below instead, so the whole gate — sign in, a
 * refused domain, remote progress merged into local, signing out — runs against
 * the app's real code path with no Google account and no network.
 *
 * The stub is only ever as wide as src/firebase.js asks for. Its surface is
 * exactly the imports named there (initializeApp; getAuth, onAuthStateChanged,
 * signOut, GoogleAuthProvider, signInWithPopup; getFirestore, doc, getDoc,
 * getDocFromServer, setDoc, runTransaction, collection, getDocs) — if that file starts using something else, the
 * stub fails loudly rather than pretending.
 *
 * The scenario is not baked into the modules: they read window.__E2E_FIREBASE__,
 * which the harness sets per test. Every document written lands in
 * window.__E2E_WRITES__, so a spec can assert that a session actually pushed. */

/* Two accounts, either side of the domain gate in src/firebase.js. The trailing
 * "(Berk)" is the Workspace campus tag cleanDisplayName() is meant to strip. */
export const MEMBER = {
  uid: "u-ada",
  email: "ada@acts2.network",
  displayName: "Ada Lovelace (Berk)",
  photoURL: null,
};

export const OUTSIDER = {
  uid: "u-outside",
  email: "someone@gmail.com",
  displayName: "Someone Else",
  photoURL: null,
};

/* A Firebase web config shaped like the real one. Only its presence matters —
 * isFirebaseConfigured() is what decides whether the app tries to sign in. */
export const STUB_CONFIG = {
  apiKey: "e2e-key",
  authDomain: "e2e.firebaseapp.com",
  projectId: "e2e",
  storageBucket: "e2e.appspot.com",
  messagingSenderId: "0",
  appId: "1:0:web:e2e",
};

const APP_MODULE = `
export const initializeApp = (config) => ({ config });
`;

/* The auth module holds the one auth object, so the observer registered at
 * startup and the popup the member presses later are talking about the same
 * session. Notifications are synchronous, which fixes the one ordering that
 * matters: src/firebase.js signs a refused account out and *then* throws, so the
 * "denied" the app sets from the throw must land after the sign-out. */
const AUTH_MODULE = `
const scenario = () => (window.__E2E_FIREBASE__ || {});

const auth = { currentUser: null, _observers: [] };
let started = false;

const notify = () => auth._observers.forEach((cb) => cb(auth.currentUser));

export const getAuth = () => auth;

export function onAuthStateChanged(a, cb) {
  a._observers.push(cb);
  if (!started) {
    started = true;
    a.currentUser = scenario().session || null;
  }
  // The real SDK answers asynchronously, and App.js leans on that: the splash is
  // up until it does.
  Promise.resolve().then(() => cb(a.currentUser));
  return () => {
    a._observers = a._observers.filter((x) => x !== cb);
  };
}

export function signOut(a) {
  a.currentUser = null;
  notify();
  return Promise.resolve();
}

export class GoogleAuthProvider {
  setCustomParameters() {}
}

export function signInWithPopup(a) {
  const popup = scenario().popup;
  if (popup === "error") return Promise.reject(new Error("auth/popup-closed-by-user"));
  a.currentUser = popup || null;
  notify();
  return Promise.resolve({ user: a.currentUser });
}
`;

/* Firestore, as far as one member's document and the roster read go.
 *
 * The document is really stored (window.__E2E_DOC__, seeded from the scenario's
 * `remote`), because the thing under test is now a read-modify-write: an
 * ordinary push folds this device's record into the stored one. A stub that
 * only recorded writes could not tell a push that merges from a push that
 * flattens. Writes are still recorded in window.__E2E_WRITES__ as well, so a
 * spec can assert what went up and not only what came to rest. */
const FIRESTORE_MODULE = `
const scenario = () => (window.__E2E_FIREBASE__ || {});

export const getFirestore = () => ({});
export const doc = (db, ...path) => ({ path: path.join("/") });
export const collection = (db, name) => ({ name });

const isMap = (v) => v != null && typeof v === "object" && !Array.isArray(v);

/* The stored document, seeded once from the scenario so that a spec setting
 * only \`remote\` behaves as it always did.
 *
 * It lives in sessionStorage rather than on window for the same reason the
 * seeded localStorage does (see helpers/app.mjs): a reload is a real second
 * visit, and a cloud that evaporated when the page reloaded could not answer
 * the question the reload is asking. */
const DOC_KEY = "e2e:doc";

/* Keyed by path, because a push now writes two documents: the member's record
 * and the small summary the leaderboard reads (see src/standings.js). A single
 * slot would have the second land on top of the first. Only the record is
 * seeded from the scenario — a summary is derived, never authored. */
const RECORD = "users";

function docs() {
  const raw = sessionStorage.getItem(DOC_KEY);
  if (raw != null) return JSON.parse(raw);
  const seeded = { [RECORD]: scenario().remote || null };
  sessionStorage.setItem(DOC_KEY, JSON.stringify(seeded));
  return seeded;
}

const pathKey = (ref) => String((ref && ref.path) || RECORD).split("/")[0];

function store(ref) {
  const all = docs();
  const key = pathKey(ref);
  return key in all ? all[key] : null;
}

function put(ref, doc) {
  const all = docs();
  all[pathKey(ref)] = doc == null ? null : doc;
  sessionStorage.setItem(DOC_KEY, JSON.stringify(all));
}

/* setDoc's merge is a field mask, and modelling it exactly is the point: for a
 * map with contents the mask reaches the leaves, so keys not mentioned survive;
 * an empty map has no leaves, so the mask names the field itself and the stored
 * map is replaced by nothing. That asymmetry is what mergeable() in
 * src/firebase.js exists for. */
function applyMerge(target, payload) {
  const out = { ...(target || {}) };
  for (const key of Object.keys(payload)) {
    const value = payload[key];
    if (isMap(value)) {
      out[key] = Object.keys(value).length === 0 ? {} : applyMerge(isMap(out[key]) ? out[key] : {}, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function commit(ref, data, options) {
  (window.__E2E_WRITES__ = window.__E2E_WRITES__ || []).push({ path: ref.path, data, options });
  put(ref, options && options.merge ? applyMerge(store(ref), data) : data);
}

export function setDoc(ref, data, options) {
  commit(ref, data, options);
  return Promise.resolve();
}

const snapshot = (ref) => {
  const doc = store(ref);
  return { exists: () => doc != null, data: () => doc };
};

/* A read-modify-write, as the push makes it. The updateFunction runs against
 * what is stored now, and its writes land only if it resolves — which is what
 * lets a spec change the document underneath and assert the push folded into
 * the change rather than over it. */
export function runTransaction(db, updateFunction) {
  const pending = [];
  const tx = {
    get: (ref) => {
      const refused = refusal();
      return refused ? Promise.reject(refused) : Promise.resolve(snapshot(ref));
    },
    set: (ref, data, options) => {
      pending.push({ ref, data, options });
      return tx;
    },
  };
  return Promise.resolve()
    .then(() => updateFunction(tx))
    .then(() => {
      for (const w of pending) commit(w.ref, w.data, w.options);
    });
}

/* The initial pull uses getDocFromServer, never getDoc.
 *
 * Firestore's getDoc can answer from the local view, which includes this
 * client's own pending writes — so on a cold client it can return a document
 * holding only the identity write, with no progress and no profile. The
 * scenario's localView is that situation: what getDoc would hand back, as
 * distinct from what is really stored. A scenario that sets it is asserting
 * that the app reads the server, because reading the local view is
 * indistinguishable from being a new member. */
export function getDocFromServer(ref) {
  const refused = refusal();
  if (refused) return Promise.reject(refused);
  return Promise.resolve(snapshot(ref));
}

/* A read the rules refuse, or the network cannot make. Shared by every reader
 * so a scenario cannot accidentally refuse one and not the others. */
function refusal() {
  const refused = scenario().refuseReads;
  if (!refused) return null;
  const err = new Error("Missing or insufficient permissions.");
  err.code = typeof refused === "string" ? refused : "permission-denied";
  return err;
}

export function getDoc(ref) {
  const stale = scenario().localView;
  if (stale) return Promise.resolve({ exists: () => true, data: () => stale });

  const refused = refusal();
  if (refused) return Promise.reject(refused);
  return Promise.resolve(snapshot(ref));
}

/* A collection read, of which the app makes exactly two — the leaderboard's
 * scan of \`standings\`, and the fallback scan of \`users\` it makes only while
 * that collection is empty (see src/firebase.js, fetchRoster). Answered by
 * name, so a scenario chooses which of the two the board is reading by which
 * of \`standings\` / \`roster\` it sets. */
export function getDocs(ref) {
  const s = scenario();
  const rows = ((ref && ref.name) === "standings" ? s.standings : s.roster) || [];
  return Promise.resolve({
    forEach: (fn) => rows.forEach((r, i) => fn({ id: r.uid || "peer-" + i, data: () => r })),
  });
}
`;

const MODULES = {
  "firebase-app.js": APP_MODULE,
  "firebase-auth.js": AUTH_MODULE,
  "firebase-firestore.js": FIRESTORE_MODULE,
};

/* Serve the stub in place of the CDN.
 *
 * `mode` is what the network does rather than what the SDK says:
 *   "stub"        — the modules above (the default);
 *   "unreachable" — the import fails, which is the app's local-only fallback;
 *   "hang"        — the import never answers, which is what SPLASH_MAX_MS is for. */
export async function installFirebaseStub(page, { mode = "stub" } = {}) {
  await page.route("https://www.gstatic.com/firebasejs/**", async (route) => {
    if (mode === "unreachable") return route.abort("failed");
    if (mode === "hang") {
      // Long enough that nothing in the suite outlives it; the request is
      // abandoned when the page closes.
      await new Promise((resolve) => setTimeout(resolve, 60_000));
      return route.abort("failed").catch(() => {});
    }
    const file = new URL(route.request().url()).pathname.split("/").pop();
    const body = MODULES[file];
    if (!body) return route.fulfill({ status: 404, body: `no stub for ${file}` });
    return route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body });
  });
}
