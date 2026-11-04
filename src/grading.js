/* Grading an attempt against the passage.
 *
 * Three exercises need real matching logic: "Write it out" (free recall, graded
 * word by word), its first-letter variant (a live reveal as you type), and Test
 * mode's typed reference ("where is this from?"). All are pure functions of the
 * passage, or its reference, and the raw text the member typed, so they can be
 * unit-tested without a browser.
 *
 * Comparison always runs through text.norm(), which lowercases and drops
 * punctuation, members are never marked wrong for a missing comma or capital. */

import { norm } from "./text.js";

/* Split raw input into comparable tokens. In first-letter mode every letter or
 * digit is its own token, so "f t h w" and "fthw" grade identically. */
export function attemptTokens(typed, { firstLetters = false } = {}) {
  const text = typed || "";
  if (firstLetters) return text.toLowerCase().match(/[a-z0-9]/g) || [];
  return text.split(/\s+/).filter(Boolean).map(norm);
}

/* Whether a typed answer matches an expected word, ignoring case/punctuation. */
export const matchesWord = (expected, answer) => norm(answer || "") === norm(expected);

/* Line the attempt up against the passage: which typed token, if any, each
 * passage word was given by. This is the longest common subsequence, which is
 * what a diff computes, so a word left out, a word put in, or a word got wrong
 * costs that one word and the words after it still line up with their own.
 *
 * It replaced a cursor that looked three tokens ahead (issue #78): a member who
 * stumbled over one word in the middle of a long passage, or put two words in
 * where one belonged, watched everything after it marked wrong, and could not
 * tell from the marked paper what had actually gone wrong.
 *
 * Returns, per passage word, the index of the token that matched it, or -1.
 * Where the alignment is ambiguous the earlier passage word is given up first,
 * so a mismatch reads as an omission before it reads as an insertion. */
function alignTokens(keys, tokens) {
  const n = keys.length;
  const m = tokens.length;
  // suffix[i][j]: how many words of keys[i..] can still be matched to tokens[j..]
  const suffix = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      suffix[i][j] = keys[i] === tokens[j] ? suffix[i + 1][j + 1] + 1 : Math.max(suffix[i + 1][j], suffix[i][j + 1]);
    }
  }
  const matched = new Array(n).fill(-1);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (keys[i] === tokens[j]) {
      matched[i] = j;
      i++;
      j++;
    } else if (suffix[i + 1][j] >= suffix[i][j + 1]) {
      i++; // this passage word was not given
    } else {
      j++; // this token belongs to no passage word
    }
  }
  return matched;
}

/* Grade a free-recall attempt word by word.
 *
 * Every passage word is either given by one of the typed tokens or missed, as
 * alignTokens decides. Returns one entry per passage word plus the tally.
 *
 * A miss also carries `typed`: what the member wrote in its place, mirroring
 * revealFirstLetters, which shows a wrong letter rather than just flagging it.
 * That is read off the alignment too: the tokens that matched nothing between
 * the last word given and the next one are what stood in for the words missed
 * between them, handed out one per missed word, with anything left over
 * joining the last. A word simply left out carries nothing, there is nothing
 * to show, and the mistake is the gap itself. */
export function gradeWritten(words, typed, { firstLetters = false } = {}) {
  const tokens = attemptTokens(typed, { firstLetters });
  const keyOf = (w) => (firstLetters ? norm(w).slice(0, 1) : norm(w));
  const matched = alignTokens(words.map(keyOf), tokens);
  const taken = new Set(matched.filter((j) => j >= 0));

  const diff = words.map((word, i) => ({ word, hit: matched[i] >= 0, typed: "" }));
  // Walk the runs of missed words between matched ones, pairing each run with
  // the unmatched tokens that sit in the same gap of the attempt.
  let i = 0;
  while (i < words.length) {
    if (matched[i] >= 0) {
      i++;
      continue;
    }
    let end = i;
    while (end < words.length && matched[end] < 0) end++;
    const from = i > 0 ? matched[i - 1] + 1 : 0;
    const to = end < words.length ? matched[end] : tokens.length;
    const spare = [];
    for (let j = from; j < to; j++) if (!taken.has(j)) spare.push(tokens[j]);
    for (let k = i; k < end; k++) {
      const last = k === end - 1;
      const mine = last ? spare.slice(k - i) : spare.slice(k - i, k - i + 1);
      diff[k].typed = mine.join(" ");
    }
    i = end;
  }

  const hits = matched.filter((j) => j >= 0).length;
  return { diff, hits, total: words.length, score: words.length ? hits / words.length : 0 };
}

/* A masked word's stand-in, the same three dots for every word, so a hidden
 * word gives away nothing about how long it is. One dot per letter would turn
 * the mask into a length hint, which defeats the point of hiding it. */
const HIDDEN_WORD = "···";

/* First-letter drill: map the Nth letter typed onto the Nth word.
 *
 * A correct initial pops the whole word into view ("right"); a wrong one shows
 * the word the member missed, marked wrong, and the drill moves on to the next
 * one; anything not yet reached stays masked ("hidden"). Unlike gradeWritten
 * this is strictly positional, it is a live reveal, so word N must correspond
 * to keystroke N.
 *
 * A miss shows the answer rather than the letter that was typed, and that is
 * the whole point of the exercise rather than a nicety: the member finds out
 * what the word was at the moment they could not produce it, which is when it
 * is worth knowing. It only works because the letter cannot be taken back,
 * see lockedInput, which is what makes the score mean something. */
export function revealFirstLetters(words, typed) {
  const tokens = attemptTokens(typed, { firstLetters: true });
  let hits = 0;
  const revealed = words.map((word, i) => {
    const got = tokens[i];
    const want = norm(word).slice(0, 1);
    if (got == null) return { text: HIDDEN_WORD, state: "hidden" };
    if (got === want) {
      hits++;
      return { text: word, state: "right" };
    }
    return { text: word, state: "wrong", typed: got };
  });
  return { words: revealed, hits, total: words.length, score: words.length ? hits / words.length : 0 };
}

/* What the first-letter box is allowed to become, the rule that makes the
 * drill a recall test rather than a typing exercise.
 *
 * Without it a member can always reach 100%: type a letter, see the word fail
 * to appear, backspace, try the next letter. The reveal is live, so the box is
 * answering its own question. So the box only ever grows: an edit that is not
 * `prev` with something added is refused outright and the box keeps what it
 * had. That covers backspace, select-all-and-retype, and putting the cursor
 * back into the middle, without any of them needing to be named, the one
 * shape that is allowed is the one a member typing forwards produces.
 *
 * Starting over is still allowed, just not silently: Try again and switching
 * the scaffold off and on both clear the box outright, which is a fresh
 * attempt rather than a repaired one. */
export function lockedInput(prev, next) {
  const before = prev || "";
  const after = next || "";
  return after.startsWith(before) ? after : before;
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
 * end of the reference or a verse, non-greedy, so the leading digit of "1 John"
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
 * the book out, but "John" never matches "1 John", since the numeral is part
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
