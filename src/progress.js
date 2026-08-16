/* Reading a stored progress map.
 *
 * A progress map is `{ [passageId]: record }` where a record is the shape
 * srs.js defines: `{ hits, status, last, stability }`. This module is the read
 * side — the pure questions the UI asks of that map ("how fresh is verse 12?",
 * "what should we review next?", "how long is the streak?"). The write side
 * (recording a review, toggling committed) stays with the component that owns
 * the state; persistence stays in storage.js.
 *
 * Records are normalised through srs.migrate() on every read so legacy records
 * saved before stability existed answer these questions correctly too.
 *
 * Everything here is a pure function of (map, now) and unit-tested in Node. */

import { migrate, retrievability, freshness, isDue } from "./srs.js";
import { dayKey } from "./text.js";

/* Member-facing wording for the three statuses a passage can be in. */
export const STATUS_LABEL = { memorized: "Committed", learning: "In progress", new: "Not started" };

/* A passage is committed by writing it out in full from memory, and by nothing
 * else — see srs.commitsVerse(), which is the only thing that sets this status.
 * `hits` still counts clean reviews, but it no longer promotes anything. */
export const isCommitted = (rec) => migrate(rec).status === "memorized";

/* Bind a progress map to the per-passage questions the views ask, so callers
 * pass a passage id instead of threading the map (and the migrate call) through
 * every call site. */
export function progressReader(progress, now = Date.now()) {
  const map = progress || {};
  const record = (id) => migrate(map[id]);
  return {
    record,
    statusOf: (id) => record(id).status,
    /* Whether the passage has ever been reviewed — untouched ones show "—"
     * rather than a misleading 0%. */
    isReviewed: (id) => !!record(id).last,
    retrievability: (id) => retrievability(record(id), now),
    freshness: (id) => freshness(record(id), now),
    isDue: (id) => isDue(record(id), now),
  };
}

/* How many passages are in a given status. */
export function countByStatus(passages, progress, status) {
  const read = progressReader(progress);
  return passages.filter((p) => read.statusOf(p.id) === status).length;
}

/* Committed passages in any progress map — including a peer's, which is why it
 * takes the raw map rather than a passage list. */
export function committedCount(progress) {
  return Object.values(progress || {}).filter(isCommitted).length;
}

/* Sum of retrievability across committed verses — how much committed scripture
 * is actually fresh right now. Ranges from 0 to committedCount(progress). */
export function freshnessSum(progress, now = Date.now()) {
  return Object.values(progress || {})
    .map(migrate)
    .filter((r) => r.status === "memorized")
    .reduce((sum, r) => sum + retrievability(r, now), 0);
}

/* Passages in spaced-repetition order: stalest first. Never-reviewed passages
 * have retrievability 0, so they sort to the top on their own. */
export function dueOrder(passages, progress, now = Date.now()) {
  const read = progressReader(progress, now);
  return [...passages].sort((a, b) => read.retrievability(a.id) - read.retrievability(b.id));
}

/* ── what each session draws from ─────────────────────────────────────────── */

/* The app has two ways through the set, and they take disjoint halves of it:
 * review keeps committed verses from fading, learning commits the rest. Both
 * pools are defined here, once, so the board's two sections and the two setup
 * screens can never disagree about what is on offer.
 *
 * Both return a new array — neither disturbs the passage list it was given. */

/* Review: committed verses that have faded to `maxFreshness` or below, stalest
 * first. A verse still above the threshold is holding fine and is left alone. */
export function reviewPool(passages, progress, maxFreshness, now = Date.now()) {
  const read = progressReader(progress, now);
  return dueOrder(passages, progress, now).filter(
    (p) => read.statusOf(p.id) === "memorized" && read.freshness(p.id) <= maxFreshness,
  );
}

/* Learn: everything not yet committed. Verses already in progress come ahead of
 * untouched ones — finish what you started before opening something new — and
 * within those, the most faded first. Untouched verses have no history to sort
 * on, so they keep canonical order. */
export function learnPool(passages, progress, now = Date.now()) {
  const read = progressReader(progress, now);
  const started = passages.filter((p) => read.statusOf(p.id) === "learning");
  started.sort((a, b) => read.retrievability(a.id) - read.retrievability(b.id));
  return [...started, ...passages.filter((p) => read.statusOf(p.id) === "new")];
}

/* Length of the current run of consecutive days with at least one review.
 * Today not being reviewed yet does not break the streak — the count simply
 * starts at yesterday. */
export function streakOf(log, today = new Date()) {
  const days = log || {};
  const d = new Date(today);
  let n = 0;
  if (!days[dayKey(d)]) d.setDate(d.getDate() - 1);
  while (days[dayKey(d)]) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
