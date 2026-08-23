/* Speak mode: the hands-free recitation loop, as a pure module.
 *
 * The session is a cycle — PROMPT (speak the reference) → LISTEN (the member
 * recites) → GRADE → FEEDBACK (speak how it went) → NEXT (advance the queue,
 * wrapping) — and this file models all of it that can be modelled without a
 * browser: what to say, how to mark what was heard, and where the queue goes
 * next. The microphone, the voice and the silence timer live in App.js, which
 * is why nothing here holds a timer or touches the DOM.
 *
 * Grading is `recital.js`, not `grading.js`, and the difference is the whole
 * reason this mode became usable. `gradeWritten()` is exact and positional,
 * which is right for something typed and wrong for something said: its cursor
 * only advances on a match, so three words the engine put in that the passage
 * did not want desynchronized it for the rest of the verse. A word-perfect
 * Proverbs 3:5-6 preceded by "trust in the— " — a false start, the commonest
 * thing in real recitation — scored 14%. The member had recited it perfectly.
 *
 * `scoreRecital()` aligns instead, and charges almost nothing for a word nobody
 * asked for, so false starts, self-corrections and the engine's own noise are
 * free by construction while a genuinely forgotten clause still costs exactly
 * what it should. grading.js stays exactly as it was: nothing a member *types*
 * is forgiven, and the two graders never have to agree.
 *
 * Speak mode is practice only — nothing here (or in its callers) writes
 * progress or moves a verse along the ladder. Giving a clean spoken recital SRS
 * credit is follow-up work, and `strictScore` is the figure that gate should
 * read when it is built: it never counts the phonetic tier. */

import { scoreRecital } from "./recital.js";
import { copy } from "./copy.js";

export const SPEAK_MODES = ["passage", "word", "verse"];
export const SPEAK_PHASES = ["idle", "prompt", "listen", "feedback"];

/* What the speaker says to open a turn. */
export const promptFor = (passage) => copy.speak.prompt(passage.ref);

/* The queue wraps rather than ends — the loop runs until the member stops it. */
export const nextIndex = (index, queueLength) => (queueLength ? (index + 1) % queueLength : 0);

/* The phase after this one. GRADE is instantaneous (it happens between LISTEN
 * and FEEDBACK, inside feedbackFor), so the cycle the speakr walks is three
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
    /* A verse is a plain string — `data/passages.js` stores `verses` as an
     * array of strings whose join is `text` (test/passages.test.mjs asserts
     * exactly that). Reading `.text` off one gave `undefined.split`, which
     * threw on every real multi-verse passage in the set; the unit test missed
     * it because its fixture invented a `{ v, text }` shape nothing ships.
     * Accepting either keeps that fixture honest and the data working. */
    const line = typeof verse === "string" ? verse : verse.text || "";
    const count = line.split(" ").filter(Boolean).length;
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
  const graded = scoreRecital(passage, said);
  const result = {
    score: graded.score || 0,
    pct: graded.pct,
    strictScore: graded.strictScore,
    verbose: graded.verbose,
    abstained: graded.abstained,
    spokenFeedback: "",
  };

  /* Nothing worth marking came back — an empty recital, or a transcript with
   * too little of the passage in it to be a reading of it at all. Saying "seven
   * percent" to a member whose microphone was covered is a figure about the
   * app's own failure, dressed up as theirs. */
  if (graded.abstained) {
    result.pct = null;
    result.spokenFeedback = copy.speak.nothingHeard;
    return result;
  }

  const parts = [];
  if (mode === "word") {
    result.perWord = graded.diff.map((w) => ({ word: w.word, hit: w.hit }));
    const missed = graded.diff.filter((w) => !w.hit).map((w) => w.word);
    result.missed = missed;
    // Cap what is read aloud — a badly missed chapter should not be recited
    // back at the member word by word while they drive.
    if (missed.length) parts.push(copy.speak.missedWords(missed.slice(0, MAX_SPOKEN_MISSES)));
  }
  if (mode === "verse" && Array.isArray(passage.verses) && passage.verses.length > 1) {
    result.perVerse = perVerseOf(graded.diff, passage.verses);
    result.perVerse.forEach((v) => parts.push(copy.speak.verseSpoken(v.verse, v.pct)));
  }
  result.spokenFeedback = parts.join(" ");
  return result;
}

export const MAX_SPOKEN_MISSES = 8;

/* ── the shape of a turn ─────────────────────────────────────────────────────
 *
 * What the session does after a recital, and why it is bands rather than a
 * number. "Sixty-two percent correct" is a figure with nothing attached to it:
 * a member at the wheel can neither act on it nor tell which words it is about,
 * and hearing one after every verse is what made the loop feel like it was
 * taking something and giving nothing back.
 *
 * The thing worth giving back is the verse. So three of these four bands end
 * with the passage read aloud, which is both the feedback and the next
 * repetition — it is the beat a recall drill has always had (prompt, silence,
 * attempt, *answer*) and the one this loop was missing. A clean recital is
 * answered with speed instead, which is the only reward worth anything to
 * somebody driving. */
export const BANDS = ["clean", "close", "shaky", "lost"];
export const BAND_CLEAN = 0.95;
export const BAND_CLOSE = 0.8;
export const BAND_SHAKY = 0.55;

export function bandFor(score) {
  if (score >= BAND_CLEAN) return "clean";
  if (score >= BAND_CLOSE) return "close";
  if (score >= BAND_SHAKY) return "shaky";
  return "lost";
}

/* How long to let a silence run before taking the recital as finished.
 *
 * A flat window is wrong in both directions, and the short one is the one that
 * hurts: the pause in a half-remembered verse is exactly where the recall is
 * happening, so a member who stops to think is cut off and marked on the
 * fragment. So the window widens when what has been heard so far is plainly
 * short of the passage — the app can see it is not finished, and waits like a
 * person would. When the transcript already covers the passage there is
 * nothing to wait for, and the shorter window keeps the session moving. */
export const SILENCE_DONE_MS = 2000;
export const SILENCE_THINKING_MS = 4500;
export const COVERED_RATIO = 0.7;

export function silenceMsFor(passage, heard) {
  const want = String(passage.text || "")
    .split(/\s+/)
    .filter(Boolean).length;
  const got = String(heard || "")
    .split(/\s+/)
    .filter(Boolean).length;
  if (!want) return SILENCE_DONE_MS;
  return got / want >= COVERED_RATIO ? SILENCE_DONE_MS : SILENCE_THINKING_MS;
}

/* The prompter: the next few words, for a member who has dried up.
 *
 * The first-letter scaffold is what a member on a screen reaches for when a
 * verse will not come, and Speak mode had no equivalent — being stuck meant
 * waiting out the silence and being marked on nothing. Feeding the next few
 * words is the same help in the only form a car can take it, and the alignment
 * is positional (the Nth word heard is the Nth word of the passage), which is
 * the same assumption the scaffold and voice.js already make. */
export const PROMPT_WORDS = 3;

export function promptWordsFor(passage, heard, count = PROMPT_WORDS) {
  const words = String(passage.text || "")
    .split(/\s+/)
    .filter(Boolean);
  const said = String(heard || "")
    .split(/\s+/)
    .filter(Boolean).length;
  return words.slice(said, said + count).join(" ");
}

/* ── speaking to the app rather than to the verse ───────────────────────────
 *
 * Hands-free has to mean hands-free, so a member has to be able to ask for a
 * hint or leave without reaching for the screen. The risk is obvious: every one
 * of these words could also be a word of scripture, and mistaking a recital for
 * an instruction is worse than having no commands at all.
 *
 * Two things make it safe. The vocabulary was checked against all 183 shipped
 * passages and these six appear in none of them (the obvious candidate, "help",
 * appears in the Psalms and is deliberately not here — "hint" is the free one).
 * And a command is only read as a command when it is *all* that was heard: a
 * member reciting says a verse, not a single word, so a lone word is never a
 * recital being thrown away. */
export const COMMANDS = ["hint", "skip", "repeat", "stop", "again", "slower"];
const COMMAND_MAX_WORDS = 2;

export function commandIn(transcript) {
  const words = String(transcript || "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length || words.length > COMMAND_MAX_WORDS) return null;
  const found = words.find((w) => COMMANDS.includes(w));
  return found || null;
}
