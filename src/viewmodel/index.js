/* Assembles the view-model — the single plain object every view reads.
 *
 * Views never touch component state: App hands this builder its state plus a
 * table of actions, and gets back one flat object of strings, numbers, and
 * callbacks. That keeps the templates declarative and makes the whole layer
 * testable without mounting anything (see test/views.test.mjs).
 *
 * Each per-view builder owns a disjoint set of keys; they are merged here. */

import { progressReader, streakOf } from "../progress.js";
import { deriveTotals } from "./totals.js";
import { chromeVals } from "./chrome.js";
import { boardVals } from "./board.js";
import { listVals } from "./list.js";
import { reviewVals, reviewSetupVals } from "./review.js";
import { examVals } from "./exam.js";
import { leaderboardVals } from "./leaderboard.js";

export function buildViewModel({ state, groupName, deadline, actions, now = new Date() }) {
  const totals = deriveTotals({
    passages: state.passages,
    progress: state.progress,
    deadline,
    now,
  });
  const prog = progressReader(state.progress, now.getTime());
  const myStreak = streakOf(state.log, now);

  return {
    // Set-wide figures several views quote.
    goal: totals.goal,
    memorized: totals.memorized,
    learning: totals.learning,
    remaining: totals.remaining,
    pctLabel: totals.pctLabel,

    ...chromeVals({ state, groupName, actions }),
    ...boardVals({ state, totals, prog, actions, today: now }),
    ...listVals({ state, prog, actions }),
    ...reviewSetupVals({ state, prog, actions }),
    ...reviewVals({ state, prog, totals, actions }),
    ...examVals({ state, actions, now: now.getTime() }),
    ...leaderboardVals({ state, totals, myStreak, actions }),
  };
}

export { authGateVals, profileFormVals } from "./gate.js";
