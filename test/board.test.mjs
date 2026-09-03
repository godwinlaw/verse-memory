/* The board view-model: the two queues the home page offers.
 *
 * The board is where the split between the two sittings is most visible, so
 * these tests are mostly about which passages land in which queue, and about
 * the freshness readout, which belongs to review alone. */

import test from "node:test";
import assert from "node:assert/strict";

import { progressReader } from "../src/progress.js";
import { deriveTotals } from "../src/viewmodel/totals.js";
import { boardVals } from "../src/viewmodel/board.js";
import { committed, learning, NOW, stateOf } from "./helpers/setup-fixtures.mjs";

const TODAY = new Date(NOW);

function build(state) {
  const capture = {};
  const actions = { startSession: (mode, ids, kind) => (capture.started = { mode, ids, kind }) };
  const prog = progressReader(state.progress, NOW);
  const totals = deriveTotals({
    passages: state.passages,
    progress: state.progress,
    deadline: "2026-10-31",
    now: TODAY,
  });
  return { v: boardVals({ state, totals, prog, actions, today: TODAY }), capture };
}

const boardState = (passages, progress, over = {}) => ({ ...stateOf(passages, progress, over), log: {} });

test("the board splits the set into a review queue and a learn queue", () => {
  const passages = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  const progress = {
    1: committed(30), // ~22%, committed and faded, so due for review
    2: committed(0), // ~100%, committed and holding
    3: learning(1), // in progress, never written out
    // 4 untouched
  };
  const { v } = build(boardState(passages, progress));

  assert.deepEqual(
    v.reviewQueue.map((r) => r.id),
    [1],
  );
  assert.deepEqual(
    v.learnQueue.map((r) => r.id),
    [3, 4],
  );
  assert.equal(v.reviewCount, 1);
  assert.equal(v.learnCount, 2);
});

test("a queue row starts the sitting that suits its half of the set", () => {
  const passages = [{ id: 1 }, { id: 2 }];
  const { v, capture } = build(boardState(passages, { 1: committed(30) }));

  v.reviewQueue[0].onClick();
  assert.equal(capture.started.kind, "review");
  assert.deepEqual(capture.started.ids, [1]);

  v.learnQueue[0].onClick();
  assert.equal(capture.started.kind, "learn");
  assert.deepEqual(capture.started.ids, [2]);
});

test("only the review queue carries a freshness readout", () => {
  // The learn queue's verses are not committed, so how far they have decayed is
  // nothing a member can act on, they need writing out either way.
  const passages = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const progress = { 1: committed(30), 2: learning(1) };
  const { v } = build(boardState(passages, progress));

  assert.ok(
    v.reviewQueue.every((r) => /%$/.test(r.freshLabel)),
    "a committed verse is quoted at the freshness it has left",
  );
  assert.deepEqual(
    v.learnQueue.map((r) => r.freshLabel),
    ["", ""],
    "and a verse still being learned is quoted at nothing",
  );
});

test("each queue explains its own emptiness", () => {
  const passages = [{ id: 1 }, { id: 2 }];

  const nothingCommitted = build(boardState(passages, {})).v;
  assert.equal(nothingCommitted.reviewCount, 0);
  assert.match(nothingCommitted.reviewQueueEmpty, /once you have committed it/);
  assert.equal(nothingCommitted.learnCount, 2, "everything is learn material");

  const allDone = build(boardState(passages, { 1: committed(0), 2: committed(0) })).v;
  assert.equal(allDone.learnCount, 0);
  assert.match(allDone.learnQueueEmpty, /Nothing left to learn/);
  assert.match(allDone.reviewQueueEmpty, /still fresh/);
});

test("the review queue is capped at the profile's Top X, the learn queue at its size", () => {
  const passages = [1, 2, 3, 4, 5, 6].map((id) => ({ id }));
  const progress = Object.fromEntries([1, 2, 3, 4].map((id) => [id, committed(30)]));
  const { v } = build(boardState(passages, progress, { profile: { dueTopX: 2 }, learnSetup: { size: 1 } }));

  assert.equal(v.reviewQueue.length, 2);
  assert.equal(v.learnQueue.length, 1);
});
