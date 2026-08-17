/* The review-setup view-model: what a review session targets before it starts.
 *
 * Review is the upkeep half of the app. It draws only on verses already
 * committed, and only those faded past the member's threshold — everything else
 * is a learn session's job (see test/learn-setup.test.mjs), and several of these
 * tests are really about that boundary.
 *
 * Pure function of (state, actions), so — like the other view-model tests —
 * nothing is mounted. A fixed `now` keeps freshness stable without touching the
 * global clock.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_DUE_FRESHNESS } from "../src/profile.js";
import { reviewSetupVals } from "../src/viewmodel/review.js";
import { committed, learning, stateOf, NOW } from "./helpers/setup-fixtures.mjs";

/* Build the view-model for a state, capturing what its callbacks would do.
 * Pinned to the fixture's NOW — reviewSetupVals defaults to Date.now(), which
 * would let these freshness figures drift, and quietly wrong, with the wall
 * clock (see reviewPool()'s ceiling being read against the real time this
 * once caught). */
function build(state) {
  const capture = {};
  const actions = {
    startReviewSession: (ids) => (capture.startedIds = ids),
    setReviewSetup: (patch) => (capture.setup = { ...(capture.setup || {}), ...patch }),
    goto: (view) => (capture.goto = view),
  };
  return { v: reviewSetupVals({ state, actions, now: NOW }), capture };
}

test("building the view-model does not reorder state.passages", () => {
  // Distinct retrievabilities, deliberately out of stalest-first order, so a
  // sort in place (the bug this guards) would visibly rewrite the array.
  const passages = [{ id: 3 }, { id: 1 }, { id: 2 }];
  const before = passages.map((p) => p.id);
  build(stateOf(passages, { 3: committed(0), 2: committed(20) }));
  assert.deepEqual(
    passages.map((p) => p.id),
    before,
    "state.passages must keep its original order",
  );
});

test("a member with nothing committed has nothing to review", () => {
  const { v } = build(stateOf([{ id: 1 }, { id: 2 }], {}));

  assert.equal(v.reviewHasDue, false);
  assert.equal(v.reviewNothingCommitted, true);
  assert.equal(v.reviewSetupCanStart, false, "never-reviewed verses are not review material");
  assert.match(v.reviewSetupTarget, /not committed a verse yet/);
});

test("the review queue is the committed verses faded past the threshold", () => {
  const passages = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const progress = {
    1: committed(30), // ~22%
    2: committed(10), // ~61%
    3: committed(0), // ~100%, holding fine
  };
  const { v, capture } = build(stateOf(passages, progress));

  assert.equal(v.reviewHasDue, true);
  assert.match(v.reviewSetupNote, /due right now/);
  assert.match(v.reviewSetupTarget, new RegExp(String(DEFAULT_DUE_FRESHNESS) + "%"));

  v.startReviewSession();
  assert.deepEqual(capture.startedIds, [1, 2], "stalest first, and the fresh one is left alone");
});

test("an uncommitted verse is never review material, however faded", () => {
  // The old model reviewed whatever was stalest, which meant never-reviewed
  // verses. Learning those is now a learn session's job.
  const passages = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const progress = {
    1: committed(30), // ~22%, committed
    2: learning(40, 2), // ~0%, in progress
    // 3 never touched → 0%
  };
  const { v, capture } = build(stateOf(passages, progress));

  v.startReviewSession();
  assert.deepEqual(capture.startedIds, [1], "only the committed verse, despite being the freshest of the three");
});

test("the threshold defaults to 75%, not 50%", () => {
  const passages = [{ id: 1 }];
  const { v } = build(stateOf(passages, { 1: committed(10) })); // ~61%
  assert.equal(DEFAULT_DUE_FRESHNESS, 75);
  assert.equal(v.reviewHasDue, true, "a committed verse at ~61% is due at a 75% threshold");

  const { v: strict } = build(stateOf(passages, { 1: committed(10) }, { profile: { dueFreshness: 50 } }));
  assert.equal(strict.reviewHasDue, false, "and is left alone by a member who sets 50%");
});

test("caps the due queue at the profile's Top X", () => {
  const passages = [1, 2, 3, 4, 5].map((id) => ({ id }));
  const progress = Object.fromEntries(passages.map((p) => [p.id, committed(30)])); // all ~22%
  const { v, capture } = build(stateOf(passages, progress, { profile: { dueTopX: 3 } }));

  v.startReviewSession();
  assert.equal(capture.startedIds.length, 3, "only the top 3 due verses are reviewed");
});

test("surfaces the manual controls only once the due queue is empty", () => {
  // Two committed verses holding above the threshold — the caught-up case,
  // which is the only time extra review is offered.
  const passages = [{ id: 1 }, { id: 2 }];
  const progress = { 1: committed(2), 2: committed(1) }; // ~90%, ~95%
  const { v, capture } = build(stateOf(passages, progress, { reviewSetup: { manualSize: 10, manualFreshness: 99 } }));

  assert.equal(v.reviewHasDue, false, "nothing has faded that far");
  assert.equal(v.reviewNothingCommitted, false);
  assert.match(v.reviewSetupTarget, /all caught up/);
  assert.equal(v.reviewSetupCanStart, true);
  assert.match(v.reviewSetupNote, /committed verses match/);

  v.startReviewSession();
  assert.deepEqual(capture.startedIds, [1, 2], "extra review reaches further up the same committed shelf");
});

test("extra review still refuses uncommitted verses, at any ceiling", () => {
  const passages = [{ id: 1 }, { id: 2 }];
  const progress = { 1: committed(1), 2: learning(30, 2) }; // ~95% committed, ~0% uncommitted
  const { v, capture } = build(stateOf(passages, progress, { reviewSetup: { manualSize: 10, manualFreshness: 100 } }));

  assert.equal(v.reviewHasDue, false);
  v.startReviewSession();
  assert.deepEqual(capture.startedIds, [1], "a 0%-fresh uncommitted verse is a learn job, not a review one");
});

test("the freshness ceiling is inclusive of a verse sitting exactly on it", () => {
  const passages = [{ id: 1 }, { id: 2 }];
  const progress = { 1: committed(2), 2: committed(1) }; // 90% and 95%
  const { v, capture } = build(stateOf(passages, progress, { reviewSetup: { manualSize: 10, manualFreshness: 90 } }));

  assert.equal(v.reviewHasDue, false);
  v.startReviewSession();
  assert.deepEqual(capture.startedIds, [1], "90% is included at a ceiling of 90; 95% is not");
});

test("caps the manual pool at the chosen size when the pool is larger", () => {
  const passages = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => ({ id }));
  const progress = Object.fromEntries(passages.map((p) => [p.id, committed(1)])); // all ~95%
  const { v, capture } = build(stateOf(passages, progress, { reviewSetup: { manualSize: 5, manualFreshness: 99 } }));

  assert.equal(v.reviewHasDue, false);
  v.startReviewSession();
  assert.equal(capture.startedIds.length, 5, "the manual pool is sliced to the chosen size");
});

test("a manual size of 0 means all matching verses, not none", () => {
  const passages = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const progress = { 1: committed(2), 2: committed(2), 3: committed(1) };
  const { v, capture } = build(stateOf(passages, progress, { reviewSetup: { manualSize: 0, manualFreshness: 99 } }));

  assert.equal(v.reviewHasDue, false);
  v.startReviewSession();
  assert.equal(capture.startedIds.length, 3, '"All" reviews every matching verse');
});
