/* Grading an attempt against the passage.
 *
 * Three exercises need real matching logic: "Write it out" (free recall, graded
 * word by word), its first-letter variant (a live reveal as you type), and Test
 * mode's typed reference ("where is this from?"). All are pure functions of the
 * passage — or its reference — and the raw text the member typed, so they can be
 * unit-tested without a browser.
 *
 * Comparison always runs through text.norm(), which lowercases and drops
 * punctuation — members are never marked wrong for a missing comma or capital. */

import { norm } from "./text.js";

/* How far ahead of the current position a word may be found and still count as
 * a match. This is what lets a member skip or transpose a word without every
 * later word falling out of alignment. */
const LOOKAHEAD = 3;

/* Split raw input into comparable tokens. In first-letter mode every letter or
 * digit is its own token, so "f t h w" and "fthw" grade identically. */
export function attemptTokens(typed, { firstLetters = false } = {}) {
  const text = typed || "";
  if (firstLetters) return text.toLowerCase().match(/[a-z0-9]/g) || [];
  return text.split(/\s+/).filter(Boolean).map(norm);
}

/* Whether a typed answer matches an expected word, ignoring case/punctuation. */
export const matchesWord = (expected, answer) => norm(answer || "") === norm(expected);

/* Grade a free-recall attempt word by word.
 *
 * Walks the passage in order, holding a cursor into the typed tokens. A word
 * counts as recalled if the cursor is on it, or if it turns up within the next
 * LOOKAHEAD tokens; the cursor then advances past the match. Returns one entry
 * per passage word plus the tally. */
export function gradeWritten(words, typed, { firstLetters = false } = {}) {
  const tokens = attemptTokens(typed, { firstLetters });
  const keyOf = (w) => (firstLetters ? norm(w).slice(0, 1) : norm(w));
  let cursor = 0;
  let hits = 0;
  const diff = words.map((word) => {
    const key = keyOf(word);
    const at = tokens.indexOf(key, cursor);
    const hit = tokens[cursor] === key || (at > -1 && at < cursor + LOOKAHEAD);
    if (hit) {
      cursor = Math.max(cursor + 1, at + 1);
      hits++;
    }
    return { word, hit };
  });
  return { diff, hits, total: words.length, score: words.length ? hits / words.length : 0 };
}

/* First-letter drill: map the Nth letter typed onto the Nth word.
 *
 * A correct initial pops the whole word into view ("right"); a wrong one shows
 * just the letter that was typed ("wrong"); anything not yet reached stays
 * masked ("hidden"). Unlike gradeWritten this is strictly positional — it is a
 * live reveal, so word N must correspond to keystroke N. */
export function revealFirstLetters(words, typed) {
  const tokens = attemptTokens(typed, { firstLetters: true });
  let hits = 0;
  const revealed = words.map((word, i) => {
    const got = tokens[i];
    const want = norm(word).slice(0, 1);
    if (got == null) return { text: word.replace(/[A-Za-z0-9]/g, "·"), state: "hidden" };
    if (got === want) {
      hits++;
      return { text: word, state: "right" };
    }
    return { text: got, state: "wrong" };
  });
  return { words: revealed, hits, total: words.length, score: words.length ? hits / words.length : 0 };
}

/* ── references ───────────────────────────────────────────────────────────── */

/* Comparison key for a book name: lowercase, letters and digits only, so
 * "1 Samuel", "1samuel" and "1 Sam." all reduce to the same stem. */
const bookKey = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/* Shortest abbreviation accepted as a book. Two letters lets "ps" stand for
 * Psalm and "ro" for Romans; one would let a stray "j" match John, James,
 * Jeremiah, and Joshua alike. */
const MIN_BOOK_CHARS = 2;

/* Book is worth half a mark, chapter the other half. */
export const REF_BOOK_WEIGHT = 0.5;

/* "1 Samuel 15:22" → { book: "1 Samuel", key: "1samuel", chapter: 15, verse: 22 }.
 *
 * The book part is whatever precedes the first number that is followed by the
 * end of the reference or a verse — non-greedy, so the leading digit of "1 John"
 * stays with the book. A trailing verse range keeps only its first verse; a
 * missing chapter comes back as null. */
export function parseReference(ref) {
  const m = /^\s*(.+?)\s*(\d+)\s*(?::\s*(\d+))?/.exec(ref || "");
  if (!m) return { book: String(ref || "").trim(), key: bookKey(ref), chapter: null, verse: null };
  return {
    book: m[1].trim(),
    key: bookKey(m[1]),
    chapter: Number(m[2]),
    verse: m[3] ? Number(m[3]) : null,
  };
}

/* Grade a typed reference against the passage's own.
 *
 * Book and chapter carry half a mark each. The book matches on a prefix, so a
 * member who writes "Ps 119" or "Rom 12" is not marked down for not spelling
 * the book out — but "John" never matches "1 John", since the numeral is part
 * of the stem. The verse is never scored: Test mode asks for book and chapter,
 * and offers the verse as optional, so getting it wrong costs nothing. */
export function gradeReference(typed, ref) {
  const want = parseReference(ref);
  const got = parseReference(typed);
  const bookOk = got.key.length >= MIN_BOOK_CHARS && (got.key === want.key || want.key.startsWith(got.key));
  const chapterOk = got.chapter != null && got.chapter === want.chapter;
  return {
    bookOk,
    chapterOk,
    verseOk: got.verse != null && got.verse === want.verse,
    score: (bookOk ? REF_BOOK_WEIGHT : 0) + (chapterOk ? 1 - REF_BOOK_WEIGHT : 0),
  };
}
