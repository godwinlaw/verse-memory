import test from "node:test";
import assert from "node:assert/strict";

import {
  migrate,
  retrievability,
  freshness,
  isDue,
  nextStability,
  reviewAward,
  awardCeiling,
  reviewedLast,
  commitsVerse,
  COMMIT_SCORE,
  GROWTH_BASE,
  PEEK_COST,
  R_FLOOR,
} from "../src/srs.js";

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

test("nextStability rewards a finer scramble level more than a coarser one", () => {
  const prev = { hits: 1, status: "learning", last: Date.now(), stability: 2 };
  const fine = nextStability(prev, { mode: "scramble", scrambleLevel: 2 });
  const coarse = nextStability(prev, { mode: "scramble", scrambleLevel: 0 });
  assert.ok(fine > coarse);
});

/* ── what a card awards ─────────────────────────────────────────────────── */

test("writing it out fully is worth the most, ordering the least", () => {
  const write = reviewAward({ mode: "type", score: 1 });
  const blanks = reviewAward({ mode: "blanks", blankLevel: 2, score: 1 });
  const order = reviewAward({ mode: "scramble", scrambleLevel: 2, score: 1 });

  assert.equal(write, 1, "a clean write-out leaves the passage fully fresh");
  assert.ok(write > blanks, "and is worth more than filling the blanks");
  assert.ok(blanks > order, "which is itself worth more than putting phrases back");
});

test("the harder setting of an activity awards more", () => {
  const fullBlanks = reviewAward({ mode: "blanks", blankLevel: 2, score: 1 });
  const lightBlanks = reviewAward({ mode: "blanks", blankLevel: 0, score: 1 });
  const fineOrder = reviewAward({ mode: "scramble", scrambleLevel: 2, score: 1 });
  const coarseOrder = reviewAward({ mode: "scramble", scrambleLevel: 0, score: 1 });
  const wholePassage = reviewAward({ mode: "type", score: 1 });
  const firstLetters = reviewAward({ mode: "type", firstLetters: true, score: 1 });

  assert.ok(fullBlanks > lightBlanks);
  assert.ok(fineOrder > coarseOrder);
  assert.ok(wholePassage > firstLetters, "typing initials is scaffolded, so it pays less");
});

test("the award follows the mark the attempt earned", () => {
  const half = reviewAward({ mode: "type", score: 0.5 });
  const full = reviewAward({ mode: "type", score: 1 });
  assert.ok(half < full);
  assert.equal(half, 0.5, "half the passage recalled leaves it half fresh");
  assert.equal(reviewAward({ mode: "type", score: 0 }), R_FLOOR, "a blank paper falls to the floor, not below it");
});

test("every peek costs the card freshness", () => {
  const clean = reviewAward({ mode: "blanks", blankLevel: 2, score: 1 });
  assert.equal(reviewAward({ mode: "blanks", blankLevel: 2, score: 1, peeks: 1 }), clean - PEEK_COST);
  assert.ok(reviewAward({ mode: "blanks", blankLevel: 2, score: 1, peeks: 3 }) < clean - PEEK_COST);
  assert.equal(reviewAward({ mode: "blanks", score: 1, peeks: 99 }), R_FLOOR, "and cannot take it below the floor");
});

test("the flashcard is unmarked, so it still simply counts as reviewed", () => {
  assert.equal(reviewAward({ mode: "flip" }), 1);
});

test("awardCeiling is what the activity pays before the attempt is marked", () => {
  assert.equal(awardCeiling({ mode: "type" }), reviewAward({ mode: "type", score: 1 }));
  assert.equal(
    awardCeiling({ mode: "scramble", scrambleLevel: 0, peeks: 4 }),
    reviewAward({ mode: "scramble", scrambleLevel: 0, score: 1 }),
    "the ceiling ignores what has been spent so far",
  );
});

test("a recorded card reads back at exactly the freshness it was awarded", () => {
  const now = Date.now();
  for (const award of [1, 0.9, 0.55, R_FLOOR]) {
    const stability = 6;
    const rec = { hits: 1, status: "learning", last: reviewedLast(stability, award, now), stability };
    assert.equal(freshness(rec, now), Math.round(award * 100), `award ${award} should read back unchanged`);
  }
});

/* ── what commits a verse ─────────────────────────────────────────────────── */

test("only writing the passage out in full commits it", () => {
  assert.equal(commitsVerse({ mode: "type", score: 1 }), true);
  assert.equal(commitsVerse({ mode: "type", score: COMMIT_SCORE }), true, "the bar itself is a pass");

  for (const mode of ["flip", "blanks", "scramble"]) {
    assert.equal(commitsVerse({ mode, score: 1 }), false, `${mode} is practice, not a write-out`);
  }
});

test("a write-out short of the bar does not commit", () => {
  assert.equal(commitsVerse({ mode: "type", score: COMMIT_SCORE - 0.01 }), false);
  assert.equal(commitsVerse({ mode: "type", score: 0.5 }), false);
  assert.equal(commitsVerse({ mode: "type", score: 0 }), false);
  assert.equal(commitsVerse({ mode: "type" }), false, "and an unmarked attempt has demonstrated nothing");
});

test("the bar leaves room for a slip, but not for half a passage", () => {
  assert.ok(COMMIT_SCORE < 1, "one dropped article should not deny a passage the member knows");
  assert.ok(COMMIT_SCORE > 0.9, "but most of the passage is not the whole of it");
});

test("peeked-at recall is not recall, in Learn or anywhere else", () => {
  assert.equal(commitsVerse({ mode: "type", score: 1, peeks: 1 }), false, "a passage read is not a passage recalled");
  assert.equal(
    commitsVerse({ mode: "type", score: 1, peeks: 1, sessionKind: "learn" }),
    false,
    "peeking still disqualifies inside Learn",
  );
});

test("the first-letter scaffold does not commit outside Learn", () => {
  assert.equal(commitsVerse({ mode: "type", score: 1, firstLetters: true }), false, "no sessionKind means not Learn");
  assert.equal(
    commitsVerse({ mode: "type", score: 1, firstLetters: true, sessionKind: "review" }),
    false,
    "Review never offers an uncommitted verse, but the rule holds anyway",
  );
});

test("the first-letter scaffold commits a clean write-out in Learn — that is what Learn is for", () => {
  assert.equal(commitsVerse({ mode: "type", score: 1, firstLetters: true, sessionKind: "learn" }), true);
  assert.equal(
    commitsVerse({ mode: "type", score: COMMIT_SCORE - 0.01, firstLetters: true, sessionKind: "learn" }),
    false,
    "the scaffold moves nothing about the bar itself",
  );
});

test("a member's own threshold moves the bar, but nothing else about the rule", () => {
  assert.equal(commitsVerse({ mode: "type", score: 0.9 }, 0.9), true, "a lower bar admits a lower score");
  assert.equal(commitsVerse({ mode: "type", score: 0.9 }), false, "COMMIT_SCORE is still the default");
  assert.equal(
    commitsVerse({ mode: "type", score: 0.9, firstLetters: true }, 0.9),
    false,
    "a moved bar still only reads a write-out",
  );
});
