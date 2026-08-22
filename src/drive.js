/* Drive mode: the hands-free recitation loop, as a pure module.
 *
 * The session is a cycle — PROMPT (speak the reference) → LISTEN (the member
 * recites) → GRADE → FEEDBACK (speak how it went) → NEXT (advance the queue,
 * wrapping) — and this file models all of it that can be modelled without a
 * browser: what to say, how to mark what was heard, and where the queue goes
 * next. The microphone, the voice and the silence timer live in App.js, which
 * is why nothing here holds a timer or touches the DOM.
 *
 * Grading reuses gradeWritten() against the raw transcript: an engine hands
 * back lowercase unpunctuated words, and norm() already makes the comparison
 * blind to case and punctuation, so the recital is marked by exactly the rule
 * a typed attempt is. Drive mode is practice only — nothing here (or in its
 * callers) writes progress or moves a verse along the ladder. Giving a clean
 * drive recital SRS credit is follow-up work. */

import { gradeWritten } from "./grading.js";
import { copy } from "./copy.js";

export const DRIVE_MODES = ["passage", "word", "verse"];
export const DRIVE_PHASES = ["idle", "prompt", "listen", "feedback"];

/* What the speaker says to open a turn. */
export const promptFor = (passage) => copy.drive.prompt(passage.ref);

/* The queue wraps rather than ends — the loop runs until the member stops it. */
export const nextIndex = (index, queueLength) => (queueLength ? (index + 1) % queueLength : 0);

/* The phase after this one. GRADE is instantaneous (it happens between LISTEN
 * and FEEDBACK, inside feedbackFor), so the cycle the driver walks is three
 * phases long; leaving FEEDBACK is also what advances the queue. */
export function nextPhase({ phase, index, queueLength }) {
  if (phase === "prompt") return { phase: "listen", index };
  if (phase === "listen") return { phase: "feedback", index };
  return { phase: "prompt", index: nextIndex(index, queueLength) };
}

/* Slice one graded diff into per-verse tallies. The passage was graded whole —
 * so a word said early still matches within gradeWritten's lookahead — and the
 * verses then read their own words back out of the diff by position, since a
 * passage's text is the flat join of its verses. */
function perVerseOf(diff, verses) {
  const out = [];
  let at = 0;
  verses.forEach((verse, i) => {
    const count = verse.text.split(" ").length;
    const slice = diff.slice(at, at + count);
    const hits = slice.filter((w) => w.hit).length;
    out.push({ verse: i + 1, score: count ? hits / count : 0, pct: count ? Math.round((hits / count) * 100) : 0 });
    at += count;
  });
  return out;
}

/* Mark a recital and compose what the speaker says about it.
 *
 * Always returns { score, pct, spokenFeedback }; `perWord` rides along in word
 * mode (one entry per passage word, plus the missed words the feedback names)
 * and `perVerse` in verse mode when the passage carries a `verses` array — a
 * single-verse passage in verse mode just gets the whole-passage sentence. */
export function feedbackFor(passage, transcript, mode) {
  const said = (transcript || "").trim();
  const graded = gradeWritten(passage.text.split(" "), said);
  const pct = Math.round(graded.score * 100);
  const result = { score: graded.score, pct, spokenFeedback: "" };

  if (!said) {
    result.spokenFeedback = copy.drive.nothingHeard;
    return result;
  }

  const parts = [copy.drive.scoreSpoken(pct)];
  if (mode === "word") {
    result.perWord = graded.diff.map((w) => ({ word: w.word, hit: w.hit }));
    const missed = graded.diff.filter((w) => !w.hit).map((w) => w.word);
    result.missed = missed;
    // Cap what is read aloud — a badly missed chapter should not be recited
    // back at the member word by word while they drive.
    if (missed.length) parts.push(copy.drive.missedWords(missed.slice(0, MAX_SPOKEN_MISSES)));
  }
  if (mode === "verse" && Array.isArray(passage.verses) && passage.verses.length > 1) {
    result.perVerse = perVerseOf(graded.diff, passage.verses);
    result.perVerse.forEach((v) => parts.push(copy.drive.verseSpoken(v.verse, v.pct)));
  }
  result.spokenFeedback = parts.join(" ");
  return result;
}

export const MAX_SPOKEN_MISSES = 8;
