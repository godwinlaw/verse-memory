/* Whole-set arithmetic: how much is committed, how much time is left, and the
 * pace those two imply. Shared by the board, the passage list, the leaderboard,
 * and the end-of-session summary, so it is computed once per render. */

import { countByStatus, committedCount } from "../progress.js";
import { GOAL_CATEGORY, inCategory } from "../categories.js";

const DAY_MS = 86400000;

/* The goal deadline as a Date, at the end of that local day. */
export function deadlineDate(deadline) {
  return new Date(deadline + "T23:59:59");
}

/* The goal is one category, not the whole set.
 *
 * Psalms and DT Passages are worth learning and count everywhere a member's
 * work is counted — but the deadline was set against the core verses, and
 * folding two more shelves into the denominator would have dropped everyone's
 * percentage overnight without anyone forgetting a word. So `goal`, `pct` and
 * `perWeek` are measured over the goal category, and `memorized` / `learning` /
 * `remaining` are measured there too, which is what keeps "n / goal" on the
 * board an honest fraction.
 *
 * What is counted across every category is `committedAll` — the figure the
 * leaderboard ranks on, where the question is how much scripture a member holds
 * rather than how far through one list they are. */
export function deriveTotals({ passages, progress, deadline, now = new Date() }) {
  const goalPassages = inCategory(passages, GOAL_CATEGORY);
  const goal = goalPassages.length;
  const memorized = countByStatus(goalPassages, progress, "memorized");
  const learning = countByStatus(goalPassages, progress, "learning");
  const end = deadlineDate(deadline);
  const daysLeft = Math.max(0, Math.ceil((end - now) / DAY_MS));
  // Never divide by less than a week, so the pace stays a sane number on the
  // last few days rather than exploding.
  const weeksLeft = Math.max(1, daysLeft / 7);
  const pct = goal ? Math.round((memorized / goal) * 100) : 0;
  return {
    goal,
    memorized,
    learning,
    remaining: goal - memorized - learning,
    pct,
    pctLabel: pct + "%",
    deadline: end,
    daysLeft,
    perWeek: Math.ceil((goal - memorized) / weeksLeft),
    // Every category. Counted off the progress map rather than the passage
    // list, so it is the same measure the roster reports for everybody else
    // (App.loadRoster) and the leaderboard compares like with like.
    committedAll: committedCount(progress),
    // Every category, as a size: what the passage list actually holds.
    totalCount: passages.length,
  };
}
