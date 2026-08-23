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
 * backspace.
 *
 * The one correction the box does make for itself is a word the engine spelled
 * wrong rather than a word the member said wrong — see same() below, which is
 * the only loose comparison anywhere in the app and says why. */

import { same } from "./wordmatch.js";

/* The engine hands back lowercase; a passage starts with a capital. Only ever
 * applied to the first word in the box, so a member who typed the opening and
 * recited the rest is not second-guessed mid-sentence. */
const capitalized = (s) => s.replace(/^[a-z]/, (c) => c.toUpperCase());

const wordsOf = (s) =>
  String(s || "")
    .split(/\s+/)
    .filter(Boolean);

/* A word with its trailing punctuation taken off: "one.” " -> "one". Leading
 * punctuation is deliberately kept, since an opening quote belongs to the word
 * it opens and there is never a question of having earned it. */
const unpunctuated = (w) => w.replace(/[^\p{L}\p{N}]+$/u, "");

/* Whether a word that was heard is the word the passage wanted.
 *
 * The predicate itself lives in wordmatch.js, and this is the whole reason it
 * was moved there: the box a member recites into and the scorer that marks the
 * recital must not be able to drift about what counts as the same word. It was
 * written here first, when the box was the only thing with a microphone behind
 * it; Speak mode gave it a second reader, and two copies of a fuzzy comparison
 * is two comparisons that will eventually disagree.
 *
 * What it does, and why the app has one loose comparison at all, is documented
 * there. The short version: an engine hands back a spelling rather than a
 * sound, so a member reciting Galatians perfectly gets "sews" for `sow`, and
 * the passage is right there to correct it against. `grading.js` stays exact,
 * so nothing anybody *types* is forgiven — this is the microphone being held to
 * what it heard, not the commit bar being lowered. */

/* Fitting what was heard back onto the passage.
 *
 * Two things the engine cannot know and the passage can. It hands back a flat
 * lowercase stream with no punctuation at all — "the lord our god the lord is
 * one you shall love" — so a member reciting perfectly watched their verse come
 * out looking nothing like the verse.
 *
 * A word that matches is therefore shown as the passage writes it: "LORD" for
 * lord, "God's" for gods. And the punctuation between two words is only earned
 * once both of them are right — a full stop after "one" is a claim about where
 * the sentence ended, and until the next word is in there is nothing to make
 * that claim about. So the stop arrives with "You", one word late, which is
 * also when a reader would want it.
 *
 * The alignment is positional: the Nth word said is the Nth word of the
 * passage, the same assumption the first-letter drill makes. A member reciting
 * says the words in order or they are not reciting; a word they get wrong is
 * left exactly as it was heard, and the words after it still line up. */
function fitToPassage(heard, target, from) {
  return heard.map((w, i) => {
    const at = from + i;
    const want = target[at];
    if (!same(w, want)) return w;
    return same(heard[i + 1], target[at + 1]) ? want : unpunctuated(want);
  });
}

/* The transcript once `text` takes the place of whatever was provisional.
 *
 * `settled` is the browser saying it will not revise this phrase again, which
 * moves the tail past it — everything before the tail is the member's, and
 * everything after it is still being heard.
 *
 * `passage` is what is being recited, and is optional: without it the words go
 * in exactly as they were heard, which is what the box did before it was ever
 * given the verse to compare against.
 *
 * `rest` is how many characters at the end of the box sit *after* the point
 * words are going in — nothing at all in the ordinary case, where the member is
 * reciting onto the end of what they have said so far. It is what makes the
 * words land where the cursor is: put the caret back into the middle of the
 * transcript and everything from there on is held aside, the phrase goes in at
 * the caret, and the held part is put back after it. Counted from the end
 * rather than held as an index because the phrase in the middle is still being
 * revised, and every revision changes its length. */
export function transcribe(typed, tail, text, settled = false, passage = "", rest = 0) {
  const box = String(typed || "");
  const held = rest > 0 ? box.slice(Math.max(0, box.length - rest)).replace(/^\s+/, "") : "";
  const before = box.slice(0, Math.max(0, Math.min(tail || 0, box.length - held.length))).replace(/\s+$/, "");
  const spoken = String(text || "").trim();
  if (!spoken) {
    const emptied = held ? (before ? before + " " + held : held) : before;
    return { typed: emptied, tail: before.length, rest: held.length };
  }

  const target = wordsOf(passage);
  const kept = wordsOf(before);
  const heard = wordsOf(spoken);

  const fitted = target.length ? fitToPassage(heard, target, kept.length) : heard;

  // The word on the other side of the join is in the same position: it could
  // not earn its punctuation when it was heard, because the word after it had
  // not been said yet. Now it has. Only ever adds — a word the member typed
  // themselves, or one that already carries punctuation, is left alone.
  const last = kept[kept.length - 1];
  const wantLast = target[kept.length - 1];
  const bridge =
    last && unpunctuated(last) === last && same(last, wantLast) && same(heard[0], target[kept.length])
      ? before.slice(0, before.length - last.length) + wantLast
      : before;

  const said = fitted.join(" ");
  const joined = bridge ? bridge + " " + said : capitalized(said);
  return {
    typed: held ? joined + " " + held : joined,
    tail: settled ? joined.length : bridge.length,
    rest: held.length,
  };
}
