import test from "node:test";
import assert from "node:assert/strict";

import {
  bandFor,
  commandIn,
  feedbackFor,
  nextIndex,
  nextPhase,
  promptFor,
  promptWordsFor,
  silenceMsFor,
  COMMANDS,
  SILENCE_DONE_MS,
  SILENCE_THINKING_MS,
} from "../src/speak.js";
import { copy } from "../src/copy.js";
import { passages } from "../data/passages.js";

const SHORT = { id: 1, ref: "John 11:35", text: "Jesus wept." };
/* `verses` is an array of strings — that is what data/passages.js ships and what
 * test/passages.test.mjs asserts. The fixture used to invent `[{ v, text }]`,
 * which is why verse mode threw on every real passage without a test noticing;
 * both shapes are kept here so neither can rot again. */
const MULTI = {
  id: 2,
  ref: "Psalm 117",
  text: "Praise the LORD, all nations! Extol him, all peoples! For great is his steadfast love toward us.",
  verses: ["Praise the LORD, all nations! Extol him, all peoples!", "For great is his steadfast love toward us."],
};

test("passage mode: a perfect lowercase transcript scores full marks", () => {
  const r = feedbackFor(SHORT, "jesus wept", "passage");
  assert.equal(r.score, 1);
  assert.equal(r.pct, 100);
  assert.match(r.spokenFeedback, /100 percent/);
  assert.equal(r.perWord, undefined);
  assert.equal(r.perVerse, undefined);
});

test("passage mode: an empty recital says so instead of quoting zero", () => {
  const r = feedbackFor(SHORT, "", "passage");
  assert.equal(r.score, 0);
  // The line changed when the loop learned to hand the verse back: a member who
  // said nothing is offered the passage rather than told they were not heard.
  assert.equal(r.spokenFeedback, copy.speak.nothingHeard);
  assert.doesNotMatch(r.spokenFeedback, /percent/i, "and never a figure for having said nothing");
});

test("word mode: the missed words are graded per word and read out", () => {
  const r = feedbackFor(SHORT, "jesus", "word");
  assert.equal(r.perWord.length, 2);
  assert.equal(r.perWord[0].hit, true);
  assert.equal(r.perWord[1].hit, false);
  assert.deepEqual(r.missed, ["wept."]);
  assert.match(r.spokenFeedback, /missed/i);
  assert.match(r.spokenFeedback, /wept/);
});

test("verse mode: a verses-bearing passage is graded verse by verse", () => {
  // The first verse recited cleanly, the second not at all.
  const r = feedbackFor(MULTI, "praise the lord all nations extol him all peoples", "verse");
  assert.equal(r.perVerse.length, 2);
  assert.equal(r.perVerse[0].pct, 100);
  assert.equal(r.perVerse[1].pct, 0);
  assert.match(r.spokenFeedback, /Verse 1: 100 percent/);
  assert.match(r.spokenFeedback, /Verse 2: 0 percent/);
});

test("verse mode: a passage without verses falls back to the whole-passage sentence", () => {
  const r = feedbackFor(SHORT, "jesus wept", "verse");
  assert.equal(r.perVerse, undefined);
  assert.match(r.spokenFeedback, /100 percent/);
});

test("the queue wraps instead of ending", () => {
  assert.equal(nextIndex(0, 3), 1);
  assert.equal(nextIndex(2, 3), 0);
  assert.equal(nextIndex(0, 0), 0);
});

test("the cycle runs prompt → listen → feedback → prompt, advancing on the way round", () => {
  let s = { phase: "prompt", index: 1, queueLength: 2 };
  s = { ...s, ...nextPhase(s) };
  assert.equal(s.phase, "listen");
  s = { ...s, ...nextPhase(s) };
  assert.equal(s.phase, "feedback");
  s = { ...s, ...nextPhase(s) };
  assert.equal(s.phase, "prompt");
  assert.equal(s.index, 0);
});

test("the prompt names the reference", () => {
  assert.match(promptFor(SHORT), /John 11:35/);
});

/* ── the loop ─────────────────────────────────────────────────────────────── */

test("every real multi-verse passage can be graded verse by verse", () => {
  // The shape bug this pins threw on all sixteen of them, and the old fixture
  // was the reason nothing caught it.
  const multi = passages.filter((p) => Array.isArray(p.verses) && p.verses.length > 1);
  assert.ok(multi.length > 10, "the set really does carry multi-verse passages");
  for (const p of multi) {
    const r = feedbackFor(p, p.text, "verse");
    assert.equal(r.pct, 100, `${p.ref} scores itself`);
    assert.equal(r.perVerse.length, p.verses.length, `${p.ref} reports one figure per verse`);
  }
});

test("the bands are the four the session speaks", () => {
  assert.equal(bandFor(1), "clean");
  assert.equal(bandFor(0.95), "clean");
  assert.equal(bandFor(0.94), "close");
  assert.equal(bandFor(0.8), "close");
  assert.equal(bandFor(0.79), "shaky");
  assert.equal(bandFor(0.55), "shaky");
  assert.equal(bandFor(0.54), "lost");
  assert.equal(bandFor(0), "lost");
});

test("a member still short of the passage is given longer to think", () => {
  const p = passages.find((x) => /Proverbs 3:5/.test(x.ref));
  assert.equal(silenceMsFor(p, p.text), SILENCE_DONE_MS, "a finished recital is not waited on");
  assert.equal(silenceMsFor(p, "trust in the"), SILENCE_THINKING_MS, "a stalled one is");
});

test("the prompter feeds the next words, from where the member dried up", () => {
  const p = { id: 9, ref: "Psalm 23:1", text: "The LORD is my shepherd; I shall not want." };
  assert.equal(promptWordsFor(p, ""), "The LORD is");
  assert.equal(promptWordsFor(p, "The LORD is my shepherd;"), "I shall not");
  assert.equal(promptWordsFor(p, p.text), "", "and has nothing to add to a finished verse");
});

test("a word said to the app is only a command when it is all that was said", () => {
  assert.equal(commandIn("hint"), "hint");
  assert.equal(commandIn("Skip."), "skip");
  assert.equal(commandIn(""), null);
  // The danger the whole rule exists for: scripture that contains a command word.
  assert.equal(commandIn("again I say rejoice the Lord is at hand"), null);
  assert.equal(commandIn("stop and consider the wondrous works of God"), null);
});

test("no command word is a word of scripture on its own", () => {
  /* A command is read only when it is the whole utterance, so the risk is a
   * passage that *is* one word long. None are, but this is the assertion that
   * keeps the vocabulary honest as the set grows. */
  for (const p of passages) {
    const words = p.text.split(/\s+/).filter(Boolean);
    if (words.length <= 2) assert.equal(commandIn(p.text), null, `${p.ref} would be heard as a command`);
  }
  assert.ok(COMMANDS.includes("hint"));
  assert.ok(!COMMANDS.includes("help"), "help is in the Psalms — hint is the free word");
});
