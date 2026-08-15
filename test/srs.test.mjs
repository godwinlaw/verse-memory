import test from "node:test";
import assert from "node:assert/strict";

import { migrate, retrievability, freshness, isDue, nextStability, GROWTH_BASE } from "../src/srs.js";

test("migrate returns defaults for unseen verse", () => {
  const rec = migrate(undefined);
  assert.deepEqual(rec, { hits: 0, status: "new", last: null, stability: 0 });
});

test("migrate back-fills stability for legacy records", () => {
  const rec = migrate({ hits: 2, status: "learning", last: Date.now() });
  assert.ok(rec.stability > 0, "legacy record should get a stability");
});

test("migrate leaves records that already have a stability untouched", () => {
  const rec = { hits: 2, status: "learning", last: Date.now(), stability: 4 };
  assert.equal(migrate(rec), rec);
});

test("retrievability and freshness bounds", () => {
  const fresh = { hits: 1, status: "learning", last: Date.now(), stability: 2 };
  const r = retrievability(fresh);
  assert.ok(r > 0.9 && r <= 1, `just-reviewed verse should be near-fully fresh, got ${r}`);
  assert.equal(freshness({ hits: 0, status: "new", last: null, stability: 0 }), 0);
});

test("never-reviewed verse is due; very fresh verse is not", () => {
  assert.equal(isDue(migrate(undefined)), true);
  assert.equal(isDue({ hits: 1, status: "learning", last: Date.now(), stability: 5 }), false);
});

test("nextStability grows and rewards free recall over recognition", () => {
  const prev = { hits: 1, status: "learning", last: Date.now(), stability: 2 };
  const write = nextStability(prev, { mode: "type", score: 1 });
  const flip = nextStability(prev, { mode: "flip" });
  assert.ok(write > prev.stability, "review should increase stability");
  assert.ok(write > flip, "writing it out should build more stability than a flashcard");
  assert.ok(GROWTH_BASE > 1);
});

test("nextStability rewards a fuller blanks level more than a lighter one", () => {
  const prev = { hits: 1, status: "learning", last: Date.now(), stability: 2 };
  const full = nextStability(prev, { mode: "blanks", blankLevel: 2 });
  const light = nextStability(prev, { mode: "blanks", blankLevel: 0 });
  assert.ok(full > light);
});
