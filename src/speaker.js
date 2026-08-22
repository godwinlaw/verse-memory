/* The browser's own speech synthesis, wrapped.
 *
 * Written like recognizer.js: an optional overlay the app runs happily
 * without. `speechSupported()` coming back false just means Speak mode is not
 * offered on this browser. Kept thin on purpose — what is said, and when,
 * lives with the callers; this file only knows how to say it. */

export const speechSupported = () => typeof window !== "undefined" && !!window.speechSynthesis;

/* How long a line ought to take to say, with a floor for the short ones — the
 * ceiling the watchdog below is armed with. It is a second copy of the estimate
 * in beat.js rather than a shared import, because this file is the seam Speak
 * mode is written against and run mode's beat is not part of that contract. */
export function speechMs(text) {
  const words = String(text || "")
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(2500, (words / 2.5) * 1000);
}

export function createSpeaker() {
  if (!speechSupported()) return null;
  const synth = window.speechSynthesis;
  return {
    /* `onDone` fires whether the utterance finished, failed, or simply went
     * quiet without saying so — a caller waiting to reopen the microphone must
     * never be left waiting. The last of those is not hypothetical: a browser
     * that abandons an utterance reports nothing at all, and a driving session
     * that waits forever for a callback has ended without telling anybody, at
     * the wheel, which is the one place there is nobody free to press a
     * button. So every line is also given a generous ceiling, after which the
     * session carries on regardless. */
    speak(text, onDone) {
      const u = new SpeechSynthesisUtterance(text);
      let done = false;
      let watchdog = null;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(watchdog);
        if (onDone) onDone();
      };
      u.onend = finish;
      u.onerror = finish;
      synth.speak(u);
      watchdog = setTimeout(finish, speechMs(text) * 2.5 + 5000);
    },
    cancel() {
      synth.cancel();
    },
  };
}
