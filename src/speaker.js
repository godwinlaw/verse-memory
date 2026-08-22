/* The browser's own speech synthesis, wrapped.
 *
 * Written like recognizer.js: an optional overlay the app runs happily
 * without. `speechSupported()` coming back false just means Drive mode is not
 * offered on this browser. Kept thin on purpose — what is said, and when,
 * lives with the callers; this file only knows how to say it. */

export const speechSupported = () => typeof window !== "undefined" && !!window.speechSynthesis;

export function createSpeaker() {
  if (!speechSupported()) return null;
  const synth = window.speechSynthesis;
  return {
    /* `onDone` fires whether the utterance finished or failed — a caller
     * waiting to reopen the microphone must never be left waiting. */
    speak(text, onDone) {
      const u = new SpeechSynthesisUtterance(text);
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        if (onDone) onDone();
      };
      u.onend = finish;
      u.onerror = finish;
      synth.speak(u);
    },
    cancel() {
      synth.cancel();
    },
  };
}
