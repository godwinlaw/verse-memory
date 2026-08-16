/* The review-setup view-model: what a review session targets before it starts.
 *
 * Pure function of (state, progress reader, actions), so — like the other
 * view-model tests — nothing is mounted. A fixed `now` keeps freshness stable
 * without touching the global clock. */

import test from "node:test";
import assert from "node:assert/strict";

import { progressReader } from "../src/progress.js";
import { reviewSetupVals } from "../src/viewmodel/review.js";

const NOW = new Date("2026-08-15T12:00:00.000Z").getTime();
const daysAgo = (n) => NOW - n * 86400000;

/* Build the view-model for a state, capturing what its callbacks would do. */
function build(state) {
  const capture = {};
  const actions = {
    startReviewSession: (ids) => (capture.startedIds = ids),
    setReviewSetup: (patch) => (capture.setup = { ...(capture.setup || {}), ...patch }),
    goto: (view) => (capture.goto = view),
  };
  const prog = progressReader(state.progress, NOW);
  return { v: reviewSetupVals({ state, prog, actions }), capture };
}

const stateOf = (passages, progress, over = {}) => ({
  passages,
  progress,
  profile: {},
  reviewSetup: { manualSize: 10, manualFreshness: 50, ...over },
});

test("building the view-model does not reorder state.passages", () => {
  // Distinct retrievabilities, deliberately out of stalest-first order, so a
  // sort in place (the bug this guards) would visibly rewrite the array.
  const passages = [{ id: 3 }, { id: 1 }, { id: 2 }];
  const progress = {
    3: { hits: 4, status: "memorized", last: daysAgo(0), stability: 20 }, // ~100%
    2: { hits: 2, status: "learning", last: daysAgo(2), stability: 5 }, // ~67%
    // id 1 never reviewed → 0%
  };
  const before = passages.map((p) => p.id);
  build(stateOf(passages, progress));
  assert.deepEqual(
    passages.map((p) => p.id),
    before,
    "state.passages must keep its original order",
  );
});

test("defaults to the due queue when verses are due", () => {
  // ids 1 and 2 never reviewed → due and 0% fresh; id 3 fully fresh & committed.
  const passages = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const progress = { 3: { hits: 4, status: "memorized", last: daysAgo(0), stability: 20 } };
  const { v, capture } = build(stateOf(passages, progress));

  assert.equal(v.reviewHasDue, true);
  assert.equal(v.reviewSetupCanStart, true);
  assert.match(v.reviewSetupNote, /due right now/);

  v.startReviewSession();
  // id 3 is left out because it is fresh / not due — the due queue applies no
  // committed-status filter (a faded committed verse would appear here too).
  assert.deepEqual(capture.startedIds, [1, 2], "the due queue drives the session");
});

test("caps the due queue at the profile's Top X", () => {
  const passages = [1, 2, 3, 4, 5].map((id) => ({ id })); // all never reviewed → all due
  const state = { ...stateOf(passages, {}), profile: { dueTopX: 3, dueFreshness: 50 } };
  const { v, capture } = build(state);

  v.startReviewSession();
  assert.equal(capture.startedIds.length, 3, "only the top 3 due verses are reviewed");
});

test("surfaces manual selection only once the due queue is empty", () => {
  // No verse is due-and-below-50: one committed & fully fresh, two uncommitted
  // but sitting above the 50% due threshold (so the board considers them caught
  // up) — exactly the case where manual review takes over.
  const passages = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const progress = {
    1: { hits: 4, status: "memorized", last: daysAgo(0), stability: 20 }, // ~100%, committed
    2: { hits: 2, status: "learning", last: daysAgo(1), stability: 5 }, // ~82%
    3: { hits: 2, status: "learning", last: daysAgo(1), stability: 5 }, // ~82%
  };
  const { v: capped } = build(stateOf(passages, progress, { manualFreshness: 50 }));
  assert.equal(capped.reviewHasDue, false, "nothing is due");
  assert.equal(capped.reviewSetupCanStart, false, "and the 50% ceiling excludes the 82% verses");

  // Raise the ceiling and the two uncommitted verses become reviewable.
  const { v, capture } = build(stateOf(passages, progress, { manualFreshness: 90 }));
  assert.equal(v.reviewHasDue, false);
  assert.equal(v.reviewSetupCanStart, true);
  assert.match(v.reviewSetupNote, /uncommitted/);

  v.startReviewSession();
  assert.deepEqual(capture.startedIds, [2, 3], "manual selection targets uncommitted verses under the ceiling");
});

test("caps the manual pool at the chosen size when the pool is larger", () => {
  // Eight uncommitted verses at ~82% — above the 50% due threshold, so nothing
  // is due (caught up), but all match a raised ceiling. Size 5 must truncate.
  const passages = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => ({ id }));
  const progress = Object.fromEntries(
    passages.map((p) => [p.id, { hits: 2, status: "learning", last: daysAgo(1), stability: 5 }]),
  );
  const { v, capture } = build(stateOf(passages, progress, { manualSize: 5, manualFreshness: 90 }));
  assert.equal(v.reviewHasDue, false);

  v.startReviewSession();
  assert.equal(capture.startedIds.length, 5, "the manual pool is sliced to the chosen size");
});

test("the freshness ceiling is inclusive of a verse sitting exactly on it", () => {
  const passages = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const progress = {
    1: { hits: 4, status: "memorized", last: daysAgo(0), stability: 20 }, // ~100%, committed → keeps due queue empty
    2: { hits: 2, status: "learning", last: daysAgo(1), stability: 5 }, // exactly 82%
    3: { hits: 2, status: "learning", last: daysAgo(1), stability: 10 }, // ~90%, above the ceiling
  };
  const { v, capture } = build(stateOf(passages, progress, { manualFreshness: 82 }));
  assert.equal(v.reviewHasDue, false);

  v.startReviewSession();
  assert.deepEqual(capture.startedIds, [2], "82% is included at a ceiling of 82; 90% is not");
});

test("a size of 0 means all matching verses, not none", () => {
  const passages = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const progress = {
    2: { hits: 2, status: "learning", last: daysAgo(1), stability: 5 }, // ~82%
    3: { hits: 2, status: "learning", last: daysAgo(1), stability: 5 }, // ~82%
    // id 1 never reviewed → due, keeps the due queue non-empty on its own,
    // so give it a fresh committed record to force the manual path.
    1: { hits: 4, status: "memorized", last: daysAgo(0), stability: 20 },
  };
  const { v, capture } = build(stateOf(passages, progress, { manualSize: 0, manualFreshness: 90 }));
  assert.equal(v.reviewHasDue, false);

  v.startReviewSession();
  assert.deepEqual(capture.startedIds, [2, 3], '"All" reviews every matching verse');
});
