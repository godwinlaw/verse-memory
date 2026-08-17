/* Reciting a passage out loud: the transcript, and how to take it back.
 *
 * Recognition itself is a browser affair and lives behind recognizer.js. What
 * is here is the part worth unit-testing: the transcript is still the same
 * `state.typed` string the member could have written by hand, so nothing in
 * grading.js or srs.js knows or cares which way the words arrived. Speaking is
 * a second way to fill the box, not a second exercise.
 *
 * What speaking does need, and typing does not, is a way back. A keyboard has
 * backspace; a microphone hands over a finished phrase and offers nothing. So
 * every phrase recognition settles on is recorded as a chunk — `{ text, start }`,
 * the words and where in the transcript they landed — and the stack of chunks is
 * what "undo" walks back down. Three sizes of step, because a misrecitation
 * comes in three sizes:
 *
 *   undoPhrase()  the last thing said, gone whole — the common case, since a
 *                 member notices the mistake as the phrase lands
 *   undoWord()    one word, for when recognition heard "lord" as "lorde" and
 *                 the rest of the phrase was fine
 *   clearSpoken() start the passage again
 *
 * The transcript stays editable by hand throughout, so a chunk can be
 * invalidated by the member typing over it. liveChunks() is what reconciles the
 * two: a chunk counts only while its words are still sitting where it left
 * them, and undoPhrase() quietly degrades to undoWord() when the tail has been
 * edited. That is the whole reason chunks carry `start` rather than a length —
 * a position can be checked against the transcript, a count cannot. */

import { norm } from "./text.js";

/* Phrases that are heard as an instruction rather than as scripture.
 *
 * Only a whole utterance matches, never words inside one: a member reciting a
 * passage that happens to contain "undo" is reciting, and the phrase they
 * actually say to take something back is said on its own, into the pause after
 * the mistake. `key` is the step it takes — the same three the buttons take. */
export const VOICE_COMMANDS = [
  { key: "undo", phrases: ["scratch that", "undo that", "undo", "delete that"] },
  { key: "back", phrases: ["backspace", "back one word", "back a word", "delete the last word"] },
  { key: "clear", phrases: ["start over", "start again", "clear it", "clear everything"] },
];

/* A whole utterance reduced for comparison: the same lowercase, punctuation-free
 * reading of each word that grading uses, joined back into a phrase. So "Scratch
 * that!" and "scratch that" are the same instruction. */
const phraseKey = (text) =>
  String(text || "")
    .split(/\s+/)
    .map(norm)
    .filter(Boolean)
    .join(" ");

/* Which step, if any, an utterance asks for. Null means it was scripture. */
export function spokenCommand(text) {
  const key = phraseKey(text);
  if (!key) return null;
  const hit = VOICE_COMMANDS.find((c) => c.phrases.includes(key));
  return hit ? hit.key : null;
}

/* Where a chunk's last character sits in the transcript. Every chunk but the
 * first is preceded by the space that joined it on, which is why this is not
 * simply start + length. */
const endOf = (chunk) => chunk.start + (chunk.start ? 1 : 0) + chunk.text.length;

/* The chunks still standing: those whose words are where they were left.
 *
 * Checked by position rather than by rebuilding the transcript, so typing at the
 * start of the box does not invalidate everything spoken after it — only a chunk
 * actually written over stops counting, and everything past it with it (a chunk
 * whose predecessor moved is no longer at the offset it recorded). */
export function liveChunks(typed, chunks = []) {
  const text = String(typed || "");
  const kept = [];
  for (const chunk of chunks) {
    const want = chunk.start ? " " + chunk.text : chunk.text;
    if (text.slice(chunk.start, endOf(chunk)) !== want) break;
    kept.push(chunk);
  }
  return kept;
}

/* Add a phrase recognition has settled on to the end of the transcript.
 *
 * Trailing whitespace on what is already there is absorbed rather than kept, so
 * a member who typed "Hear O Israel " and then spoke gets one space at the join
 * and a chunk whose recorded start is a position that will still be checkable. */
export function appendSpoken(typed, chunks, text) {
  const spoken = String(text || "").trim();
  if (!spoken) return { typed, chunks: liveChunks(typed, chunks) };
  const base = String(typed || "").replace(/\s+$/, "");
  const kept = liveChunks(base, chunks);
  return {
    typed: base ? base + " " + spoken : spoken,
    chunks: [...kept, { text: spoken, start: base.length }],
  };
}

/* Take back the last phrase said — but only while it is still the tail of the
 * transcript. Once the member has typed past it there is no phrase to lift out
 * cleanly, so this becomes a backspace over one word, which is always safe. */
export function undoPhrase(typed, chunks) {
  const text = String(typed || "");
  const kept = liveChunks(text, chunks);
  const last = kept[kept.length - 1];
  if (!last || text.trimEnd().length !== endOf(last)) return undoWord(text, chunks);
  return { typed: text.slice(0, last.start), chunks: kept.slice(0, -1) };
}

/* Backspace over one word, however it got there. */
export function undoWord(typed, chunks) {
  const next = String(typed || "").replace(/\s*\S+\s*$/, "");
  return { typed: next, chunks: liveChunks(next, chunks) };
}

/* Start the passage again. */
export const clearSpoken = () => ({ typed: "", chunks: [] });

/* Whether there is anything left to take back. */
export const canUndo = (typed) => !!String(typed || "").trim();

/* Apply a spoken instruction. Returns null for anything that is not one, so the
 * caller can tell "this was a command, here is the new transcript" from "this
 * was scripture, append it" without a second lookup. */
export function applyCommand(key, typed, chunks) {
  if (key === "undo") return undoPhrase(typed, chunks);
  if (key === "back") return undoWord(typed, chunks);
  if (key === "clear") return clearSpoken();
  return null;
}

/* One utterance, start to finish: an instruction is obeyed, anything else is
 * written down. This is the whole of what arrives from the recognizer. */
export function hearFinal(typed, chunks, text) {
  const command = spokenCommand(text);
  const acted = command && applyCommand(command, typed, chunks);
  return acted ? { ...acted, command } : { ...appendSpoken(typed, chunks, text), command: null };
}
