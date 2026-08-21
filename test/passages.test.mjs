/* The shipped passage set: that it is well-formed, and that it stays inside the
 * ESV API's licence.
 *
 * The licence half is the point of this file. Crossway's v3 terms cap how much
 * of their text may be stored and displayed — no more than 500 consecutive
 * verses, and no more than half of any one book — and the natural way to breach
 * that is not a bad line of code but a well-meant addition to
 * tools/new-passages.json. So the limits are asserted over what we actually
 * ship, where they can fail the build, rather than left in the README where
 * they can only be remembered. */

import test from "node:test";
import assert from "node:assert";

import { passages } from "../data/passages.js";
import { keywordIndices } from "../data/keywords.js";
import { CATEGORIES, categoryOf } from "../src/categories.js";

const KEYS = new Set(CATEGORIES.map((c) => c.key));

/* Verses per book, for the books the set actually draws on. Only needed for the
 * half-a-book rule, so it is not the whole canon — a book added to the set
 * without a total here fails loudly below rather than skipping the check. */
const BOOK_VERSES = {
  Genesis: 1533,
  Exodus: 1213,
  Leviticus: 859,
  Numbers: 1288,
  Deuteronomy: 959,
  Joshua: 658,
  "1 Samuel": 810,
  "1 Chronicles": 942,
  "2 Chronicles": 822,
  Nehemiah: 406,
  Job: 1070,
  Psalm: 2461,
  Proverbs: 915,
  Ecclesiastes: 222,
  Isaiah: 1292,
  Jeremiah: 1364,
  Lamentations: 154,
  Ezekiel: 1273,
  Daniel: 357,
  Hosea: 197,
  Joel: 73,
  Amos: 146,
  Jonah: 48,
  Micah: 105,
  Habakkuk: 56,
  Zephaniah: 53,
  Zechariah: 211,
  Malachi: 55,
  Matthew: 1071,
  Mark: 678,
  Luke: 1151,
  John: 879,
  Acts: 1007,
  Romans: 433,
  "1 Corinthians": 437,
  "2 Corinthians": 257,
  Galatians: 149,
  Ephesians: 155,
  Philippians: 104,
  Colossians: 95,
  "1 Thessalonians": 89,
  "2 Thessalonians": 47,
  "1 Timothy": 113,
  "2 Timothy": 83,
  Titus: 46,
  Philemon: 25,
  Hebrews: 303,
  James: 108,
  "1 Peter": 105,
  "2 Peter": 61,
  "1 John": 105,
  "2 John": 13,
  "3 John": 15,
  Jude: 25,
  Revelation: 404,
};

/* The verses one record covers, as chapter/verse pairs. "Hebrews 11:8-16" is
 * nine of them; "Psalm 23" is however many its `verses` array holds. */
function versesCovered(p) {
  const ranged = p.ref.match(/^(.+?)\s+(\d+):(\d+)(?:[-–](\d+))?$/);
  if (ranged) {
    const chapter = Number(ranged[2]);
    const from = Number(ranged[3]);
    const to = ranged[4] ? Number(ranged[4]) : from;
    return Array.from({ length: to - from + 1 }, (_, i) => [chapter, from + i]);
  }
  // A whole chapter ("Psalm 1"), which only the verse-structured records are.
  const whole = p.ref.match(/^(.+?)\s+(\d+)$/);
  if (whole && p.verses) {
    const chapter = Number(whole[2]);
    return p.verses.map((_, i) => [chapter, i + 1]);
  }
  return [];
}

test("every passage is well-formed", () => {
  const ids = new Set();
  for (const p of passages) {
    assert.ok(!ids.has(p.id), `duplicate id ${p.id}`);
    ids.add(p.id);
    assert.ok(p.ref && p.book && p.text, `${p.id} is missing a field`);
    assert.ok(p.testament === "OT" || p.testament === "NT", `${p.ref} has no testament`);
    assert.ok(KEYS.has(categoryOf(p)), `${p.ref} is in an unknown category`);
  }
});

test("a verse-structured passage joins back to its own text", () => {
  const structured = passages.filter((p) => p.verses);
  // The long passages are the reason `verses` exists; if this ever drops to
  // zero the verse-unit chunking is silently doing nothing.
  assert.ok(structured.length > 0, "no passage carries verses");
  for (const p of structured) {
    assert.ok(Array.isArray(p.verses) && p.verses.length > 0, `${p.ref} has an empty verses array`);
    assert.equal(p.text, p.verses.join(" "), `${p.ref}: text and verses disagree`);
    // A newline or a double space here would put an empty token in the middle
    // of text.split(" "), which is what keywords.js indexes against.
    assert.ok(!/\s\s|\n/.test(p.text), `${p.ref} has collapsed whitespace trouble`);
  }
});

test("keyword indices line up with the passage they belong to", () => {
  for (const p of passages) {
    const words = p.text.split(" ").length;
    for (const i of keywordIndices[p.id] || []) {
      assert.ok(i >= 0 && i < words, `${p.ref}: keyword index ${i} is outside ${words} words`);
    }
  }
});

/* ── the ESV licence ──────────────────────────────────────────────────────── */

test("no book is stored past half its verses", () => {
  const stored = {};
  for (const p of passages) {
    for (const [chapter, verse] of versesCovered(p)) {
      (stored[p.book] ||= new Set()).add(chapter + ":" + verse);
    }
  }
  for (const [book, verses] of Object.entries(stored)) {
    const total = BOOK_VERSES[book];
    assert.ok(total, `${book} has no verse total — add it to BOOK_VERSES`);
    assert.ok(
      verses.size <= total / 2,
      `${book}: ${verses.size} of ${total} verses stored, over the half-a-book limit`,
    );
  }
});

test("no run of 500 consecutive verses is stored", () => {
  const byBook = {};
  for (const p of passages) {
    for (const [chapter, verse] of versesCovered(p)) {
      (byBook[p.book] ||= []).push(chapter * 1000 + verse);
    }
  }
  for (const [book, marks] of Object.entries(byBook)) {
    const sorted = [...new Set(marks)].sort((a, b) => a - b);
    let run = 1;
    let longest = 1;
    for (let i = 1; i < sorted.length; i++) {
      run = sorted[i] === sorted[i - 1] + 1 ? run + 1 : 1;
      longest = Math.max(longest, run);
    }
    assert.ok(longest <= 500, `${book}: a run of ${longest} consecutive verses, over the 500 limit`);
  }
});
