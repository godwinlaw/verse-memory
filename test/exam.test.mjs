import test from "node:test";
import assert from "node:assert/strict";

import {
  ACTIVITY_KEYS,
  applyExam,
  buildExam,
  DEFAULT_SETUP,
  eligiblePassages,
  examPassages,
  FINISH_REF_WEIGHT,
  gradeQuestion,
  MATCH_BLOCK,
  NONE_OF_THE_ABOVE,
  normalizeSetup,
  plannedQuestions,
  scoreExam,
} from "../src/exam.js";
import { freshness, migrate, stabilityFor, TEST_PASS } from "../src/srs.js";
import { mergeProgress } from "../src/storage.js";
import { passages } from "../data/passages.js";

const NOW = new Date("2026-08-15T12:00:00.000Z").getTime();
const daysAgo = (n) => NOW - n * 86400000;

/* Three committed verses at descending freshness, two in progress, the rest
 * untouched — enough to exercise every setup filter. */
const progress = {
  1: { hits: 5, status: "memorized", last: daysAgo(0.2), step: 2, stability: 12 }, // ~98%
  2: { hits: 4, status: "memorized", last: daysAgo(9), step: 1, stability: 8 }, // ~32%
  3: { hits: 3, status: "memorized", last: daysAgo(40), step: 1, stability: 6 }, // ~0%
  4: { hits: 2, status: "learning", last: daysAgo(3), step: 0, stability: 2.2 },
  5: { hits: 1, status: "learning", last: daysAgo(1), step: 0, stability: 1 },
};

const setup = (over) => normalizeSetup({ ...DEFAULT_SETUP, ...over });
const build = (over, seed = 11) => buildExam({ passages, progress, setup: setup(over), now: NOW, seed });

/* ── setup ────────────────────────────────────────────────────────────────── */

test("normalizeSetup drops values an older build could have left behind", () => {
  const s = normalizeSetup({ size: 7, maxFreshness: 480, committedOnly: 1, activities: ["match", "gone"] });
  assert.equal(s.size, DEFAULT_SETUP.size, "7 is not an offered size");
  assert.equal(s.maxFreshness, 100);
  assert.equal(s.committedOnly, true);
  assert.deepEqual(s.activities, ["match"]);
});

test("normalizeSetup falls back to every activity rather than an empty paper", () => {
  assert.deepEqual(normalizeSetup({ activities: [] }).activities, ACTIVITY_KEYS);
  assert.deepEqual(normalizeSetup(null).activities, ACTIVITY_KEYS);
});

/* ── choosing what to test ────────────────────────────────────────────────── */

test("eligiblePassages returns the whole set, stalest first, by default", () => {
  const pool = eligiblePassages(passages, progress, setup(), NOW);
  assert.equal(pool.length, passages.length);
  // Verse 1 was reviewed hours ago, so it sorts last of all; untouched verses
  // (retrievability 0) come before it.
  assert.equal(pool[pool.length - 1].id, 1);
});

test("committedOnly keeps only committed verses", () => {
  const pool = eligiblePassages(passages, progress, setup({ committedOnly: true }), NOW);
  assert.deepEqual(
    pool.map((p) => p.id).sort((a, b) => a - b),
    [1, 2, 3],
  );
});

test("the freshness ceiling excludes anything fresher than it", () => {
  const pool = eligiblePassages(passages, progress, setup({ committedOnly: true, maxFreshness: 50 }), NOW);
  const ids = pool.map((p) => p.id);
  assert.ok(!ids.includes(1), "a 98% fresh verse is above a 50% ceiling");
  assert.ok(ids.includes(2) && ids.includes(3));
});

test("examPassages honours the size, and 0 means all of them", () => {
  assert.equal(examPassages(passages, progress, setup({ size: 20 }), NOW).length, 20);
  assert.equal(examPassages(passages, progress, setup({ size: 0 }), NOW).length, passages.length);
});

/* ── building the paper ───────────────────────────────────────────────────── */

test("buildExam is a function of its seed", () => {
  assert.deepEqual(build({ size: 10 }, 3), build({ size: 10 }, 3));
  assert.notDeepEqual(build({ size: 10 }, 3), build({ size: 10 }, 4));
});

test("a paper covers every chosen verse, once, using every chosen activity", () => {
  const exam = build({ size: 20 });
  assert.equal(exam.ids.length, 20);
  const asked = exam.questions.flatMap((q) => q.ids);
  assert.deepEqual(
    [...asked].sort((a, b) => a - b),
    [...exam.ids].sort((a, b) => a - b),
  );
  assert.deepEqual([...new Set(exam.questions.map((q) => q.kind))].sort(), [...ACTIVITY_KEYS].sort());
});

test("only the requested activities are asked", () => {
  const exam = build({ size: 8, activities: ["finish"] });
  assert.deepEqual([...new Set(exam.questions.map((q) => q.kind))], ["finish"]);
});

test("an empty pool builds an empty paper rather than throwing", () => {
  const exam = buildExam({ passages: [], progress, setup: setup(), now: NOW, seed: 1 });
  assert.deepEqual(exam, { questions: [], ids: [] });
});

test("plannedQuestions matches what buildExam actually deals", () => {
  for (const size of [5, 10, 20, 30]) {
    for (const activities of [ACTIVITY_KEYS, ["match"], ["finish", "match"], ["name-ref", "pick-ref"]]) {
      const exam = build({ size, activities });
      assert.equal(
        plannedQuestions(exam.ids.length, activities),
        exam.questions.length,
        `size ${size} with ${activities.join("+")}`,
      );
    }
  }
});

test("multiple choice offers four references plus none-of-the-above", () => {
  const q = build({ size: 30, activities: ["pick-ref"] }).questions[0];
  assert.equal(q.options.length, 5);
  assert.equal(q.options[q.options.length - 1].key, NONE_OF_THE_ABOVE);
  assert.equal(new Set(q.options.map((o) => o.label)).size, 5, "no reference is offered twice");
  assert.ok(
    q.options.some((o) => o.key === q.correctKey),
    "the right answer is one of the options",
  );
});

test("none-of-the-above is sometimes the right answer", () => {
  const kinds = build({ size: 30, activities: ["pick-ref"] }).questions.map((q) => q.correctKey);
  assert.ok(kinds.includes(NONE_OF_THE_ABOVE), "the correct reference is left out now and then");
  assert.ok(kinds.some((k) => k !== NONE_OF_THE_ABOVE));
});

test("finish gives away a lead and keeps a non-empty rest of the sentence", () => {
  for (const q of build({ size: 20, activities: ["finish"] }).questions) {
    assert.ok(q.lead.length > 0 && q.answer.length > 0, q.ref);
    // The two halves are the sentence, split at a word boundary.
    assert.ok(passages.find((p) => p.id === q.ids[0]).text.includes(q.lead + " " + q.answer), q.ref);
  }
});

test("a matching grid pairs one reference per verse, padded with decoys", () => {
  for (const q of build({ size: 30, activities: ["match"] }).questions) {
    assert.equal(q.verses.length, q.ids.length);
    assert.equal(q.refs.length, MATCH_BLOCK, "short blocks are padded so they are still a choice");
    for (const v of q.verses)
      assert.ok(
        q.refs.some((r) => r.key === v.key),
        "every verse's own reference is offered",
      );
    assert.equal(new Set(q.refs.map((r) => r.key)).size, q.refs.length, "no reference twice");
  }
});

/* ── marking ──────────────────────────────────────────────────────────────── */

test("a typed reference scores book and chapter separately", () => {
  const q = build({ size: 10, activities: ["name-ref"] }).questions[0];
  const [book, chapter] = q.ref.split(":")[0].split(/\s(?=\d+$)/);
  assert.equal(gradeQuestion(q, book + " " + chapter).score, 1);
  assert.equal(gradeQuestion(q, book + " 999").score, 0.5);
  assert.equal(gradeQuestion(q, "").score, 0);
});

test("multiple choice is right or nothing", () => {
  const q = build({ size: 10, activities: ["pick-ref"] }).questions[0];
  const wrong = q.options.find((o) => o.key !== q.correctKey);
  assert.equal(gradeQuestion(q, q.correctKey).score, 1);
  assert.equal(gradeQuestion(q, wrong.key).score, 0);
  assert.equal(gradeQuestion(q, undefined).score, 0);
});

test("finishing the sentence is graded word by word, plus the reference", () => {
  const q = build({ size: 10, activities: ["finish"] }).questions[0];
  assert.equal(gradeQuestion(q, { text: q.answer, ref: q.ref }).score, 1);
  assert.equal(gradeQuestion(q, {}).score, 0);
  // Each half of the question is worth exactly its weight on its own.
  assert.equal(gradeQuestion(q, { text: q.answer }).score, 1 - FINISH_REF_WEIGHT);
  assert.equal(gradeQuestion(q, { ref: q.ref }).score, FINISH_REF_WEIGHT);
  const half = q.answer
    .split(" ")
    .slice(0, Math.ceil(q.answer.split(" ").length / 2))
    .join(" ");
  const part = gradeQuestion(q, { text: half, ref: q.ref }).score;
  assert.ok(part > 0.3 && part < 1, `half the sentence should be part marks, got ${part}`);
});

test("a matching grid scores each verse on its own pairing", () => {
  const q = build({ size: 30, activities: ["match"] }).questions[0];
  const right = Object.fromEntries(q.verses.map((v) => [v.key, v.key]));
  assert.equal(gradeQuestion(q, right).score, 1);
  const [first, ...rest] = q.verses;
  const oneRight = { [first.key]: first.key, ...Object.fromEntries(rest.map((v) => [v.key, "0"])) };
  const graded = gradeQuestion(q, oneRight);
  assert.equal(graded.hits, 1);
  assert.deepEqual(
    graded.scores.find((s) => s.id === first.id),
    { id: first.id, score: 1 },
  );
});

test("scoreExam averages every question a verse appeared in", () => {
  const exam = build({ size: 10 });
  const perfect = Object.fromEntries(
    exam.questions.map((q, i) => [
      i,
      q.kind === "name-ref"
        ? q.ref
        : q.kind === "pick-ref"
          ? q.correctKey
          : q.kind === "finish"
            ? { text: q.answer, ref: q.ref }
            : q.kind === "match"
              ? Object.fromEntries(q.verses.map((v) => [v.key, v.key]))
              : q.kind === "scramble"
                ? q.chunks.map((_, j) => j)
                : q.kind === "blanks"
                  ? Object.fromEntries(q.blanks.map((idx) => [idx, q.words[idx]]))
                  : q.text,
    ]),
  );
  const scored = scoreExam(exam.questions, perfect);
  assert.equal(scored.score, 1);
  assert.equal(scored.right, scored.total);
  assert.deepEqual(
    scored.results.map((r) => r.id).sort((a, b) => a - b),
    [...exam.ids].sort((a, b) => a - b),
  );

  const blank = scoreExam(exam.questions, {});
  assert.equal(blank.score, 0);
  assert.equal(blank.right, 0);
  assert.ok(blank.results.every((r) => r.score === 0));
});

/* ── what a result does to a verse ────────────────────────────────────────── */

test("a perfect test leaves a verse fully fresh and counts as a clean review", () => {
  const { progress: next, rows } = applyExam({ progress, results: [{ id: 2, score: 1 }], now: NOW });
  assert.equal(rows[0].after, 100);
  assert.ok(rows[0].after > rows[0].before);
  assert.equal(next[2].hits, progress[2].hits + 1);
  assert.ok(next[2].stability > progress[2].stability, "a strong result lengthens the interval");
});

test("a poor test leaves the verse at the freshness it was worth, and shortens the interval", () => {
  const { progress: next, rows } = applyExam({ progress, results: [{ id: 1, score: 0.3 }], now: NOW });
  assert.equal(rows[0].after, 30, "30% recalled reads as 30% fresh");
  assert.ok(rows[0].after < rows[0].before);
  assert.ok(next[1].stability < progress[1].stability);
  assert.equal(next[1].hits, progress[1].hits, "a failure is not a clean review");
});

test("the pass mark is the hinge: at it a verse holds the rung it is on", () => {
  // Above the mark a paper moves the verse up the interval ladder and below it
  // moves it down, so exactly at the mark it stays where it was. The stability
  // it comes back with is the rung's own (srs.stabilityFor), which is how a
  // record written by the old multiplicative model settles onto the ladder.
  const { progress: next } = applyExam({ progress, results: [{ id: 2, score: TEST_PASS }], now: NOW });
  assert.equal(next[2].step, progress[2].step);
  assert.equal(next[2].stability, stabilityFor(progress[2].step));
});

test("one bad test never demotes a committed verse", () => {
  const { progress: next } = applyExam({ progress, results: [{ id: 3, score: 0 }], now: NOW });
  assert.equal(next[3].status, "memorized");
  assert.equal(next[3].hits, progress[3].hits, "and it keeps the clean reviews it had");
});

test("a test never commits a verse, however well it goes", () => {
  // Only writing the passage out in full does that (srs.commitsVerse), and a
  // paper of multiple choice and matching is not that — however many perfect
  // papers are sat.
  let uncommitted = { 9: { hits: 2, status: "learning", last: daysAgo(5), step: 0, stability: 3 } };
  for (let i = 0; i < 5; i++) {
    uncommitted = applyExam({ progress: uncommitted, results: [{ id: 9, score: 1 }], now: NOW }).progress;
  }
  assert.equal(uncommitted[9].status, "learning");
  assert.equal(uncommitted[9].hits, 7, "the clean reviews are still counted");
});

test("a test still opens an untouched verse's account", () => {
  const { progress: next } = applyExam({ progress: {}, results: [{ id: 9, score: 1 }], now: NOW });
  assert.equal(next[9].status, "learning", "it is in progress, not committed and not untouched");
});

test("a backdated test result still wins the cross-device merge", () => {
  // Dating a verse back is what makes a score show up as freshness, and it puts
  // `last` behind the copy on another device. The `updatedAt` stamp is what
  // keeps the newer write winning anyway.
  const { progress: next } = applyExam({ progress, results: [{ id: 1, score: 0 }], now: NOW });
  assert.ok(next[1].last < progress[1].last, "a blank answer dates the verse well back");
  assert.equal(next[1].updatedAt, NOW);
  assert.equal(mergeProgress(progress, next)[1], next[1]);
  assert.equal(mergeProgress(next, progress)[1], next[1]);
});

test("an untested verse is untouched, and an unseen one starts from scratch", () => {
  const { progress: next } = applyExam({ progress, results: [{ id: 99, score: 0.8 }], now: NOW });
  assert.equal(next[1], progress[1]);
  assert.equal(next[99].hits, 1);
  assert.equal(freshness(migrate(next[99]), NOW), 80);
});

/* ── categories ───────────────────────────────────────────────────────────── */

test("normalizeSetup keeps a real category and forgets one that has gone", () => {
  assert.equal(normalizeSetup({ category: "psalms" }).category, "psalms");
  // A shelf removed from a later build must read as "All" — a setup pointing at
  // nothing would otherwise build an empty paper the member cannot explain.
  assert.equal(normalizeSetup({ category: "apocrypha" }).category, null);
  assert.equal(normalizeSetup({}).category, null);
  assert.equal(DEFAULT_SETUP.category, null);
});

test("a category narrows the verses a paper can cover", () => {
  const all = eligiblePassages(passages, progress, setup(), NOW);
  const psalms = eligiblePassages(passages, progress, setup({ category: "psalms" }), NOW);
  assert.ok(psalms.length > 0);
  assert.ok(psalms.length < all.length);
  assert.ok(
    psalms.every((p) => p.category === "psalms"),
    "a verse from another shelf reached the paper",
  );
});

test("the decoy references still come from the whole set", () => {
  // The paper is one shelf, but a wrong reference is only worth reasoning about
  // if it could have come from anywhere — so buildExam is handed every passage
  // for its distractors even when eligiblePassages has narrowed the verses.
  const exam = buildExam({
    passages,
    progress,
    setup: setup({ category: "psalms", activities: ["pick-ref"], size: 0 }),
    now: NOW,
    seed: 5,
  });
  const offered = exam.questions.flatMap((q) => (q.options || []).map((o) => o.label));
  assert.ok(offered.length > 0, "no multiple-choice questions were built");
  assert.ok(
    offered.some((label) => label !== NONE_OF_THE_ABOVE && !label.startsWith("Psalm")),
    "every reference offered was a psalm, so the choice gives the answer away",
  );
});
