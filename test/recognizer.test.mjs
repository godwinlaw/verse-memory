/* The engine seam's pure half. Recognition itself needs a browser, a microphone
 * and a CDN, so what is asserted here is the part that decides which engine a
 * member gets — and the part that has to hold when the answer is "none". */

import test from "node:test";
import assert from "node:assert/strict";

import {
  availableEngines,
  createRecognizer,
  DEFAULT_ENGINE,
  ENGINES,
  ERRORS,
  resolveEngine,
  STATUSES,
  WEB_SPEECH,
  WHISPER,
} from "../src/recognizer.js";

test("a browser with no recognition offers nothing, rather than guessing", () => {
  // Node has no window, which is the same answer Firefox gives for the browser
  // engine: the app has to degrade to a box you type in.
  assert.deepEqual(availableEngines(), []);
  assert.equal(resolveEngine(WEB_SPEECH, []), null);
  assert.equal(createRecognizer(WEB_SPEECH, {}), null);
  assert.equal(createRecognizer(WHISPER, {}), null);
});

test("a preference nothing can honour falls back to what the browser has", () => {
  assert.equal(resolveEngine(WHISPER, [WEB_SPEECH]), WEB_SPEECH);
  assert.equal(resolveEngine("some-engine-from-an-older-build", [WHISPER]), WHISPER);
  assert.equal(resolveEngine(WHISPER, [WEB_SPEECH, WHISPER]), WHISPER, "and an honourable one is kept");
});

test("an unknown engine key never builds a recognizer", () => {
  assert.equal(createRecognizer("gramophone", {}), null);
  assert.equal(createRecognizer(null, {}), null);
});

test("the offered engines are the ones the app knows how to build", () => {
  assert.deepEqual(
    ENGINES.map((e) => e.key),
    [WEB_SPEECH, WHISPER],
  );
  assert.ok(ENGINES.every((e) => e.name && e.note));
  assert.ok(
    ENGINES.some((e) => e.key === DEFAULT_ENGINE),
    "the default has to be one of them",
  );
});

test("every status and error the card can be handed is one it knows a sentence for", async () => {
  const { copy } = await import("../src/copy.js");
  for (const key of ERRORS) assert.ok(copy.review.voiceErrors[key], `no sentence for "${key}"`);
  assert.deepEqual(STATUSES, ["off", "starting", "loading", "listening", "working"]);
});

/* ── the browser engine, against a stand-in for SpeechRecognition ──────────── */

/* Everything webSpeechRecognizer does is wiring: it splits interim results from
 * settled ones, and it keeps the session alive across the pauses Chrome ends it
 * on. Both are worth pinning, and neither needs a microphone — a stub with the
 * same four events is enough. */
class FakeSpeechRecognition {
  constructor() {
    this.started = 0;
    FakeSpeechRecognition.last = this;
  }
  start() {
    this.started++;
    if (this.onstart) this.onstart();
  }
  stop() {
    if (this.onend) this.onend();
  }
  abort() {
    this.aborted = true;
  }
  /* One onresult event, from a list of [transcript, isFinal] pairs. */
  deliver(pairs) {
    const results = pairs.map(([transcript, isFinal]) => ({ 0: { transcript }, isFinal }));
    results.length = pairs.length;
    this.onresult({ resultIndex: 0, results });
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
  const heard = { partials: [], finals: [], statuses: [], errors: [] };
  const rec = createRecognizer(WEB_SPEECH, {
    onPartial: (t) => heard.partials.push(t),
    onFinal: (t) => heard.finals.push(t),
    onStatus: (s) => heard.statuses.push(s),
    onError: (e) => heard.errors.push(e),
  });
  return { rec, heard, engine: FakeSpeechRecognition.last };
}

test("a browser with recognition offers it, and builds one", () => {
  withSpeech(() => {
    assert.deepEqual(availableEngines(), [WEB_SPEECH], "no microphone API here, so no on-device engine");
    assert.ok(createRecognizer(WEB_SPEECH, {}));
  });
});

test("settled phrases are handed over; half-heard ones stay a partial", () => {
  withSpeech(() => {
    const { rec, heard, engine } = wired();
    rec.start();
    engine.deliver([
      ["Hear O Israel ", true],
      ["the LORD our", false],
    ]);
    assert.deepEqual(heard.finals, ["Hear O Israel "]);
    assert.deepEqual(heard.partials, ["the LORD our"]);
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
    engine.onend();
    assert.equal(engine.started, 2, "but once they stop, it stays stopped");
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
    assert.ok(ERRORS.includes("failed"));
  });
});

test("disposing lets the microphone go and stops reporting", () => {
  withSpeech(() => {
    const { rec, engine } = wired();
    rec.start();
    rec.dispose();
    assert.equal(engine.aborted, true);
    assert.equal(engine.onresult, null, "nothing arriving late can reach the card");
  });
});

test("the on-device engine's module still loads, since nothing else imports it", async () => {
  // whisper.js is reached only through a dynamic import at runtime, so a typo
  // in it would otherwise surface on a member's machine rather than here.
  const { createWhisper } = await import("../src/whisper.js");
  assert.equal(typeof createWhisper, "function");
});
