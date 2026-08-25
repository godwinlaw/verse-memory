/* The record-then-transcribe seam's pure half.
 *
 * Everything in transcriber.js that needs a microphone is deliberately kept out
 * of these three functions, which is what lets them be asserted in node with no
 * browser anywhere in sight — the same split speaker.js makes around
 * `pickVoice`. What is worth pinning here is what the file decides rather than
 * what it wires: which container to record in, what a response body meant, and
 * when a recording should not be sent at all. */

import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_RECORD_MS,
  MAX_UPLOAD_BYTES,
  MIME_PREFERENCE,
  RECORD_GRACE_MS,
  pickMimeType,
  recordingRejection,
  recordingSupported,
  transcriptFrom,
} from "../src/transcriber.js";

/* ------------------------------------------------------------ mime types */

test("pickMimeType prefers Opus in WebM above everything else", () => {
  assert.equal(pickMimeType(["audio/mp4", "audio/webm", "audio/webm;codecs=opus"]), "audio/webm;codecs=opus");
});

test("pickMimeType walks the preference order, not the browser's order", () => {
  // Ogg/Opus beats bare WebM even when the browser listed WebM first: the codec
  // is the thing being chosen, and Opus is the reason a recitation fits in tens
  // of kilobytes.
  assert.equal(pickMimeType(["audio/webm", "audio/ogg;codecs=opus"]), "audio/ogg;codecs=opus");
  assert.equal(pickMimeType(["audio/mp4", "audio/webm"]), "audio/webm");
  // Safari: no Opus at all, and mp4 is the whole of what it offers.
  assert.equal(pickMimeType(["audio/mp4"]), "audio/mp4");
});

test("pickMimeType reads a browser's spacing and case as the same type", () => {
  assert.equal(pickMimeType(["AUDIO/WEBM; CODECS=OPUS"]), "audio/webm;codecs=opus");
});

test("pickMimeType says nothing when the browser supports nothing", () => {
  // The case that decides whether the feature is offered at all: no container
  // both ends understand means recordingSupported() is false and Speak mode
  // listens the way it always has.
  assert.equal(pickMimeType([]), "");
  assert.equal(pickMimeType(["audio/wav", "video/mp4"]), "");
  assert.equal(pickMimeType(undefined), "");
  assert.equal(pickMimeType(null), "");
});

test("every preferred type is one a caller could be handed back", () => {
  // Guards against a typo in the constant: what pickMimeType returns has to be
  // a string MediaRecorder was asked about, so each entry must pick itself.
  MIME_PREFERENCE.forEach((t) => assert.equal(pickMimeType([t]), t));
});

/* -------------------------------------------------------- response bodies */

test("transcriptFrom reads the normalized body the Worker returns", () => {
  assert.equal(transcriptFrom({ text: "The LORD is my shepherd" }), "The LORD is my shepherd");
});

test("transcriptFrom trims what the engine padded", () => {
  // Whisper habitually returns a leading space.
  assert.equal(transcriptFrom({ text: "  I shall not want  " }), "I shall not want");
});

test("transcriptFrom accepts Workers AI's own envelope", () => {
  assert.equal(transcriptFrom({ result: { text: "he makes me lie down" } }), "he makes me lie down");
});

test("transcriptFrom answers a malformed body with nothing rather than a throw", () => {
  // Every one of these is a real way this fails in the field — an endpoint that
  // 404s to an HTML page, a proxy login screen, a provider error object, a
  // response that parsed to a bare string. None of them may throw: the caller
  // is a hands-free loop, and an empty recital is something it already answers
  // (the verse is read out together) while an exception is not.
  assert.equal(transcriptFrom(null), "");
  assert.equal(transcriptFrom(undefined), "");
  assert.equal(transcriptFrom("The LORD is my shepherd"), "");
  assert.equal(transcriptFrom(42), "");
  assert.equal(transcriptFrom([]), "");
  assert.equal(transcriptFrom({}), "");
  assert.equal(transcriptFrom({ error: "upstream" }), "");
  assert.equal(transcriptFrom({ text: null }), "");
  assert.equal(transcriptFrom({ text: { toString: () => "nope" } }), "");
  assert.equal(transcriptFrom({ result: {} }), "");
  assert.equal(transcriptFrom({ result: null }), "");
});

/* ------------------------------------------------------------- the guards */

test("recordingRejection passes an ordinary recitation", () => {
  // Forty seconds of Opus at the configured bitrate — the shape of nearly every
  // real turn.
  assert.equal(recordingRejection({ bytes: 80000, ms: 40000 }), null);
});

test("recordingRejection calls an empty recording empty", () => {
  // Not a fault: a member who never said anything. It is the commonest of these
  // by far, and it is what a covered microphone also looks like.
  assert.equal(recordingRejection({ bytes: 0, ms: 8000 }), "empty");
  assert.equal(recordingRejection({}), "empty");
  assert.equal(recordingRejection(), "empty");
});

test("recordingRejection refuses a blob over the upload cap", () => {
  assert.equal(recordingRejection({ bytes: MAX_UPLOAD_BYTES + 1, ms: 30000 }), "too-large");
  assert.equal(recordingRejection({ bytes: MAX_UPLOAD_BYTES, ms: 30000 }), null);
});

test("recordingRejection refuses a recording past the length cap", () => {
  assert.equal(recordingRejection({ bytes: 50000, ms: MAX_RECORD_MS + RECORD_GRACE_MS + 1 }), "too-long");
});

test("recordingRejection allows the beat a recorder takes to flush", () => {
  // A recorder asked to stop at the cap finishes a moment after it. Refusing a
  // recital for being one frame over its own ceiling would throw away
  // something the member actually said.
  assert.equal(recordingRejection({ bytes: 50000, ms: MAX_RECORD_MS + 1 }), null);
  assert.equal(recordingRejection({ bytes: 50000, ms: MAX_RECORD_MS + RECORD_GRACE_MS }), null);
});

test("the size cap is checked before the duration cap", () => {
  // A recording that is both is refused for being large, because that is the
  // one of the two that costs money.
  assert.equal(recordingRejection({ bytes: MAX_UPLOAD_BYTES + 1, ms: MAX_RECORD_MS * 2 }), "too-large");
});

/* ------------------------------------------------------------- the window */

test("recordingSupported is false with no window at all", () => {
  // Asked at startup by App.js, which the unit suite instantiates in node. A
  // seam that questioned a window that is not there would take the whole suite
  // down with it — the same reason voiceSupported() and speechSupported() are
  // written the way they are.
  assert.equal(typeof globalThis.window, "undefined");
  assert.equal(recordingSupported(), false);
});

test("recordingSupported is false in a window with no recorder", () => {
  withWindow({ navigator: { mediaDevices: { getUserMedia: () => {} } } }, () =>
    assert.equal(recordingSupported(), false),
  );
});

test("recordingSupported is false in a window that cannot open a microphone", () => {
  // Firefox over plain HTTP, and any browser where mediaDevices is absent.
  withWindow({ navigator: {}, MediaRecorder: fakeRecorder(() => true) }, () =>
    assert.equal(recordingSupported(), false),
  );
});

test("recordingSupported is false when no container is recordable", () => {
  withWindow(
    { navigator: { mediaDevices: { getUserMedia: () => {} } }, MediaRecorder: fakeRecorder(() => false) },
    () => assert.equal(recordingSupported(), false),
  );
});

test("recordingSupported is true with a recorder, a microphone and a container", () => {
  withWindow(
    {
      navigator: { mediaDevices: { getUserMedia: () => {} } },
      MediaRecorder: fakeRecorder((t) => t === "audio/webm;codecs=opus"),
    },
    () => assert.equal(recordingSupported(), true),
  );
});

test("recordingSupported survives an isTypeSupported that throws", () => {
  withWindow(
    {
      navigator: { mediaDevices: { getUserMedia: () => {} } },
      MediaRecorder: fakeRecorder(() => {
        throw new Error("no");
      }),
    },
    () => assert.equal(recordingSupported(), false),
  );
});

/* A window with whatever the test needs on it, for the length of one test. */
function withWindow(value, run) {
  const had = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value });
  try {
    return run();
  } finally {
    if (had) Object.defineProperty(globalThis, "window", had);
    else delete globalThis.window;
  }
}

/* A stand-in MediaRecorder that only has to answer one question. */
function fakeRecorder(isTypeSupported) {
  const MR = function () {};
  MR.isTypeSupported = isTypeSupported;
  return MR;
}
