/* Whole-set arithmetic: how much is committed, how much time is left, and the
 * pace those two imply. Shared by the board, the passage list, the leaderboard,
 * and the end-of-session summary, so it is computed once per render. */

import { countByStatus } from "../progress.js";

const DAY_MS = 86400000;

/* The goal deadline as a Date, at the end of that local day. */
export function deadlineDate(deadline) {
  return new Date(deadline + "T23:59:59");
}

export function deriveTotals({ passages, progress, deadline, now = new Date() }) {
  const goal = passages.length;
  const memorized = countByStatus(passages, progress, "memorized");
  const learning = countByStatus(passages, progress, "learning");
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
  };
}
