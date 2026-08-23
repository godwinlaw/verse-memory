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
    // `neverOpens` is an engine that accepts start() and then ends without ever
    // reporting itself listening — which is exactly what Chrome's restart
    // limiter looks like from the outside, and the only case the backoff has to
    // survive. An engine that really opens resets the backoff, as it should.
    if (this.onstart && !this.neverOpens) this.onstart();
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

/* A clock the test winds by hand, so a four-second wait costs no seconds. */
function fakeClock() {
  let now = 0;
  let seq = 0;
  const jobs = new Map();
  return {
    schedule: (fn, ms) => {
      const id = ++seq;
      jobs.set(id, { at: now + ms, fn });
      return id;
    },
    unschedule: (id) => jobs.delete(id),
    /* Run everything due within `ms`, in the order it came due. */
    tick(ms) {
      now += ms;
      for (const [id, job] of [...jobs].sort((a, b) => a[1].at - b[1].at)) {
        if (job.at <= now) {
          jobs.delete(id);
          job.fn();
        }
      }
    },
  };
}

/* A recognizer plus a log of everything it reported. */
function wired(clock) {
  const heard = { text: [], statuses: [], errors: [], endpoints: 0 };
  const rec = createRecognizer(
    {
      onText: (t, settled) => heard.text.push([t, settled]),
      onStatus: (s) => heard.statuses.push(s),
      onError: (e) => heard.errors.push(e),
      onEndpoint: () => heard.endpoints++,
    },
    clock ? { schedule: clock.schedule, unschedule: clock.unschedule } : undefined,
  );
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
    const clock = fakeClock();
    const { rec, engine } = wired(clock);
    rec.start();
    assert.equal(engine.started, 1);

    /* Chrome ends a continuous session of its own accord after silence. The
     * member is still mid-passage, so it is started again — but never in the
     * same breath. Restarting inside `onend` is the pattern Chrome's
     * rate-limiter watches for, and a session that trips it thereafter ends the
     * instant it opens, which reads as a microphone that has died. */
    engine.onend();
    assert.equal(engine.started, 1, "not restarted synchronously — that is what trips the limiter");

    clock.tick(300);
    assert.equal(engine.started, 2, "an unasked-for end is restarted, after a beat");

    rec.stop();
    assert.equal(engine.aborted, true, "but stopping lets the microphone go");
  });
});

test("the waits grow, so a rate-limited engine is not hammered", () => {
  withSpeech(() => {
    const clock = fakeClock();
    const { rec, engine } = wired(clock);
    rec.start();
    engine.neverOpens = true;

    engine.onend();
    clock.tick(240); // just short of the first wait
    assert.equal(engine.started, 1, "the first retry waits");
    clock.tick(20);
    assert.equal(engine.started, 2);

    // The engine never reported starting, so the next wait is longer than the
    // last: onstart is what resets the backoff.
    engine.onend();
    clock.tick(300);
    assert.equal(engine.started, 2, "the second retry waits longer than the first");
    clock.tick(300);
    assert.equal(engine.started, 3);
  });
});

test("a microphone that will not stay open gives up rather than spinning", () => {
  withSpeech(() => {
    const clock = fakeClock();
    const { rec, heard, engine } = wired(clock);
    rec.start();
    engine.neverOpens = true;
    // An engine that ends every time it is started, which is what tripping the
    // limiter looks like from in here.
    for (let i = 0; i < 20; i++) {
      engine.onend();
      clock.tick(5000);
    }
    assert.ok(heard.errors.length > 0, "the member is told, rather than left with a dead microphone");
    const gaveUpAt = engine.started;
    clock.tick(60000);
    assert.equal(engine.started, gaveUpAt, "and it stops trying");
  });
});

test("the engine's own endpoint is passed on", () => {
  withSpeech(() => {
    const { rec, heard, engine } = wired();
    rec.start();
    engine.onspeechend();
    assert.equal(heard.endpoints, 1);
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
