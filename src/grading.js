/* Grading an attempt against the passage.
 *
 * Two exercises need real matching logic: "Write it out" (free recall, graded
 * word by word) and its first-letter variant (a live reveal as you type). Both
 * are pure functions of the passage's words and the raw text the member typed,
 * so they can be unit-tested without a browser.
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
