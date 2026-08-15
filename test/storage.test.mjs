import test from "node:test";
import assert from "node:assert/strict";

import { mergeProgress, mergeLog } from "../src/storage.js";

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
