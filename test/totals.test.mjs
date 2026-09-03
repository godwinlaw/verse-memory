/* The set-wide arithmetic behind the board's hero figures and the leaderboard.
 *
 * The one thing worth pinning down here is the split between two counts that
 * used to be one. The goal is a single category, the deadline was set against
 * the core verses, and folding the other shelves into the denominator would
 * drop every member's percentage without anyone forgetting a word, while the
 * leaderboard ranks on everything a member holds. Getting those the wrong way
 * round is silent: both are plausible numbers. */

import test from "node:test";
import assert from "node:assert/strict";

import { deriveTotals } from "../src/viewmodel/totals.js";
import { committed, learning, NOW } from "./helpers/setup-fixtures.mjs";

const DEADLINE = "2026-12-31";
const NOW_DATE = new Date(NOW);

/* Three core verses and two psalms. */
const PASSAGES = [
  { id: 1, category: "core" },
  { id: 2, category: "core" },
  { id: 3, category: "core" },
  { id: 4, category: "psalms" },
  { id: 5, category: "psalms" },
];

const totals = (progress) => deriveTotals({ passages: PASSAGES, progress, deadline: DEADLINE, now: NOW_DATE });

test("the goal is the goal category, not the size of the set", () => {
  const t = totals({});
  assert.equal(t.goal, 3);
  assert.equal(t.totalCount, 5);
});

test("a passage with no category of its own counts towards the goal", () => {
  // Every record predates categories existing, and all of them were the goal.
  const t = deriveTotals({ passages: [{ id: 1 }, { id: 2 }], progress: {}, deadline: DEADLINE, now: NOW_DATE });
  assert.equal(t.goal, 2);
});

test("committing outside the goal moves the leaderboard figure but not the board's", () => {
  const t = totals({ 4: committed(0), 5: committed(0) });
  // Two psalms committed: real work, and it counts where members are compared.
  assert.equal(t.committedAll, 2);
  // But the board still reads 0 of 3, the deadline is about the core verses,
  // and claiming progress against it would be a lie about a different set.
  assert.equal(t.memorized, 0);
  assert.equal(t.pctLabel, "0%");
  assert.equal(t.remaining, 3);
});

test("committing inside the goal moves both", () => {
  const t = totals({ 1: committed(0), 4: committed(0) });
  assert.equal(t.memorized, 1);
  assert.equal(t.committedAll, 2);
  assert.equal(t.pctLabel, "33%");
});

test("in-progress verses outside the goal are not counted as goal progress", () => {
  const t = totals({ 1: learning(1), 5: learning(1) });
  assert.equal(t.learning, 1);
  assert.equal(t.remaining, 2);
});

test("the weekly pace is what is left of the goal, not of the whole set", () => {
  const far = deriveTotals({
    passages: PASSAGES,
    progress: {},
    deadline: DEADLINE,
    // Exactly three weeks out, so the pace is a figure worth asserting.
    now: new Date(new Date(DEADLINE + "T23:59:59").getTime() - 21 * 86400000),
  });
  assert.equal(far.daysLeft, 21);
  assert.equal(far.perWeek, 1); // three core verses over three weeks
});
