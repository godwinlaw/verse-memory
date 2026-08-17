import test from "node:test";
import assert from "node:assert/strict";

import { transcribe } from "../src/voice.js";

/* Recite a run of phrases the way the browser delivers them: a guess that keeps
 * changing, then the settled version. `[text, settled]` pairs. */
function recite(...steps) {
  return steps.reduce((s, [text, settled]) => transcribe(s.typed, s.tail, text, settled), { typed: "", tail: 0 });
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

test("only the first word — later phrases are left as they were heard", () => {
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
  assert.deepEqual(transcribe("", 0, "", true), { typed: "", tail: 0 });
  assert.deepEqual(transcribe(undefined, undefined, undefined), { typed: "", tail: 0 });
  assert.deepEqual(transcribe("Trust in the Lord", 17, "   ", true), { typed: "Trust in the Lord", tail: 17 });
});
