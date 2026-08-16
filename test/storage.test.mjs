import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

import { mergeProgress, mergeLog, storage } from "../src/storage.js";

/* An in-memory stand-in for localStorage. storage.js reads the global lazily
 * inside each guarded access, so installing it after import is enough. */
function stubLocalStorage() {
  const map = new Map();
  globalThis.localStorage = {
    getItem: (k) => (map.has(String(k)) ? map.get(String(k)) : null),
    setItem: (k, v) => map.set(String(k), String(v)),
  };
  return map;
}

test("mergeProgress keeps the most recently reviewed record per verse", () => {
  const local = { 1: { last: 100, hits: 1 }, 2: { last: 500, hits: 2 } };
  const remote = { 1: { last: 300, hits: 2 }, 3: { last: 50, hits: 1 } };
  const merged = mergeProgress(local, remote);
  assert.equal(merged[1].last, 300, "newer remote record wins for verse 1");
  assert.equal(merged[2].last, 500, "local-only verse 2 retained");
  assert.equal(merged[3].last, 50, "remote-only verse 3 adopted");
});

test("mergeLog unions days and keeps the larger count", () => {
  const merged = mergeLog({ "2026-08-13": 3, "2026-08-14": 1 }, { "2026-08-14": 5, "2026-08-15": 2 });
  assert.deepEqual(merged, { "2026-08-13": 3, "2026-08-14": 5, "2026-08-15": 2 });
});

test("merge helpers tolerate null/undefined inputs", () => {
  assert.deepEqual(mergeProgress(null, undefined), {});
  assert.deepEqual(mergeLog(undefined, null), {});
});

test("mergeProgress reconciles a backdated test result on when it was written", () => {
  // A test dates a verse back to the freshness it measured, so `last` alone
  // would make the newer record look like the older one (see srs.testedLast).
  const tested = { 1: { hits: 3, status: "memorized", last: 500, stability: 2, updatedAt: 2000 } };
  const reviewed = { 1: { hits: 2, status: "learning", last: 1000, stability: 4 } };
  assert.equal(mergeProgress(reviewed, tested)[1], tested[1]);
  assert.equal(mergeProgress(tested, reviewed)[1], tested[1]);

  // …and a review after that test wins again, stale stamp carried along or not.
  const after = { 1: { ...tested[1], hits: 4, last: 3000 } };
  assert.equal(mergeProgress(tested, after)[1], after[1]);
});

/* componentDidMount is the one caller no render test reaches, so a store method
 * deleted from under it fails only in the browser (this happened: a missing
 * loadTypeFirstLetter threw on mount). Hold the store to the surface its callers
 * actually name. */
test("every storage.* call in the source exists on the store", () => {
  const dirs = ["src", "src/viewmodel", "src/views"];
  const called = new Map();
  for (const dir of dirs) {
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".js"))) {
      const path = `${dir}/${file}`;
      const src = readFileSync(path, "utf8");
      for (const [, name] of src.matchAll(/\bstorage\.([A-Za-z0-9_]+)\s*\(/g)) {
        if (!called.has(name)) called.set(name, path);
      }
    }
  }
  assert.ok(called.size > 0, "found no storage.* calls — the scan is broken, not the store");
  for (const [name, path] of called) {
    assert.equal(typeof storage[name], "function", `${path} calls storage.${name}(), which the store does not define`);
  }
});

/* Each preference is keyed by a KEYS entry; a missing entry reads and writes
 * `undefined` instead of throwing, so only a round trip catches it. */
test("device-local preferences round-trip through their own keys", () => {
  const map = stubLocalStorage();

  storage.saveTypeFirstLetter(true);
  assert.equal(storage.loadTypeFirstLetter(false), true);
  storage.saveTypeFirstLetter(false);
  assert.equal(storage.loadTypeFirstLetter(true), false);

  storage.saveScrambleLevel(2);
  assert.equal(storage.loadScrambleLevel(1, 4), 2);

  storage.saveBlankHint(true);
  assert.equal(storage.loadBlankHint(false), true);

  assert.ok(!map.has("undefined"), "a preference was written under a missing KEYS entry");
  for (const key of map.keys()) assert.match(key, /^mv\./, `unexpected storage key ${key}`);
});

test("an unset preference falls back, and a corrupt level does too", () => {
  stubLocalStorage();
  assert.equal(storage.loadTypeFirstLetter(true), true);
  assert.equal(storage.loadScrambleLevel(1, 4), 1);

  // A level left by an older build that no longer has that many options.
  storage.saveScrambleLevel(9);
  assert.equal(storage.loadScrambleLevel(1, 4), 1);
});
