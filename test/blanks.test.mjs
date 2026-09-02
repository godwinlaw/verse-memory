import test from "node:test";
import assert from "node:assert/strict";

import { keyBlankSet, chunksFor, BLANK_LEVELS, BLANK_PARITIES, SCRAMBLE_LEVELS } from "../src/blanks.js";
import { passages } from "../data/passages.js";

/* ── the alternating level ────────────────────────────────────────────────── */

const ALTERNATE = BLANK_LEVELS.findIndex((l) => l.alternate);
const SAMPLE = "You yourselves have seen what I did to the Egyptians";

test("the alternating level blanks every other word, whatever the words are", () => {
  const words = SAMPLE.split(" ");
  assert.deepEqual(
    [...keyBlankSet(SAMPLE, 999, ALTERNATE, 0)].sort((a, b) => a - b),
    [0, 2, 4, 6, 8],
  );
  assert.deepEqual(
    [...keyBlankSet(SAMPLE, 999, ALTERNATE, 1)].sort((a, b) => a - b),
    [1, 3, 5, 7, 9],
  );
  // Together they are the whole passage and they never overlap, which is what
  // makes turning it over worth doing.
  const a = keyBlankSet(SAMPLE, 999, ALTERNATE, 0);
  const b = keyBlankSet(SAMPLE, 999, ALTERNATE, 1);
  assert.equal(a.size + b.size, words.length);
  assert.equal([...a].filter((i) => b.has(i)).length, 0);
});

test("it ignores the keyword pool a passage may have", () => {
  // Passage 1 has precomputed keywords; the alternating level is not interested,
  // and a function word being blank is the point rather than a bug.
  const p = passages[0];
  const chosen = keyBlankSet(p.text, p.id, ALTERNATE, 0);
  const words = p.text.split(" ");
  assert.equal(chosen.size, Math.ceil(words.length / 2));
  for (const i of chosen) assert.equal(i % 2, 0);
});

test("parity is ignored by every level that has no two halves", () => {
  const p = passages[0];
  for (const level of [0, 1, 2]) {
    assert.deepEqual(
      [...keyBlankSet(p.text, p.id, level, 0)].sort(),
      [...keyBlankSet(p.text, p.id, level, 1)].sort(),
      `level ${level} should not read parity`,
    );
  }
});

test("a one-word passage is blanked one way round and not the other", () => {
  // No half to fall back on. Better an empty exercise the member can flip than
  // an invented blank that does not match the label they picked.
  assert.equal(keyBlankSet("Rejoice", 999, ALTERNATE, 0).size, 1);
  assert.equal(keyBlankSet("Rejoice", 999, ALTERNATE, 1).size, 0);
});

test("there are two ways round and they are named by counting", () => {
  assert.equal(BLANK_PARITIES.length, 2);
  // "Odd" and "even" would leave the member working out where the count starts.
  for (const p of BLANK_PARITIES) assert.match(p.label, /\d/);
});

test("keyBlankSet picks valid, in-range word indices", () => {
  const p = passages[0];
  const words = p.text.split(" ");
  const blanks = keyBlankSet(p.text, p.id, 1);
  assert.ok(blanks.size > 0, "should blank at least one word");
  for (const i of blanks) assert.ok(i >= 0 && i < words.length, `index ${i} in range`);
  // Fuller level blanks at least as many words as the light level.
  assert.ok(keyBlankSet(p.text, p.id, 2).size >= keyBlankSet(p.text, p.id, 0).size);
  assert.equal(BLANK_LEVELS.length, 4);
});

test("chunksFor splits a passage into ordered chunks that rejoin to the text", () => {
  const p = passages[0];
  for (let level = 0; level < SCRAMBLE_LEVELS.length; level++) {
    const chunks = chunksFor(p.text, level);
    assert.ok(chunks.length >= 1);
    assert.equal(chunks.join(" ").replace(/\s+/g, " ").trim(), p.text.replace(/\s+/g, " ").trim());
  }
});

/* ── verse-unit chunking ──────────────────────────────────────────────────── */

/* Nine verses, the shape of one section of a long chapter (Hebrews 11:8-16).
 * Deliberately written so every verse is long enough that punctuation alone
 * would cut them into far more pieces than there are verses, which is exactly
 * the difference the verse path exists to make. */
const VERSES = Array.from({ length: 9 }, (_, i) => `Verse ${i + 1} says one thing, and then it says another thing.`);
const VERSE_TEXT = VERSES.join(" ");

const COARSE = 0;
const MEDIUM = 1;
const FINE = 2;

test("a verse-structured passage is cut on its verses, one per chunk at the finest level", () => {
  const chunks = chunksFor(VERSE_TEXT, FINE, VERSES);
  assert.deepEqual(chunks, VERSES);
});

test("the coarser levels group verses rather than splitting them", () => {
  const medium = chunksFor(VERSE_TEXT, MEDIUM, VERSES);
  const coarse = chunksFor(VERSE_TEXT, COARSE, VERSES);
  assert.equal(medium.length, 5); // nine verses, two at a time
  assert.equal(coarse.length, 3); // three at a time
  assert.equal(medium[0], VERSES[0] + " " + VERSES[1]);
  assert.equal(coarse[0], VERSES.slice(0, 3).join(" "));
});

test("every level puts the whole passage back, in order", () => {
  for (const level of [COARSE, MEDIUM, FINE]) {
    assert.equal(chunksFor(VERSE_TEXT, level, VERSES).join(" "), VERSE_TEXT, `level ${level} lost text`);
  }
});

test("a chapter longer than the level's cap is grouped up until it fits", () => {
  // Forty verses at the finest level would be forty tiles to place; the
  // maxChunks fold the punctuation path already had applies here too.
  const many = Array.from({ length: 40 }, (_, i) => `Verse ${i + 1} of it.`);
  const chunks = chunksFor(many.join(" "), FINE, many);
  assert.ok(chunks.length <= SCRAMBLE_LEVELS[FINE].maxChunks, `got ${chunks.length} chunks`);
  assert.equal(chunks.join(" "), many.join(" "));
});

test("a passage with no verses chunks exactly as it did before", () => {
  const text = "For God so loved the world, that he gave his only Son, that whoever believes in him should not perish.";
  for (const level of [COARSE, MEDIUM, FINE]) {
    assert.deepEqual(chunksFor(text, level, null), chunksFor(text, level));
  }
});

test("a passage of one or two verses takes the punctuation path", () => {
  // Two verses would be two tiles, a choice between two, which is no exercise.
  // Under the threshold the punctuation cut gives a real one.
  const two = ["The Lord is my shepherd; I shall not want.", "He makes me lie down in green pastures."];
  const text = two.join(" ");
  assert.deepEqual(chunksFor(text, FINE, two), chunksFor(text, FINE));
});
