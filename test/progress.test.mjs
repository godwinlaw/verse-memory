import test from "node:test";
import assert from "node:assert/strict";

import { streakOf, dueOrder, committedCount } from "../src/progress.js";
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
