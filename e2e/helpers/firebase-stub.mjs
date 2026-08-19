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
 * getDocFromServer,
 * setDoc, collection, getDocs) — if that file starts using something else, the
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

/* Firestore, as far as one member's document and the roster read go. Writes are
 * recorded rather than stored: what a spec wants to know is that the app pushed,
 * and with what. */
const FIRESTORE_MODULE = `
const scenario = () => (window.__E2E_FIREBASE__ || {});

export const getFirestore = () => ({});
export const doc = (db, ...path) => ({ path: path.join("/") });
export const collection = (db, name) => ({ name });

export function setDoc(ref, data, options) {
  (window.__E2E_WRITES__ = window.__E2E_WRITES__ || []).push({ path: ref.path, data, options });
  return Promise.resolve();
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
export function getDocFromServer() {
  const refused = refusal();
  if (refused) return Promise.reject(refused);
  const remote = scenario().remote || null;
  return Promise.resolve({ exists: () => remote != null, data: () => remote });
}

/* A read the rules refuse, or the network cannot make. Shared by both readers so
 * a scenario cannot accidentally refuse one and not the other. */
function refusal() {
  const refused = scenario().refuseReads;
  if (!refused) return null;
  const err = new Error("Missing or insufficient permissions.");
  err.code = typeof refused === "string" ? refused : "permission-denied";
  return err;
}

export function getDoc() {
  const stale = scenario().localView;
  if (stale) return Promise.resolve({ exists: () => true, data: () => stale });

  /* A read the rules refuse. This is the case the app must not mistake for a
   * member with no record — see views/sync-gate.js — so the scenario can ask
   * for it by name rather than only by taking the whole SDK away. */
  const refused = refusal();
  if (refused) return Promise.reject(refused);
  const remote = scenario().remote || null;
  return Promise.resolve({ exists: () => remote != null, data: () => remote });
}

export function getDocs() {
  const rows = scenario().roster || [];
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
