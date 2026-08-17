import test from "node:test";
import assert from "node:assert/strict";

import {
  appendSpoken,
  canUndo,
  clearSpoken,
  hearFinal,
  liveChunks,
  spokenCommand,
  undoPhrase,
  undoWord,
  VOICE_COMMANDS,
} from "../src/voice.js";

/* Speak a run of phrases in order, as the recognizer would deliver them. */
function recite(...phrases) {
  return phrases.reduce((s, p) => appendSpoken(s.typed, s.chunks, p), { typed: "", chunks: [] });
}

test("spoken phrases join into one transcript, separated by single spaces", () => {
  const { typed } = recite("Hear O Israel", "the LORD our God", "the LORD is one");
  assert.equal(typed, "Hear O Israel the LORD our God the LORD is one");
});

test("each phrase records where it landed, so it can be lifted back out", () => {
  const { typed, chunks } = recite("Hear O Israel", "the LORD our God");
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].start, 0);
  assert.equal(typed.slice(chunks[1].start), " the LORD our God");
});

test("an empty or whitespace utterance adds nothing", () => {
  const spoken = recite("Trust in the Lord");
  for (const nothing of ["", "   ", null, undefined]) {
    const after = appendSpoken(spoken.typed, spoken.chunks, nothing);
    assert.equal(after.typed, spoken.typed);
    assert.equal(after.chunks.length, 1);
  }
});

test("speaking after typing joins on with one space and absorbs the trailing one", () => {
  const { typed, chunks } = appendSpoken("Trust in the Lord ", [], "with all your heart");
  assert.equal(typed, "Trust in the Lord with all your heart");
  // The chunk's start has to be a position still checkable against the
  // transcript — the trailing space the member left is not part of it.
  assert.equal(typed.slice(chunks[0].start), " with all your heart");
});

/* ── taking it back ───────────────────────────────────────────────────────── */

test("undoPhrase removes the last phrase whole", () => {
  const spoken = recite("Hear O Israel", "the LORD our God", "the LORD is one");
  const after = undoPhrase(spoken.typed, spoken.chunks);
  assert.equal(after.typed, "Hear O Israel the LORD our God");
  assert.equal(after.chunks.length, 2);
});

test("undoPhrase walks all the way back to nothing", () => {
  let s = recite("Hear O Israel", "the LORD our God");
  s = undoPhrase(s.typed, s.chunks);
  s = undoPhrase(s.typed, s.chunks);
  assert.equal(s.typed, "");
  assert.deepEqual(s.chunks, []);
});

test("undoWord backspaces over one word, spoken or typed", () => {
  assert.equal(undoWord("Trust in the Lord", []).typed, "Trust in the");
  assert.equal(undoWord("Trust in the Lord   ", []).typed, "Trust in the");
  assert.equal(undoWord("Trust", []).typed, "");
  assert.equal(undoWord("", []).typed, "");
});

test("undoWord drops the chunk it ate into, so undo cannot re-add words", () => {
  const spoken = recite("Hear O Israel", "the LORD our God");
  const after = undoWord(spoken.typed, spoken.chunks);
  assert.equal(after.typed, "Hear O Israel the LORD our");
  // The second phrase is no longer where it said it was, so it stops counting.
  assert.equal(after.chunks.length, 1);
  // ...and the next undoPhrase therefore takes a word, not a phrase.
  assert.equal(undoPhrase(after.typed, after.chunks).typed, "Hear O Israel the LORD");
});

test("clearSpoken starts the passage again", () => {
  assert.deepEqual(clearSpoken(), { typed: "", chunks: [] });
});

test("canUndo is false only when there is nothing there", () => {
  assert.equal(canUndo(""), false);
  assert.equal(canUndo("   "), false);
  assert.equal(canUndo(undefined), false);
  assert.equal(canUndo("Trust"), true);
});

/* ── the transcript stays editable by hand ────────────────────────────────── */

test("a chunk stops counting once the member has typed over it", () => {
  const spoken = recite("Hear O Israel", "the LORD our God");
  // The member corrects the second phrase by hand.
  const edited = "Hear O Israel the Lord our God";
  assert.equal(liveChunks(edited, spoken.chunks).length, 1);
});

test("editing the start of the box invalidates what follows it, not by rebuilding", () => {
  const spoken = recite("Hear O Israel", "the LORD our God");
  // Everything shifts by one character, so no chunk sits at its recorded
  // offset any more.
  assert.deepEqual(liveChunks("Hear, O Israel the LORD our God", spoken.chunks), []);
});

test("undoPhrase degrades to one word when the tail has been edited", () => {
  const spoken = recite("Hear O Israel", "the LORD our God");
  const edited = spoken.typed + " today";
  const after = undoPhrase(edited, spoken.chunks);
  assert.equal(after.typed, "Hear O Israel the LORD our God");
  // Both phrases are still where they were, so the next undo is a phrase again.
  assert.equal(after.chunks.length, 2);
  assert.equal(undoPhrase(after.typed, after.chunks).typed, "Hear O Israel");
});

test("liveChunks tolerates a missing or empty chunk list", () => {
  assert.deepEqual(liveChunks("Trust in the Lord"), []);
  assert.deepEqual(liveChunks("", []), []);
});

/* ── spoken instructions ──────────────────────────────────────────────────── */

test("spokenCommand recognises each instruction, ignoring case and punctuation", () => {
  assert.equal(spokenCommand("Scratch that!"), "undo");
  assert.equal(spokenCommand("  UNDO  "), "undo");
  assert.equal(spokenCommand("Backspace."), "back");
  assert.equal(spokenCommand("Start over"), "clear");
});

test("every listed phrase resolves to the step it is listed under", () => {
  for (const { key, phrases } of VOICE_COMMANDS) {
    for (const p of phrases) assert.equal(spokenCommand(p), key, `"${p}" should be ${key}`);
  }
});

test("scripture is never mistaken for an instruction", () => {
  assert.equal(spokenCommand("Hear O Israel the LORD our God"), null);
  // The words appear inside the utterance rather than being the whole of it.
  assert.equal(spokenCommand("undo the heavy burdens"), null);
  assert.equal(spokenCommand("and start over again"), null);
  assert.equal(spokenCommand(""), null);
  assert.equal(spokenCommand(null), null);
});

test("hearFinal writes scripture down and obeys instructions", () => {
  const spoken = recite("Hear O Israel", "the LORD our dog");
  const fixed = hearFinal(spoken.typed, spoken.chunks, "scratch that");
  assert.equal(fixed.command, "undo");
  assert.equal(fixed.typed, "Hear O Israel");

  const carried = hearFinal(fixed.typed, fixed.chunks, "the LORD our God");
  assert.equal(carried.command, null);
  assert.equal(carried.typed, "Hear O Israel the LORD our God");

  assert.equal(hearFinal(carried.typed, carried.chunks, "start over").typed, "");
});
