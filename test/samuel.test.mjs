/* Samuel mode's pure half: the countdown, the draw, and the record.
 *
 * The dataset itself is asserted here too — a study aid for a real exam is only
 * worth having if the chapters are right, so the shape checks below are as much
 * about the content as about the code that reads it. */

import test from "node:test";
import assert from "node:assert/strict";

import { SAMUEL_CHAPTERS, SAMUEL_PEOPLE, SAMUEL_QUESTIONS } from "../data/samuel.js";
import {
  BOOKS,
  ROUND_SIZE,
  TEST_DATE,
  buildRound,
  chapterAt,
  chaptersOf,
  choicesFor,
  daysUntil,
  inScope,
  isRight,
  readiness,
  recordAnswer,
  weakChapters,
  weightOf,
} from "../src/samuel.js";

/* ── the dataset ──────────────────────────────────────────────────────────── */

test("both books are covered chapter by chapter, with no gaps", () => {
  const first = chaptersOf("1 Samuel");
  const second = chaptersOf("2 Samuel");
  assert.equal(first.length, 31, "1 Samuel has 31 chapters");
  assert.equal(second.length, 24, "2 Samuel has 24 chapters");
  assert.equal(SAMUEL_CHAPTERS.length, 55);
  first.forEach((c, i) => assert.equal(c.chapter, i + 1, "1 Samuel is numbered without gaps"));
  second.forEach((c, i) => assert.equal(c.chapter, i + 1, "2 Samuel is numbered without gaps"));
});

test("every chapter says what happens in it", () => {
  for (const c of SAMUEL_CHAPTERS) {
    assert.ok(c.title && c.title.length > 3, `${c.book} ${c.chapter} has a title`);
    assert.ok(c.summary && c.summary.length > 20, `${c.book} ${c.chapter} has a summary`);
    assert.ok(Array.isArray(c.people), `${c.book} ${c.chapter} lists its people`);
  }
});

test("the question bank is well formed and every chapter is asked about", () => {
  assert.ok(SAMUEL_QUESTIONS.length >= 100, "the bank is big enough to be worth drilling");

  const ids = new Set();
  for (const q of SAMUEL_QUESTIONS) {
    assert.ok(!ids.has(q.id), `duplicate question id: ${q.id}`);
    ids.add(q.id);
    assert.ok(q.prompt && q.answer, `${q.id} asks something and has an answer`);
    assert.equal(q.options.length, 3, `${q.id} offers three wrong answers`);
    assert.ok(!q.options.includes(q.answer), `${q.id} does not list its own answer as a distractor`);
    assert.ok(new Set(q.options).size === 3, `${q.id} has no repeated distractor`);
    assert.ok(BOOKS.includes(q.book), `${q.id} names a real book`);
    assert.ok(chapterAt(q.book, q.chapter), `${q.id} points at a chapter that exists`);
  }

  // Nothing is left unasked, which is what makes "read these again" honest.
  for (const c of SAMUEL_CHAPTERS) {
    const asked = SAMUEL_QUESTIONS.some((q) => q.book === c.book && q.chapter === c.chapter);
    assert.ok(asked, `nothing asks about ${c.book} ${c.chapter}`);
  }
});

test("the people are named and placed", () => {
  assert.ok(SAMUEL_PEOPLE.length >= 20);
  for (const p of SAMUEL_PEOPLE) {
    assert.ok(p.name && p.who, `${p.name} is described`);
    assert.ok(Array.isArray(p.chapters) && p.chapters.length, `${p.name} is placed in a chapter`);
  }
});

/* ── the countdown ────────────────────────────────────────────────────────── */

test("the countdown counts down, and says the day itself is the day", () => {
  const on = (s) => new Date(s + "T09:00:00").getTime();
  assert.equal(daysUntil(TEST_DATE, on("2026-09-29")), 1);
  assert.equal(daysUntil(TEST_DATE, on("2026-09-30")), 0);
  assert.equal(daysUntil(TEST_DATE, on("2026-09-23")), 7);
  assert.ok(daysUntil(TEST_DATE, on("2026-10-05")) < 0, "and knows when it has passed");
});

/* ── the draw ─────────────────────────────────────────────────────────────── */

test("a round is the round size, and never repeats a question inside itself", () => {
  const round = buildRound({}, { seed: 7 });
  assert.equal(round.length, ROUND_SIZE);
  assert.equal(new Set(round.map((q) => q.id)).size, round.length);
});

test("a book scope keeps the other book out", () => {
  const round = buildRound({}, { scope: "2 Samuel", seed: 3, size: 20 });
  assert.ok(round.length > 0);
  for (const q of round) assert.equal(q.book, "2 Samuel");
});

test("a chapter range narrows further", () => {
  const q = { book: "1 Samuel", chapter: 17 };
  assert.equal(inScope(q, null), true);
  assert.equal(inScope(q, "1 Samuel"), true);
  assert.equal(inScope(q, "2 Samuel"), false);
  assert.equal(inScope(q, { book: "1 Samuel", from: 16, to: 20 }), true);
  assert.equal(inScope(q, { book: "1 Samuel", from: 18 }), false);
});

test("what keeps going wrong is asked more often", () => {
  const unseen = weightOf(undefined);
  const missed = weightOf({ right: 0, wrong: 2 });
  const held = weightOf({ right: 3, wrong: 0 });
  assert.ok(missed > unseen, "a question got wrong outranks one never seen");
  assert.ok(unseen > held, "and one never seen outranks one already held");
  assert.ok(held > 0, "but nothing falls out of the bank entirely");
});

test("a question got wrong is drawn ahead of the rest", () => {
  const target = SAMUEL_QUESTIONS[40];
  let record = {};
  for (let i = 0; i < 4; i++) record = recordAnswer(record, target, "definitely wrong");
  const round = buildRound(record, { seed: 11 });
  assert.ok(
    round.some((q) => q.id === target.id),
    "the question missed four times is in the next ten",
  );
});

/* ── answering ────────────────────────────────────────────────────────────── */

test("the choices are the answer and its three distractors, in a stable order", () => {
  const q = SAMUEL_QUESTIONS[0];
  const a = choicesFor(q);
  const b = choicesFor(q);
  assert.deepEqual(a, b, "the same question arranges the same way every time");
  assert.equal(a.length, 4);
  assert.ok(a.includes(q.answer));
  for (const opt of q.options) assert.ok(a.includes(opt));
});

test("a right answer is right, and the record remembers both kinds", () => {
  const q = SAMUEL_QUESTIONS[0];
  assert.equal(isRight(q, q.answer), true);
  assert.equal(isRight(q, q.options[0]), false);

  let record = recordAnswer({}, q, q.answer, 1000);
  assert.deepEqual(record[q.id], { right: 1, wrong: 0, last: 1000 });
  record = recordAnswer(record, q, q.options[0], 2000);
  assert.deepEqual(record[q.id], { right: 1, wrong: 1, last: 2000 });
});

test("the record is replaced rather than mutated", () => {
  const q = SAMUEL_QUESTIONS[0];
  const before = {};
  const after = recordAnswer(before, q, q.answer);
  assert.deepEqual(before, {}, "the map handed in is left alone");
  assert.ok(after[q.id]);
});

/* ── how ready ────────────────────────────────────────────────────────────── */

test("readiness counts what is holding, not what was scored", () => {
  const q = SAMUEL_QUESTIONS[0];
  const empty = readiness({});
  assert.equal(empty.held, 0);
  assert.equal(empty.total, SAMUEL_QUESTIONS.length);

  // Right once is holding; wrong more often than right is not.
  assert.equal(readiness(recordAnswer({}, q, q.answer)).held, 1);
  let shaky = recordAnswer({}, q, q.answer);
  shaky = recordAnswer(shaky, q, "wrong");
  shaky = recordAnswer(shaky, q, "wrong");
  assert.equal(readiness(shaky).held, 0, "a question got wrong twice for one right is not held");
  assert.equal(readiness(shaky).seen, 1, "but it has still been seen");
});

test("the weakest chapters are the ones actually got wrong, worst first", () => {
  const a = SAMUEL_QUESTIONS[0];
  const b = SAMUEL_QUESTIONS.find((q) => q.book !== a.book || q.chapter !== a.chapter);
  let record = {};
  record = recordAnswer(record, a, "wrong");
  record = recordAnswer(record, b, "wrong");
  record = recordAnswer(record, b, "wrong");

  const weak = weakChapters(record);
  assert.equal(weak[0].key, b.book + " " + b.chapter, "the chapter missed twice comes first");
  assert.ok(weak.some((c) => c.key === a.book + " " + a.chapter));

  // A chapter nobody has been asked about is unmet, not weak.
  assert.equal(weakChapters({}).length, 0);
});
