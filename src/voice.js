/* Reciting a passage instead of typing it.
 *
 * Recognition is the browser's own (see recognizer.js). What is here is the one
 * piece worth testing without a microphone: where the words go. They go into
 * the same `state.typed` a member could have written by hand, so grading.js and
 * srs.js never learn how the passage arrived — which is why a clean recitation
 * commits a verse exactly as a write-out does, with no rule anywhere needing to
 * agree that it should.
 *
 * The browser reports a phrase twice: first as a guess that keeps changing
 * while the member is still speaking, then once it settles. `tail` is where
 * that unsettled guess begins in the transcript, so each new version replaces
 * the last in place rather than piling up after it. A settled point and a
 * provisional tail after it is the whole model.
 *
 * Keeping the guess in `typed` rather than in a buffer beside it is the reason
 * there is nothing else here: what the member sees in the box is what the
 * grader will mark, and correcting a mistake needs no machinery of its own,
 * because the box is an ordinary textarea the whole time. Backspace is
 * backspace. */

/* The engine hands back lowercase; a passage starts with a capital. Only ever
 * applied to the first word in the box, so a member who typed the opening and
 * recited the rest is not second-guessed mid-sentence. */
const capitalized = (s) => s.replace(/^[a-z]/, (c) => c.toUpperCase());

/* The transcript once `text` takes the place of whatever was provisional.
 *
 * `settled` is the browser saying it will not revise this phrase again, which
 * moves the tail past it — everything before the tail is the member's, and
 * everything after it is still being heard. */
export function transcribe(typed, tail, text, settled = false) {
  const before = String(typed || "")
    .slice(0, Math.max(0, tail || 0))
    .replace(/\s+$/, "");
  const spoken = String(text || "").trim();
  if (!spoken) return { typed: before, tail: before.length };
  const joined = before ? before + " " + spoken : capitalized(spoken);
  return { typed: joined, tail: settled ? joined.length : before.length };
}
