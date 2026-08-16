import test from "node:test";
import assert from "node:assert/strict";

import { streakOf, dueOrder, committedCount, learnPool, reviewPool } from "../src/progress.js";
import { dayKey } from "../src/text.js";

const dayBefore = (d, n) => {
  const copy = new Date(d);
  copy.setDate(copy.getDate() - n);
  return copy;
};

test("streakOf counts back from today", () => {
  const today = new Date("2026-08-15T12:00:00");
  const log = {
    [dayKey(today)]: 3,
    [dayKey(dayBefore(today, 1))]: 2,
    [dayKey(dayBefore(today, 2))]: 1,
  };
  assert.equal(streakOf(log, today), 3);
});

test("an unreviewed today does not break the streak", () => {
  const today = new Date("2026-08-15T12:00:00");
  const log = {
    [dayKey(dayBefore(today, 1))]: 2,
    [dayKey(dayBefore(today, 2))]: 1,
  };
  assert.equal(streakOf(log, today), 2, "streak should start counting from yesterday");
});

test("a gap breaks the streak", () => {
  const today = new Date("2026-08-15T12:00:00");
  const log = {
    [dayKey(today)]: 1,
    [dayKey(dayBefore(today, 1))]: 1,
    // gap at 2 days ago
    [dayKey(dayBefore(today, 3))]: 1,
  };
  assert.equal(streakOf(log, today), 2);
});

test("streakOf is 0 for an empty log", () => {
  assert.equal(streakOf({}, new Date("2026-08-15T12:00:00")), 0);
  assert.equal(streakOf(null, new Date("2026-08-15T12:00:00")), 0);
});

test("dueOrder puts never-reviewed passages first", () => {
  const passages = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const now = Date.now();
  const progress = { 2: { hits: 3, status: "memorized", last: now, stability: 12 } };
  const order = dueOrder(passages, progress, now).map((p) => p.id);
  assert.equal(order[order.length - 1], 2, "the just-reviewed, high-retrievability passage sorts last");
  assert.ok(order.indexOf(1) < order.indexOf(2));
  assert.ok(order.indexOf(3) < order.indexOf(2));
});

test("committedCount migrates legacy records (no stability)", () => {
  const progress = {
    1: { hits: 5, status: "memorized", last: Date.now() }, // legacy, no stability
    2: { hits: 1, status: "learning", last: Date.now() },
  };
  assert.equal(committedCount(progress), 1);
});

/* ── the two pools ────────────────────────────────────────────────────────── */

const NOW = new Date("2026-08-15T12:00:00.000Z").getTime();
const daysAgo = (n) => NOW - n * 86400000;
const committed = (days) => ({ hits: 4, status: "memorized", last: daysAgo(days), stability: 20 });
const learning = (days, stability = 5) => ({ hits: 2, status: "learning", last: daysAgo(days), stability });

test("the two pools divide the set between them, with no overlap", () => {
  const passages = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  const progress = { 1: committed(30), 2: committed(0), 3: learning(1) };

  const review = reviewPool(passages, progress, 100, NOW).map((p) => p.id);
  const learn = learnPool(passages, progress, NOW).map((p) => p.id);

  assert.deepEqual([...review, ...learn].sort(), [1, 2, 3, 4], "every passage lands in exactly one pool");
  assert.equal(review.filter((id) => learn.includes(id)).length, 0, "and none in both");
});

test("reviewPool takes committed verses at or below the ceiling, stalest first", () => {
  const passages = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  const progress = {
    1: committed(10), // ~61%
    2: committed(30), // ~22%
    3: committed(0), // ~100%
    4: learning(30, 2), // ~0%, but never committed
  };
  assert.deepEqual(
    reviewPool(passages, progress, 75, NOW).map((p) => p.id),
    [2, 1],
    "most faded first; the fresh one and the uncommitted one are both left out",
  );
});

test("reviewPool's ceiling is inclusive", () => {
  const passages = [{ id: 1 }];
  const progress = { 1: committed(2) }; // 90%
  assert.equal(reviewPool(passages, progress, 90, NOW).length, 1, "90% is in at a ceiling of 90");
  assert.equal(reviewPool(passages, progress, 89, NOW).length, 0, "and out at 89");
});

test("learnPool puts started verses ahead of untouched ones", () => {
  const passages = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  const progress = {
    2: learning(1), // ~82%, started
    4: learning(10), // ~13%, started and more faded
  };
  assert.deepEqual(
    learnPool(passages, progress, NOW).map((p) => p.id),
    [4, 2, 1, 3],
    "the most faded of the started, then the untouched in canonical order",
  );
});

test("neither pool disturbs the passage list it is given", () => {
  const passages = [{ id: 3 }, { id: 1 }, { id: 2 }];
  const progress = { 3: committed(30), 1: learning(2) };
  const before = passages.map((p) => p.id);

  reviewPool(passages, progress, 75, NOW);
  learnPool(passages, progress, NOW);
  assert.deepEqual(
    passages.map((p) => p.id),
    before,
  );
});
