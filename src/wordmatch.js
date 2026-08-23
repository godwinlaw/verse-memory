/* When two words are the same word.
 *
 * This is the one loose comparison in the app, and it exists for one reason: a
 * speech recognizer hands back a *spelling*, not a sound. A member reciting
 * Galatians perfectly gets "sews" for `sow`; a member reciting Isaiah 9 gets
 * "naftali" for `Naphtali`. Neither of those is a recall error, and marking
 * them wrong fails the member who said the verse right — which is precisely the
 * failure reciting aloud was meant to save them from.
 *
 * The rule CLAUDE.md states about `voice.js` still holds, only its address has
 * changed: **nothing a member types is forgiven; what a microphone heard is.**
 * `grading.js` is exact and stays exact. This module is the loose half, and the
 * only things allowed to import it are the two with a microphone behind them —
 * `voice.js`, which fits heard words back onto the passage, and `recital.js`,
 * which scores a spoken recitation.
 *
 * Four tiers, strongest first, and each one is narrower than it looks:
 *
 *   exact      — the same word once `norm()` has taken case and punctuation off.
 *   homophone  — a curated, hand-audited pair. Not a recall error at all: the
 *                member produced the right sound and the engine picked a
 *                spelling. `no`/`know` is the argument for having the table,
 *                since both words are under MIN_FUZZY_LEN and no other tier can
 *                reach them.
 *   edit       — within one edit, ignoring a plural ending on either side, and
 *                never on a word short enough for one edit to be most of it.
 *                Moved here verbatim from `voice.js`, which imports it back.
 *   phonetic   — Double Metaphone key equality, gated hard (see below). This
 *                tier is deliberately the weakest and the most expensive, and
 *                the scorer's strict figure excludes it entirely.
 *
 * The tiers are OR'd; the phonetic tier's *internals* are an AND, and that
 * conjunction is the whole reason it is safe. Measured over this repo's 1,546
 * word vocabulary, crediting on key equality alone admits 194 pairs at two
 * edits — `love`/`life`, `holy`/`whole`, `blessed`/`pleased` — every one of
 * which is a word a member could genuinely have got wrong. Requiring key
 * equality *and* a two-edit gate *and* that the reference word be a proper noun
 * collapses that to a handful, because a name has no near neighbour in the
 * passage's semantic space for a false positive to land on: when the reference
 * word is `Naphtali` the member either has the name or does not. Edit distance
 * asks whether these are plausibly two transcriptions of one utterance; the
 * phonetic key asks whether they sound alike. Neither question alone is enough. */

import { norm } from "./text.js";

/* How far apart two spellings may be and still be the same word said out loud.
 * One edit, and never on a word short enough for one edit to be most of it —
 * "us" and "as" are two words, "Jews" and "Jew" are one word twice. */
export const MAX_EDITS = 1;
export const MIN_FUZZY_LEN = 3;

/* The phonetic tier's gate. Five letters because a four-letter word reduces to
 * a key that is a claim about almost nothing, and two edits because at one edit
 * the tier is a measured no-op — everything within one edit is already caught
 * above it. Two edits is what buys `naftali`/`Naphtali` and `pharoah`/`Pharaoh`,
 * and it is also what would buy `love`/`life` if the proper-noun gate were not
 * there to stop it. */
export const MIN_PHONETIC_LEN = 5;
export const MAX_PHONETIC_EDITS = 2;

/* A key of one code grants nothing. `Ash` and `oaks` both reduce to a single
 * sound; agreeing on it is not evidence of anything. */
const MIN_PHONETIC_KEY = 2;

/* Whether two strings are within MAX_EDITS of each other — one substitution,
 * insertion, or deletion. Walked in step rather than scored with a full edit
 * matrix, because the only question ever asked is "one or fewer", and the
 * answer to that is known the second time the walk falls out of step. */
export function withinOneEdit(a, b) {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (long.length - short.length > MAX_EDITS) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > MAX_EDITS) return false;
    // Same length: the two are out of step by a substitution, so both advance.
    // Different: the longer one carries a letter the shorter does not.
    if (short.length === long.length) i++;
    j++;
  }
  return true;
}

/* A word with one plural or third-person ending taken off. Speech recognition
 * gets the sound and guesses the grammar, and the guess it gets wrong most is
 * this one: "sows" comes back as "sews", "Jew" as "Jews". Stripped from both
 * sides before they are compared, so the ending is never what separates them. */
export const stem = (w) => w.replace(/(?:es|s)$/, "");

/* Whether a word that was heard is the word the passage wanted. Compared
 * through norm(), so neither punctuation nor an apostrophe nobody pronounces
 * can separate "eagles", "eagles'" and "eagle's".
 *
 * A heard word within one edit of the word the passage wanted, ignoring a
 * plural ending on either side, is taken as that word. Held tight by the two
 * rules above: one edit, and nothing under MIN_FUZZY_LEN letters, where a
 * single edit is the difference between "he" and "be".
 *
 * The cost is that a recited word genuinely misremembered as a near neighbour
 * ("hear" for "heart") is now given, which is the trade this makes on purpose:
 * the alternative failed a member who said the verse right. MAX_EDITS and
 * MIN_FUZZY_LEN are where that is tuned.
 *
 * This is `voice.js`'s own predicate, unchanged — it moved here so that the
 * recital scorer and the transcription box cannot come to disagree about what
 * counts as the same word. */
export function same(heard, want) {
  if (!want || !heard) return false;
  const a = norm(heard);
  const b = norm(want);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length < MIN_FUZZY_LEN || b.length < MIN_FUZZY_LEN) return false;
  return withinOneEdit(a, b) || withinOneEdit(stem(a), stem(b));
}

/* ── homophones ───────────────────────────────────────────────────────────── */

/* A curated, bidirectional allowlist, and curated is the point rather than a
 * shortcut: every entry is a pair a human confirmed are genuinely homophones,
 * so the false-positive rate of this tier is exactly what the curator wrote
 * down and nothing more. It is the mirror of PHONETIC_BLOCK below, and the two
 * tables together are the whole hand-tuned surface of the design.
 *
 * Every pair here was checked against the shipped vocabulary — at least one
 * side of each appears in the passage set, which is what makes it worth an
 * entry. A homophone earns full credit including in the strict score, because
 * nothing was got wrong: the member produced the correct sound and the engine
 * chose a spelling. */
export const HOMOPHONES = [
  ["their", "there"],
  ["no", "know"],
  ["to", "two"],
  ["to", "too"],
  ["two", "too"],
  ["hear", "here"],
  ["soul", "sole"],
  ["peace", "piece"],
  ["way", "weigh"],
  ["led", "lead"],
  ["whole", "hole"],
  ["son", "sun"],
  ["wait", "weight"],
  ["right", "write"],
  ["heir", "air"],
  ["past", "passed"],
  ["throne", "thrown"],
  ["would", "wood"],
  ["our", "hour"],
  ["knew", "new"],
];

/* Both directions, indexed once at load rather than scanned per comparison —
 * the aligner asks this question O(n·m) times per recital. */
const HOMOPHONE_INDEX = new Map();
for (const [a, b] of HOMOPHONES) {
  if (!HOMOPHONE_INDEX.has(a)) HOMOPHONE_INDEX.set(a, new Set());
  if (!HOMOPHONE_INDEX.has(b)) HOMOPHONE_INDEX.set(b, new Set());
  HOMOPHONE_INDEX.get(a).add(b);
  HOMOPHONE_INDEX.get(b).add(a);
}

const homophone = (a, b) => HOMOPHONE_INDEX.get(a)?.has(b) === true;

/* ── the phonetic blocklist ───────────────────────────────────────────────── */

/* The complete false-positive surface of the phonetic tier over this corpus:
 * every pair where a proper noun of five letters or more collides with an
 * ordinary vocabulary word under the gate. Listed by name rather than described
 * by a rule, because a risk surface you can read is a risk surface you can
 * reason about — and because `test/wordmatch.test.mjs` recomputes the collision
 * set over all 183 shipped passages and fails loudly the day a new passage
 * introduces one this table does not name.
 *
 * These are the eight pairs `docs/research/scoring.md` §2 measured. Under this
 * port of the algorithm only four of them can actually fire — the other four
 * are stopped by a gate before their keys are ever compared (`even` and `jews`
 * are under five letters; `better` keeps its B where Philips' own reference
 * would fold it into P; `destroyer` carries a second R). The inert four are
 * kept regardless, because a table entry costs a line and deleting one would
 * only invite somebody to re-derive why it was safe. Which four are live is a
 * property of the code, so the test measures it rather than trusting this
 * comment. */
export const PHONETIC_BLOCK = [
  ["creator", "greater"],
  ["heaven", "even"],
  ["jesus", "jews"],
  ["peter", "better"],
  ["sheol", "shall"],
  ["david", "divide"],
  ["destroy", "destroyer"],
  ["barak", "break"],
];

const BLOCK_INDEX = new Set();
for (const [a, b] of PHONETIC_BLOCK) {
  BLOCK_INDEX.add(`${a}|${b}`);
  BLOCK_INDEX.add(`${b}|${a}`);
}

const blocked = (a, b) => BLOCK_INDEX.has(`${a}|${b}`);

/* ── Double Metaphone ─────────────────────────────────────────────────────── */

const VOWELS = "AEIOUY";

/* Codes emitted are a restricted set — A B F H J K L M N P R S T X, plus 0 for
 * the *th* sound. The reduction is aggressive by design (D emits T, V emits F,
 * Z emits S, G emits K), which is exactly why this tier needs the edit gate and
 * the proper-noun gate above it.
 *
 * Two keys come back rather than one, and that is the "double": they are
 * identical except where a rule declares a genuine pronunciation variant, of
 * which this vocabulary exercises one — an initial J, which a Spanish reading
 * gives a vowel. Two words match if any of the four cross-pairs agree.
 *
 * **The key is never truncated.** Philips' reference implementation caps at
 * four codes because it was written to feed a database index; truncation is
 * precisely what makes Soundex collide (`shall`, `sheol` and `shell` all land
 * on S400, and `Sheol` is in Psalm 16 while `shall` is in nearly everything).
 * There is no index here, so the whole key is kept. */
export function doubleMetaphone(word) {
  const s = String(word || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  if (!s) return ["", ""];

  const n = s.length;
  let primary = "";
  let alternate = "";
  const add = (p, a = p) => {
    primary += p;
    alternate += a;
  };
  /* Bounds-safe lookups. A window that runs off the end must read as "no
   * letter" rather than as the empty string, or every `includes("")` test in
   * the rules below would answer true. */
  const at = (i) => (i >= 0 && i < n ? s[i] : " ");
  const span = (i, len) => (i >= 0 ? s.slice(i, i + len) : "");
  const vowel = (i) => VOWELS.includes(at(i));
  const oneOf = (c, list) => c !== " " && list.includes(c);

  let i = 0;

  /* A silent first letter. These five clusters open with a letter English
   * writes and does not say. */
  if (["GN", "KN", "PN", "WR", "PS"].includes(span(0, 2))) i = 1;
  /* And an initial X is an S — Xerxes, not ks-erxes. */
  if (s[0] === "X") {
    add("S");
    i = 1;
  }

  while (i < n) {
    const c = s[i];

    /* A doubled letter is one sound. Collapsing it here rather than in each
     * rule is what keeps `Abba` at AB and `shall` at XL. */
    if (c === at(i + 1)) {
      i++;
      continue;
    }

    switch (c) {
      case "A":
      case "E":
      case "I":
      case "O":
      case "U":
      case "Y":
        /* Only a word-initial vowel is worth a code. Every later vowel is
         * skipped outright, which is what makes the key a consonant skeleton
         * and so blind to the vowel shifts an accent moves. */
        if (i === 0) add("A");
        i++;
        break;

      case "B":
        add("B");
        i++;
        break;

      case "C":
        if (span(i, 2) === "CH") {
          /* CH is the one genuinely ambiguous cluster in this vocabulary, and
           * it separates `Christ` from `Jericho`. A Greek-rooted CH followed by
           * a consonant is a K — Christ, chrism, chronicle — as is one inside
           * the -ARCH-/ORCHES- shapes and one followed by T or S. Everywhere
           * else it is the English X sound, which is why `Jericho` stays JRX
           * and "jerico" (which reads as a hard C) is honestly not rescued. */
          const greek =
            ["ORCHES", "ARCHIT", "ORCHID"].includes(span(i - 2, 6)) ||
            oneOf(at(i + 2), "TS") ||
            ["HOR", "HYM", "HIA", "HEM"].includes(span(i + 1, 3)) ||
            ((i === 0 || oneOf(at(i - 1), "AOUE")) && oneOf(at(i + 2), "LRNMBHFVW"));
          add(greek ? "K" : "X");
          i += 2;
        } else if (span(i, 2) === "CK") {
          add("K");
          i += 2;
        } else if (oneOf(at(i + 1), "IEY")) {
          add("S");
          i++;
        } else {
          add("K");
          i++;
        }
        break;

      case "D":
        if (["GE", "GI", "GY"].includes(span(i + 1, 2))) {
          add("J");
          i += 2;
        } else {
          add("T");
          i++;
        }
        break;

      case "F":
        add("F");
        i++;
        break;

      case "G":
        if (span(i, 2) === "GH") {
          /* Silent after a vowel — thou*gh*, brou*gh*t — and a hard G
           * otherwise, as in ghost. */
          if (!vowel(i - 1)) add("K");
          i += 2;
        } else {
          add("K");
          i++;
        }
        break;

      case "H":
        /* An H is only heard between two vowels, or opening a word in front of
         * one. `Rahab` keeps its H; the H closing `Pharaoh` and `Sarah` does
         * not, which is what lets "saira" reach `Sarah`. */
        if ((i === 0 || vowel(i - 1)) && vowel(i + 1)) add("H");
        i++;
        break;

      case "J":
        /* The one pronunciation variant this vocabulary exercises: Jesus,
         * Jacob and Jericho all read with a vowel in Spanish, which is what the
         * alternate key is for. */
        if (i === 0) add("J", "A");
        else add("J");
        i++;
        break;

      case "K":
      case "Q":
        add("K");
        i++;
        break;

      case "L":
        add("L");
        i++;
        break;

      case "M":
        add("M");
        i++;
        break;

      case "N":
        add("N");
        i++;
        break;

      case "P":
        if (at(i + 1) === "H") {
          add("F");
          i += 2;
        } else {
          add("P");
          i++;
        }
        break;

      case "R":
        add("R");
        i++;
        break;

      case "S":
        if (span(i, 3) === "SCH") {
          add("SK");
          i += 3;
        } else if (span(i, 2) === "SH") {
          add("X");
          i += 2;
        } else {
          add("S");
          i++;
        }
        break;

      case "T":
        if (span(i, 3) === "TCH") {
          add("X");
          i += 3;
        } else if (span(i, 2) === "TH") {
          add("0");
          i += 2;
        } else {
          add("T");
          i++;
        }
        break;

      case "V":
        add("F");
        i++;
        break;

      case "W":
        /* Mostly silent. It opens a syllable as a vowel would (`what`), it is
         * an R in the WR the entry rule has usually already stepped over, and
         * in the middle of a word English rarely gives it a consonant at all. */
        if (span(i, 2) === "WR") {
          add("R");
          i += 2;
        } else if (i === 0 && (span(i, 2) === "WH" || vowel(i + 1))) {
          add("A");
          i++;
        } else {
          i++;
        }
        break;

      case "X":
        add("KS");
        i++;
        break;

      case "Z":
        add("S");
        i++;
        break;

      default:
        i++;
    }
  }

  return [primary, alternate];
}

/* Full Levenshtein distance, which the phonetic gate needs and withinOneEdit
 * deliberately will not give: "one or fewer" and "two or fewer" are different
 * questions, and the second one cannot be answered by a single walk. Two rows
 * rather than a matrix, since only the previous one is ever read. */
function editDistance(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > MAX_PHONETIC_EDITS) return MAX_PHONETIC_EDITS + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = row;
  }
  return prev[b.length];
}

/* Whether two normalized words agree on a phonetic key, under the whole gate.
 * Every conjunct here is load-bearing; see the module comment for what each one
 * is holding back. */
function phoneticallySame(a, b) {
  if (a.length < MIN_PHONETIC_LEN || b.length < MIN_PHONETIC_LEN) return false;
  if (blocked(a, b)) return false;
  if (editDistance(a, b) > MAX_PHONETIC_EDITS) return false;
  const keys = doubleMetaphone(a);
  const want = doubleMetaphone(b);
  return keys.some((k) => k.length >= MIN_PHONETIC_KEY && want.includes(k));
}

/* The one predicate the aligner asks.
 *
 * `proper` is whether the *reference* word is a proper noun, which is the gate
 * on the phonetic tier — it is a fact about the passage, not about the
 * transcript, so the caller works it out from `passage.text` and passes it in.
 * Returning the tier rather than a boolean is what lets the scorer price the
 * tiers apart (a tie should prefer the exact reading) and lets the strict
 * figure fence the phonetic one off from any decision with a consequence. */
export function wordMatch(heard, want, { proper = false } = {}) {
  const a = norm(heard);
  const b = norm(want);
  if (!a || !b) return null;
  if (a === b) return "exact";
  if (homophone(a, b)) return "homophone";
  if (same(a, b)) return "edit";
  if (proper && phoneticallySame(a, b)) return "phonetic";
  return null;
}
