/* Assembles the view-model, the single plain object every view reads.
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
import { explainerVals } from "./explainer.js";
import { guideVals } from "./guide.js";
import { listVals } from "./list.js";
import { reviewVals, reviewSetupVals } from "./review.js";
import { learnSetupVals } from "./learn.js";
import { examVals } from "./exam.js";
import { leaderboardVals } from "./leaderboard.js";

export function buildViewModel({ state, groupName, motto, deadline, actions, now = new Date() }) {
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
    // Every category, where the four above are the goal's own (see totals.js).
    totalCount: totals.totalCount,

    ...chromeVals({ state, groupName, motto, actions }),
    ...boardVals({ state, totals, prog, actions, today: now }),
    ...listVals({ state, prog, actions }),
    // Shared by both setup screens, so it is built once rather than by each.
    ...explainerVals({ state, actions }),
    // The long-form version of the same two ideas, plus the tour of the header.
    ...guideVals({ state, actions }),
    ...reviewSetupVals({ state, actions, now: now.getTime() }),
    ...learnSetupVals({ state, prog, actions }),
    ...reviewVals({ state, prog, totals, actions }),
    ...examVals({ state, actions, now: now.getTime() }),
    ...leaderboardVals({ state, totals, myStreak, actions, now: now.getTime() }),
  };
}

export { mobileGateVals, splashVals, authGateVals, syncGateVals, profileFormVals, welcomeVals } from "./gate.js";
