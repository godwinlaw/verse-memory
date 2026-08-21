/* The learn-setup view-model: what a learn session takes on.
 *
 * Learning is the other half of the app from review — it works the verses that
 * are not committed yet, and a session is what commits them. The boundary
 * between the two is asserted from the review side as well
 * (see test/review-setup.test.mjs). */

import test from "node:test";
import assert from "node:assert/strict";

import { progressReader } from "../src/progress.js";
import { learnSetupVals } from "../src/viewmodel/learn.js";
import { committed, learning, NOW, stateOf } from "./helpers/setup-fixtures.mjs";

function build(state) {
  const capture = {};
  const actions = {
    startLearnSession: (ids) => (capture.startedIds = ids),
    setLearnSetup: (patch) => (capture.setup = { ...(capture.setup || {}), ...patch }),
    goto: (view) => (capture.goto = view),
  };
  const prog = progressReader(state.progress, NOW);
  return { v: learnSetupVals({ state, prog, actions }), capture };
}

test("learn takes the uncommitted verses, and only those", () => {
  const passages = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  const progress = {
    1: committed(20), // committed, and well faded — still not learn material
    2: learning(20, 5),
    3: committed(0),
    // 4 never touched
  };
  const { v, capture } = build(stateOf(passages, progress));

  v.startLearnSession();
  assert.deepEqual(capture.startedIds, [2, 4], "the in-progress verse and the untouched one");
  assert.equal(v.learnSetupCanStart, true);
});

test("verses already started come before ones never opened", () => {
  const passages = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  const progress = {
    2: learning(1, 5), // ~82% — started, freshest
    4: learning(10, 5), // ~13% — started, most faded
    // 1 and 3 never touched, and keep canonical order between them
  };
  const { v, capture } = build(stateOf(passages, progress));

  v.startLearnSession();
  assert.deepEqual(capture.startedIds, [4, 2, 1, 3], "most faded of the started, then the untouched in order");
});

test("the sitting is capped at the chosen size", () => {
  const passages = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => ({ id }));
  const { v, capture } = build(stateOf(passages, {}, { learnSetup: { size: 3 } }));

  v.startLearnSession();
  assert.equal(capture.startedIds.length, 3);
  assert.match(v.learnSetupNote, /3 verses in this sitting/);
  assert.match(v.learnSetupNote, /8 uncommitted in the set/);
});

test("a size of 0 means every uncommitted verse", () => {
  const passages = [1, 2, 3, 4, 5].map((id) => ({ id }));
  const { v, capture } = build(stateOf(passages, { 1: committed(0) }, { learnSetup: { size: 0 } }));

  v.startLearnSession();
  assert.deepEqual(capture.startedIds, [2, 3, 4, 5], '"All" takes every uncommitted verse, and no committed one');
});

test("the note counts what is already in progress", () => {
  const passages = [1, 2, 3, 4].map((id) => ({ id }));
  const { v } = build(stateOf(passages, { 1: learning(2), 2: learning(3) }));
  assert.match(v.learnSetupNote, /2 already in progress/);
});

test("a fully committed set has nothing left to learn", () => {
  const passages = [{ id: 1 }, { id: 2 }];
  const { v } = build(stateOf(passages, { 1: committed(0), 2: committed(0) }));

  assert.equal(v.learnSetupCanStart, false);
  assert.match(v.learnSetupNote, /nothing left to learn/i);
  assert.deepEqual(v.learnQueuePreview, [], "and nothing to preview");
});

test("the screen previews what the sitting will open with", () => {
  const passages = [
    { id: 1, ref: "Psalm 1:1", text: "Blessed is the man" },
    { id: 2, ref: "John 1:1", text: "In the beginning" },
  ];
  const { v } = build(stateOf(passages, { 2: learning(1) }));

  assert.deepEqual(
    v.learnQueuePreview.map((p) => p.ref),
    ["John 1:1", "Psalm 1:1"],
    "the started verse leads",
  );
  assert.equal(v.learnQueuePreview[0].statusLabel, "In progress");
  assert.equal(v.learnQueuePreview[1].statusLabel, "Not started");
});

test("a long sitting previews the first few and counts the rest", () => {
  const passages = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, ref: "Ref " + (i + 1), text: "text" }));
  const { v } = build(stateOf(passages, {}, { learnSetup: { size: 0 } }));

  assert.equal(v.learnQueuePreview.length, 6);
  assert.equal(v.learnPreviewMore, "+6 more");
});

test("building the view-model does not reorder state.passages", () => {
  const passages = [{ id: 3 }, { id: 1 }, { id: 2 }];
  const before = passages.map((p) => p.id);
  build(stateOf(passages, { 1: learning(9), 3: learning(1) }));
  assert.deepEqual(
    passages.map((p) => p.id),
    before,
  );
});

/* ── categories ───────────────────────────────────────────────────────────── */

const SHELVED = [
  { id: 1, category: "core" },
  { id: 2, category: "core" },
  { id: 3, category: "psalms" },
  { id: 4, category: "dt" },
];

test("with All chosen the queue draws on the whole set", () => {
  const { v } = build(stateOf(SHELVED, {}));
  v.startLearnSession();
  const b = build(stateOf(SHELVED, {}));
  b.v.startLearnSession();
  assert.deepEqual(b.capture.startedIds, [1, 2, 3, 4]);
});

test("a category narrows what the sitting can open", () => {
  const b = build(stateOf(SHELVED, {}, { learnSetup: { size: 5, category: "psalms" } }));
  b.v.startLearnSession();
  assert.deepEqual(b.capture.startedIds, [3]);
});

test("choosing a shelf is saved as the learn setup", () => {
  const b = build(stateOf(SHELVED, {}));
  b.v.learnSetupCategories.find((c) => c.key === "dt").onClick();
  assert.deepEqual(b.capture.setup, { category: "dt" });
});

test("a shelf with everything already committed has nothing to learn", () => {
  const b = build(stateOf(SHELVED, { 3: committed(0) }, { learnSetup: { size: 5, category: "psalms" } }));
  assert.equal(b.v.learnSetupCanStart, false);
});
