/* View-model for the board: the hero stats, today's queue, the mode cards, the
 * whole-set map, and the activity chart. */

import { copy } from "../copy.js";
import { features } from "../config.js";
import { dayKey } from "../text.js";
import { freshColor } from "../srs.js";
import { learnPool, reviewPool, streakOf, STATUS_LABEL } from "../progress.js";
import { reviewSettings } from "../profile.js";
import { ACTIVITY_DAYS, LEARN, LEARN_SIZE, REVIEW } from "../review.js";
import { muted, statusTag } from "../ui/tokens.js";

/* One cell of the 2×2 hero stat grid; the outer edges drop their rules. */
const HERO_CELL =
  "padding:22px 24px;display:flex;flex-direction:column;gap:6px;" +
  "border-bottom:1px solid color-mix(in srgb, var(--color-reverse-text) 25%, transparent);border-right:1px solid color-mix(in srgb, var(--color-reverse-text) 25%, transparent)";

/* Floor for the activity chart's y-axis, so a couple of reviews on a quiet week
 * don't render as a full-height bar. */
const MIN_CHART_PEAK = 4;

/* The trailing ACTIVITY_DAYS days ending today, with each day's review count. */
function activityDays(log, today) {
  const out = [];
  for (let i = ACTIVITY_DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    out.push({ d, n: log[dayKey(d)] || 0 });
  }
  return out;
}

/* One row of either queue: number, reference, opening words, status — the same
 * passages seen at two stages of the same journey.
 *
 * The freshness readout is the exception, and it is review's alone. A verse in
 * the learn queue is not committed, so how much of it has decayed says nothing
 * a member can act on; what it needs is to be written out, and that is the same
 * job whether it reads 4% or 40%. */
function queueRow(p, i, { prog, kind, actions, showFreshness }) {
  const status = prog.statusOf(p.id);
  const reviewed = prog.isReviewed(p.id);
  const fresh = prog.freshness(p.id);
  return {
    id: p.id,
    num: String(p.id).padStart(3, "0"),
    ref: p.ref,
    snippet: p.text.slice(0, 90),
    statusLabel: STATUS_LABEL[status],
    tagStyle: statusTag(status),
    freshLabel: !showFreshness ? "" : reviewed ? fresh + "%" : copy.board.freshNew,
    freshStyle:
      "font-family:var(--font-heading);font-size:12px;font-weight:600;width:44px;flex:none;text-align:right;color:" +
      (reviewed ? freshColor(fresh) : muted(45)),
    // The row's resting fill is deliberately absent here: .queue-row draws it,
    // so the hover that marks the row about to be opened has something it can
    // outrank. An inline background could not be.
    style:
      "display:flex;align-items:center;gap:14px;padding:13px 18px;border:none;cursor:pointer;font-family:var(--font-body);color:var(--color-text);--stagger-i:" +
      i +
      (i ? ";border-top:1px solid var(--color-divider)" : ""),
    onClick: () => actions.startSession(undefined, [p.id], kind),
  };
}

export function boardVals({ state, totals, prog, actions, today = new Date() }) {
  const { goal, memorized, pct, daysLeft, perWeek, deadline } = totals;
  const { dueTopX, dueFreshness } = reviewSettings(state.profile);

  // The set, split the way the two sittings split it: committed verses that have
  // faded enough to be worth topping up, and verses not yet committed at all.
  // `today` is threaded through rather than left to these two calls' own
  // Date.now() default, so the split is pinned to the same instant as every
  // other figure on this screen (see activityDays, deriveTotals above).
  const now = today.getTime();
  const toReview = reviewPool(state.passages, state.progress, dueFreshness, now).slice(0, dueTopX);
  const learnSize = (state.learnSetup && state.learnSetup.size) || LEARN_SIZE;
  const toLearn = learnPool(state.passages, state.progress, now).slice(0, learnSize);

  const days = activityDays(state.log, today);
  const peak = Math.max(MIN_CHART_PEAK, ...days.map((x) => x.n));

  const shortDate = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  return {
    /* The verse across the top of the hero. Read here rather than in the view
     * because whether it is printed is a question about what is shown, and the
     * answer is a flag (config.js) — the sign-in gate keeps its own copy of the
     * same epigraph, which is deliberately not covered by this. */
    epigraph: features.boardEpigraph ? copy.app.epigraph : "",
    deadlineLabel: deadline.toLocaleDateString("en-GB", { day: "numeric", month: "long" }),
    barStyle: "position:absolute;inset:0 auto 0 0;width:" + pct + "%;background:var(--color-reverse-text)",

    heroStats: [
      {
        label: copy.board.statDaysLeft,
        value: daysLeft,
        note: copy.board.statDaysLeftNote(shortDate(deadline)),
        style: HERO_CELL,
      },
      {
        label: copy.board.statPace,
        value: perWeek,
        note: copy.board.statPaceNote,
        style: HERO_CELL + ";border-right:none",
      },
      {
        label: copy.board.statReviewed,
        value: state.log[dayKey(today)] || 0,
        note: copy.board.statReviewedNote,
        style: HERO_CELL + ";border-bottom:none",
      },
      {
        label: copy.board.statStreak,
        value: streakOf(state.log, today),
        note: copy.board.statStreakNote,
        style: HERO_CELL + ";border-bottom:none;border-right:none",
      },
    ],

    // ── review today: committed verses that have started to fade ────────────
    reviewCount: toReview.length,
    reviewQueue: toReview.map((p, i) => queueRow(p, i, { prog, kind: REVIEW, actions, showFreshness: true })),
    reviewQueueNote: copy.board.reviewQueueNote(dueFreshness),
    reviewQueueEmpty: memorized ? copy.board.reviewQueueEmpty : copy.board.reviewQueueEmptyNoneCommitted,

    // ── learn today: what is not committed yet ──────────────────────────────
    learnCount: toLearn.length,
    learnQueue: toLearn.map((p, i) => queueRow(p, i, { prog, kind: LEARN, actions, showFreshness: false })),
    learnQueueNote: copy.board.learnQueueNote,
    learnQueueEmpty: copy.board.learnQueueEmpty,

    mapCells: state.passages.map((p, i) => {
      const status = prog.statusOf(p.id);
      const reviewed = prog.isReviewed(p.id);
      const fresh = prog.freshness(p.id);
      // Fade a reviewed tile as its freshness decays, so stale passages visibly
      // dim without changing colour band.
      const fade = status !== "new" && reviewed ? ";opacity:" + (0.4 + (0.6 * fresh) / 100).toFixed(2) : "";
      return {
        id: p.id,
        title: copy.board.mapCellTitle(p.ref, STATUS_LABEL[status], reviewed ? fresh : null),
        onClick: () => actions.startSession(undefined, [p.id]),
        // The cell's place in the set is also its place in the wave the map
        // wakes up with (styles.css, .board-map-grid > button).
        style:
          "aspect-ratio:1;padding:0;cursor:pointer;--stagger-i:" +
          i +
          ";border:1px solid " +
          (status === "new" ? "var(--color-divider)" : "transparent") +
          ";background:" +
          (status === "memorized"
            ? "var(--color-accent-900)"
            : status === "learning"
              ? "var(--color-accent-300)"
              : "transparent") +
          fade,
      };
    }),

    activityDays: ACTIVITY_DAYS,
    dayBars: days.map((x, i) => ({
      key: dayKey(x.d),
      title: copy.board.dayBarTitle(x.d.toDateString(), x.n),
      style:
        "flex:1;--stagger-i:" +
        i +
        ";background:" +
        (x.n ? "var(--color-accent)" : "var(--color-neutral-200)") +
        ";height:" +
        Math.max(3, Math.round((x.n / peak) * 100)) +
        "%",
    })),
    barsFrom: shortDate(days[0].d),

    paceHeadline: memorized >= goal ? copy.board.paceHeadlineDone : copy.board.paceHeadline(perWeek),
    paceBody: memorized >= goal ? copy.board.paceBodyDone : copy.board.paceBody(goal - memorized, daysLeft, perWeek),
  };
}
