/* The installable half: sw.js, manifest.webmanifest and the lines in index.html
 * that point at them.
 *
 * There is no build step to generate the worker's file list, so it is written
 * by hand, and this is what holds it to the tree: a module added to src/
 * without a line in SHELL would load fine online and fail the first time the
 * app was opened with no signal, which is exactly when nobody is watching. */

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";

import { offlineSupported, registerOffline, SW_PATH } from "../src/offline.js";

const ROOT = new URL("../", import.meta.url).pathname;
const read = (file) => readFileSync(join(ROOT, file), "utf8");

/* Every file under a directory, as the worker would name it. */
function tree(dir) {
  const out = [];
  for (const entry of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${entry}`;
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...tree(rel));
    else out.push("./" + rel);
  }
  return out;
}

/* Run sw.js in a stub worker: no caches, no network, just a `self` to hang
 * its listeners and its lists on. */
function loadWorker({ fetch, caches } = {}) {
  const listeners = {};
  const self = {
    location: { origin: "https://verses.example" },
    addEventListener: (name, fn) => (listeners[name] = fn),
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() },
  };
  const context = { self, fetch, caches, URL, Response, console, Promise };
  runInNewContext(read("sw.js"), context);
  return { sw: self.VERSE_SW, listeners };
}

test("the worker lists every file the app ships", () => {
  const { sw } = loadWorker();
  const shipped = [...tree("src"), ...tree("data")];
  for (const file of shipped) assert.ok(sw.SHELL.includes(file), `${file} is not in sw.js SHELL`);
  for (const entry of sw.SHELL) {
    if (entry === "./" || entry === "./config.js") continue; // served by the host, not in the tree
    assert.ok(
      shipped.includes(entry) || ["./index.html", "./manifest.webmanifest"].includes(entry),
      `sw.js SHELL names ${entry}, which is not in the tree`,
    );
  }
});

test("the worker's vendored scripts are the ones index.html loads, at the same versions", () => {
  const { sw } = loadWorker();
  const html = read("index.html");
  const scripts = [...html.matchAll(/<script src="(https:\/\/unpkg\.com\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(scripts.length >= 3, "index.html loads the CDN scripts");
  // Spread: the worker's array was made in another realm, and deepEqual is
  // strict about prototypes.
  assert.deepEqual([...sw.VENDOR], scripts);
});

test("the worker only handles the app's own files and its vendored origins", () => {
  const { sw } = loadWorker();
  const get = (url, mode) => ({ method: "GET", url, mode });
  assert.equal(sw.handles(get("https://verses.example/src/App.js")), true);
  assert.equal(sw.handles(get("https://verses.example/?screen=today", "navigate")), true);
  assert.equal(sw.handles(get("https://unpkg.com/react@18.3.1/umd/react.production.min.js")), true);
  assert.equal(sw.handles(get("https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js")), true);
  // Firestore, sign-in and Analytics are left to the browser.
  assert.equal(sw.handles(get("https://firestore.googleapis.com/v1/projects/x")), false);
  assert.equal(sw.handles(get("https://accounts.google.com/o/oauth2")), false);
  assert.equal(sw.handles({ method: "POST", url: "https://verses.example/anything" }), false);
});

/* A cache the worker can be run against. */
function fakeCaches() {
  const store = new Map();
  const cache = {
    put: async (key, response) => store.set(typeof key === "string" ? key : key.url, response),
    match: async (key, opts = {}) => {
      const url = typeof key === "string" ? key : key.url;
      if (store.has(url)) return store.get(url);
      if (opts.ignoreSearch) {
        const bare = url.split("?")[0];
        for (const [k, v] of store) if (k.split("?")[0] === bare) return v;
      }
      return undefined;
    },
  };
  return { caches: { open: async () => cache, keys: async () => [], delete: async () => true }, store };
}

test("online, the network answers and the copy goes in the cache on the way past", async () => {
  const { caches, store } = fakeCaches();
  const fetch = async () => new Response("fresh", { status: 200 });
  const { sw } = loadWorker({ fetch, caches });
  const response = await sw.networkFirst({ url: "https://verses.example/src/App.js", method: "GET" });
  assert.equal(await response.text(), "fresh");
  assert.ok(store.has("https://verses.example/src/App.js"), "cached for next time");
});

test("a bad answer is handed on but not kept", async () => {
  const { caches, store } = fakeCaches();
  const fetch = async () => new Response("", { status: 404 });
  const { sw } = loadWorker({ fetch, caches });
  const response = await sw.networkFirst({ url: "https://verses.example/config.js", method: "GET" });
  assert.equal(response.status, 404);
  assert.equal(store.size, 0);
});

test("offline, the cache answers, and a navigation falls back to the page itself", async () => {
  const { caches, store } = fakeCaches();
  store.set("https://verses.example/src/App.js", new Response("cached app"));
  store.set("./index.html", new Response("cached page"));
  const fetch = async () => {
    throw new TypeError("Failed to fetch");
  };
  const { sw } = loadWorker({ fetch, caches });

  const file = await sw.networkFirst({ url: "https://verses.example/src/App.js", method: "GET" });
  assert.equal(await file.text(), "cached app");

  const page = await sw.networkFirst({ url: "https://verses.example/?screen=today", method: "GET", mode: "navigate" });
  assert.equal(await page.text(), "cached page", "an address never cached still opens the app");

  await assert.rejects(
    sw.networkFirst({ url: "https://verses.example/src/missing.js", method: "GET" }),
    /Failed to fetch/,
    "a file never cached fails the way the network did",
  );
});

test("installing fills the cache one file at a time, so one missing file does not stop it", async () => {
  const { caches, store } = fakeCaches();
  // The deploy override is the one file a local copy is allowed not to have.
  const fetch = async (url) => new Response(url, { status: url === "./config.js" ? 404 : 200 });
  const { sw, listeners } = loadWorker({ fetch, caches });
  let done;
  listeners.install({ waitUntil: (p) => (done = p) });
  await done;
  assert.ok(store.size >= sw.SHELL.length + sw.VENDOR.length - 1);
  assert.ok(!store.has("./config.js"), "the 404 was not kept");
  assert.ok(store.has("./index.html"));
});

/* ── the manifest, and the page that points at it ─────────────────────────── */

test("the manifest opens on Today and names icons that exist", () => {
  const manifest = JSON.parse(read("manifest.webmanifest"));
  assert.equal(manifest.start_url, "./?screen=today");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.name, "Verse Mastery");
  for (const icon of manifest.icons) {
    assert.doesNotThrow(() => statSync(join(ROOT, icon.src)), `${icon.src} is missing`);
  }
  const sizes = manifest.icons.map((i) => i.sizes);
  assert.ok(sizes.includes("192x192") && sizes.includes("512x512"), "the two sizes launchers ask for");
});

test("index.html links the manifest and the worker is registered from the entry point", () => {
  const html = read("index.html");
  assert.match(html, /<link rel="manifest" href="\.\/manifest\.webmanifest" \/>/);
  assert.match(html, /<meta name="theme-color" content="#1d2d3d" \/>/);
  assert.match(html, /apple-touch-icon/);
  assert.match(read("src/main.js"), /registerOffline\(\)/);
  assert.equal(SW_PATH, "./sw.js");
});

test("both deploy manifests ship the worker and the manifest", () => {
  for (const file of ["scripts/build.mjs", "Dockerfile"]) {
    const text = read(file);
    assert.match(text, /sw\.js/, `${file} does not ship sw.js`);
    assert.match(text, /manifest\.webmanifest/, `${file} does not ship the manifest`);
  }
});

/* ── the seam ─────────────────────────────────────────────────────────────── */

test("a browser with no service workers is simply the app as it was", async () => {
  assert.equal(offlineSupported(undefined), false);
  assert.equal(offlineSupported({ navigator: {} }), false);
  assert.equal(await registerOffline(undefined), null);
  assert.equal(await registerOffline({ navigator: {} }), null);
});

test("the seam registers the worker at the root, and a refusal is not an error", async () => {
  const calls = [];
  const win = {
    navigator: {
      serviceWorker: {
        register: (path, opts) => {
          calls.push([path, opts]);
          return Promise.resolve({ scope: "/" });
        },
      },
    },
  };
  assert.deepEqual(await registerOffline(win), { scope: "/" });
  assert.deepEqual(calls, [["./sw.js", { updateViaCache: "none" }]]);

  const refusing = { navigator: { serviceWorker: { register: () => Promise.reject(new Error("blocked")) } } };
  assert.equal(await registerOffline(refusing), null);
  const throwing = {
    navigator: {
      serviceWorker: {
        register: () => {
          throw new Error("no");
        },
      },
    },
  };
  assert.equal(await registerOffline(throwing), null);
});
