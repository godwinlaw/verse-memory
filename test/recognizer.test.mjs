/* The browser engine, against a stand-in for SpeechRecognition.
 *
 * Everything createRecognizer() does is wiring: it reports settled phrases apart
 * from ones the browser is still revising, and it keeps the session alive across
 * the pauses Chrome ends it on. Both are worth pinning, and neither needs a
 * microphone — a stub with the same four events is enough. */

import test from "node:test";
import assert from "node:assert/strict";

import { createRecognizer, ERRORS, voiceSupported } from "../src/recognizer.js";

class FakeSpeechRecognition {
  constructor() {
    this.started = 0;
    FakeSpeechRecognition.last = this;
  }
  start() {
    this.started++;
    if (this.onstart) this.onstart();
  }
  abort() {
    this.aborted = true;
  }
  /* One onresult event, from a list of [transcript, isFinal] pairs. */
  deliver(pairs) {
    this.onresult({
      resultIndex: 0,
      results: Object.assign(
        pairs.map(([transcript, isFinal]) => ({ 0: { transcript }, isFinal })),
        { length: pairs.length },
      ),
    });
  }
}

/* A window with recognition, for the length of one test. */
function withSpeech(run) {
  const had = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { SpeechRecognition: FakeSpeechRecognition },
  });
  try {
    return run();
  } finally {
    if (had) Object.defineProperty(globalThis, "window", had);
    else delete globalThis.window;
  }
}

/* A recognizer plus a log of everything it reported. */
function wired() {
  const heard = { text: [], statuses: [], errors: [] };
  const rec = createRecognizer({
    onText: (t, settled) => heard.text.push([t, settled]),
    onStatus: (s) => heard.statuses.push(s),
    onError: (e) => heard.errors.push(e),
  });
  return { rec, heard, engine: FakeSpeechRecognition.last };
}

test("a browser with no recognition offers none, rather than guessing", () => {
  // Node has no window, which is the same answer Firefox gives: the app has to
  // degrade to a box you type in.
  assert.equal(voiceSupported(), false);
  assert.equal(createRecognizer({}), null);
});

test("a browser with recognition offers it, and builds one", () => {
  withSpeech(() => {
    assert.equal(voiceSupported(), true);
    assert.ok(createRecognizer({}));
  });
});

test("settled phrases are marked as such; ones still being revised are not", () => {
  withSpeech(() => {
    const { rec, heard, engine } = wired();
    rec.start();
    engine.deliver([
      ["Hear O Israel ", true],
      ["the LORD our", false],
    ]);
    assert.deepEqual(heard.text, [
      ["Hear O Israel ", true],
      ["the LORD our", false],
    ]);
    assert.deepEqual(heard.statuses, ["starting", "listening"]);
  });
});

test("a pause does not end the session — the member does", () => {
  withSpeech(() => {
    const { rec, engine } = wired();
    rec.start();
    assert.equal(engine.started, 1);

    // Chrome ends a continuous session of its own accord after silence. The
    // member is still mid-passage, so it is started again.
    engine.onend();
    assert.equal(engine.started, 2, "an unasked-for end is restarted");

    rec.stop();
    assert.equal(engine.aborted, true, "but stopping lets the microphone go");
  });
});

test("silence is not a failure, and a real failure stops the session", () => {
  withSpeech(() => {
    const { rec, heard, engine } = wired();
    rec.start();

    engine.onerror({ error: "no-speech" });
    assert.deepEqual(heard.errors, [], "a member thinking about the next line has not failed");

    engine.onerror({ error: "not-allowed" });
    assert.deepEqual(heard.errors, ["not-allowed"]);
    engine.onend();
    assert.equal(engine.started, 1, "and a refused microphone is not asked again in a loop");
  });
});

test("an unrecognised failure still resolves to a sentence the card can say", () => {
  withSpeech(() => {
    const { rec, heard, engine } = wired();
    rec.start();
    engine.onerror({ error: "something-new-from-a-future-chrome" });
    assert.deepEqual(heard.errors, ["failed"]);
  });
});

test("stopping detaches the events, so nothing arriving late can reach the card", () => {
  withSpeech(() => {
    const { rec, engine } = wired();
    rec.start();
    rec.stop();
    assert.equal(engine.onresult, null);
    assert.equal(engine.onend, null);
  });
});

test("every failure the card can be handed is one it knows a sentence for", async () => {
  const { copy } = await import("../src/copy.js");
  for (const key of ERRORS) assert.ok(copy.review.voiceErrors[key], `no sentence for "${key}"`);
});
