import test from "node:test";
import assert from "node:assert/strict";

import { seededShuffle, modeByKey, MODES } from "../src/review.js";

test("seededShuffle is a permutation of the input", () => {
  const items = ["a", "b", "c", "d", "e"];
  const shuffled = seededShuffle(items, 42).map((x) => x.v);
  assert.deepEqual([...shuffled].sort(), [...items].sort());
});

test("seededShuffle is deterministic for a given seed", () => {
  const items = ["a", "b", "c", "d", "e"];
  const a = seededShuffle(items, 7).map((x) => x.v);
  const b = seededShuffle(items, 7).map((x) => x.v);
  assert.deepEqual(a, b);
});

test("seededShuffle differs across seeds", () => {
  const items = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const a = seededShuffle(items, 1).map((x) => x.v);
  const b = seededShuffle(items, 2).map((x) => x.v);
  assert.notDeepEqual(a, b);
});

test("modeByKey falls back to MODES[0] for an unknown key", () => {
  assert.equal(modeByKey("blanks").key, "blanks");
  assert.equal(modeByKey("nonsense"), MODES[0]);
  assert.equal(modeByKey(undefined), MODES[0]);
});
