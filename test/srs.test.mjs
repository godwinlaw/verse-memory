import test from "node:test";
import assert from "node:assert/strict";

import {
  migrate,
  retrievability,
  freshness,
  nextStep,
  intervalFor,
  stabilityFor,
  stepNear,
  reviewAward,
  awardCeiling,
  reviewedLast,
  commitsVerse,
  ADVANCE_R,
  COMMIT_SCORE,
  DUE_R,
  HOLD_R,
  INTERVALS,
  LAPSE_R,
  LEVEL_AWARD,
  MAX_STEP,
  PEEK_COST,
  R_FLOOR,
} from "../src/srs.js";
import { BLANK_LEVELS } from "../src/blanks.js";

test("migrate returns defaults for unseen verse", () => {
  const rec = migrate(undefined);
  assert.deepEqual(rec, { hits: 0, status: "new", last: null, stability: 0, step: 0 });
});

test("migrate places a legacy record on the ladder", () => {
  const rec = migrate({ hits: 2, status: "learning", last: Date.now() });
  assert.equal(rec.step, 0, "one clean review is one rung");
  assert.equal(rec.stability, stabilityFor(0));
});

test("migrate caps a run-away legacy stability by the reviews that earned it", () => {
  // The multiplicative model this replaced compounded about 3.9x a review, so a
  // verse reviewed three times could be carrying a hundred-day interval. `hits`
  // is the ceiling that walks those back onto the ladder.
  const rec = migrate({ hits: 3, status: "memorized", last: Date.now(), stability: 143 });
  assert.equal(rec.step, 2, "three reviews is three rungs, whatever the record claims");
  assert.equal(intervalFor(rec.step), 3);
});

test("migrate leaves a record that is already on the ladder untouched", () => {
  const rec = { hits: 2, status: "learning", last: Date.now(), step: 3, stability: 4 };
  assert.equal(migrate(rec), rec);
});

test("retrievability and freshness bounds", () => {
  const fresh = { hits: 1, status: "learning", last: Date.now(), stability: 2 };
  const r = retrievability(fresh);
  assert.ok(r > 0.9 && r <= 1, `just-reviewed verse should be near-fully fresh, got ${r}`);
  assert.equal(freshness({ hits: 0, status: "new", last: null, stability: 0 }), 0);
});

/* ── the ladder ───────────────────────────────────────────────────────────── */

test("the ladder starts at a day and widens all the way out", () => {
  assert.deepEqual(INTERVALS.slice(0, 7), [1, 2, 3, 4, 5, 6, 7], "a day at a time out to a week");
  assert.equal(INTERVALS[INTERVALS.length - 1], 365);
  for (let i = 1; i < INTERVALS.length; i++) {
    assert.ok(INTERVALS[i] > INTERVALS[i - 1], `rung ${i} should be longer than the one below it`);
  }
});

// Dated from a non-zero instant: retrievability() reads a falsy `last` as
// "never reviewed" and answers 0 for it.
const DAY = 86400000;
const at = (step, last = DAY) => ({ last, stability: stabilityFor(step), step });

test("a rung's stability is the one that reads at the due mark when its interval runs out", () => {
  for (const step of [0, 3, 6, 9, MAX_STEP]) {
    const atDue = retrievability(at(step), DAY + intervalFor(step) * DAY);
    assert.ok(Math.abs(atDue - DUE_R) < 1e-9, `rung ${step} should read ${DUE_R} after ${intervalFor(step)} days`);
  }
});

test("a verse on the first rung is asked for the next day, and one higher up is not", () => {
  assert.equal(freshness(at(0), 2 * DAY), 75, "a day after learning it, and back on the list");
  assert.equal(freshness(at(6), 2 * DAY), 96, "the same day for a verse on the week rung, and left alone");
  assert.equal(freshness(at(6), 8 * DAY), 75, "which comes back a week later instead");
});

test("stepNear finds a loose stability's place on the ladder", () => {
  assert.equal(stepNear(stabilityFor(4)), 4, "a stability already on the ladder stays put");
  assert.equal(stepNear(0), 0);
  assert.equal(stepNear(1e9), MAX_STEP, "and nothing runs off the top");
});

/* ── moving along it ──────────────────────────────────────────────────────── */

const on = (step) => ({ hits: 2, status: "memorized", last: Date.now(), step, stability: stabilityFor(step) });

test("the first review of a verse puts it on the first rung, whatever it scored", () => {
  const unseen = migrate(undefined);
  assert.equal(nextStep(unseen, 1, "type"), 0);
  assert.equal(nextStep(unseen, 0, "type"), 0, "there is no interval yet to lose");
});

test("a clean card moves the verse up one rung, a middling one holds it", () => {
  assert.equal(nextStep(on(3), reviewAward({ mode: "type", score: 1 }), "type"), 4);
  assert.equal(nextStep(on(3), reviewAward({ mode: "blanks", blankLevel: 1, score: 1 }), "blanks"), 4);
  assert.equal(
    nextStep(on(3), reviewAward({ mode: "scramble", scrambleLevel: 0, score: 1 }), "scramble"),
    3,
    "the coarsest ordering is worth keeping the interval, never lengthening it",
  );
});

test("a poor card costs a rung, and forgetting it outright starts the ladder again", () => {
  assert.equal(nextStep(on(5), reviewAward({ mode: "type", score: 0.5 }), "type"), 4);
  assert.equal(nextStep(on(5), reviewAward({ mode: "type", score: 0.1 }), "type"), 0);
});

test("peeking buys freshness and costs the rung", () => {
  const two = { mode: "type", score: 1, peeks: 2 };
  const three = { mode: "type", score: 1, peeks: 3 };
  assert.equal(nextStep(on(2), reviewAward(two), "type"), 3, "two peeks still just clears the bar");
  assert.equal(nextStep(on(2), reviewAward(three), "type"), 2, "a third does not");
});

test("a flashcard holds the rung it is on and can never lengthen it", () => {
  // Nothing measures a flashcard, so it pays a full freshness award and is no
  // evidence at all — otherwise a member could click a verse onto a year.
  assert.equal(reviewAward({ mode: "flip" }), 1, "still worth a full review in freshness");
  for (const step of [0, 4, MAX_STEP]) assert.equal(nextStep(on(step), reviewAward({ mode: "flip" }), "flip"), step);
});

test("the ladder has a floor and a ceiling", () => {
  assert.equal(nextStep(on(0), 0, "type"), 0);
  assert.equal(nextStep(on(MAX_STEP), 1, "type"), MAX_STEP);
});

test("the three hinges are in order, and sit where the award table can reach them", () => {
  assert.ok(ADVANCE_R > HOLD_R && HOLD_R > LAPSE_R);
  assert.ok(
    awardCeiling({ mode: "blanks", blankLevel: 1 }) >= ADVANCE_R,
    "filling the blanks at its middle setting must be able to earn a longer interval",
  );
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

test("alternating blanks pays the mode's full ceiling, and says so in the table", () => {
  // Half the passage gone, function words included, so there is nothing left to
  // lean on — at least as hard as blanking every key word, and paid the same.
  const alternate = BLANK_LEVELS.findIndex((l) => l.alternate);
  const full = reviewAward({ mode: "blanks", blankLevel: 2, score: 1 });
  assert.equal(reviewAward({ mode: "blanks", blankLevel: alternate, score: 1 }), full);
  // Written down rather than reached by the != null fallback, so a difficulty
  // that pays full marks is visible in LEVEL_AWARD itself.
  assert.equal(LEVEL_AWARD.length, BLANK_LEVELS.length);
  assert.equal(LEVEL_AWARD[alternate], 1.0);
});

test("and it still cannot pay more than the activity is worth", () => {
  // The blanks ceiling is the mode's, not the level's: a cued-recall exercise
  // never becomes free recall by being made harder.
  const alternate = BLANK_LEVELS.findIndex((l) => l.alternate);
  assert.ok(reviewAward({ mode: "blanks", blankLevel: alternate, score: 1 }) < reviewAward({ mode: "type", score: 1 }));
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
