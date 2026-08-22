/* Run mode's pure half: the callout queue and the per-verse script. */

import test from "node:test";
import assert from "node:assert/strict";

import { calloutQueue, calloutScript, ECHO_MAX_MS, ECHO_MIN_MS, ECHO_MS_PER_WORD, REF_PAUSE_MS } from "../src/run.js";

const NOW = Date.now();
const committedRec = (last) => ({ hits: 3, status: "memorized", last, step: 3, stability: 10, updatedAt: last });
const learningRec = () => ({ hits: 1, status: "learning", last: NOW, step: 0, stability: 1, updatedAt: NOW });

const passages = [
  { id: 1, ref: "John 3:16", text: "For God so loved the world that he gave his only Son." },
  { id: 2, ref: "Romans 3:23", text: "For all have sinned and fall short of the glory of God." },
  { id: 3, ref: "Psalm 117:2", text: "Great is his steadfast love toward us." },
];

test("the queue is the committed verses, stalest first", () => {
  const day = 24 * 60 * 60 * 1000;
  const progress = {
    1: committedRec(NOW - 1 * day), // fresh
    2: committedRec(NOW - 20 * day), // stale — comes first
    3: learningRec(), // not committed — not on a run
  };
  const q = calloutQueue(passages, progress, NOW);
  assert.deepEqual(
    q.map((p) => p.id),
    [2, 1],
  );
});

test("with nothing committed, the whole set is the run", () => {
  const q = calloutQueue(passages, { 3: learningRec() }, NOW);
  assert.deepEqual(
    q.map((p) => p.id),
    [1, 2, 3],
  );
});

test("the queue does not disturb the list it was given", () => {
  const copy = [...passages];
  calloutQueue(passages, {}, NOW);
  assert.deepEqual(passages, copy);
});

test("a callout is the reference, then the verse, each with its pause", () => {
  const script = calloutScript(passages[0]);
  assert.equal(script.length, 2);
  assert.equal(script[0].text, "John 3:16");
  assert.equal(script[0].pauseAfterMs, REF_PAUSE_MS);
  assert.equal(script[1].text, passages[0].text);
  const words = passages[0].text.split(" ").length;
  assert.equal(script[1].pauseAfterMs, Math.max(ECHO_MIN_MS, words * ECHO_MS_PER_WORD));
});

test("the echo pause is proportional to length, inside its bounds", () => {
  const short = calloutScript({ ref: "R", text: "two words" });
  assert.equal(short[1].pauseAfterMs, ECHO_MIN_MS);
  const long = calloutScript({ ref: "R", text: Array(200).fill("word").join(" ") });
  assert.equal(long[1].pauseAfterMs, ECHO_MAX_MS);
});
