import test from "node:test";
import assert from "node:assert/strict";

import { gradeWritten, gradeReference, parseReference, revealFirstLetters } from "../src/grading.js";

test("gradeWritten scores an exact match 1.0", () => {
  const words = ["Trust", "in", "the", "Lord"];
  const { hits, total, score } = gradeWritten(words, "Trust in the Lord");
  assert.equal(hits, 4);
  assert.equal(total, 4);
  assert.equal(score, 1);
});

test("gradeWritten scores empty input 0", () => {
  const words = ["Trust", "in", "the", "Lord"];
  assert.equal(gradeWritten(words, "").score, 0);
  assert.equal(gradeWritten(words, undefined).score, 0);
});

test("a skipped word does not desynchronise the rest, within LOOKAHEAD", () => {
  const words = ["Trust", "in", "the", "Lord", "with", "all", "your", "heart"];
  // "in" dropped; the remaining words are all within LOOKAHEAD (3) of where
  // the cursor expects them, so they should still match.
  const { diff, hits } = gradeWritten(words, "Trust the Lord with all your heart");
  assert.equal(hits, 7, "every word but the dropped one should match");
  assert.equal(diff.find((d) => d.word === "in").hit, false);
});

test("a transposition outside LOOKAHEAD does not match", () => {
  const words = ["one", "two", "three", "four", "five", "six", "seven"];
  // "seven" typed 6 tokens early — well past LOOKAHEAD (3) — must not match
  // seven's slot, and must not desync everything after it either.
  const { diff } = gradeWritten(words, "seven one two three four five six");
  assert.equal(diff.find((d) => d.word === "seven").hit, false);
});

test("a miss carries what was typed in its place", () => {
  const words = ["Trust", "in", "the", "Lord"];
  // "the" is written as "teh" — a real mistake, not an omission — so the slot
  // it landed in is worth showing.
  const { diff } = gradeWritten(words, "Trust in teh Lord");
  assert.equal(diff.find((d) => d.word === "the").typed, "teh");
  assert.equal(diff.find((d) => d.word === "Trust").typed, "", "a hit carries nothing — there is no mistake to show");
});

test("a word never reached carries nothing typed, not the next word's", () => {
  const words = ["Trust", "in", "the", "Lord"];
  // Typing runs out after "Trust in" — "the" and "Lord" are both missed with
  // nothing left to blame them on.
  const { diff } = gradeWritten(words, "Trust in");
  assert.equal(diff.find((d) => d.word === "the").typed, "");
  assert.equal(diff.find((d) => d.word === "Lord").typed, "");
});

test("punctuation and capitals are ignored", () => {
  const words = ["Trust", "in", "the", "LORD."];
  assert.equal(gradeWritten(words, "trust, IN the lord").score, 1);
});

test("firstLetters mode grades spaced and unspaced initials identically", () => {
  const words = ["for", "the", "heart", "wanders"];
  const spaced = gradeWritten(words, "f t h w", { firstLetters: true });
  const packed = gradeWritten(words, "fthw", { firstLetters: true });
  assert.equal(spaced.score, 1);
  assert.equal(packed.score, 1);
});

test("revealFirstLetters is strictly positional", () => {
  const words = ["Trust", "in", "the", "Lord"];
  const { words: revealed } = revealFirstLetters(words, "t x");
  assert.equal(revealed[0].state, "right");
  assert.equal(revealed[0].text, "Trust");
  assert.equal(revealed[1].state, "wrong");
  assert.equal(revealed[1].text, "x", "a wrong letter shows what was typed, not the word");
  assert.equal(revealed[2].state, "hidden");
  assert.equal(revealed[3].state, "hidden");
});

test("a hidden word's mask does not give away its length", () => {
  const words = ["I", "wanders", "a", "commandments"];
  const { words: revealed } = revealFirstLetters(words, "");
  assert.equal(revealed[0].text, revealed[1].text, "a 1-letter and a 7-letter word mask the same");
  assert.equal(revealed[2].text, revealed[3].text, "a 1-letter and a 12-letter word mask the same");
});

test("parseReference keeps a leading numeral with the book", () => {
  assert.deepEqual(parseReference("1 Samuel 15:22"), { book: "1 Samuel", key: "1samuel", chapter: 15, verse: 22 });
  assert.deepEqual(parseReference("Psalm 119:105"), { book: "Psalm", key: "psalm", chapter: 119, verse: 105 });
});

test("parseReference keeps the first verse of a range, and copes with no verse", () => {
  assert.equal(parseReference("Exodus 19:4-6").verse, 4);
  assert.equal(parseReference("Psalm 34").verse, null);
  assert.equal(parseReference("Psalm").chapter, null);
});

test("gradeReference splits the mark between book and chapter", () => {
  assert.equal(gradeReference("Psalm 34", "Psalm 34:8-9").score, 1);
  assert.equal(gradeReference("Psalm 35", "Psalm 34:8-9").score, 0.5);
  assert.equal(gradeReference("Isaiah 34", "Psalm 34:8-9").score, 0.5);
  assert.equal(gradeReference("Isaiah 40", "Psalm 34:8-9").score, 0);
  assert.equal(gradeReference("", "Psalm 34:8-9").score, 0);
});

test("gradeReference accepts an abbreviated book but not a wrong one", () => {
  assert.equal(gradeReference("ps 34", "Psalm 34:8-9").bookOk, true);
  assert.equal(gradeReference("Rom 12", "Romans 12:1-2").score, 1);
  // The numeral is part of the book, so the plain name is a different book.
  assert.equal(gradeReference("John 4", "1 John 4:19").bookOk, false);
  // One letter would match half the canon; two is the floor.
  assert.equal(gradeReference("p 34", "Psalm 34:8-9").bookOk, false);
});

test("gradeReference never charges for the verse", () => {
  assert.equal(gradeReference("Psalm 34:1", "Psalm 34:8-9").score, 1);
  assert.equal(gradeReference("Psalm 34:8", "Psalm 34:8-9").verseOk, true);
});
