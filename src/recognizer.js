/* The browser's own speech recognition, wrapped.
 *
 * Written like firebase.js: an optional overlay the app runs happily without.
 * `voiceSupported()` coming back false just means the recall activity is a box
 * you type in, which is what it has always been — Firefox has no
 * SpeechRecognition, and nothing about that is worth working around here.
 *
 * A recognizer is `{ start, stop }`, driven through four callbacks:
 *
 *   onStatus(status)   "off" | "starting" | "listening"
 *   onText(text, settled, alternatives)
 *                      a phrase, whether the browser will still revise it (see
 *                      voice.js — an unsettled phrase replaces the last version
 *                      rather than being appended), and on a settled phrase the
 *                      engine's other readings of it (see MAX_ALTERNATIVES)
 *   onEndpoint()       the engine's own judgement that the speech it was
 *                      following has ended — see below
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

/* How many readings of a phrase to ask the engine for.
 *
 * The engine ranks its hypotheses by how confident it is that the words were
 * *said*, which is not the question this app asks. It asks whether a particular
 * passage was said — and it knows the passage. So a caller with a verse in hand
 * can look past the top reading to the others and take whichever is closest to
 * the verse, which is N-best rescoring done in ten lines.
 *
 * It is worth being clear about why this is the safe kind of biasing, since the
 * alternatives (Chrome's `phrases`, Whisper's initial prompt) are not. Those
 * lean on the recogniser to hear what we expect, which in a *scoring* app is a
 * way of grading the member on the app's expectations rather than on what they
 * said. Re-ranking touches nothing: every reading offered here is one the
 * engine produced on its own, and choosing among them cannot invent a word
 * nobody spoke.
 *
 * Chrome may well hand back one reading whatever this is set to — the reports
 * disagree and no primary source settles it — so nothing depends on there being
 * more than one. A single alternative simply makes the pick a pick of one. */
export const MAX_ALTERNATIVES = 5;

/* Chrome rate-limits a recogniser restarted the instant it ends, and a session
 * that trips that limiter thereafter ends immediately, forever. So a restart
 * waits, and waits longer each time, and eventually gives up rather than
 * spinning: a microphone that will not stay open is worth saying out loud. */
const RESTART_MS = 250;
const RESTART_MAX_MS = 4000;
const RESTART_LIMIT = 8;

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
/* `schedule` is the one seam past the engine itself: the backoff below is the
 * part worth testing, and a test that really waited four seconds to prove a
 * four-second wait would be a bad trade. Defaults to the clock. */
export function createRecognizer(handlers, { schedule = setTimeout, unschedule = clearTimeout } = {}) {
  const Ctor = ctor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = MAX_ALTERNATIVES;
  rec.lang = "en-US";
  let wanted = false;
  let restarts = 0;
  let restartTimer = null;
  const noop = () => {};
  const onEndpoint = handlers.onEndpoint || noop;

  rec.onstart = () => {
    // A session that opened is a session that did not trip the limiter, so the
    // backoff starts again from nothing.
    restarts = 0;
    handlers.onStatus("listening");
  };
  rec.onresult = (event) => {
    let pending = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        // Every reading the engine offered, best first, for a caller that has a
        // passage to compare them against.
        const readings = [];
        for (let k = 0; k < result.length; k++) readings.push(result[k].transcript);
        handlers.onText(result[0].transcript, true, readings);
      } else pending += result[0].transcript;
    }
    handlers.onText(pending, false, []);
  };
  /* The engine's own endpointing. It has the audio and a voice-activity model;
   * a timer in the caller has neither, and has to guess. Where these fire they
   * are a better answer than the guess, and where they do not the caller's
   * timer is still underneath. */
  rec.onspeechend = () => onEndpoint();
  rec.onerror = (event) => {
    // Silence is not a failure — it is a member thinking about the next line.
    if (event.error === "no-speech" || event.error === "aborted") return;
    wanted = false;
    handlers.onError(errorFor(event.error));
  };
  rec.onend = () => {
    if (!wanted) return handlers.onStatus("off");
    if (++restarts > RESTART_LIMIT) {
      wanted = false;
      return handlers.onError("failed");
    }
    // Never synchronously: restarting inside onend is the pattern the limiter
    // is watching for.
    const wait = Math.min(RESTART_MAX_MS, RESTART_MS * 2 ** (restarts - 1));
    unschedule(restartTimer);
    restartTimer = schedule(() => {
      if (!wanted) return;
      try {
        rec.start();
      } catch {
        /* still winding down — the next onend backs off again */
      }
    }, wait);
  };

  return {
    start() {
      wanted = true;
      restarts = 0;
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
      unschedule(restartTimer);
      restartTimer = null;
      rec.onstart = rec.onresult = rec.onerror = rec.onend = rec.onspeechend = null;
      try {
        rec.abort();
      } catch {
        /* never started */
      }
    },
  };
}
