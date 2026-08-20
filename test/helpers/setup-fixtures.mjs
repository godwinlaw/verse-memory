/* Progress records at known freshnesses, shared by the two setup view-model
 * tests. Both screens are really testing the same division of the set, so they
 * describe verses the same way.
 *
 * Freshness is e^(−days/stability): a stability of 20 gives roughly 100% at 0
 * days, 95% at 1, 90% at 2, 61% at 10, 22% at 30, and 37% at 20. Each call site
 * quotes the figure it is relying on.
 *
 * Each record carries its rung of the interval ladder as well, so srs.migrate()
 * reads it as a current record and leaves the stability chosen here alone —
 * a record without a `step` is a legacy one, and migrating it would replace
 * these stabilities with the ladder's own. */

import { stepNear } from "../../src/srs.js";

export const NOW = new Date("2026-08-15T12:00:00.000Z").getTime();
export const daysAgo = (n) => NOW - n * 86400000;

/* A committed verse, last written out `days` ago. */
export const committed = (days) => ({ hits: 4, status: "memorized", last: daysAgo(days), step: 5, stability: 20 });

/* A verse in progress — reviewed, never yet written out in full, so not
 * committed however fresh it happens to be. */
export const learning = (days, stability = 5) => ({
  hits: 2,
  status: "learning",
  last: daysAgo(days),
  step: stepNear(stability),
  stability,
});

/* The slice of App state the two setup view-models read.
 *
 * Passages are given as `{ id }` — what these tests actually care about — and
 * filled out here with the reference and text a real passage carries, so the
 * learn screen's preview has something to render. Anything passed explicitly
 * wins. */
export const stateOf = (passages, progress, over = {}) => ({
  passages: passages.map((p) => ({ ref: "Ref " + p.id, text: "the text of verse " + p.id, ...p })),
  progress,
  profile: {},
  reviewSetup: { manualSize: 10, manualFreshness: 90 },
  learnSetup: { size: 5 },
  ...over,
});
