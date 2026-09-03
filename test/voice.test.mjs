import test from "node:test";
import assert from "node:assert/strict";

import { transcribe } from "../src/voice.js";

/* Recite a run of phrases the way the browser delivers them: a guess that keeps
 * changing, then the settled version. `[text, settled]` pairs. */
function recite(...steps) {
  return steps.reduce((s, [text, settled]) => transcribe(s.typed, s.tail, text, settled), { typed: "", tail: 0 });
}

/* The same, against a passage the words can be fitted back onto. */
const SHEMA = "Hear, O Israel: The LORD our God, the LORD is one. You shall love the LORD your God.";
function reciteInto(passage, ...steps) {
  return steps.reduce((s, [text, settled]) => transcribe(s.typed, s.tail, text, settled, passage, s.rest), {
    typed: "",
    tail: 0,
    rest: 0,
  });
}

test("settled phrases join into one transcript, separated by single spaces", () => {
  const { typed } = recite(["hear O Israel", true], ["the LORD our God", true], ["the LORD is one", true]);
  assert.equal(typed, "Hear O Israel the LORD our God the LORD is one");
});

test("an unsettled phrase is replaced in place, not piled up after itself", () => {
  // What the browser actually sends while a member is mid-sentence.
  const s = recite(["hear", false], ["hear O", false], ["hear O Israel", false]);
  assert.equal(s.typed, "Hear O Israel", "the box shows the words as they are spoken");
  assert.equal(s.tail, 0, "and all of it is still provisional");
});

test("settling a phrase moves the tail past it, so the next one appends", () => {
  const settled = recite(["hear O Israel", false], ["hear O Israel", true]);
  assert.equal(settled.tail, settled.typed.length);

  const next = transcribe(settled.typed, settled.tail, "the LORD", false);
  assert.equal(next.typed, "Hear O Israel the LORD");
  assert.equal(next.tail, "Hear O Israel".length, "the settled part is safe from the next revision");
});

test("a revised guess replaces the last one rather than doubling it", () => {
  let s = recite(["hear O Israel", true]);
  s = transcribe(s.typed, s.tail, "the lord", false);
  s = transcribe(s.typed, s.tail, "the LORD our God", false);
  assert.equal(s.typed, "Hear O Israel the LORD our God");
});

test("a withdrawn guess takes its words back out", () => {
  let s = recite(["hear O Israel", true]);
  s = transcribe(s.typed, s.tail, "the lor", false);
  assert.equal(s.typed, "Hear O Israel the lor");
  // The browser reports an empty interim once a result settles or is dropped.
  s = transcribe(s.typed, s.tail, "", false);
  assert.equal(s.typed, "Hear O Israel", "and nothing of the settled text goes with it");
});

/* ── capitals ─────────────────────────────────────────────────────────────── */

test("the very first word is capitalised, since the engine hands back lowercase", () => {
  assert.equal(transcribe("", 0, "trust in the Lord", true).typed, "Trust in the Lord");
  assert.equal(transcribe("", 0, "and these words", false).typed, "And these words");
});

test("only the first word, later phrases are left as they were heard", () => {
  const { typed } = recite(["trust in the Lord", true], ["with all your heart", true]);
  assert.equal(typed, "Trust in the Lord with all your heart");
});

test("a member who typed the opening is not second-guessed", () => {
  const { typed } = transcribe("hear O Israel", 13, "the LORD our God", true);
  assert.equal(typed, "hear O Israel the LORD our God", "their capitals are theirs");
});

test("a first word that is not a letter is left alone", () => {
  assert.equal(transcribe("", 0, "1 Samuel says", true).typed, "1 Samuel says");
  assert.equal(transcribe("", 0, "“hear O Israel”", true).typed, "“hear O Israel”");
});

/* ── the box stays the member's ───────────────────────────────────────────── */

test("trailing whitespace a member left is absorbed at the join", () => {
  assert.equal(
    transcribe("Trust in the Lord   ", 20, "with all your heart", true).typed,
    "Trust in the Lord with all your heart",
  );
});

test("a tail past the end of the transcript cannot resurrect deleted words", () => {
  // What a hand edit leaves behind for a moment: the member deleted back past
  // where the engine thought it was.
  const { typed } = transcribe("Trust", 99, "in the Lord", true);
  assert.equal(typed, "Trust in the Lord");
});

test("a missing or negative tail is treated as the start of the box", () => {
  assert.equal(transcribe("anything at all", -5, "hear O Israel", true).typed, "Hear O Israel");
  assert.equal(transcribe("anything at all", null, "hear O Israel", true).typed, "Hear O Israel");
});

test("empty input never throws and never invents words", () => {
  assert.deepEqual(transcribe("", 0, "", true), { typed: "", tail: 0, rest: 0 });
  assert.deepEqual(transcribe(undefined, undefined, undefined), { typed: "", tail: 0, rest: 0 });
  assert.deepEqual(transcribe("Trust in the Lord", 17, "   ", true), {
    typed: "Trust in the Lord",
    tail: 17,
    rest: 0,
  });
});

/* ── fitting what was heard back onto the passage ─────────────────────────── */

test("a word that was right is shown the way the passage writes it", () => {
  // The engine hands back a flat lowercase stream. The verse knows better.
  const { typed } = reciteInto(SHEMA, ["hear o israel", true], ["the lord our god", true]);
  assert.match(typed, /O Israel/, "capitals the engine never sends");
  assert.match(typed, /The LORD our God/, "including the ones only this verse uses");
});

test("punctuation arrives once the word after it is right too", () => {
  // A full stop after "one" is a claim about where the sentence ended, and
  // until the next word is in there is nothing to make that claim about.
  const mid = reciteInto(SHEMA, ["hear o israel", true], ["the lord our god", true], ["the lord is one", true]);
  assert.match(mid.typed, /is one$/, "nothing yet after the last word heard");

  const on = transcribe(mid.typed, mid.tail, "you shall love", true, SHEMA, mid.rest);
  assert.match(on.typed, /is one\. You shall love/, "and now the stop is earned");
});

test("the whole thing comes out as the verse reads", () => {
  const { typed } = reciteInto(
    SHEMA,
    ["hear o israel", true],
    ["the lord our god", true],
    ["the lord is one", true],
    ["you shall love the lord your god", true],
  );
  assert.equal(typed, "Hear, O Israel: The LORD our God, the LORD is one. You shall love the LORD your God");
});

test("a word that was wrong is left exactly as it was heard", () => {
  const { typed } = reciteInto(SHEMA, ["hear o israel", true], ["the lord our dog", true], ["the lord is one", true]);
  assert.match(typed, /our dog the LORD/, "what they said, not what was wanted");
  assert.doesNotMatch(typed, /dog,/, "and no punctuation it did not earn");
  assert.match(typed, /the LORD is one/, "the words after it still line up");
});

/* ── what the engine misheard ─────────────────────────────────────────────── */

test("a word the engine spelled wrong is corrected to the passage's", () => {
  // Both reported by a member: the engine hears the sound and guesses the
  // grammar, and these are the guesses it gets wrong.
  const jew = reciteInto("Salvation is from the Jew first", ["salvation is from the jews first", true]);
  assert.equal(jew.typed, "Salvation is from the Jew first");

  const sow = reciteInto("Whatever one sows, that will he also reap", [
    "whatever one sews that will he also reap",
    true,
  ]);
  assert.equal(sow.typed, "Whatever one sows, that will he also reap");
});

test("a corrected word still earns its punctuation, and the ones after it line up", () => {
  const { typed } = reciteInto(SHEMA, ["hear o israel", true], ["the lord our gods the lord is one", true]);
  assert.match(typed, /our God, the LORD is one/, "the plural is dropped and the comma is earned");
});

test("but a different word is still a different word", () => {
  // Two edits apart, and left alone, the leniency is for a misspelling of the
  // right word, not for a near neighbour of it.
  const { typed } = reciteInto(SHEMA, ["hear o israel", true], ["the lord our dog", true]);
  assert.match(typed, /our dog/);
});

test("and a short word is compared strictly, where one edit is most of it", () => {
  const passage = "Be still and know";
  const { typed } = reciteInto(passage, ["he still and know", true]);
  assert.match(typed, /^He still/, '"he" is not "be", however close it is spelled');
});

test("an apostrophe nobody pronounced is put back", () => {
  const passage = "He bore us on eagles’ wings";
  const { typed } = reciteInto(passage, ["he bore us on eagles wings", true]);
  assert.equal(typed, "He bore us on eagles’ wings");
});

test("with no passage to compare against, the words go in as they were heard", () => {
  // The box worked this way before it was ever handed the verse, and a card
  // with nothing on it must not start throwing.
  const { typed } = recite(["hear o israel", true], ["the lord our god", true]);
  assert.equal(typed, "Hear o israel the lord our god");
});

/* ── the words go in where the cursor is ──────────────────────────────────── */

test("what sits after the cursor is held aside and put back", () => {
  // The member has parked the caret before a phrase they already have.
  const box = "Hear, O Israel: is one.";
  const at = "Hear, O Israel:".length;
  const next = transcribe(box, at, "the lord our god the lord", true, SHEMA, box.length - at);
  assert.equal(next.typed, "Hear, O Israel: The LORD our God, the LORD is one.");
  assert.equal(next.rest, "is one.".length, "and it is still held, for the next phrase");
});

test("nothing after the cursor is the ordinary case, and is untouched", () => {
  const { typed, rest } = reciteInto(SHEMA, ["hear o israel", true]);
  assert.equal(typed, "Hear, O Israel");
  assert.equal(rest, 0);
});

test("a held tail survives a phrase being revised in place", () => {
  const box = "Hear, O Israel: is one.";
  const at = "Hear, O Israel:".length;
  let s = transcribe(box, at, "the lord", false, SHEMA, box.length - at);
  assert.equal(s.typed, "Hear, O Israel: The LORD is one.");
  s = transcribe(s.typed, s.tail, "the lord our god", false, SHEMA, s.rest);
  assert.equal(s.typed, "Hear, O Israel: The LORD our God is one.", "the guess is replaced, the tail stays put");
});

test("a held tail is kept even when the phrase heard is nothing at all", () => {
  const box = "Hear, O Israel: is one.";
  const at = "Hear, O Israel:".length;
  const s = transcribe(box, at, "   ", true, SHEMA, box.length - at);
  assert.equal(s.typed, "Hear, O Israel: is one.");
});
