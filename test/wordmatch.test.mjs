import test from "node:test";
import assert from "node:assert/strict";

import {
  HOMOPHONES,
  MAX_EDITS,
  MAX_PHONETIC_EDITS,
  MIN_FUZZY_LEN,
  MIN_PHONETIC_LEN,
  PHONETIC_BLOCK,
  doubleMetaphone,
  same,
  stem,
  withinOneEdit,
  wordMatch,
} from "../src/wordmatch.js";
import { properNouns } from "../src/recital.js";
import { norm } from "../src/text.js";
import { passages } from "../data/passages.js";

/* ── the tiers moved out of voice.js ──────────────────────────────────────── */

test("withinOneEdit accepts one substitution, insertion or deletion and no more", () => {
  assert.equal(withinOneEdit("sows", "sews"), true, "one substitution");
  assert.equal(withinOneEdit("jew", "jews"), true, "one insertion");
  assert.equal(withinOneEdit("paths", "path"), true, "one deletion");
  assert.equal(withinOneEdit("heart", "heart"), true, "no edits at all");
  assert.equal(withinOneEdit("hard", "heart"), false, "two edits is two words");
  assert.equal(withinOneEdit("past", "paths"), false);
  assert.equal(MAX_EDITS, 1, "the tier is one edit, and the tests above assume it");
});

test("stem takes off one plural or third-person ending", () => {
  assert.equal(stem("sows"), "sow");
  assert.equal(stem("praises"), "prais");
  assert.equal(stem("heart"), "heart", "a word that does not end in one is untouched");
});

test("same() is the voice.js comparison, unchanged", () => {
  assert.equal(same("sews", "sow"), true, "the case voice.js documents: a plural the engine invented");
  assert.equal(same("Jews", "Jew"), true);
  assert.equal(same("eagles'", "eagles"), true, "norm() drops the apostrophe");
  assert.equal(same("LORD", "Lord"), true, "and the case");
  assert.equal(same("us", "as"), false, `nothing under ${MIN_FUZZY_LEN} letters is forgiven`);
  assert.equal(same("he", "be"), false);
  assert.equal(same("", "heart"), false);
  assert.equal(same("heart", ""), false);
});

/* ── Double Metaphone ─────────────────────────────────────────────────────── */

/* Pinned against the words this corpus actually makes hard — transliterated
 * Hebrew and Greek — rather than against a generic surname suite. These are the
 * keys *this* port emits; the reduction is per-implementation (the alphabet in
 * the design keeps B and P apart where Philips' own reference folds them), so a
 * change to any of these is a change to what the phonetic tier credits. */
test("Double Metaphone keys are pinned for this corpus's hard vocabulary", () => {
  const pins = {
    Naphtali: "NFTL",
    Zebulun: "SBLN",
    Jephthah: "JF0",
    Sheol: "XL",
    Christ: "KRST",
    Pharaoh: "FR",
    Jericho: "JRX",
    Rahab: "RHB",
    Abba: "AB",
    Midian: "MTN",
  };
  for (const [word, key] of Object.entries(pins)) {
    assert.equal(doubleMetaphone(word)[0], key, `${word} should key as ${key}`);
  }
});

test("the alternate key is the initial-J variant, and only that", () => {
  assert.deepEqual(doubleMetaphone("Jericho"), ["JRX", "ARX"]);
  assert.deepEqual(doubleMetaphone("Jephthah"), ["JF0", "AF0"]);
  assert.deepEqual(doubleMetaphone("Naphtali"), ["NFTL", "NFTL"], "no variant, so both keys agree");
});

test("Double Metaphone survives words it cannot key", () => {
  assert.deepEqual(doubleMetaphone(""), ["", ""]);
  assert.deepEqual(doubleMetaphone("123"), ["", ""]);
  assert.deepEqual(doubleMetaphone(null), ["", ""]);
});

test("the entry rules: a silent opening letter, and an initial X", () => {
  assert.equal(doubleMetaphone("gnat")[0], "NT");
  assert.equal(doubleMetaphone("knee")[0], "N");
  assert.equal(doubleMetaphone("wrath")[0], "R0");
  assert.equal(doubleMetaphone("psalm")[0], "SLM");
  assert.equal(doubleMetaphone("Xerxes")[0], "SRKSS", "only the *initial* X is an S; the later one is KS");
});

/* ── the phonetic tier, and what it is gated off ──────────────────────────── */

test("the phonetic tier rescues a misspelled name the edit tier cannot reach", () => {
  assert.equal(wordMatch("naftali", "Naphtali", { proper: true }), "phonetic", "PH → F, two edits apart");
  assert.equal(wordMatch("pharoah", "Pharaoh", { proper: true }), "phonetic");
  assert.equal(wordMatch("saira", "Sarah", { proper: true }), "phonetic");
});

test("names within one edit are caught by the edit tier first, which is strict-eligible", () => {
  assert.equal(wordMatch("zebulon", "Zebulun", { proper: true }), "edit");
  assert.equal(wordMatch("shiol", "Sheol", { proper: true }), "edit");
  assert.equal(wordMatch("midyan", "Midian", { proper: true }), "edit");
});

/* The design is explicit that the phonetic tier does not reach these, and says
 * why: PH ≠ P and CH → X ≠ K are real distinctions in the algorithm rather than
 * defects in it. Pinning the keys keeps a future "improvement" from quietly
 * widening the tier — the sounds genuinely differ, and a phonetic table that
 * said otherwise would be wrong about English, not merely lenient.
 *
 * Two of the three are rescued anyway, one tier up: `jerico` and `enock` are a
 * single edit from their spellings. That is the hybrid working as intended —
 * edit distance asks whether these are two transcriptions of one utterance, and
 * on those two the answer is yes without any phonetics being consulted. */
test("the phonetic tier does not reach a genuinely different sound", () => {
  for (const [heard, name] of [
    ["jeptha", "Jephthah"],
    ["jerico", "Jericho"],
    ["enock", "Enoch"],
  ]) {
    const keys = doubleMetaphone(name);
    assert.ok(!doubleMetaphone(heard).some((k) => keys.includes(k)), `${heard} and ${name} must not share a key`);
  }
  assert.equal(wordMatch("jeptha", "Jephthah", { proper: true }), null, "and this one is an honest miss");
  assert.equal(wordMatch("jerico", "Jericho", { proper: true }), "edit", "while these two are one edit out");
  assert.equal(wordMatch("enock", "Enoch", { proper: true }), "edit");
});

test("the phonetic tier never fires on an ordinary word, however alike it sounds", () => {
  // This is the whole reason the tier is gated to proper nouns: at two edits an
  // ungated tier admits 194 pairs on this vocabulary, and these are three of them.
  for (const [a, b] of [
    ["life", "love"],
    ["whole", "holy"],
    ["pleased", "blessed"],
  ]) {
    assert.equal(wordMatch(a, b, { proper: false }), null, `${a}/${b} must not be credited`);
    assert.equal(wordMatch(a, b, {}), null, "and the gate defaults to closed");
  }
});

test("the phonetic gate needs both words at least MIN_PHONETIC_LEN letters", () => {
  assert.ok(MIN_PHONETIC_LEN === 5 && MAX_PHONETIC_EDITS === 2);
  assert.equal(wordMatch("jews", "Jesus", { proper: true }), null, "jews is four letters");
});

test("every blocklisted pair is refused, in both directions", () => {
  for (const [a, b] of PHONETIC_BLOCK) {
    assert.equal(wordMatch(a, b, { proper: true }), null, `${a} → ${b} must not be credited`);
    assert.equal(wordMatch(b, a, { proper: true }), null, `${b} → ${a} must not be credited`);
  }
});

/* The test that keeps the phonetic tier honest: it recomputes the entire
 * false-positive surface over the shipped set — every proper noun against every
 * vocabulary word — and asserts the blocklist already names all of it. It will
 * fail loudly the day somebody adds a passage that introduces a new collision,
 * which is exactly when somebody should be looking. */
test("the blocklist is the complete collision surface over the whole passage set", () => {
  const vocabulary = new Set();
  const names = new Set();
  for (const passage of passages) {
    for (const word of passage.text.split(/\s+/)) {
      const key = norm(word);
      if (key) vocabulary.add(key);
    }
    for (const key of properNouns(passage.text)) names.add(key);
  }
  /* The corpus these figures were measured against. They are expected to move
   * whenever data/passages.js does — a split passage or a new shelf changes
   * both — and moving them is the prompt to re-read the loop below rather than
   * a failure in itself: the surface the blocklist has to cover is exactly this
   * vocabulary crossed with these names. */
  assert.equal(vocabulary.size, 1537, "the vocabulary this surface was measured against");
  assert.equal([...names].filter((w) => w.length >= MIN_PHONETIC_LEN).length, 53, "proper nouns long enough to fire");

  /* Nothing gets through. A pair that reaches the phonetic tier here is a pair
   * of real vocabulary words being credited for each other, which is the
   * failure the design forbids — so the blocklist must already have caught it,
   * and wordMatch must already be answering null. */
  for (const name of names) {
    for (const word of vocabulary) {
      // Anything the edit tier already reaches is not this tier's risk.
      if (word === name || same(word, name)) continue;
      const tier = wordMatch(word, name, { proper: true });
      assert.notEqual(tier, "phonetic", `${name}/${word} collides and is not in PHONETIC_BLOCK`);
    }
  }

  /* And which half of the table is doing the work, pinned. Four of the eight
   * documented pairs cannot fire under this port at all (see the comment on
   * PHONETIC_BLOCK); these are the four that can. Recomputed here rather than
   * asserted from the source, so the day one goes inert somebody has to say so
   * on purpose. */
  const live = PHONETIC_BLOCK.filter(([a, b]) => wouldCollide(a, b))
    .map(([a, b]) => `${a}/${b}`)
    .sort();
  assert.deepEqual(live, ["barak/break", "creator/greater", "david/divide", "sheol/shall"]);
});

/* The §2 gate with the blocklist taken out of it, so the test can ask what the
 * table is actually holding back. Levenshtein is written out here rather than
 * imported because a blocklist audited against the module's own arithmetic
 * would only be checking that the module agrees with itself. */
function wouldCollide(a, b) {
  if (a.length < MIN_PHONETIC_LEN || b.length < MIN_PHONETIC_LEN) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  if (prev[b.length] > MAX_PHONETIC_EDITS) return false;
  const keys = doubleMetaphone(b);
  return doubleMetaphone(a).some((k) => k.length >= 2 && keys.includes(k));
}

/* ── homophones ───────────────────────────────────────────────────────────── */

test("the curated homophone table is bidirectional", () => {
  for (const [a, b] of HOMOPHONES) {
    assert.equal(wordMatch(a, b), "homophone", `${a} → ${b}`);
    assert.equal(wordMatch(b, a), "homophone", `${b} → ${a}`);
  }
});

test("the table reaches the pairs no other tier can", () => {
  // Both are under MIN_FUZZY_LEN and under MIN_PHONETIC_LEN, so without an
  // explicit entry "no" is simply a miss — and "I will fear no evil" needs it.
  assert.equal(same("know", "no"), false, "the fuzzy tier is gated off by length");
  assert.equal(wordMatch("know", "no"), "homophone");
  // Two edits apart, so the fuzzy tier cannot reach these either.
  assert.equal(same("there", "their"), false);
  assert.equal(wordMatch("there", "their"), "homophone");
});

/* ── the predicate itself ─────────────────────────────────────────────────── */

test("wordMatch reports the strongest tier that applies", () => {
  assert.equal(wordMatch("Lord", "LORD"), "exact", "norm() settles case and punctuation");
  assert.equal(wordMatch("heart,", "heart"), "exact");
  assert.equal(wordMatch("here", "hear"), "homophone");
  assert.equal(wordMatch("sews", "sows"), "edit");
  assert.equal(wordMatch("hard", "heart"), null, "a genuinely different word is not a match");
  assert.equal(wordMatch("past", "paths"), null);
});

test("wordMatch says nothing about a word with nothing in it", () => {
  assert.equal(wordMatch("", "heart"), null);
  assert.equal(wordMatch("heart", ""), null);
  assert.equal(wordMatch("...", "heart"), null, "punctuation alone normalizes to nothing");
});
