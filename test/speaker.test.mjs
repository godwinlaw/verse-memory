/* The speech-synthesis seam, against a stand-in for the browser.
 *
 * Two halves, split the way the module is. `pickVoice` and `chunkForSpeech` are
 * pure rules over plain values and are asserted directly — which is the point
 * of having lifted them out, since the interesting decision (which of 47 voices
 * a member hears) has nothing to do with a browser being present. The speaker
 * itself needs a window, and gets a fake one: a synthesiser that records what
 * it was asked to say without saying it, and timers that are recorded rather
 * than run, because the watchdog's own floor is eleven seconds and no test
 * should wait for it.
 *
 * The test this file exists for is "a cancelled line never calls back". That
 * was a live bug: cancelling fires `onerror` rather than `onend`, and Speak
 * mode's `onDone` is the callback that reopens the microphone and moves the
 * queue on, so a Stop used to advance the session it had just stopped. */

import test from "node:test";
import assert from "node:assert/strict";

import {
  chunkForSpeech,
  createSpeaker,
  pickVoice,
  speechMs,
  speechSupported,
  warmVoices,
  CHUNK_PAUSE_MS,
  MAX_CHUNK_CHARS,
  NOVELTY_VOICES,
  LOW_QUALITY_VOICES,
  PREFERRED_VOICES,
  RATE,
} from "../src/speaker.js";

/* ----------------------------------------------------------- the fake world */

const voice = (name, lang, extra = {}) => ({
  name,
  lang,
  localService: true,
  voiceURI: name,
  default: false,
  ...extra,
});

/* The 47 English voices this Mac really exposes, verbatim from
 * docs/research/tts.md §1.1 — the list is the fixture, so the ranking is being
 * asserted against the machine it has to run on rather than against a tidy
 * imaginary browser. macOS suffixes the locale onto a name it ships twice. */
const both = (name) => [
  voice(`${name} (English (United States))`, "en-US"),
  voice(`${name} (English (United Kingdom))`, "en-GB"),
];

const MAC_VOICES = [
  voice("Samantha", "en-US", { default: true }),
  voice("Aaron", "en-US"),
  voice("Albert", "en-US"),
  voice("Arthur", "en-GB"),
  voice("Bad News", "en-US"),
  voice("Bahh", "en-US"),
  voice("Bells", "en-US"),
  voice("Boing", "en-US"),
  voice("Bubbles", "en-US"),
  voice("Catherine", "en-AU"),
  voice("Cellos", "en-US"),
  voice("Daniel (English (United Kingdom))", "en-GB"),
  ...both("Eddy"),
  ...both("Flo"),
  voice("Fred", "en-US"),
  voice("Good News", "en-US"),
  voice("Gordon", "en-AU"),
  ...both("Grandma"),
  ...both("Grandpa"),
  voice("Jester", "en-US"),
  voice("Junior", "en-US"),
  voice("Karen", "en-AU"),
  voice("Kathy", "en-US"),
  voice("Martha", "en-GB"),
  voice("Moira", "en-IE"),
  voice("Nicky", "en-US"),
  voice("Organ", "en-US"),
  voice("Ralph", "en-US"),
  ...both("Reed"),
  voice("Rishi", "en-IN"),
  ...both("Rocko"),
  ...both("Sandy"),
  ...both("Shelley"),
  voice("Superstar", "en-US"),
  voice("Tessa", "en-ZA"),
  voice("Trinoids", "en-US"),
  voice("Whisper", "en-US"),
  voice("Wobble", "en-US"),
  voice("Zarvox", "en-US"),
];

const without = (names) => MAC_VOICES.filter((v) => !names.some((n) => v.name.startsWith(n)));

/* A window with a synthesiser that writes down what it was told to say, and
 * timers that are written down rather than run. Nothing here waits: a test
 * fires the browser's events and the app's timers by hand, in whatever order it
 * wants to prove something about. */
function fakeWindow({ voices = [] } = {}) {
  let voiceList = voices;
  let nextId = 1;
  const timers = [];
  const spoken = [];
  const win = {
    setTimeout(fn, ms) {
      timers.push({ id: nextId, fn, ms, kind: "timeout", live: true });
      return nextId++;
    },
    setInterval(fn, ms) {
      timers.push({ id: nextId, fn, ms, kind: "interval", live: true });
      return nextId++;
    },
    clearTimeout(id) {
      const t = timers.find((x) => x.id === id);
      if (t) t.live = false;
    },
    clearInterval(id) {
      win.clearTimeout(id);
    },
    speechSynthesis: {
      cancelled: 0,
      onvoiceschanged: null,
      getVoices: () => voiceList,
      speak(u) {
        spoken.push(u);
      },
      cancel() {
        win.speechSynthesis.cancelled += 1;
      },
    },
    SpeechSynthesisUtterance: class {
      constructor(text) {
        this.text = text;
      }
    },
  };
  return {
    win,
    spoken,
    timers,
    /* Hand the browser its voices some time after the app asked for them. */
    setVoices(list) {
      voiceList = list;
    },
    /* Timers still armed, newest last, optionally only those set for `ms`. */
    live: (ms) => timers.filter((t) => t.live && (ms === undefined || t.ms === ms)),
    /* Run one armed timer, as the browser's clock would. */
    fire(t) {
      t.live = false;
      t.fn();
    },
  };
}

/* Install a window for the length of one test, as recognizer.test.mjs does. */
function withWindow(win, run) {
  const had = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: win });
  try {
    return run();
  } finally {
    if (had) Object.defineProperty(globalThis, "window", had);
    else delete globalThis.window;
  }
}

/* A speaker, its fake world, and a count of how often the caller was told the
 * line was finished — which is the number every cancel test is really about. */
function speaking(opts = {}) {
  const world = fakeWindow(opts);
  const done = { count: 0 };
  const speaker = withWindow(world.win, () => createSpeaker());
  return { ...world, speaker, done, onDone: () => (done.count += 1) };
}

/* ------------------------------------------------------------- pickVoice */

test("on this Mac, the curated ranking lands on Samantha", () => {
  const picked = pickVoice(MAC_VOICES, { lang: "en-US" });
  assert.equal(picked.name, "Samantha");
  // The array's own object, never a copy — Chrome ignores an utterance whose
  // voice is not one of the objects it handed out.
  assert.equal(picked, MAC_VOICES[0]);
});

test("Alex, when a member has installed it, outranks everything Apple preinstalls", () => {
  const alex = voice("Alex", "en-US");
  assert.equal(pickVoice([...MAC_VOICES, alex], { lang: "en-US" }).name, "Alex");
});

test("with the ranked voices gone, the compact Siri voices still beat the unranked ones", () => {
  const left = without(["Samantha", "Nicky", "Daniel"]);
  assert.equal(pickVoice(left, { lang: "en-US" }).name, "Aaron");
});

test("and with those gone too, it falls through to the first English voice left", () => {
  const left = without(["Samantha", "Nicky", "Daniel", "Aaron", "Martha", "Arthur"]);
  // Nothing here is named in the preference list and nothing is en-US, so the
  // only thing left to go on is the order the browser listed them in.
  assert.equal(pickVoice(left, { lang: "en-US" }).name, "Catherine");
});

test("nothing to choose from is null, not a guess", () => {
  assert.equal(pickVoice([], { lang: "en-US" }), null);
  assert.equal(pickVoice(undefined, { lang: "en-US" }), null);
  assert.equal(pickVoice(null), null);
  assert.equal(pickVoice([{}, { name: 5 }]), null);
});

test("a browser offering nothing but novelty voices is left to its own default", () => {
  const joke = NOVELTY_VOICES.map((n) => voice(n, "en-US"));
  assert.equal(pickVoice(joke, { lang: "en-US" }), null);
});

test("every excluded name is refused even as the only voice on the machine", () => {
  for (const name of [...NOVELTY_VOICES, ...LOW_QUALITY_VOICES]) {
    // Including with the locale macOS hangs off the end of it, and including
    // when the platform itself calls it the default.
    const suffixed = `${name} (English (United States))`;
    assert.equal(pickVoice([voice(name, "en-US", { default: true })]), null, name);
    assert.equal(pickVoice([voice(suffixed, "en-US")]), null, suffixed);
  }
});

test("a locale is a locale however the platform spells it", () => {
  // Chrome on Android hands back en_US, with an underscore.
  const android = [voice("Zarvox", "en_US"), voice("Samantha", "en_US")];
  assert.equal(pickVoice(android, { lang: "en-US" }).name, "Samantha");
  assert.equal(pickVoice(android, { lang: "en_US" }).name, "Samantha");
});

test("a local voice is preferred to a network one for long-form reading", () => {
  // Google's desktop voices sound better and cut out after ~200 characters with
  // no network at all, which is a run in a canyon. Samantha always works.
  const list = [voice("Google US English", "en-US", { localService: false }), voice("Samantha", "en-US")];
  assert.equal(pickVoice(list, { lang: "en-US" }).name, "Samantha");
});

test("but a network voice still beats a compact one", () => {
  const list = [voice("Aaron", "en-US"), voice("Google US English", "en-US", { localService: false })];
  assert.equal(pickVoice(list, { lang: "en-US" }).name, "Google US English");
});

test("among equals, the asked-for region wins before the platform's own default", () => {
  const list = [
    voice("Karen", "en-AU", { default: true }),
    voice("Gordon", "en-AU"),
    voice("Rishi", "en-US"), // same rank, right region
  ];
  assert.equal(pickVoice(list, { lang: "en-US" }).name, "Rishi");
  // Ask for Australian English and the same list answers differently.
  assert.equal(pickVoice(list, { lang: "en-AU" }).name, "Karen");
});

test("a language nobody speaks here is nobody, rather than the nearest English", () => {
  assert.equal(pickVoice(MAC_VOICES, { lang: "de-DE" }), null);
});

test("the preference list and the exclusion lists do not contradict each other", () => {
  const excluded = new Set([...NOVELTY_VOICES, ...LOW_QUALITY_VOICES]);
  for (const name of PREFERRED_VOICES) {
    assert.ok(!excluded.has(name), `${name} is both preferred and excluded`);
  }
});

/* --------------------------------------------------------------- chunking */

test("a short line is spoken in one piece, and nothing at all is nothing to say", () => {
  assert.deepEqual(chunkForSpeech("Psalm 23:1"), ["Psalm 23:1"]);
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
  for (const c of chunks) assert.ok(c.length <= MAX_CHUNK_CHARS, `chunk within the ceiling: ${c.length}`);
  assert.equal(chunks.join(" ").replace(/\s+/g, " ").trim(), long.replace(/\s+/g, " ").trim());
});

test("the watchdog's estimate grows with the words and has a floor", () => {
  assert.equal(speechMs(""), 2500);
  assert.ok(speechMs(Array(60).fill("word").join(" ")) > speechMs("Psalm 23"));
});

/* ---------------------------------------------------------- the seam itself */

test("a browser with no synthesis offers none, rather than guessing", () => {
  assert.equal(speechSupported(), false);
  assert.equal(createSpeaker(), null);
});

test("an ordinary line is said once and reports itself finished once", () => {
  const s = speaking({ voices: MAC_VOICES });
  withWindow(s.win, () => s.speaker.speak("Psalm twenty three, verse one.", s.onDone));
  assert.equal(s.spoken.length, 1);
  s.spoken[0].onend();
  assert.equal(s.done.count, 1);
  // A browser that reports both does not get to call the loop on twice.
  s.spoken[0].onerror({ error: "interrupted" });
  assert.equal(s.done.count, 1);
});

test("every utterance carries the tuned rate, an untouched pitch, and a language", () => {
  const s = speaking({ voices: MAC_VOICES });
  withWindow(s.win, () => s.speaker.speak("For God so loved the world.", s.onDone));
  const u = s.spoken[0];
  assert.equal(u.rate, RATE);
  assert.equal(u.rate, 0.9);
  assert.equal(u.pitch, 1);
  assert.equal(u.volume, 1);
  assert.equal(u.lang, "en-US");
  assert.equal(u.voice.name, "Samantha");
});

test("an option can override the rate without disturbing the two-argument call", () => {
  const s = speaking({ voices: MAC_VOICES });
  withWindow(s.win, () => s.speaker.speak("Slower, please.", s.onDone, { rate: 0.8 }));
  assert.equal(s.spoken[0].rate, 0.8);
  withWindow(s.win, () => s.speaker.speak("At the usual pace.", s.onDone));
  assert.equal(s.spoken[1].rate, RATE);
});

test("a browser with no voices yet still speaks — it just speaks in its own", () => {
  const s = speaking({ voices: [] });
  withWindow(s.win, () => s.speaker.speak("Psalm 23", s.onDone));
  assert.equal(s.spoken.length, 1);
  assert.equal(s.spoken[0].voice, undefined, "no voice set is the platform's default");
  assert.equal(s.spoken[0].lang, "en-US", "but the language is always said out loud");
  s.spoken[0].onend();
  assert.equal(s.done.count, 1);
});

test("nothing to say is not a caller left waiting", () => {
  const s = speaking({ voices: MAC_VOICES });
  withWindow(s.win, () => s.speaker.speak("   ", s.onDone));
  assert.equal(s.spoken.length, 0);
  assert.equal(s.done.count, 1);
});

test("a long line is said in pieces, in order, with a real pause between them", () => {
  const s = speaking({ voices: MAC_VOICES });
  const long = "In the beginning God created the heavens and the earth. ".repeat(8);
  const chunks = chunkForSpeech(long);
  assert.ok(chunks.length > 1);

  withWindow(s.win, () => s.speaker.speak(long, s.onDone));
  assert.equal(s.spoken.length, 1, "one piece at a time, not all queued at once");
  assert.equal(s.spoken[0].text, chunks[0]);

  s.spoken[0].onend();
  assert.equal(s.spoken.length, 1, "the next piece waits for the pause");
  const gap = s.live(CHUNK_PAUSE_MS);
  assert.equal(gap.length, 1, "and the pause is a real timer, because the browser leaves none");
  s.fire(gap[0]);
  assert.equal(s.spoken[1].text, chunks[1]);

  // Round the rest of them, and the caller is told once at the very end.
  for (let i = 1; i < chunks.length; i++) {
    s.spoken[i].onend();
    assert.equal(s.done.count, i + 1 === chunks.length ? 1 : 0);
    const pause = s.live(CHUNK_PAUSE_MS);
    if (pause.length) s.fire(pause[0]);
  }
  assert.equal(s.spoken.length, chunks.length);
  assert.equal(s.done.count, 1);
});

test("a browser that goes quiet without saying so still moves the loop along", () => {
  const s = speaking({ voices: MAC_VOICES });
  withWindow(s.win, () => s.speaker.speak("Psalm twenty three.", s.onDone));
  const watchdog = s.live().find((t) => t.ms > 5000);
  assert.ok(watchdog, "every piece is given a ceiling");
  s.fire(watchdog);
  assert.equal(s.done.count, 1);
  // And the line arriving late afterwards cannot report it a second time.
  s.spoken[0].onend();
  assert.equal(s.done.count, 1);
});

/* The bug this rewrite exists for, both ways it could reach the caller. */

test("a cancelled line never calls back, though the browser reports it as an error", () => {
  const s = speaking({ voices: MAC_VOICES });
  withWindow(s.win, () => s.speaker.speak("For God so loved the world.", s.onDone));
  s.speaker.cancel();
  assert.equal(s.win.speechSynthesis.cancelled, 1);
  // This is what Chromium actually does on cancel(): onerror, not onend.
  s.spoken[0].onerror({ error: "interrupted" });
  assert.equal(s.done.count, 0, "a cancel must not reopen the microphone");
  s.spoken[0].onend();
  assert.equal(s.done.count, 0);
});

test("a cancelled line's watchdog is inert too, not merely early", () => {
  const s = speaking({ voices: MAC_VOICES });
  withWindow(s.win, () => s.speaker.speak("For God so loved the world.", s.onDone));
  const watchdog = s.live().find((t) => t.ms > 5000);
  s.speaker.cancel();
  assert.equal(watchdog.live, false, "and it is disarmed rather than left ticking");
  watchdog.fn(); // fire it anyway, as a browser mid-callback would
  assert.equal(s.done.count, 0);
});

test("a cancel in the middle of a long passage stops the pieces still to come", () => {
  const s = speaking({ voices: MAC_VOICES });
  const long = "In the beginning God created the heavens and the earth. ".repeat(8);
  withWindow(s.win, () => s.speaker.speak(long, s.onDone));
  s.spoken[0].onend();
  const gap = s.live(CHUNK_PAUSE_MS)[0];

  s.speaker.cancel();
  assert.equal(gap.live, false);
  gap.fn(); // the pause firing late must not start the next piece
  assert.equal(s.spoken.length, 1, "nothing further is said");
  assert.equal(s.done.count, 0, "and nobody is told the passage finished");
});

test("a fresh line supersedes the one before it rather than double-reporting", () => {
  const s = speaking({ voices: MAC_VOICES });
  const first = { count: 0 };
  const second = { count: 0 };
  withWindow(s.win, () => s.speaker.speak("The first thing.", () => (first.count += 1)));
  withWindow(s.win, () => s.speaker.speak("The second thing.", () => (second.count += 1)));
  s.spoken[0].onerror({ error: "interrupted" });
  assert.equal(first.count, 0, "the abandoned line does not call the loop on");
  s.spoken[1].onend();
  assert.equal(second.count, 1);
});

test("speaking again after a cancel works, which is what every turn does", () => {
  // App.js tears down and cancels on the way into every spoken turn, so
  // cancel-then-speak is the ordinary path and not an edge case.
  const s = speaking({ voices: MAC_VOICES });
  s.speaker.cancel();
  withWindow(s.win, () => s.speaker.speak("Psalm twenty three.", s.onDone));
  assert.equal(s.spoken.length, 1);
  s.spoken[0].onend();
  assert.equal(s.done.count, 1);
});

/* ------------------------------------------------------------- the race */

test("voices already on the machine are used straight away, with nothing left ticking", () => {
  const world = fakeWindow({ voices: MAC_VOICES });
  warmVoices(world.win);
  assert.equal(world.live().length, 0, "no poll is armed when there was nothing to wait for");
  const speaker = withWindow(world.win, () => createSpeaker());
  withWindow(world.win, () => speaker.speak("Psalm 23", () => {}));
  assert.equal(world.spoken[0].voice.name, "Samantha");
});

test("voices arriving late are polled for, and picked up when they land", () => {
  const world = fakeWindow({ voices: [] });
  warmVoices(world.win);
  const poll = world.live().find((t) => t.kind === "interval");
  assert.ok(poll, "an empty list is polled rather than waited on");

  world.setVoices(MAC_VOICES);
  world.fire(poll);
  assert.equal(world.live().length, 0, "and the poll and its deadline are put away");

  const speaker = withWindow(world.win, () => createSpeaker());
  withWindow(world.win, () => speaker.speak("Psalm 23", () => {}));
  assert.equal(world.spoken[0].voice.name, "Samantha");
});

test("the event is an accelerator, not a gate — and it stays attached after", () => {
  const world = fakeWindow({ voices: [] });
  warmVoices(world.win);
  assert.equal(typeof world.win.speechSynthesis.onvoiceschanged, "function");

  world.setVoices([voice("Samantha", "en-US", { default: true })]);
  world.win.speechSynthesis.onvoiceschanged();
  const speaker = withWindow(world.win, () => createSpeaker());
  withWindow(world.win, () => speaker.speak("Psalm 23", () => {}));
  assert.equal(world.spoken[0].voice.name, "Samantha");

  // Chrome adds its network voices late and Android adds engine voices when a
  // language pack lands, so a settled list can still get better.
  world.setVoices([voice("Samantha", "en-US", { default: true }), voice("Alex", "en-US")]);
  world.win.speechSynthesis.onvoiceschanged();
  withWindow(world.win, () => speaker.speak("Psalm 24", () => {}));
  assert.equal(world.spoken[1].voice.name, "Alex");
});

test("voices that never arrive are a default voice, never a session that hangs", () => {
  const world = fakeWindow({ voices: [] });
  warmVoices(world.win);
  const deadline = world.live().find((t) => t.kind === "timeout");
  assert.ok(deadline && deadline.ms <= 2000, "the wait is bounded");
  world.fire(deadline);
  assert.equal(world.live().length, 0, "and giving up stops the polling too");

  const speaker = withWindow(world.win, () => createSpeaker());
  const done = { count: 0 };
  withWindow(world.win, () => speaker.speak("Psalm 23", () => (done.count += 1)));
  assert.equal(world.spoken.length, 1, "the line is still spoken");
  world.spoken[0].onend();
  assert.equal(done.count, 1);
});

test("a browser whose getVoices throws is a browser with no voices, not a crash", () => {
  const world = fakeWindow({ voices: [] });
  world.win.speechSynthesis.getVoices = () => {
    throw new Error("mid-teardown");
  };
  assert.doesNotThrow(() => warmVoices(world.win));
  const speaker = withWindow(world.win, () => createSpeaker());
  assert.doesNotThrow(() => withWindow(world.win, () => speaker.speak("Psalm 23", () => {})));
  assert.equal(world.spoken.length, 1);
});
