/* The review session: what the modes are and how a session is shaped.
 *
 * Pure descriptions and helpers only — the running session's state (which card,
 * what has been typed) belongs to the component. */

/* The four ways to review a passage, in the order the board presents them.
 * `key` is persisted in state and read by srs.nextStability() to decide how much
 * stability a completed review earns, so these keys are part of the data model —
 * renaming one changes how reviews are scored. */
export const MODES = [
  {
    key: "flip",
    name: "Flashcard",
    short: "Card",
    desc: "Reference first. Say it aloud, then reveal the text to check.",
  },
  {
    key: "scramble",
    name: "Order the phrases",
    short: "Order",
    desc: "The passage is cut into phrases and shuffled. Put them back.",
  },
  {
    key: "blanks",
    name: "Fill the blanks",
    short: "Blanks",
    desc: "The key words — verbs, actions, and names — are removed. Type what belongs there, and dial how many blanks you get.",
  },
  {
    key: "type",
    name: "Write it out",
    short: "Write",
    desc: "Type the whole passage from memory and get it graded word by word.",
  },
];

/* Mode a session falls back to when the member hasn't picked one. */
export const DEFAULT_MODE = "flip";

/* The two kinds of sitting. They run the same card UI and offer the same four
 * activities; what separates them is the half of the set they draw from, and
 * what finishing a card can do — only a learn session can commit a verse.
 * Persisted in session state, so these keys are part of the data model. */
export const REVIEW = "review";
export const LEARN = "learn";

/* Passages pulled into a "Review now" session, taken from the top of the due
 * order. Small enough to finish in a sitting. */
export const SESSION_SIZE = 8;

/* Uncommitted verses a learn session takes by default. Smaller than a review
 * sitting: committing a passage is a good deal more work than refreshing one. */
export const LEARN_SIZE = 5;

/* Verses listed before a sitting starts, so a size picker is not a blind choice
 * without turning the setup screen into the queue itself. */
export const QUEUE_PREVIEW_ROWS = 6;

/* Width of the board's activity chart, in days (including today). */
export const ACTIVITY_DAYS = 14;

export const modeByKey = (key) => MODES.find((m) => m.key === key) || MODES[0];

/* What each chunk put in the wrong place costs the ordering mark. The exercise
 * refuses a wrong chunk rather than accepting it, so a finished ordering is
 * always in the right order — how many wrong chunks were tried on the way is
 * the only thing separating recall from trial and error. */
export const SCRAMBLE_MISS_COST = 0.05;

/* Mark an ordering attempt: how much of the passage was rebuilt, less what the
 * wrong tries cost. */
export function scrambleScore(placed, total, misses = 0) {
  if (!total) return 0;
  return Math.max(0, placed / total - SCRAMBLE_MISS_COST * misses);
}

/* mulberry32 — a small, well-distributed 32-bit PRNG. Math.imul and `>>> 0` keep
 * every step inside 32 bits, so it stays exact in doubles (a plain `s * bigConst`
 * LCG silently loses precision past 2^53 and degenerates).
 *
 * Exported because Test mode builds a whole paper from one seed (see exam.js)
 * and needs the generator itself, not a single shuffle. */
export function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Deterministic shuffle: a given passage always scrambles the same way, so
 * leaving a card and coming back doesn't rearrange it under the member. Returns
 * `{ v, i }` pairs, `i` being each item's position in the original order, which
 * is how the exercise knows whether a chunk was placed correctly.
 *
 * Fisher–Yates — an unbiased permutation. (Shuffling via `Array.sort` with a
 * random comparator, as this once did, is not: the comparator must be a
 * consistent ordering, and engines are free to produce anything when it isn't.) */
export function seededShuffle(items, seed) {
  const out = items.map((v, i) => ({ v, i }));
  const random = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
