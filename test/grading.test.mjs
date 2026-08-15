import test from "node:test";
import assert from "node:assert/strict";

import { gradeWritten, revealFirstLetters } from "../src/grading.js";

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
