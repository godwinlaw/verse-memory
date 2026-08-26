/* Scoring a spoken recitation.
 *
 * `gradeWritten()` walks the passage holding a cursor into the transcript that
 * only ever moves forward on a match, and looks no more than three tokens ahead
 * for one. Those two properties together mean that any three consecutive tokens
 * the recognizer emits which the passage did not want desynchronize it
 * permanently: the cursor falls behind, every later word looks for itself
 * further ahead than the lookahead reaches, misses, and so fails to advance the
 * cursor, which guarantees the next word misses too. Measured on the real data,
 * a word-perfect recital of Proverbs 3:5-6 preceded by the three-word false
 * start "trust in the…" — which is simply what recitation sounds like — scores
 * **14%**. That is not a tuning problem, it is a cliff at exactly LOOKAHEAD,
 * and it is why this module exists.
 *
 * The replacement is Needleman–Wunsch global alignment over two normalized word
 * sequences, and **the asymmetry of its gap costs is the whole design**: a
 * reference word the member failed to produce costs a full point, while a heard
 * word the passage never wanted costs almost nothing. Run the false start
 * through it — three repeated words absorbed as insertions cost 3 × 0.20 =
 * 0.60, against 3 × 1.00 = 3.00 for the alternative of substituting them
 * against `Lord with all` and then shifting back. The cheap path wins by a
 * factor of five, and it wins for every disfluency of every length. Fillers,
 * false starts, self-corrections, doubled words and the recognizer's own noise
 * become free *by construction*. **No filler word-list is doing that work.**
 *
 * Global, not local, and that matters: Smith–Waterman would find the
 * best-matching *substring*, which is precisely wrong here — a member who
 * recites the first third of Psalm 23 beautifully and then stops must not score
 * 100% on a well-aligned fragment. The denominator is the whole passage, so the
 * alignment has to span the whole passage.
 *
 * The figure this reports is **word accuracy against a known reference**,
 * `1 − (S + D) / N`, and it is deliberately not the ASR literature's Word Error
 * Rate. WER counts insertions and is therefore unbounded above; it is the right
 * measure for judging a *recognizer* against an unknown utterance and the wrong
 * one for telling somebody in a car how much of Psalm 23 they gave back. Keep
 * the alignment, discard the metric.
 *
 * Two things the score is not allowed to be. It is never a number about a
 * transcript that carries no signal — a three-token transcript scoring 3% is a
 * microphone that cut out, not a failure, and asserting a figure about it is a
 * lie (see the abstention rule below). And it is never inflated by talking
 * more: each reference word can be credited at most once, so no amount of extra
 * speech can push the score past what was actually produced. A recital carrying
 * half again as many tokens as the passage has words is flagged `verbose`
 * rather than adjusted, and it is the *caller's* business — a commit gate's,
 * say — to decide that such a transcript is not evidence.
 *
 * Pure: no DOM, no timers, no data imports. Everything it knows about a passage
 * it works out from `passage.text` at call time. */

import { norm } from "./text.js";
import { wordMatch } from "./wordmatch.js";

/* The scoring matrix.
 *
 * Substitution and omission cost the same, and that is a judgement rather than
 * an oversight: for a memorization app "said nothing" and "said the wrong
 * thing" are one failure — the word was not recalled — and weighting one above
 * the other would need an argument for which is worse, of which there is none.
 * They differ only in what the feedback can say, which is why the diff carries
 * the operation kind.
 *
 * The three graded match tiers are priced apart rather than all set to zero so
 * that a tie prefers the exact reading, and the phonetic tier is deliberately
 * the most expensive match there is.
 *
 * **Insertion is cheap but not free**, for three reasons. A zero would make the
 * aligner indifferent between many equal-cost paths, which makes the traceback
 * — and so the diff the member is shown — arbitrary. It would remove the
 * tie-break that keeps matched runs contiguous, which is what makes a diff
 * readable. And it would let a transcript grow without bound at no cost.
 *
 * One inequality has to hold and `test/recital.test.mjs` pins it:
 * `INS + OMIT > SUB`, i.e. 1.20 > 1.00. Both readings of a genuine one-for-one
 * word swap cost the same in the *score* — one uncredited reference word either
 * way — but only the substitution reading lets the feedback say "you said
 * *hard* where the verse says *heart*", and that is the feedback worth giving.
 * It holds narrowly and on purpose; a retune must not quietly break it. */
export const COST = {
  EXACT: 0,
  HOMOPHONE: 0,
  EDIT: 0.15,
  PHONETIC: 0.3,
  SUB: 1,
  OMIT: 1,
  INS: 0.2,
  MERGE: 0.1,
  SPLIT: 0.1,
};

/* Abstention thresholds. See scoreRecital for the argument. */
export const MIN_SIGNAL_RATIO = 0.3;
export const MAX_SIGNAL_TOKENS = (n) => n * 4 + 32;
export const MIN_SIGNAL_TOKENS = 3;
export const VERBOSE_RATIO = 1.5;
export const ABSTAIN = { EMPTY: "empty", SHORT: "too-short", FLOOD: "flood" };

/* What a tier costs to pair, and which tiers the strict figure will admit. The
 * strict score exists so that the one tier most likely to credit a genuinely
 * wrong word is fenced off from the one decision where being wrong has a
 * consequence; it is the only figure a commit gate should ever read. */
const TIER_COST = { exact: COST.EXACT, homophone: COST.HOMOPHONE, edit: COST.EDIT, phonetic: COST.PHONETIC };
const STRICT_TIERS = new Set(["exact", "homophone", "edit"]);
const CREDIT_TIERS = new Set(["exact", "homophone", "edit", "phonetic"]);

/* ── the transcript, before anything is aligned ───────────────────────────── */

/* Genuine non-words only, and the reason for the list is not the one it looks
 * like: **fillers are already free**, because an insertion costs nothing in the
 * score and the denominator is the reference length. The list is here to stop
 * them accidentally *matching*. A two-letter "um" is gated out of every loose
 * tier by length alone, but "wait" is four letters and would one-edit-match
 * `want` in "I shall not want", and "right" would reach `night`, `might` and
 * `light`. So real words are deliberately left off it — "wait", "sorry" and
 * "no" are sometimes in the verse, and the aligner absorbs them correctly as
 * insertions anyway.
 *
 * The same reasoning is what makes the strip **passage-aware** rather than
 * absolute: a word the verse itself contains is never an accident. Psalm 34:8
 * opens "Oh, taste and see", and stripping that "oh" cost a word-perfect
 * recital of it two words — which the "every passage recited perfectly scores
 * 1.00" property test caught. A list of non-words is only a list of non-words
 * until the canon disagrees, and the canon is the authority here. */
const DISFLUENCIES = new Set(["um", "uh", "umm", "uhh", "er", "erm", "hmm", "mhm", "mm", "ah", "oh"]);

/* Contractions are a **transcript-side** problem and only that. Verified
 * against the shipped text: the passages contain no contractions at all, only
 * possessives, and `norm()` already drops the apostrophe out of every one of
 * those. What does happen is the recognizer writing `don't` where the ESV has
 * `do not`, which costs a word.
 *
 * The split operation below handles most of these structurally — "donot" and
 * "dont" are within one edit — and this table is for the ones one edit cannot
 * reach, such as `I'll` → `i will`, which is two. Both ship, because the
 * structural fix generalizes to contractions nobody listed and the table
 * catches the ones the structure misses.
 *
 * Keyed on the apostrophe-bearing form rather than on the bare letters, which
 * matters exactly once: `its` is a real word in this corpus ("you have
 * increased its joy" in Isaiah 9) and must not be expanded to "it is". */
const CONTRACTIONS = {
  "don't": ["do", "not"],
  "doesn't": ["does", "not"],
  "didn't": ["did", "not"],
  "isn't": ["is", "not"],
  "aren't": ["are", "not"],
  "wasn't": ["was", "not"],
  "won't": ["will", "not"],
  "can't": ["can", "not"],
  "couldn't": ["could", "not"],
  "shouldn't": ["should", "not"],
  "wouldn't": ["would", "not"],
  "it's": ["it", "is"],
  "that's": ["that", "is"],
  "there's": ["there", "is"],
  "here's": ["here", "is"],
  "he's": ["he", "is"],
  "she's": ["she", "is"],
  "what's": ["what", "is"],
  "let's": ["let", "us"],
  "i'll": ["i", "will"],
  "you'll": ["you", "will"],
  "we'll": ["we", "will"],
  "they'll": ["they", "will"],
  "i'm": ["i", "am"],
  "you're": ["you", "are"],
  "we're": ["we", "are"],
  "they've": ["they", "have"],
  "i've": ["i", "have"],
  "i'd": ["i", "would"],
  "you'd": ["you", "would"],
};

const ONES = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const ORDINALS = [
  "zeroth",
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
  "tenth",
  "eleventh",
  "twelfth",
  "thirteenth",
  "fourteenth",
  "fifteenth",
  "sixteenth",
  "seventeenth",
  "eighteenth",
  "nineteenth",
  "twentieth",
];
const SCALES = [
  [1e9, "billion"],
  [1e6, "million"],
  [1000, "thousand"],
  [100, "hundred"],
];

/* Numerals are a one-directional risk and the direction is worth stating,
 * because it is the opposite of what you would guess. Measured: `\d` matches in
 * exactly four shipped passages, and in every one of them the digits are the
 * embedded-reference leak handled further down — **the passage side of this
 * corpus contains no real numerals at all.** Number *words* do appear, all
 * spelled out (`one` fifty-three times, `thousand` three). So the only thing
 * that can go wrong is the member saying "one" and the recognizer writing `1`.
 *
 * Expanded to *tokens* rather than to one token — "32" becomes `thirty` `two` —
 * so the merge and split operations reconcile it against however the reference
 * happens to write it, and this table never has to know which side is which. */
function cardinalWords(n) {
  if (!Number.isFinite(n) || n < 0 || n > 1e12) return [];
  if (n < 20) return [ONES[n]];
  if (n < 100) {
    const rest = n % 10;
    const tens = TENS[Math.floor(n / 10)];
    return rest ? [tens, ONES[rest]] : [tens];
  }
  for (const [size, name] of SCALES) {
    if (n >= size) {
      const head = [...cardinalWords(Math.floor(n / size)), name];
      const rest = n % size;
      return rest ? [...head, ...cardinalWords(rest)] : head;
    }
  }
  return [];
}

function ordinalWords(n) {
  if (n >= 0 && n <= 20) return [ORDINALS[n]];
  const words = cardinalWords(n);
  if (!words.length) return [];
  const last = words[words.length - 1];
  const head = words.slice(0, -1);
  const one = ONES.indexOf(last);
  if (one > -1) return [...head, ORDINALS[one]];
  if (TENS.includes(last)) return [...head, last.replace(/y$/, "ieth")];
  return [...head, `${last}th`];
}

/* The transcript as the aligner wants it: a flat list of normalized tokens,
 * contractions expanded, numerals spelled out, disfluencies dropped.
 *
 * Hyphens split, which serves both sides of one problem. The four hyphenated
 * words in the set (`self-control`, `sober-minded`, and two more) normalize to
 * a single token that no recognizer will ever produce — the merge operation
 * puts the two heard halves back together.
 *
 * `keep` is the passage's own vocabulary, as `norm` keys: a token in it is
 * never dropped as a disfluency, however much it looks like one. */
export function transcriptTokens(transcript, { keep = new Set() } = {}) {
  const pieces = String(transcript || "")
    .replace(/[‘’]/g, "'")
    .toLowerCase()
    .split(/[\s–—-]+/)
    .filter(Boolean);

  const out = [];
  const push = (words) => {
    for (const w of words) {
      const key = norm(w);
      if (key && (keep.has(key) || !DISFLUENCIES.has(key))) out.push(key);
    }
  };

  for (const piece of pieces) {
    const word = piece.replace(/^[^a-z0-9']+/, "").replace(/[^a-z0-9']+$/, "");
    if (!word) continue;
    if (CONTRACTIONS[word]) {
      push(CONTRACTIONS[word]);
      continue;
    }
    const ordinal = /^(\d+)(?:st|nd|rd|th)$/.exec(word);
    if (ordinal) {
      push(ordinalWords(Number(ordinal[1])));
      continue;
    }
    if (/^\d+$/.test(word)) {
      push(cardinalWords(Number(word)));
      continue;
    }
    push([word]);
  }
  return out;
}

/* ── what the passage says about its own words ────────────────────────────── */

const leading = /^[^\p{L}\p{N}]+/u;
const trailing = /[^\p{L}\p{N}]+$/u;
const closesSentence = /[.!?][”"’']?$/;

/* Which word *types* in a passage are proper nouns, as the set of their `norm`
 * keys. The test is capitalization away from the start of a sentence, which is
 * the only signal the text carries and is a good one: `Naphtali` and `Zebulun`
 * are capitalized wherever they fall, while `Trust` is capitalized only because
 * it opens Proverbs 3.
 *
 * Gathered per *type* rather than per position deliberately, so that a name
 * which happens to open a sentence somewhere ("Jesus said…") is still known to
 * be a name. This is the gate on the phonetic tier and nothing else reads it —
 * see `wordmatch.js` for why that tier must not fire on ordinary vocabulary. */
export function properNouns(text) {
  const found = new Set();
  let sentenceStart = true;
  for (const raw of String(text || "").split(/\s+/)) {
    if (!raw) continue;
    const bare = raw.replace(leading, "");
    if (!sentenceStart && /^\p{Lu}/u.test(bare)) found.add(norm(bare));
    sentenceStart = closesSentence.test(raw);
  }
  return found;
}

/* A chapter-and-verse token: `12:48b`, `4:6b`, `55:1-3a`. */
const VERSE_NUMBER = /^\d{1,3}:\d{1,3}[a-c]?(?:[-–]\d{1,3}[a-c]?)?$/;

/* Reference words that belong to an embedded scripture reference, and so are
 * words nobody recites.
 *
 * Four shipped passages carry one as a fetch-time leak: Luke 12:32's text ends
 * "…to give you the kingdom. **Luke 12:48b** Everyone to whom much was
 * given…", and Isaiah 54:2-3, Habakkuk 3:17-18 and 1 Corinthians 6:19-20 carry
 * the same shape. A member reciting Luke 12:32 perfectly cannot score above
 * 95%, which is `COMMIT_SCORE`, which means the passage is currently
 * uncommittable by voice.
 *
 * So a run matching `[1-3]? Book Chapter:Verse[a-c]?` is marked **optional**:
 * it costs nothing to omit and leaves the denominator. It stays *in* the diff,
 * flagged, because the one-entry-per-`text.split(" ")`-word invariant is what
 * `perVerseOf`'s slicing, `data/keywords.js` and `blanks.js` all index against
 * — only the denominator changes.
 *
 * **This is a tolerance, not a fix.** The real repair is in
 * `tools/fetch_passages.mjs` and `data/passages.js`, which is generated and so
 * cannot be hand-edited here; the same is true of the three fused words
 * (`eagles;they`, `footstool;what`, `food,the`) that the merge operation
 * absorbs. Both are known follow-up work — the scorer should tolerate a broken
 * passage, but it should not be the reason nobody notices one. */
export function optionalRefWords(words) {
  const optional = new Set();
  for (let i = 1; i < words.length; i++) {
    const token = words[i].replace(leading, "").replace(trailing, "");
    if (!VERSE_NUMBER.test(token)) continue;
    const book = words[i - 1].replace(leading, "").replace(trailing, "");
    if (!/^\p{Lu}\p{L}+$/u.test(book)) continue;
    optional.add(i);
    optional.add(i - 1);
    if (i >= 2 && /^[1-3]$/.test(words[i - 2].replace(trailing, ""))) optional.add(i - 2);
  }
  return optional;
}

/* ── the aligner ──────────────────────────────────────────────────────────── */

/* Traceback markers. Stored in a byte per cell rather than re-derived on the
 * way back, because re-deriving would have to reproduce the tie-break exactly
 * and a second copy of a tie-break is a second thing to keep in step. */
const FROM = { START: 0, DIAG: 1, OMIT: 2, INS: 3, MERGE: 4, SPLIT: 5 };

/* Needleman–Wunsch over the passage's words and the transcript's tokens.
 *
 * Exported on its own so the recurrence can be tested without a passage around
 * it. `refWords` are the passage's words as written (the aligner normalizes
 * them); `heardTokens` are already through `transcriptTokens`. Per-word facts
 * the aligner cannot work out for itself arrive in `options`, indexed against
 * `refWords`: `optional` (free to omit) and `proper` (may reach the phonetic
 * tier).
 *
 * Two extra recurrence terms beyond the textbook three, and one of them pays
 * for both of the data problems above. **Merge** pairs one reference word with
 * two consecutive heard tokens, which is `steadfast` heard as "stead fast",
 * `self-control` heard as two words, and `eagles;they` heard as the two words
 * it should have been. **Split** pairs two reference words with one heard
 * token, which is `do not` heard as "don't". One recurrence term each, general
 * rather than a patch list.
 *
 * Tie-breaking is diagonal, then insertion, then omission, accepting a later
 * candidate only on strict `<`. That prefers matches over gaps and insertions
 * over omissions at equal cost, which keeps matched runs contiguous and makes
 * the false-start traceback land on "matched the second attempt, absorbed the
 * first" rather than on an interleaving nobody could read.
 *
 * O(n·m) in time and space, and comfortably so. The worst case in the shipped
 * set — Isaiah 9:1-7, 243 words, against a 283-token transcript — is 68,769
 * cells and measures about **42ms** here; the median card is well under one.
 * `SPEAK_SILENCE_MS` is 2,500ms, so the app has already waited two and a half
 * seconds of silence before it calls this at all, which makes even the worst
 * card some sixty times faster than the pause preceding it. There is therefore
 * no argument for banded alignment or Hirschberg's linear-space variant; they
 * would buy milliseconds nobody can perceive and cost clarity. The one guard
 * worth having is about correctness rather than speed and lives in
 * scoreRecital: if the transcript is absurd relative to the passage, do not
 * allocate at all. */
export function alignWords(refWords, heardTokens, options = {}) {
  const optional = options.optional || new Set();
  const proper = options.proper || new Set();

  const ref = refWords.map((w) => norm(w));
  const heard = heardTokens.map((w) => norm(w));
  const n = ref.length;
  const m = heard.length;

  const omitCost = (i) => (optional.has(i) ? 0 : COST.OMIT);

  /* Both sides are already normalized, so the overwhelmingly common answer —
   * two identical keys — is settled here rather than inside wordMatch, which
   * would normalize them a second time to find that out. Memoizing the rest was
   * tried and measured *slower*: building a cache key costs more than the work
   * it saves, because everything below the exact tier bails on a length check.
   * The remaining cost is genuinely the recurrence, which is where it belongs. */
  const tier = (a, b, isProper) => {
    if (!a || !b) return null;
    if (a === b) return "exact";
    return wordMatch(a, b, { proper: isProper });
  };

  const width = m + 1;
  const cost = new Float64Array((n + 1) * width);
  const from = new Uint8Array((n + 1) * width);

  from[0] = FROM.START;
  for (let i = 1; i <= n; i++) {
    cost[i * width] = cost[(i - 1) * width] + omitCost(i - 1);
    from[i * width] = FROM.OMIT;
  }
  for (let j = 1; j <= m; j++) {
    cost[j] = cost[j - 1] + COST.INS;
    from[j] = FROM.INS;
  }

  /* The tier chosen for each cell, kept so the traceback can report what kind
   * of match it was without asking wordMatch a second time. */
  const diagTier = new Array((n + 1) * width).fill(null);
  const compoundTier = new Array((n + 1) * width).fill(null);

  for (let i = 1; i <= n; i++) {
    const row = i * width;
    const prevRow = (i - 1) * width;
    const refKey = ref[i - 1];
    const isProper = proper.has(i - 1);
    const omit = omitCost(i - 1);
    for (let j = 1; j <= m; j++) {
      const heardKey = heard[j - 1];

      const matched = tier(heardKey, refKey, isProper);
      let best = cost[prevRow + j - 1] + (matched ? TIER_COST[matched] : COST.SUB);
      let mark = FROM.DIAG;
      let chosen = matched;
      let compound = null;

      const inserted = cost[row + j - 1] + COST.INS;
      if (inserted < best) {
        best = inserted;
        mark = FROM.INS;
        chosen = null;
      }

      const omitted = cost[prevRow + j] + omit;
      if (omitted < best) {
        best = omitted;
        mark = FROM.OMIT;
        chosen = null;
      }

      if (j >= 2) {
        const joined = heard[j - 2] + heardKey;
        const merged = tier(joined, refKey, isProper);
        if (merged) {
          const c = cost[prevRow + j - 2] + COST.MERGE + TIER_COST[merged];
          if (c < best) {
            best = c;
            mark = FROM.MERGE;
            chosen = null;
            compound = merged;
          }
        }
      }

      if (i >= 2) {
        const joined = ref[i - 2] + refKey;
        const split = tier(heardKey, joined, false);
        if (split) {
          const c = cost[(i - 2) * width + j - 1] + COST.SPLIT + TIER_COST[split];
          if (c < best) {
            best = c;
            mark = FROM.SPLIT;
            chosen = null;
            compound = split;
          }
        }
      }

      cost[row + j] = best;
      from[row + j] = mark;
      diagTier[row + j] = chosen;
      compoundTier[row + j] = compound;
    }
  }

  const ops = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const cell = i * width + j;
    const mark = i === 0 ? FROM.INS : j === 0 ? FROM.OMIT : from[cell];
    if (mark === FROM.DIAG) {
      const kind = diagTier[cell];
      ops.push({ op: "sub", kind: kind || "sub", ri: i - 1, hi: j - 1 });
      i--;
      j--;
    } else if (mark === FROM.INS) {
      ops.push({ op: "ins", kind: "ins", ri: -1, hi: j - 1 });
      j--;
    } else if (mark === FROM.OMIT) {
      ops.push({ op: "omit", kind: "omit", ri: i - 1, hi: -1 });
      i--;
    } else if (mark === FROM.MERGE) {
      /* `hi` is the first of the two heard tokens this reference word ate. */
      ops.push({ op: "merge", kind: compoundTier[cell], ri: i - 1, hi: j - 2 });
      i--;
      j -= 2;
    } else {
      /* `ri` is the first of the two reference words this heard token covered. */
      ops.push({ op: "split", kind: compoundTier[cell], ri: i - 2, hi: j - 1 });
      i -= 2;
      j--;
    }
  }
  ops.reverse();
  return { ops, cost: cost[n * width + m] };
}

/* ── the whole thing ──────────────────────────────────────────────────────── */

const emptyCounts = () => ({
  exact: 0,
  homophone: 0,
  edit: 0,
  phonetic: 0,
  sub: 0,
  omit: 0,
  ins: 0,
  merge: 0,
  split: 0,
});

/* Score a recitation of `passage` against what was heard.
 *
 * `options.sawSpeech` is the one thing the browser knows that the transcript
 * does not: whether the recognizer ever reported anything at all. It belongs in
 * `App.js`, which owns the microphone, and is passed *in* rather than guessed
 * at here — keeping this module free of browser signals is what keeps it
 * runnable under `node --test`. (`SpeechRecognitionAlternative.confidence` is
 * the obvious companion and is deliberately not read yet: there is no measured
 * threshold for it, and a gate nobody calibrated is worse than no gate.)
 *
 * **Abstain on insufficient signal, never on a low score.** A full-length
 * transcript scoring 30% is a real, honest failure and is reported as one. A
 * three-token transcript scoring 3% is a microphone that cut out. The two are
 * indistinguishable from the transcript alone, so the only question is which
 * way to be wrong — and the harms are wildly asymmetric. Telling a member who
 * recited well "I didn't catch that" costs them one retry; telling a member who
 * recited perfectly "23%" is what makes them stop using the feature.
 *
 * Abstention returns `null` rather than `0`, because a zero can be averaged,
 * displayed and compared, and nothing downstream should be able to treat a
 * failed recognition as a bad recital. */
export function scoreRecital(passage, transcript, options = {}) {
  const text = String(passage?.text || "");
  const words = text.split(" ");
  const optional = optionalRefWords(words);
  const proper = properNouns(text);
  const properIndices = new Set();
  words.forEach((w, i) => {
    if (proper.has(norm(w))) properIndices.add(i);
  });

  /* A word with no letters or digits in it cannot be recited and cannot be
   * matched, so it is no more countable than an optional one. In practice this
   * is only ever a stray double space in the source text. */
  const countable = words.map((w, i) => norm(w) !== "" && !optional.has(i));
  const total = countable.filter(Boolean).length;

  const heardTokens = transcriptTokens(transcript, { keep: new Set(words.map((w) => norm(w))) });
  const heardCount = heardTokens.length;
  const verbose = heardCount > VERBOSE_RATIO * total;

  const blank = () =>
    words.map((word, i) => ({
      word,
      hit: false,
      kind: "omit",
      heard: "",
      optional: optional.has(i),
    }));

  const abstain = (reason) => ({
    score: null,
    pct: null,
    strictScore: null,
    strictPct: null,
    total,
    credited: 0,
    heardCount,
    abstained: true,
    reason,
    verbose,
    counts: emptyCounts(),
    /* The diff is built even here, so that the one-entry-per-word invariant
     * holds for *any* transcript and callers never have to special-case it. */
    diff: blank(),
    ops: [],
  });

  if (options.sawSpeech === false || heardCount === 0) return abstain(ABSTAIN.EMPTY);
  /* Below a third of the passage, a transcript cannot distinguish "the member
   * knows a third of this verse" from "the recognizer caught a third of what
   * they said", and under genuine indistinguishability the honest move is not
   * to assert. The floor of three tokens is for short passages, where a ratio
   * alone would score a single stray token — but it is capped by the passage
   * itself, since a floor above what the verse even asks for would abstain on a
   * complete recital. "Jesus wept." is two words: two tokens is the whole of
   * it, and refusing to mark that is the app failing, not the member. */
  const floor = Math.min(MIN_SIGNAL_TOKENS, total);
  if (heardCount < Math.max(floor, Math.ceil(total * MIN_SIGNAL_RATIO))) return abstain(ABSTAIN.SHORT);
  /* A car radio, a passenger, or the app's own voice bleeding into an open
   * microphone. Checked before the matrix is sized, so it doubles as the only
   * allocation guard the aligner needs. */
  if (heardCount > MAX_SIGNAL_TOKENS(total)) return abstain(ABSTAIN.FLOOD);

  const { ops } = alignWords(words, heardTokens, { optional, proper: properIndices });

  const diff = blank();
  const counts = emptyCounts();
  /* One tally per *operation*, so the nine counters sum to `ops.length` and a
   * merged word is counted once, as a merge, rather than twice. What kind of
   * match a merge or split was is carried by the diff entry's `kind`, which is
   * where the feedback reads it from. */
  for (const op of ops) {
    if (op.op === "sub") {
      counts[op.kind]++;
      diff[op.ri] = {
        word: words[op.ri],
        hit: CREDIT_TIERS.has(op.kind),
        kind: op.kind,
        heard: heardTokens[op.hi] || "",
        optional: optional.has(op.ri),
      };
    } else if (op.op === "omit") {
      counts.omit++;
    } else if (op.op === "ins") {
      counts.ins++;
    } else if (op.op === "merge") {
      counts.merge++;
      diff[op.ri] = {
        word: words[op.ri],
        hit: true,
        kind: op.kind,
        heard: `${heardTokens[op.hi]} ${heardTokens[op.hi + 1]}`,
        optional: optional.has(op.ri),
      };
    } else {
      counts.split++;
      for (const ri of [op.ri, op.ri + 1]) {
        diff[ri] = {
          word: words[ri],
          hit: true,
          kind: op.kind,
          heard: heardTokens[op.hi] || "",
          optional: optional.has(ri),
        };
      }
    }
  }

  /* Credit is binary per reference word and each word can be credited at most
   * once, which is what makes the score a statement about the passage rather
   * than about the transcript: no amount of extra talking can inflate it. */
  let credited = 0;
  let strict = 0;
  diff.forEach((entry, i) => {
    if (!countable[i]) return;
    if (entry.hit) credited++;
    if (STRICT_TIERS.has(entry.kind)) strict++;
  });

  const score = total ? credited / total : 0;
  const strictScore = total ? strict / total : 0;
  return {
    score,
    pct: Math.round(score * 100),
    strictScore,
    strictPct: Math.round(strictScore * 100),
    total,
    credited,
    heardCount,
    abstained: false,
    reason: "",
    verbose,
    counts,
    diff,
    ops,
  };
}
