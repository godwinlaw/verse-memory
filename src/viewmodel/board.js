/* View-model for the board: the hero stats, today's queue, the mode cards, the
 * whole-set map, and the activity chart. */

import { dayKey } from "../text.js";
import { freshColor } from "../srs.js";
import { learnPool, reviewPool, streakOf, STATUS_LABEL } from "../progress.js";
import { reviewSettings } from "../profile.js";
import { ACTIVITY_DAYS, LEARN, LEARN_SIZE, REVIEW } from "../review.js";
import { muted, statusTag } from "../ui/tokens.js";

/* One cell of the 2×2 hero stat grid; the outer edges drop their rules. */
const HERO_CELL =
  "padding:22px 24px;display:flex;flex-direction:column;gap:6px;" +
  "border-bottom:1px solid rgba(242,242,243,.25);border-right:1px solid rgba(242,242,243,.25)";

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
    freshLabel: !showFreshness ? "" : reviewed ? fresh + "%" : "new",
    freshStyle:
      "font-family:var(--font-heading);font-size:12px;font-weight:600;width:44px;flex:none;text-align:right;color:" +
      (reviewed ? freshColor(fresh) : muted(45)),
    style:
      "display:flex;align-items:center;gap:14px;padding:13px 18px;background:transparent;border:none;cursor:pointer;font-family:var(--font-body);color:var(--color-text)" +
      (i ? ";border-top:1px solid var(--color-divider)" : ""),
    onClick: () => actions.startSession(undefined, [p.id], kind),
  };
}

export function boardVals({ state, totals, prog, actions, today = new Date() }) {
  const { goal, memorized, pct, daysLeft, perWeek, deadline } = totals;
  const { dueTopX, dueFreshness } = reviewSettings(state.profile);

  // The set, split the way the two sittings split it: committed verses that have
  // faded enough to be worth topping up, and verses not yet committed at all.
  const toReview = reviewPool(state.passages, state.progress, dueFreshness).slice(0, dueTopX);
  const learnSize = (state.learnSetup && state.learnSetup.size) || LEARN_SIZE;
  const toLearn = learnPool(state.passages, state.progress).slice(0, learnSize);

  const days = activityDays(state.log, today);
  const peak = Math.max(MIN_CHART_PEAK, ...days.map((x) => x.n));

  const shortDate = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  return {
    deadlineLabel: deadline.toLocaleDateString("en-GB", { day: "numeric", month: "long" }),
    barStyle: "position:absolute;inset:0 auto 0 0;width:" + pct + "%;background:#f2f2f3",

    heroStats: [
      { label: "Days left", value: daysLeft, note: "until " + shortDate(deadline), style: HERO_CELL },
      { label: "Pace needed", value: perWeek, note: "passages a week", style: HERO_CELL + ";border-right:none" },
      {
        label: "Reviewed today",
        value: state.log[dayKey(today)] || 0,
        note: "cards handled",
        style: HERO_CELL + ";border-bottom:none",
      },
      {
        label: "Streak",
        value: streakOf(state.log, today),
        note: "days running",
        style: HERO_CELL + ";border-bottom:none;border-right:none",
      },
    ],

    // ── review today: committed verses that have started to fade ────────────
    reviewCount: toReview.length,
    reviewQueue: toReview.map((p, i) => queueRow(p, i, { prog, kind: REVIEW, actions, showFreshness: true })),
    reviewQueueNote: "committed · faded to " + dueFreshness + "% or below",
    reviewQueueEmpty: memorized
      ? "Nothing to review. Every verse you have committed is still fresh."
      : "Nothing to review yet — a verse arrives here once you have committed it.",

    // ── learn today: what is not committed yet ──────────────────────────────
    learnCount: toLearn.length,
    learnQueue: toLearn.map((p, i) => queueRow(p, i, { prog, kind: LEARN, actions, showFreshness: false })),
    learnQueueNote: "not committed · write one out in full to commit it",
    learnQueueEmpty: "Every passage in the set is committed. Nothing left to learn.",

    mapCells: state.passages.map((p) => {
      const status = prog.statusOf(p.id);
      const reviewed = prog.isReviewed(p.id);
      const fresh = prog.freshness(p.id);
      // Fade a reviewed tile as its freshness decays, so stale passages visibly
      // dim without changing colour band.
      const fade = status !== "new" && reviewed ? ";opacity:" + (0.4 + (0.6 * fresh) / 100).toFixed(2) : "";
      return {
        id: p.id,
        title: p.ref + " — " + STATUS_LABEL[status] + (reviewed ? " · " + fresh + "% fresh" : ""),
        onClick: () => actions.startSession(undefined, [p.id]),
        style:
          "aspect-ratio:1;padding:0;cursor:pointer;border:1px solid " +
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
    dayBars: days.map((x) => ({
      key: dayKey(x.d),
      title: x.d.toDateString() + ": " + x.n,
      style:
        "flex:1;background:" +
        (x.n ? "var(--color-accent)" : "var(--color-neutral-200)") +
        ";height:" +
        Math.max(3, Math.round((x.n / peak) * 100)) +
        "%",
    })),
    barsFrom: shortDate(days[0].d),

    paceHeadline: memorized >= goal ? "All of them. Well done." : perWeek + " a week from here",
    paceBody:
      memorized >= goal
        ? "Every passage is committed. Keep reviewing so they stay that way."
        : "You have " +
          (goal - memorized) +
          " passages left and " +
          daysLeft +
          " days. That is about " +
          perWeek +
          " newly committed each week, plus review of what you already hold.",
  };
}
