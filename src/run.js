/* Run mode's pure half: which verses get called out on a run, and the script
 * one verse is called out with. No DOM, no audio — unit-tested in Node.
 * The audio side (beat + voice) is src/beat.js; the loop that walks this
 * script lives with the component that owns the timers. */

import { progressReader } from "./progress.js";

/* Pause after the reference, before the verse text is read. */
export const REF_PAUSE_MS = 900;
/* The echo pause — room for the runner to say the verse back in their head —
 * is proportional to the verse's length, inside these bounds. */
export const ECHO_MS_PER_WORD = 400;
export const ECHO_MIN_MS = 4000;
export const ECHO_MAX_MS = 20000;

/* The verses a run calls out: the member's committed verses, stalest first —
 * a run is upkeep, not first meetings. A member with nothing committed yet
 * still gets a run: the whole set, in canonical order. */
export function calloutQueue(passages, progress, now = Date.now()) {
  const read = progressReader(progress, now);
  const committed = passages.filter((p) => read.statusOf(p.id) === "memorized");
  const pool = committed.length ? committed : [...passages];
  if (committed.length) pool.sort((a, b) => read.retrievability(a.id) - read.retrievability(b.id));
  return pool;
}

/* One verse's callout: the reference, a beat, the verse text, then the echo
 * pause for the runner to give it back in their head. */
export function calloutScript(passage) {
  const words = String(passage.text || "")
    .split(/\s+/)
    .filter(Boolean).length;
  const echo = Math.min(ECHO_MAX_MS, Math.max(ECHO_MIN_MS, words * ECHO_MS_PER_WORD));
  return [
    { text: passage.ref, pauseAfterMs: REF_PAUSE_MS },
    { text: passage.text, pauseAfterMs: echo },
  ];
}
