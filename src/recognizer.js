/* Turning a member's voice into words: the browser half.
 *
 * Everything that can be reasoned about without a microphone lives in voice.js
 * and is unit-tested there. This module is the seam below it — the part that
 * needs a real browser, real permission, and a real engine — and it is written
 * like firebase.js: an optional overlay the app runs happily without. If no
 * engine is available, availableEngines() comes back empty and the recall
 * activity is simply a box you type in, as it has always been.
 *
 * Two engines, because neither one covers everybody:
 *
 *   WEB_SPEECH  the browser's own SpeechRecognition. Nothing to download, and
 *               it streams — interim words arrive mid-phrase, so the passage
 *               appears as it is being said. Chrome, Edge and Safari have it;
 *               Firefox does not, and Chrome's implementation sends the audio
 *               to Google.
 *   WHISPER     OpenAI's Whisper, run on the device by transformers.js pulled
 *               from a CDN (see whisper.js). Works in every browser and no
 *               audio leaves the machine, but the model is a download and it
 *               transcribes a phrase at a time rather than a word at a time.
 *
 * Both are driven through the same four callbacks, so App.js has one voice
 * lifecycle rather than two:
 *
 *   onStatus(status, detail)  where the engine is (see STATUSES below); the
 *                             detail is a percentage while "loading"
 *   onPartial(text)           the phrase currently being heard, not yet settled
 *   onFinal(text)             a phrase the engine has committed to
 *   onError(code)             a key from ERRORS below
 *
 * A recognizer is `{ start, stop, dispose }`. It never starts itself: a
 * microphone that switches on without being asked is a bug, not a feature. */

export const WEB_SPEECH = "web-speech";
export const WHISPER = "whisper";

/* The engines, in the order a member is offered them. The browser's own comes
 * first: it costs nothing to start and shows words as they are spoken, which is
 * the whole point of reciting into a box. */
export const ENGINES = [
  { key: WEB_SPEECH, name: "Browser", note: "Instant, word by word. Chrome sends audio to Google." },
  { key: WHISPER, name: "On device", note: "Private, works anywhere. One-time model download." },
];

export const DEFAULT_ENGINE = WEB_SPEECH;

/* Where an engine can be. "loading" and "working" belong to Whisper alone — the
 * browser's engine has nothing to fetch and nothing to think about — but the
 * card reads them the same way either engine reports them, so the two lifecycles
 * stay one. */
export const STATUSES = ["off", "starting", "loading", "listening", "working"];

/* Failures worth saying something about, keyed so copy.js owns the sentence.
 * Anything the engine reports that is not one of these becomes "failed". */
export const ERRORS = ["not-allowed", "no-microphone", "network", "no-engine", "failed"];

const speechCtor = () =>
  typeof window === "undefined" ? null : window.SpeechRecognition || window.webkitSpeechRecognition || null;

/* Whisper needs a microphone and WebAssembly; both are the browser's, not the
 * library's, so this can be answered without touching the CDN. */
const canRunWhisper = () =>
  typeof window !== "undefined" &&
  typeof WebAssembly !== "undefined" &&
  !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

/* Which engines this browser can actually offer, in ENGINES order. Called at
 * startup so the view-model never has to ask the window anything. */
export function availableEngines() {
  const keys = [];
  if (speechCtor()) keys.push(WEB_SPEECH);
  if (canRunWhisper()) keys.push(WHISPER);
  return keys;
}

/* The engine to use given what the member last chose and what this browser has.
 * A preference for something unavailable falls back rather than failing. */
export function resolveEngine(preferred, available = availableEngines()) {
  if (!available.length) return null;
  return available.includes(preferred) ? preferred : available[0];
}

/* SpeechRecognition's error codes, reduced to the ones worth a sentence. */
function speechError(code) {
  if (code === "not-allowed" || code === "service-not-allowed") return "not-allowed";
  if (code === "audio-capture") return "no-microphone";
  if (code === "network") return "network";
  return "failed";
}

/* The browser's own recogniser, driven as continuous dictation.
 *
 * Chrome ends a session of its own accord after a pause, which would stop the
 * member mid-passage; `wanted` is what separates "the engine stopped" from "the
 * member stopped", so an unasked-for end is simply started again. */
function webSpeechRecognizer(handlers) {
  const Ctor = speechCtor();
  const rec = new Ctor();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = "en-US";
  let wanted = false;

  rec.onstart = () => handlers.onStatus("listening");
  rec.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) handlers.onFinal(result[0].transcript);
      else interim += result[0].transcript;
    }
    handlers.onPartial(interim);
  };
  rec.onerror = (event) => {
    // Silence is not a failure — it is a member thinking about the next line.
    if (event.error === "no-speech" || event.error === "aborted") return;
    wanted = false;
    handlers.onError(speechError(event.error));
  };
  rec.onend = () => {
    if (!wanted) return handlers.onStatus("off");
    try {
      rec.start();
    } catch {
      /* already restarting — the next onend will try again */
    }
  };

  return {
    start() {
      wanted = true;
      handlers.onStatus("starting");
      try {
        rec.start();
      } catch {
        /* already listening */
      }
    },
    stop() {
      wanted = false;
      handlers.onPartial("");
      try {
        rec.stop();
      } catch {
        /* never started */
      }
    },
    dispose() {
      wanted = false;
      rec.onstart = rec.onresult = rec.onerror = rec.onend = null;
      try {
        rec.abort();
      } catch {
        /* never started */
      }
    },
  };
}

/* Whisper, loaded only if it is actually chosen — the library and its model are
 * a download, and a member on the browser engine should never pay for it. */
function whisperRecognizer(handlers) {
  let engine = null;
  let disposed = false;
  const ready = import("./whisper.js")
    .then((mod) => {
      if (disposed) return null;
      engine = mod.createWhisper(handlers);
      return engine;
    })
    .catch(() => {
      handlers.onError("failed");
      return null;
    });

  return {
    start() {
      handlers.onStatus("loading");
      ready.then((e) => e && !disposed && e.start());
    },
    stop() {
      handlers.onPartial("");
      ready.then((e) => e && e.stop());
    },
    dispose() {
      disposed = true;
      ready.then((e) => e && e.dispose());
    },
  };
}

/* Build a recogniser for `engine`, or null if it cannot run here — in which
 * case the caller has nothing to fall back to and says so (see ERRORS). */
export function createRecognizer(engine, handlers) {
  try {
    if (engine === WEB_SPEECH && speechCtor()) return webSpeechRecognizer(handlers);
    if (engine === WHISPER && canRunWhisper()) return whisperRecognizer(handlers);
  } catch {
    /* fall through to the null below — the caller reports "no-engine" */
  }
  return null;
}
