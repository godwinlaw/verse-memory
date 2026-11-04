/* The service worker: Verse Mastery with no signal.
 *
 * The app is a static tree plus three scripts from a CDN, and a member's record
 * lives in localStorage, so the only thing standing between a phone with no
 * signal and a review sitting is fetching the files. This worker keeps a copy
 * of them and answers from it when the network does not.
 *
 * Two rules keep it simple, and both are deliberate:
 *
 *   Network first. Every request this worker handles goes to the network, and
 *   a good answer is copied into the cache on the way past; the cache is read
 *   only when the network fails. So a member who is online always runs the
 *   build the server is serving, exactly as before this file existed, and there
 *   is no version string to bump and no stale copy to explain. The price is
 *   that online loads are no faster, which is not what this is for.
 *
 *   Only the app's own files and its vendored scripts. Firestore, Google
 *   sign-in and Analytics are never touched: a request to anything but this
 *   origin, unpkg and gstatic is left to the browser, so the worker cannot be
 *   the thing that breaks sync.
 *
 * SHELL is written out by hand because there is no build step to generate it
 * (see CLAUDE.md, "No-build ES modules"); test/offline.test.mjs holds it to the
 * tree, so a module added to src/ without a line here fails a test rather than
 * failing offline. The worker is a classic script, not a module, so the lists
 * are also hung on `self` for that test to read. */

const CACHE = "verse-mastery-shell-v1";

/* Everything index.html and src/main.js reach, relative to the worker. */
const SHELL = [
  "./",
  "./index.html",
  "./config.js",
  "./manifest.webmanifest",
  "./src/styles.css",
  "./src/icon.svg",
  "./src/favicon.ico",
  "./src/icon-192.png",
  "./src/icon-512.png",
  "./src/main.js",
  "./src/App.js",
  "./src/backup.js",
  "./src/blanks.js",
  "./src/categories.js",
  "./src/config.js",
  "./src/copy.js",
  "./src/device.js",
  "./src/dom.js",
  "./src/exam.js",
  "./src/files.js",
  "./src/firebase.js",
  "./src/grading.js",
  "./src/landing.js",
  "./src/offline.js",
  "./src/profile.js",
  "./src/progress.js",
  "./src/recognizer.js",
  "./src/review.js",
  "./src/srs.js",
  "./src/standings.js",
  "./src/storage.js",
  "./src/text.js",
  "./src/theme.js",
  "./src/voice.js",
  "./src/ui/tokens.js",
  "./src/viewmodel/board.js",
  "./src/viewmodel/category.js",
  "./src/viewmodel/chrome.js",
  "./src/viewmodel/exam.js",
  "./src/viewmodel/explainer.js",
  "./src/viewmodel/gate.js",
  "./src/viewmodel/guide.js",
  "./src/viewmodel/index.js",
  "./src/viewmodel/leaderboard.js",
  "./src/viewmodel/learn.js",
  "./src/viewmodel/list.js",
  "./src/viewmodel/review.js",
  "./src/viewmodel/today.js",
  "./src/viewmodel/totals.js",
  "./src/views/auth-gate.js",
  "./src/views/board.js",
  "./src/views/done.js",
  "./src/views/exam-done.js",
  "./src/views/exam-setup.js",
  "./src/views/exam.js",
  "./src/views/explainer.js",
  "./src/views/footer.js",
  "./src/views/guide.js",
  "./src/views/header.js",
  "./src/views/leaderboard.js",
  "./src/views/learn-setup.js",
  "./src/views/list.js",
  "./src/views/mobile-gate.js",
  "./src/views/profile-form.js",
  "./src/views/review-setup.js",
  "./src/views/review.js",
  "./src/views/splash.js",
  "./src/views/sync-gate.js",
  "./src/views/today.js",
  "./src/views/welcome.js",
  "./data/passages.js",
  "./data/keywords.js",
];

/* The three classic scripts index.html loads from the CDN, at the versions it
 * names. The same list as index.html, held to it by the test. */
const VENDOR = [
  "https://unpkg.com/react@18.3.1/umd/react.production.min.js",
  "https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js",
  "https://unpkg.com/htm@3.1.1/dist/htm.umd.js",
];

/* Origins whose responses are worth keeping: the app's own, the CDN above, and
 * gstatic, where firebase.js imports the SDK from. The SDK is not precached,
 * a local-only build never asks for it, but once a signed-in member has loaded
 * it, an offline open can restore their session from it. */
const CACHED_ORIGINS = new Set(["https://unpkg.com", "https://www.gstatic.com"]);

/* Whether a request is this worker's business at all. */
function handles(request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  return url.origin === self.location.origin || CACHED_ORIGINS.has(url.origin);
}

/* Network first, cache on the way past, cache when the network fails. A
 * navigation that fails with nothing cached under its own URL falls back to
 * the page itself, so ./?screen=today still opens with a cold cache for that
 * exact address. */
async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached =
      (await cache.match(request, { ignoreSearch: true })) ||
      (request.mode === "navigate" ? await cache.match("./index.html") : undefined);
    if (cached) return cached;
    throw err;
  }
}

/* Fill the cache. Each file on its own rather than cache.addAll, which is all
 * or nothing: a missing config.js (a local copy with no deploy override) or a
 * CDN that is slow to answer must not stop the worker installing. */
async function precache() {
  const cache = await caches.open(CACHE);
  await Promise.allSettled(
    [...SHELL, ...VENDOR].map(async (url) => {
      const response = await fetch(url);
      if (response.ok) await cache.put(url, response);
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith("verse-mastery-") && k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (!handles(event.request)) return;
  event.respondWith(networkFirst(event.request));
});

/* For test/offline.test.mjs, which runs this file in node with a stub `self`. */
self.VERSE_SW = { CACHE, SHELL, VENDOR, handles, networkFirst };
