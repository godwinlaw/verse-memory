/* Reciting a passage instead of typing it.
 *
 * Recognition is the browser's own (see recognizer.js). What is here is the one
 * piece worth testing without a microphone: where the words go. They go into
 * the same `state.typed` a member could have written by hand, so grading.js and
 * srs.js never learn how the passage arrived, which is why a clean recitation
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
 * wrong rather than a word the member said wrong, see same() below, which is
 * the only loose comparison anywhere in the app and says why. */

import { norm } from "./text.js";

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

/* How far apart two spellings may be and still be the same word said out loud.
 * One edit, and never on a word short enough for one edit to be most of it,
 * "us" and "as" are two words, "Jews" and "Jew" are one word twice. */
const MAX_EDITS = 1;
const MIN_FUZZY_LEN = 3;

/* Whether two strings are within MAX_EDITS of each other, one substitution,
 * insertion, or deletion. Walked in step rather than scored with a full edit
 * matrix, because the only question ever asked is "one or fewer", and the
 * answer to that is known the second time the walk falls out of step. */
function withinOneEdit(a, b) {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (long.length - short.length > MAX_EDITS) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > MAX_EDITS) return false;
    // Same length: the two are out of step by a substitution, so both advance.
    // Different: the longer one carries a letter the shorter does not.
    if (short.length === long.length) i++;
    j++;
  }
  return true;
}

/* A word with one plural or third-person ending taken off. Speech recognition
 * gets the sound and guesses the grammar, and the guess it gets wrong most is
 * this one: "sows" comes back as "sews", "Jew" as "Jews". Stripped from both
 * sides before they are compared, so the ending is never what separates them. */
const stem = (w) => w.replace(/(?:es|s)$/, "");

/* Whether a word that was heard is the word the passage wanted. Compared
 * through norm(), so neither punctuation nor an apostrophe nobody pronounces
 * can separate "eagles", "eagles'" and "eagle's".
 *
 * And compared loosely, which is the one place in the app that grades anything
 * loosely. The engine hands back a spelling, not a sound: a member reciting
 * Galatians perfectly gets "sews" for "sow" and "Jews" for "Jew", and then
 * fails the card, or has to stop and repair the box by hand, which is the
 * thing reciting was meant to save them. Those are not recall errors, they are
 * transcription errors, and the passage is right there to correct them
 * against.
 *
 * So a heard word within one edit of the word the passage wanted, ignoring a
 * plural ending on either side, is taken as that word, and fitToPassage then
 * writes the passage's spelling into the box, which is the correction. Held
 * tight by the two rules above: one edit, and nothing under MIN_FUZZY_LEN
 * letters, where a single edit is the difference between "he" and "be".
 *
 * It is deliberately only here. grading.js stays exact, so nothing a member
 * *types* is forgiven, this is the microphone being held to what it heard,
 * not the commit bar being lowered. The cost is that a recited word genuinely
 * misremembered as a near neighbour ("hear" for "heart") is now given, which
 * is the trade this makes on purpose: the alternative failed a member who said
 * the verse right. MAX_EDITS and MIN_FUZZY_LEN are where that is tuned. */
function same(heard, want) {
  if (!want || !heard) return false;
  const a = norm(heard);
  const b = norm(want);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length < MIN_FUZZY_LEN || b.length < MIN_FUZZY_LEN) return false;
  return withinOneEdit(a, b) || withinOneEdit(stem(a), stem(b));
}

/* Fitting what was heard back onto the passage.
 *
 * Two things the engine cannot know and the passage can. It hands back a flat
 * lowercase stream with no punctuation at all, "the lord our god the lord is
 * one you shall love", so a member reciting perfectly watched their verse come
 * out looking nothing like the verse.
 *
 * A word that matches is therefore shown as the passage writes it: "LORD" for
 * lord, "God's" for gods. And the punctuation between two words is only earned
 * once both of them are right, a full stop after "one" is a claim about where
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
 * moves the tail past it, everything before the tail is the member's, and
 * everything after it is still being heard.
 *
 * `passage` is what is being recited, and is optional: without it the words go
 * in exactly as they were heard, which is what the box did before it was ever
 * given the verse to compare against.
 *
 * `rest` is how many characters at the end of the box sit *after* the point
 * words are going in, nothing at all in the ordinary case, where the member is
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
  // not been said yet. Now it has. Only ever adds, a word the member typed
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
