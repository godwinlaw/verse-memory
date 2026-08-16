import test from "node:test";
import assert from "node:assert/strict";

import { seededShuffle, modeByKey, MODES, scrambleScore, SCRAMBLE_MISS_COST } from "../src/review.js";

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

test("scrambleScore marks how much was rebuilt", () => {
  assert.equal(scrambleScore(0, 8), 0);
  assert.equal(scrambleScore(4, 8), 0.5);
  assert.equal(scrambleScore(8, 8), 1);
  assert.equal(scrambleScore(0, 0), 0, "a passage with no chunks scores nothing rather than dividing by zero");
});

test("scrambleScore charges for every chunk tried in the wrong place", () => {
  assert.equal(scrambleScore(8, 8, 2), 1 - 2 * SCRAMBLE_MISS_COST);
  assert.ok(scrambleScore(8, 8, 1) < scrambleScore(8, 8, 0), "guessing costs");
  assert.equal(scrambleScore(8, 8, 100), 0, "and cannot take the mark below zero");
});
