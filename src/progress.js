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

/* Clean reviews before a passage counts as committed. */
export const REVIEWS_TO_COMMIT = 3;

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
  return Object.values(progress || {}).filter((r) => migrate(r).status === "memorized").length;
}

/* Passages in spaced-repetition order: stalest first. Never-reviewed passages
 * have retrievability 0, so they sort to the top on their own. */
export function dueOrder(passages, progress, now = Date.now()) {
  const read = progressReader(progress, now);
  return [...passages].sort((a, b) => read.retrievability(a.id) - read.retrievability(b.id));
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
