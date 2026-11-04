/* What Today asks for: the pure plan behind the screen (viewmodel/today.js).
 * The screen itself is rendered in views.test.mjs; this is the arithmetic. */

import test from "node:test";
import assert from "node:assert/strict";

import { todayPlan } from "../src/viewmodel/today.js";
import { backdatedLast, stabilityFor } from "../src/srs.js";

const NOW = new Date("2026-08-15T12:00:00.000Z").getTime();
const passages = [1, 2, 3, 4, 5, 6].map((id) => ({ id, ref: "Ref " + id, text: "Verse " + id }));

/* A committed verse reading at `fresh` right now, and one in progress. */
const committed = (fresh, step = 6) => ({
  hits: 4,
  status: "memorized",
  step,
  stability: stabilityFor(step),
  last: backdatedLast(stabilityFor(step), fresh, NOW),
  updatedAt: NOW,
});
const started = (fresh) => ({ ...committed(fresh, 0), status: "learning" });

test("due is every committed verse at or below the threshold, stalest first", () => {
  const progress = { 1: committed(0.98), 2: committed(0.4), 3: committed(0.6), 4: started(0.1) };
  const plan = todayPlan({ passages, progress, dueFreshness: 75, dueTopX: 10, now: NOW });
  assert.deepEqual(
    plan.due.map((p) => p.id),
    [2, 3],
    "the fresh one is left alone and the uncommitted one is not a review",
  );
  assert.deepEqual(plan.sitting, [2, 3]);
});

test("the sitting is capped at the member's queue size, taking the most faded", () => {
  const progress = { 1: committed(0.2), 2: committed(0.4), 3: committed(0.6), 4: committed(0.7) };
  const plan = todayPlan({ passages, progress, dueFreshness: 75, dueTopX: 2, now: NOW });
  assert.equal(plan.due.length, 4, "all four are shown as due");
  assert.deepEqual(plan.sitting, [1, 2], "and the button takes the two most faded");
});

test("the next verse to learn is a started one before an untouched one", () => {
  const progress = { 1: committed(0.98), 5: started(0.3) };
  const plan = todayPlan({ passages, progress, dueFreshness: 75, dueTopX: 10, now: NOW });
  assert.equal(plan.next.id, 5, "finish what was started");
  assert.deepEqual(plan.due, []);
  assert.equal(plan.committed, 1);
});

test("with nothing committed there is nothing due and the first verse is next", () => {
  const plan = todayPlan({ passages, progress: {}, dueFreshness: 75, dueTopX: 10, now: NOW });
  assert.deepEqual(plan.due, []);
  assert.equal(plan.next.id, 1);
  assert.equal(plan.committed, 0);
});

test("with the whole set committed and fresh there is nothing to offer at all", () => {
  const progress = Object.fromEntries(passages.map((p) => [p.id, committed(0.99)]));
  const plan = todayPlan({ passages, progress, dueFreshness: 75, dueTopX: 10, now: NOW });
  assert.deepEqual(plan.due, []);
  assert.equal(plan.next, null);
  assert.equal(plan.committed, 6);
});

test("the member's own threshold moves what counts as due", () => {
  const progress = { 1: committed(0.8) };
  assert.equal(todayPlan({ passages, progress, dueFreshness: 75, dueTopX: 10, now: NOW }).due.length, 0);
  assert.equal(todayPlan({ passages, progress, dueFreshness: 85, dueTopX: 10, now: NOW }).due.length, 1);
});
