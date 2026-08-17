/* The state a browser is started with.
 *
 * A record is seeded rather than earned: driving twenty cards to get one verse
 * to 40% freshness would test the setup, not the thing under test. The builders
 * below call the real model (src/srs.js) for the arithmetic, so a seed says what
 * it means — `committed(0.4)` is a verse the app will read as 40% fresh — and a
 * retune of the curve moves the fixtures with it rather than stranding them.
 *
 * Everything here is pure and runs in node: specs import it, and the harness
 * writes the result into localStorage before the app boots. */

import { passages } from "../../data/passages.js";
import { backdatedLast } from "../../src/srs.js";
import { dayKey } from "../../src/text.js";

export { passages };

export const GOAL = passages.length;

/* A complete profile, so the profile form is not in the way of every spec. The
 * two review settings are left off deliberately — the defaults (10 verses, due
 * at 75%) are what the board and both setup screens are written against. */
export const PROFILE = {
  name: "Ada Lovelace",
  ministryGroup: "Kairos",
  gender: "Female",
  gradClass: 2026,
  updatedAt: 1_700_000_000_000,
};

export const passageById = (id) => passages.find((p) => p.id === id);
export const passageByRef = (ref) => passages.find((p) => p.ref === ref);

/* A committed verse, dated so it reads at `fresh` (0–1) right now. `stability`
 * is how well it is held — the same number the guide draws its two curves at —
 * and it decides how fast the verse will fade from here. */
export function committed(fresh = 1, { stability = 8, hits = 4, now = Date.now() } = {}) {
  return { hits, status: "memorized", stability, last: backdatedLast(stability, fresh, now), updatedAt: now };
}

/* A verse opened but not given back in full: what a learn session draws first. */
export function started(fresh = 0.5, { stability = 1.5, hits = 1, now = Date.now() } = {}) {
  return { hits, status: "learning", stability, last: backdatedLast(stability, fresh, now), updatedAt: now };
}

/* A progress map from `{ [passageId]: record }`, keyed the way storage keys it. */
export const progressOf = (records) => ({ ...records });

/* The whole set committed and fully fresh — nothing due, nothing left to learn. */
export const everythingCommitted = (now = Date.now()) =>
  Object.fromEntries(passages.map((p) => [p.id, committed(1, { stability: 30, hits: 6, now })]));

/* A daily log from `{ daysAgo: reviews }`, so a streak or a chart can be seeded
 * without writing out local dates. */
export function logOf(byDaysAgo, today = new Date()) {
  const out = {};
  for (const [ago, n] of Object.entries(byDaysAgo)) {
    const d = new Date(today);
    d.setDate(d.getDate() - Number(ago));
    out[dayKey(d)] = n;
  }
  return out;
}

/* The passage as the grader wants it back: what a member would type to give the
 * verse back in full (grading.js normalizes punctuation and case, so the text
 * itself is a clean pass). */
export const fullText = (id) => passageById(id).text;
