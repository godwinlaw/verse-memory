/* The three parts the passage set is divided into.
 *
 * A category is a shelf, not a rule: it says nothing about what commits a verse
 * (srs.commitsVerse), what a sitting draws from (progress.reviewPool /
 * learnPool), or how a verse is scheduled. All it does is narrow the passage
 * list handed to those, which is why every screen that offers a category also
 * offers "All" and defaults to it, with nothing chosen, the app behaves
 * exactly as it did when there was one flat set.
 *
 * The names sit beside the keys here rather than in copy.js, for the same
 * reason MODES and ACTIVITIES keep theirs: `key` is written into a member's
 * saved setup (mv.reviewSetup, mv.learnSetup, mv.examSetup) and into every
 * passage record, so it is part of the data model and renaming one silently
 * drops a saved preference. `short` is what fits on a tab; `name` is the
 * shelf's full title.
 *
 * `goal: true` marks the one category the deadline is measured against, see
 * viewmodel/totals.js. The other two are worth learning and count on the
 * leaderboard, but they are not what the pace on the board is counting down. */

export const CATEGORIES = [
  {
    key: "core",
    name: "Verses Every Self Respecting Christian Should Know",
    short: "Core verses",
    goal: true,
  },
  { key: "psalms", name: "Psalms", short: "Psalms" },
  { key: "dt", name: "DT Passages", short: "DT" },
];

/* The category the goal counts, and the one a record without a category falls
 * back to. Those are deliberately the same key: every passage carried no
 * category at all before this existed, and all of them were the goal. */
export const GOAL_CATEGORY = "core";

export const categoryOf = (passage) => (passage && passage.category) || GOAL_CATEGORY;

export const categoryByKey = (key) => CATEGORIES.find((c) => c.key === key) || null;

/* Narrow a passage list to one category. A null/unknown key means "All", and
 * returns the list untouched, that is what lets every caller apply this
 * unconditionally instead of branching around it. */
export function inCategory(passages, key) {
  if (!key || !categoryByKey(key)) return passages;
  return passages.filter((p) => categoryOf(p) === key);
}

/* The key a stored setup should be read back as: a category that no longer
 * exists, or was never chosen, is "All". */
export const normalizeCategory = (key) => (categoryByKey(key) ? key : null);
