import test from "node:test";
import assert from "node:assert/strict";

import {
  ABSTAIN,
  COST,
  MAX_SIGNAL_TOKENS,
  MIN_SIGNAL_RATIO,
  VERBOSE_RATIO,
  alignWords,
  optionalRefWords,
  properNouns,
  scoreRecital,
  transcriptTokens,
} from "../src/recital.js";
import { gradeWritten } from "../src/grading.js";
import { norm } from "../src/text.js";
import { mulberry32 } from "../src/review.js";
import { passages } from "../data/passages.js";

/* The fixtures below are all real passage text — the whole point of the design
 * document is that it was measured against the shipped data rather than reasoned
 * about in the abstract, and a fixture that invents a passage would be a test
 * protecting nothing. */
const of = (ref) => {
  const passage = passages.find((p) => p.ref === ref);
  assert.ok(passage, `no passage ${ref}`);
  return passage;
};

/* What a recognizer actually emits: a flat lowercase stream, no punctuation. */
const spoken = (passage) => passage.text.split(" ").map(norm).filter(Boolean).join(" ");

const PROVERBS = of("Proverbs 3:5-6");
const PSALM23 = of("Psalm 23");

/* The commit bar, quoted from srs.js's own constant in spirit but written here
 * as the figure the fixtures are aimed at. */
const COMMIT = 0.95;

/* ── the cost matrix's one invariant ──────────────────────────────────────── */

/* One line, and it is the line that stops a retune from silently turning every
 * substitution into a delete-plus-insert. Both readings cost the same in the
 * score — one uncredited reference word either way — but only the substitution
 * reading lets the feedback say "you said *hard* where the verse says *heart*",
 * which is the feedback worth giving. It holds narrowly and deliberately. */
test("INS + OMIT > SUB, so a one-for-one swap is reported as a substitution", () => {
  assert.ok(COST.INS + COST.OMIT > COST.SUB, `${COST.INS} + ${COST.OMIT} must exceed ${COST.SUB}`);

  const heard = spoken(PROVERBS).replace("heart", "hard");
  const graded = scoreRecital(PROVERBS, heard);
  assert.equal(graded.counts.sub, 1, "reported as one substitution");
  assert.equal(graded.counts.omit, 0, "not as an omission");
  assert.equal(graded.counts.ins, 0, "plus an insertion");
  const entry = graded.diff.find((d) => d.word === "heart,");
  assert.equal(entry.kind, "sub");
  assert.equal(entry.heard, "hard", "and the diff can name what was said instead");
});

test("the graded tiers are priced apart, so a tie prefers the exact reading", () => {
  assert.equal(COST.EXACT, 0);
  assert.equal(COST.HOMOPHONE, 0, "the member said the right sound; nothing was got wrong");
  assert.ok(COST.EDIT > COST.EXACT && COST.PHONETIC > COST.EDIT, "and the phonetic tier is the dearest match");
  assert.ok(COST.PHONETIC < COST.SUB, "but still cheaper than calling it a different word");
});

/* ── §6, the twenty fixtures ──────────────────────────────────────────────── */

/* Each case names what the member did, what today's grader says about it, and
 * the range the new scorer must land in. The `today` figures are measured here
 * rather than quoted, so the regression they describe is demonstrated by the
 * suite rather than asserted by a comment. */
const today = (passage, transcript) => gradeWritten(passage.text.split(" "), transcript).score;

test("1. a word-perfect recital scores exactly 1.00", () => {
  const graded = scoreRecital(PROVERBS, spoken(PROVERBS));
  assert.equal(graded.score, 1);
  assert.equal(graded.strictScore, 1);
  assert.equal(graded.pct, 100);
  assert.equal(graded.abstained, false);
  assert.equal(graded.verbose, false);
});

test("2. a leading filler is free", () => {
  const graded = scoreRecital(PROVERBS, `um ${spoken(PROVERBS)}`);
  assert.equal(graded.score, 1);
  assert.equal(graded.heardCount, 29, "the disfluency is not even a token");
});

test("3. ★ a three-word false start no longer stalls the grader", () => {
  const heard = `trust in the ${spoken(PROVERBS)}`;
  assert.equal(Math.round(today(PROVERBS, heard) * 100), 14, "the failure this module exists to fix");

  const graded = scoreRecital(PROVERBS, heard);
  assert.ok(graded.score >= 0.98, `scored ${graded.pct}%`);
  assert.ok(graded.score >= COMMIT, "and clears the commit bar");
  assert.equal(graded.counts.ins, 3, "the false start is absorbed as three insertions");
  assert.equal(graded.credited, 29, "each reference word is credited exactly once");
});

test("4. a self-correction is one production, credited once and penalized never", () => {
  const heard =
    "trust in the lord with all your soul no wait with all your heart and do not lean on your own " +
    "understanding in all your ways acknowledge him and he will make straight your paths";
  assert.ok(today(PROVERBS, heard) < 0.3, "today it scores about a quarter");
  assert.equal(scoreRecital(PROVERBS, heard).score, 1);
});

test("5. a contraction the recognizer wrote is not a word the member dropped", () => {
  const heard = spoken(PROVERBS).replace("do not", "don't");
  assert.ok(today(PROVERBS, heard) < 1, "today it costs a word");
  assert.equal(scoreRecital(PROVERBS, heard).score, 1);
});

test("6. ★ the negative control — wrong words stay wrong", () => {
  // `hard` is not a proper noun, so the phonetic tier does not fire; `past` is
  // two edits from `paths` and is a genuinely different word.
  const heard = spoken(PROVERBS).replace("heart", "hard").replace("paths", "past");
  const graded = scoreRecital(PROVERBS, heard);
  assert.ok(graded.score >= 0.9 && graded.score <= 0.94, `scored ${graded.pct}%`);
  assert.ok(graded.score < COMMIT, "and does not clear the commit bar");
  assert.equal(graded.strictScore, graded.score, "no phonetic credit was involved either way");
});

test("7. a single dropped conjunction still clears the commit bar", () => {
  const graded = scoreRecital(PROVERBS, spoken(PROVERBS).replace(" and do not", " do not"));
  assert.ok(graded.score >= 0.95 && graded.score <= 0.97, `scored ${graded.pct}%`);
  assert.ok(graded.score >= COMMIT, "which is exactly what COMMIT_SCORE's 5% margin is for");
});

test("8. genuine recall errors score below commit", () => {
  const heard = spoken(PROVERBS)
    .replace("understanding", "knowledge")
    .replace("straight your paths", "straight your ways");
  const graded = scoreRecital(PROVERBS, heard);
  assert.ok(graded.score >= 0.9 && graded.score <= 0.94, `scored ${graded.pct}%`);
  assert.ok(graded.score < COMMIT);
});

test("9. ★ a transcript that cut out abstains rather than asserting 7%", () => {
  assert.ok(today(PROVERBS, "trust in") < 0.1, "today it says seven percent about two tokens");

  const graded = scoreRecital(PROVERBS, "trust in");
  assert.equal(graded.abstained, true);
  assert.equal(graded.reason, ABSTAIN.SHORT);
  assert.equal(graded.score, null, "null rather than 0, so nothing downstream can average it");
  assert.equal(graded.pct, null);
  assert.equal(graded.strictScore, null);
  assert.equal(graded.total, 29, "the passage is still described");
  assert.equal(graded.heardCount, 2);
});

test("10. an empty transcript abstains", () => {
  const graded = scoreRecital(PROVERBS, "");
  assert.equal(graded.abstained, true);
  assert.equal(graded.reason, ABSTAIN.EMPTY);
  assert.equal(graded.score, null);
});

test("11. length is not the problem — all 113 words of Psalm 23", () => {
  assert.equal(scoreRecital(PSALM23, spoken(PSALM23)).score, 1);
});

test("12. ★ a genuinely forgotten verse is not rescued", () => {
  const verse3 = "He restores my soul. He leads me in paths of righteousness for his name’s sake.";
  const gone = verse3.split(" ").map(norm).join(" ");
  const heard = spoken(PSALM23).replace(`${gone} `, "");

  const graded = scoreRecital(PSALM23, heard);
  assert.ok(graded.score >= 0.86 && graded.score <= 0.88, `scored ${graded.pct}% — 15 of 113 words gone`);
  assert.equal(graded.counts.omit, 15);
  assert.ok(graded.score < COMMIT, "the whole point: forgiveness has a floor");
});

test("13. ★ the stall, on a long passage", () => {
  const heard = `${spoken(PSALM23).split(" ").slice(0, 6).join(" ")} ${spoken(PSALM23)}`;
  assert.equal(Math.round(today(PSALM23, heard) * 100), 8, "today: six words in, restarted, and scored eight percent");
  assert.ok(scoreRecital(PSALM23, heard).score >= 0.98);
});

test("14. a curated homophone: 'here o israel' for 'Hear, O Israel'", () => {
  const shema = of("Deuteronomy 6:4-5");
  const heard = spoken(shema).replace(/^hear/, "here");
  assert.ok(today(shema, heard) < 1, "today the homophone costs a word");
  const graded = scoreRecital(shema, heard);
  assert.equal(graded.score, 1);
  assert.equal(graded.strictScore, 1, "a homophone earns full credit in the strict figure too");
  assert.equal(graded.diff[0].kind, "homophone", "and `Hear,` carries punctuation, which norm() settles");
});

test("15. the one-edit tier — every 'sows' heard as 'sews'", () => {
  const galatians = of("Galatians 6:7-9");
  const heard = spoken(galatians).replace(/\bsows\b/g, "sews");
  assert.ok(today(galatians, heard) < 1);
  const graded = scoreRecital(galatians, heard);
  assert.equal(graded.score, 1);
  assert.equal(graded.counts.edit, 3, "three occurrences, the case voice.js documents");
});

test("16. the merge op absorbs the `eagles;they` data bug", () => {
  const isaiah = of("Isaiah 40:28-31");
  const heard = spoken(isaiah).replace("eaglesthey", "eagles they");
  assert.ok(today(isaiah, heard) < 1, "today the fused word is a guaranteed miss");
  const graded = scoreRecital(isaiah, heard);
  assert.equal(graded.score, 1);
  assert.equal(graded.counts.merge, 1);
  assert.equal(graded.diff.find((d) => d.word === "eagles;they").heard, "eagles they");
});

test("17. ★ a passage that once carried an embedded reference now scores whole", () => {
  /* This fixture was the sharpest example of the old grader's unfairness: Luke
   * 12:32 shipped with "Luke 12:48b" inside its own text, two words nobody
   * recites, so a word-perfect recital was capped at 95% — at the commit bar
   * rather than above it. The data has since been fixed upstream, and the
   * fixture is kept because the outcome it asserts is the one that matters:
   * saying the passage correctly scores 100. */
  const luke = of("Luke 12:32");
  const heard = spoken(luke);
  const graded = scoreRecital(luke, heard);
  assert.equal(graded.score, 1);
  assert.equal(graded.diff.length, luke.text.split(" ").length, "one entry per word of the passage");
  assert.equal(graded.total, graded.diff.length, "and every one of them countable");
});

test("18. an adjacent transposition costs one word, not two", () => {
  const philippians = of("Philippians 4:6-7");
  const heard = spoken(philippians).replace("christ jesus", "jesus christ");
  const graded = scoreRecital(philippians, heard);
  assert.ok(graded.score >= 0.97 && graded.score <= 0.98, `scored ${graded.pct}%`);
  assert.ok(graded.score >= COMMIT, "the gap asymmetry gets this for free — no Damerau term needed");
});

test("19. ★ the proper-noun tiers, and the strict/friendly gap", () => {
  const isaiah = of("Isaiah 9:1-7");
  const heard = spoken(isaiah).replace("zebulun", "zebulon").replace("naphtali", "naftali");
  const graded = scoreRecital(isaiah, heard);

  assert.equal(graded.score, 1, "the friendly figure credits both");
  assert.equal(graded.counts.edit, 1, "zebulon by edit — strict-eligible");
  assert.equal(graded.counts.phonetic, 1, "naftali by phonetics — not");
  assert.ok(graded.strictScore >= 0.99 && graded.strictScore < 1, `strict ${graded.strictScore.toFixed(3)}`);
  assert.equal(graded.strictScore, 242 / 243, "exactly the one phonetic credit's worth");
});

test("20. ★ reciting twice is flagged, not silently scored", () => {
  const words = spoken(PROVERBS).split(" ");
  const wrong = words.map((w, i) => (i % 3 ? w : "elsewhere")).join(" ");
  const graded = scoreRecital(PROVERBS, `${wrong} ${spoken(PROVERBS)}`);

  assert.equal(graded.score, 1, "they did recite it correctly, on the second pass");
  assert.equal(graded.verbose, true, "and the channel guard says so, for a commit gate to act on");
  assert.ok(graded.heardCount > VERBOSE_RATIO * graded.total);
});

/* ── the acceptance cases the brief names, stated as one test ─────────────── */

test("★ a half-forgotten passage lands near half, not near the commit bar", () => {
  const words = spoken(PROVERBS).split(" ");
  const graded = scoreRecital(PROVERBS, words.slice(0, Math.ceil(words.length / 2)).join(" "));
  assert.ok(graded.score > 0.45 && graded.score < 0.6, `scored ${graded.pct}% — forgiveness is not amnesty`);
  assert.ok(graded.score < COMMIT);

  const half = spoken(PSALM23).split(" ");
  const long = scoreRecital(PSALM23, half.slice(0, Math.floor(half.length / 2)).join(" "));
  assert.ok(long.score > 0.45 && long.score < 0.55, `Psalm 23 half-recited scored ${long.pct}%`);
});

test("★ garbage abstains rather than returning a number", () => {
  for (const junk of ["", "   ", "um uh hmm", "..."]) {
    const graded = scoreRecital(PROVERBS, junk);
    assert.equal(graded.abstained, true, JSON.stringify(junk));
    assert.equal(graded.score, null);
    assert.equal(graded.reason, ABSTAIN.EMPTY);
  }
});

test("a flood of tokens abstains before the aligner allocates anything", () => {
  const graded = scoreRecital(PROVERBS, "lord ".repeat(200));
  assert.equal(graded.abstained, true);
  assert.equal(graded.reason, ABSTAIN.FLOOD);
  assert.equal(graded.ops.length, 0, "nothing was aligned");
  assert.ok(graded.heardCount > MAX_SIGNAL_TOKENS(graded.total));
});

test("the browser's own signal can abstain even when tokens arrived", () => {
  // App.js owns the microphone and knows whether onText ever fired; the pure
  // module is given that rather than guessing at it.
  const graded = scoreRecital(PROVERBS, spoken(PROVERBS), { sawSpeech: false });
  assert.equal(graded.abstained, true);
  assert.equal(graded.reason, ABSTAIN.EMPTY);
});

test("abstention thresholds are the measured ones", () => {
  assert.equal(MIN_SIGNAL_RATIO, 0.3);
  assert.equal(MAX_SIGNAL_TOKENS(29), 148);
  // The floor of three is for short passages: there is no such thing as a
  // partial recital of a two-word verse.
  const short = { text: "Jesus wept." };
  assert.equal(scoreRecital(short, "jesus").reason, ABSTAIN.SHORT);
  assert.equal(scoreRecital(short, "jesus wept truly").abstained, false);
});

/* ── the transcript, before anything is aligned ───────────────────────────── */

test("contractions expand, but a possessive that only looks like one does not", () => {
  assert.deepEqual(transcriptTokens("don't"), ["do", "not"]);
  assert.deepEqual(transcriptTokens("I'll"), ["i", "will"]);
  assert.deepEqual(transcriptTokens("let’s"), ["let", "us"], "a curly apostrophe is the same apostrophe");
  // Isaiah 9 has "you have increased its joy" — expanding that would cost a word.
  assert.deepEqual(transcriptTokens("its"), ["its"]);
});

test("numerals are spelled out, into tokens rather than into one token", () => {
  assert.deepEqual(transcriptTokens("1"), ["one"]);
  assert.deepEqual(transcriptTokens("32"), ["thirty", "two"]);
  assert.deepEqual(transcriptTokens("thirty-two"), ["thirty", "two"], "and a hyphen is a space");
  assert.deepEqual(transcriptTokens("2nd"), ["second"]);
  assert.deepEqual(transcriptTokens("1000"), ["one", "thousand"]);
  assert.deepEqual(transcriptTokens("21st"), ["twenty", "first"]);
});

test("disfluencies are dropped unless the passage itself wants the word", () => {
  assert.deepEqual(transcriptTokens("um uh the lord"), ["the", "lord"]);
  assert.deepEqual(transcriptTokens("oh taste and see"), ["taste", "and", "see"], "stripped by default");
  assert.deepEqual(transcriptTokens("oh taste and see", { keep: new Set(["oh"]) }), ["oh", "taste", "and", "see"]);
  // And the passage-aware path is what a real recital of Psalm 34:8 takes.
  const psalm34 = of("Psalm 34:8-9");
  assert.equal(scoreRecital(psalm34, spoken(psalm34)).score, 1, "'Oh, taste and see' is not a filler");
});

/* ── the aligner on its own ───────────────────────────────────────────────── */

test("alignWords reports the operations, not just a cost", () => {
  const { ops, cost } = alignWords(["trust", "in", "the", "Lord"], ["trust", "in", "the", "lord"]);
  assert.equal(cost, 0);
  assert.deepEqual(
    ops.map((o) => o.op),
    ["sub", "sub", "sub", "sub"],
  );
  assert.ok(ops.every((o) => o.kind === "exact"));
});

test("an insertion is absorbed rather than shifting the alignment", () => {
  const { ops } = alignWords(["Lord", "with", "all"], ["lord", "erm", "with", "all"]);
  assert.deepEqual(
    ops.map((o) => o.op),
    ["sub", "ins", "sub", "sub"],
  );
});

test("optional reference words cost nothing to omit", () => {
  const words = ["give", "you", "the", "kingdom.", "Luke", "12:48b", "Everyone"];
  const optional = new Set([4, 5]);
  const heard = ["give", "you", "the", "kingdom", "everyone"];
  assert.equal(alignWords(words, heard, { optional }).cost, 0);
  assert.ok(alignWords(words, heard).cost > 0, "and a full point each without the flag");
});

/* The split op has no fixture of its own, and the reason is worth pinning: the
 * contraction table expands `don't` before the aligner ever sees it, so
 * fixture 5 takes the other of the two paths §3e says should both ship. Split
 * is what catches the contractions nobody listed — and it is live code in the
 * COST table, so it needs a test that reaches it directly or a retune could
 * break it with nothing going red. */
test("the split op credits two reference words against one heard token", () => {
  const { ops, cost } = alignWords(["do", "not"], ["dont"]);
  assert.deepEqual(
    ops.map((o) => o.op),
    ["split"],
  );
  assert.equal(ops[0].kind, "edit", "'donot' and 'dont' are one edit apart");
  assert.equal(ops[0].ri, 0, "ri is the first of the two reference words");
  assert.equal(cost, COST.SPLIT + COST.EDIT);
  assert.ok(cost < COST.OMIT, "and it beats dropping one of them outright");
});

test("the merge op credits one reference word against two heard tokens", () => {
  // The same recurrence term, the other way round: it is what puts a fused
  // `eagles;they` and a hyphenated `self-control` back together.
  const { ops, cost } = alignWords(["self-control"], ["self", "control"]);
  assert.deepEqual(
    ops.map((o) => o.op),
    ["merge"],
  );
  assert.equal(ops[0].kind, "exact");
  assert.equal(cost, COST.MERGE);
});

test("the phonetic tier is reachable only when the caller says the word is a name", () => {
  const words = ["of", "Naphtali,"];
  const heard = ["of", "naftali"];
  assert.ok(alignWords(words, heard, { proper: new Set([1]) }).cost < COST.SUB);
  assert.equal(alignWords(words, heard).cost, COST.SUB, "ungated, it is simply a different word");
});

/* ── what the passage says about its own words ────────────────────────────── */

test("proper nouns are the words capitalized away from a sentence start", () => {
  const found = properNouns("Trust in the Lord with all your heart. In all your ways acknowledge him.");
  assert.ok(found.has("lord"));
  assert.ok(!found.has("trust"), "capitalized only because it opens the passage");
  assert.ok(!found.has("in"), "nor because it opens the second sentence");
});

test("no shipped passage carries a scripture reference inside its own text", () => {
  /* Four of them once did — Isaiah 54:2-3 carried "Isaiah 55:1-3a", and Luke
   * 12:32 carried "Luke 12:48b" — a fetch-time leak that capped a perfect
   * recital of Luke 12:32 at 95%, below the commit bar. The data was fixed
   * upstream (the trailing references became passages of their own), so this
   * now guards the fix rather than tolerating the bug: if the fetcher ever
   * reintroduces one, the scoring layer will quietly excuse it and nobody will
   * notice until a member is marked down. */
  const marked = {};
  for (const passage of passages) {
    const words = passage.text.split(" ");
    const optional = optionalRefWords(words);
    if (optional.size) marked[passage.ref] = [...optional].sort((a, b) => a - b).map((i) => words[i]);
  }
  assert.deepEqual(marked, {}, "the set is clean; see tools/fetch_passages.mjs if this ever fails again");
});

test("a passage that did carry one is scored whole, and reaches the commit bar", () => {
  const luke = of("Luke 12:32");
  const heard = spoken(luke);
  const graded = scoreRecital(luke, heard);
  assert.equal(graded.score, 1, "a perfect recital is perfect");
  assert.equal(
    graded.diff.filter((d) => d.optional).length,
    0,
    "with nothing excused, because there is nothing to excuse",
  );
  assert.ok(graded.score >= 0.95, "and it clears the commit bar it used to be capped at");
});

test("the optional-word mechanism still works, for the day the data slips again", () => {
  /* Driven off a passage built for the purpose rather than off the shipped set,
   * so this keeps testing the mechanism now that no real passage exercises it. */
  const leaky = {
    id: 9001,
    ref: "Made Up 1:1",
    text: "The word of the Lord came to me saying this. Jeremiah 2:2b",
  };
  const words = leaky.text.split(" ");
  const optional = optionalRefWords(words);
  assert.deepEqual(
    [...optional].sort((a, b) => a - b).map((i) => words[i]),
    ["Jeremiah", "2:2b"],
    "the trailing reference is spotted",
  );
  const graded = scoreRecital(leaky, "the word of the lord came to me saying this");
  assert.equal(graded.score, 1, "and reciting the passage without it is still a perfect recital");
});

/* ── the structural properties, which hold over the whole corpus ──────────── */

/* Worth more than any individual fixture, because they cannot be satisfied by
 * tuning the cost matrix. */

test("the diff has one entry per text.split(' ') word, for any transcript at all", () => {
  const transcripts = ["", "um uh", spoken(PSALM23), "lord ".repeat(500), "1 2 3 don't"];
  for (const passage of passages) {
    const want = passage.text.split(" ").length;
    for (const transcript of transcripts) {
      const graded = scoreRecital(passage, transcript);
      assert.equal(graded.diff.length, want, `${passage.ref} vs ${JSON.stringify(transcript.slice(0, 12))}`);
    }
    // Which is the invariant blanks.js, perVerseOf and data/keywords.js all index against.
    assert.ok(scoreRecital(passage, spoken(passage)).diff.every((d) => typeof d.word === "string"));
  }
});

test("every one of the 183 passages recited perfectly scores exactly 1.00", () => {
  const failures = passages.filter((p) => scoreRecital(p, spoken(p)).score !== 1).map((p) => p.ref);
  assert.deepEqual(failures, [], "including the four with an embedded reference and the three with a fused word");
});

test("insertions never appear in the diff, only in ops and counts", () => {
  const graded = scoreRecital(PROVERBS, `trust in the ${spoken(PROVERBS)}`);
  assert.equal(graded.diff.length, 29);
  assert.equal(graded.ops.filter((o) => o.op === "ins").length, 3);
  assert.equal(graded.counts.ins, 3);
});

test("the counts are one tally per operation, so they sum to the operation list", () => {
  const cases = [
    [PROVERBS, spoken(PROVERBS)],
    [PROVERBS, spoken(PROVERBS).replace("heart", "hard")],
    [PROVERBS, `trust in the ${spoken(PROVERBS)}`],
    [PSALM23, `um ${spoken(PSALM23)}`],
    [of("Isaiah 40:28-31"), spoken(of("Isaiah 40:28-31")).replace("eaglesthey", "eagles they")],
  ];
  for (const [passage, transcript] of cases) {
    const graded = scoreRecital(passage, transcript);
    const total = Object.values(graded.counts).reduce((a, b) => a + b, 0);
    assert.equal(total, graded.ops.length);
  }
});

test("the diff is drop-in compatible with gradeWritten().diff", () => {
  const graded = scoreRecital(PROVERBS, spoken(PROVERBS).replace("heart", "hard"));
  const written = gradeWritten(PROVERBS.text.split(" "), spoken(PROVERBS));
  assert.deepEqual(
    graded.diff.map((d) => d.word),
    written.diff.map((d) => d.word),
    "same words, same order",
  );
  for (const entry of graded.diff) {
    assert.equal(typeof entry.hit, "boolean");
    assert.equal(entry.hit, entry.kind !== "sub" && entry.kind !== "omit");
    assert.ok(["exact", "homophone", "edit", "phonetic", "sub", "omit"].includes(entry.kind));
  }
});

test("credited words advance monotonically through the transcript", () => {
  const heard = `trust in the ${spoken(PROVERBS).replace("heart", "hard")} amen`;
  const graded = scoreRecital(PROVERBS, heard);
  let last = -1;
  for (const op of graded.ops) {
    if (op.hi < 0) continue;
    assert.ok(op.hi > last, `heard index ${op.hi} came after ${last}`);
    last = op.op === "merge" ? op.hi + 1 : op.hi;
  }
});

test("data/keywords.js indices stay valid against the diff", async () => {
  const { keywordIndices } = await import("../data/keywords.js");
  for (const passage of passages) {
    const indices = keywordIndices[passage.id];
    if (!indices) continue;
    const graded = scoreRecital(passage, spoken(passage));
    for (const i of indices) assert.ok(i >= 0 && i < graded.diff.length, `${passage.ref} index ${i}`);
  }
});

/* The cross-passage floor. Sampled with the app's own seeded PRNG rather than
 * exhaustively, because 183 × 182 alignments is thirty-three thousand of them —
 * and seeded rather than random so a failure is reproducible.
 *
 * This is what actually stops a scorer this forgiving from crediting the wrong
 * verse: not the cost matrix, but the two channel guards. Two short passages
 * sharing a lot of function words are the worst case. */
test("a passage fed a different passage's text scores low, abstains, or is flagged", () => {
  const random = mulberry32(20260822);
  let highest = 0;
  let worst = "";
  let sampled = 0;
  for (let k = 0; k < 250; k++) {
    const a = passages[Math.floor(random() * passages.length)];
    const b = passages[Math.floor(random() * passages.length)];
    if (a.id === b.id) continue;
    sampled++;
    const graded = scoreRecital(a, spoken(b));
    if (graded.abstained || graded.verbose) continue;
    if (graded.score > highest) {
      highest = graded.score;
      worst = `${a.ref} against ${b.ref}`;
    }
  }
  assert.ok(sampled > 200, "the sample really ran");
  assert.ok(highest < 0.5, `highest unflagged cross-passage score was ${Math.round(highest * 100)}% — ${worst}`);
});
