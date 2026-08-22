import test from "node:test";
import assert from "node:assert/strict";

import { feedbackFor, nextIndex, nextPhase, promptFor } from "../src/speak.js";

const SHORT = { id: 1, ref: "John 11:35", text: "Jesus wept." };
const MULTI = {
  id: 2,
  ref: "Psalm 117",
  text: "Praise the LORD, all nations! Extol him, all peoples! For great is his steadfast love toward us.",
  verses: [
    { v: 1, text: "Praise the LORD, all nations! Extol him, all peoples!" },
    { v: 2, text: "For great is his steadfast love toward us." },
  ],
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
  assert.match(r.spokenFeedback, /did not hear/i);
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
