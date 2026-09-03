/* The browser's own speech recognition, wrapped.
 *
 * Written like firebase.js: an optional overlay the app runs happily without.
 * `voiceSupported()` coming back false just means the recall activity is a box
 * you type in, which is what it has always been, Firefox has no
 * SpeechRecognition, and nothing about that is worth working around here.
 *
 * A recognizer is `{ start, stop }`, driven through three callbacks:
 *
 *   onStatus(status)   "off" | "starting" | "listening"
 *   onText(text, settled)  a phrase, and whether the browser will still revise
 *                          it (see voice.js, an unsettled phrase replaces the
 *                          last version rather than being appended)
 *   onError(code)      a key from ERRORS
 *
 * It is never started by anything but the member: a microphone that switches
 * itself on is a bug, not a feature. */

/* Failures worth a sentence, keyed so copy.js owns the wording. Anything else
 * the browser reports becomes "failed". */
export const ERRORS = ["not-allowed", "no-microphone", "network", "failed"];

const ctor = () =>
  typeof window === "undefined" ? null : window.SpeechRecognition || window.webkitSpeechRecognition || null;

/* Asked once at startup, so no view-model ever has to question the window. */
export const voiceSupported = () => !!ctor();

/* SpeechRecognition's error codes, reduced to the ones worth saying. */
function errorFor(code) {
  if (code === "not-allowed" || code === "service-not-allowed") return "not-allowed";
  if (code === "audio-capture") return "no-microphone";
  if (code === "network") return "network";
  return "failed";
}

/* Continuous dictation. Chrome ends a session of its own accord after a pause,
 * which would stop the member mid-passage; `wanted` is what separates "the
 * engine stopped" from "the member stopped", so an unasked-for end is simply
 * started again. */
export function createRecognizer(handlers) {
  const Ctor = ctor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = "en-US";
  let wanted = false;

  rec.onstart = () => handlers.onStatus("listening");
  rec.onresult = (event) => {
    let pending = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) handlers.onText(result[0].transcript, true);
      else pending += result[0].transcript;
    }
    handlers.onText(pending, false);
  };
  rec.onerror = (event) => {
    // Silence is not a failure, it is a member thinking about the next line.
    if (event.error === "no-speech" || event.error === "aborted") return;
    wanted = false;
    handlers.onError(errorFor(event.error));
  };
  rec.onend = () => {
    if (!wanted) return handlers.onStatus("off");
    try {
      rec.start();
    } catch {
      /* already restarting, the next onend will try again */
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
    /* Always a full teardown: a recognizer is cheap to rebuild, and a
     * half-stopped one still holding the microphone open is not worth being
     * able to reach. */
    stop() {
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
