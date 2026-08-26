/* The pure half of the run-mode audio seam. The audio graph itself needs a
 * browser, but how a verse is cut up for the voice does not — and that is the
 * part a stalled session turns on (see the note on MAX_CHUNK_CHARS). */

import test from "node:test";
import assert from "node:assert/strict";

import { chunkForSpeech, speechMs, presetByKey, BEAT_PRESETS } from "../src/beat.js";

test("a short line is spoken in one piece", () => {
  assert.deepEqual(chunkForSpeech("Psalm 23:1"), ["Psalm 23:1"]);
});

test("nothing at all is nothing to say", () => {
  assert.deepEqual(chunkForSpeech(""), []);
  assert.deepEqual(chunkForSpeech("   "), []);
  assert.deepEqual(chunkForSpeech(undefined), []);
});

test("a long passage is cut into pieces the browser will finish", () => {
  const long =
    "The LORD is my shepherd; I shall not want. He makes me lie down in green pastures. " +
    "He leads me beside still waters. He restores my soul. He leads me in paths of " +
    "righteousness for his name's sake. Even though I walk through the valley of the " +
    "shadow of death, I will fear no evil, for you are with me; your rod and your staff, " +
    "they comfort me.";
  const chunks = chunkForSpeech(long);
  assert.ok(chunks.length > 1, "a long passage is split");
  for (const c of chunks) assert.ok(c.length <= 180, `chunk within the ceiling: ${c.length}`);
  // Nothing is dropped on the way through — the words come back in order.
  const rejoined = chunks.join(" ").replace(/\s+/g, " ");
  assert.equal(rejoined.replace(/\s+/g, " ").trim(), long.replace(/\s+/g, " ").trim());
});

test("one enormous sentence is still cut, on a space", () => {
  const runOn = "and " + "the word of the LORD came to me saying ".repeat(12);
  const chunks = chunkForSpeech(runOn);
  assert.ok(chunks.length > 1);
  for (const c of chunks) assert.ok(c.length <= 180);
});

test("the watchdog's estimate grows with the words and has a floor", () => {
  assert.equal(speechMs(""), 2500);
  assert.ok(speechMs("one two three four five six seven eight nine ten") >= 2500);
  const short = speechMs("Psalm 23");
  const long = speechMs(Array(60).fill("word").join(" "));
  assert.ok(long > short, "a longer line is given longer");
});

test("an unknown preset falls back rather than failing", () => {
  assert.equal(presetByKey("nope"), BEAT_PRESETS[0]);
  assert.equal(presetByKey("sprint").key, "sprint");
});

test("every preset is a full bar of sixteenths", () => {
  for (const p of BEAT_PRESETS) {
    for (const track of ["kick", "hat", "snare", "bass"]) {
      assert.equal(p[track].length, 16, `${p.key}.${track} is one bar`);
    }
    assert.ok(p.bpm >= 140 && p.bpm <= 200, `${p.key} sits at a running cadence`);
  }
});
