/* View-model for the board: the hero stats, today's queue, the mode cards, the
 * whole-set map, and the activity chart. */

import { dayKey } from "../text.js";
import { freshColor } from "../srs.js";
import { dueOrder, streakOf, REVIEWS_TO_COMMIT, STATUS_LABEL } from "../progress.js";
import { ACTIVITY_DAYS, DUE_PREVIEW_ROWS, MODES } from "../review.js";
import { muted, statusTag } from "../ui/tokens.js";

/* One cell of the 2×2 hero stat grid; the outer edges drop their rules. */
const HERO_CELL =
  "padding:22px 24px;display:flex;flex-direction:column;gap:6px;" +
  "border-bottom:1px solid rgba(242,242,243,.25);border-right:1px solid rgba(242,242,243,.25)";

/* Floor for the activity chart's y-axis, so a couple of reviews on a quiet week
 * don't render as a full-height bar. */
const MIN_CHART_PEAK = 4;

/* The pace copy spells its number out; keep the prose in step with the constant
 * rather than hard-coding "three" next to a 3 that can change. */
const NUMBER_WORD = ["zero", "one", "two", "three", "four", "five"];

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

export function boardVals({ state, totals, prog, actions, today = new Date() }) {
  const { goal, memorized, pct, daysLeft, perWeek, deadline } = totals;

  // Prefer passages that are actually due; if none are, fall back to the
  // stalest few so the board is never empty.
  const ranked = dueOrder(state.passages, state.progress);
  const dueNow = ranked.filter((p) => prog.isDue(p.id));
  const due = (dueNow.length ? dueNow : ranked).slice(0, DUE_PREVIEW_ROWS);

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

    dueCount: due.length,
    queue: due.map((p, i) => {
      const status = prog.statusOf(p.id);
      const reviewed = prog.isReviewed(p.id);
      return {
        id: p.id,
        num: String(p.id).padStart(3, "0"),
        ref: p.ref,
        snippet: p.text.slice(0, 90),
        statusLabel: STATUS_LABEL[status],
        tagStyle: statusTag(status),
        freshLabel: reviewed ? prog.freshness(p.id) + "%" : "new",
        freshStyle:
          "font-family:var(--font-heading);font-size:12px;font-weight:600;width:44px;flex:none;text-align:right;color:" +
          (reviewed ? freshColor(prog.freshness(p.id)) : muted(45)),
        style:
          "display:flex;align-items:center;gap:14px;padding:13px 18px;background:transparent;border:none;cursor:pointer;font-family:var(--font-body);color:var(--color-text)" +
          (i ? ";border-top:1px solid var(--color-divider)" : ""),
        onClick: () => actions.startSession(undefined, [p.id]),
      };
    }),

    modes: MODES.map((m, i) => ({ ...m, index: "0" + (i + 1), onClick: () => actions.startSession(m.key) })),

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
          " newly committed each week, plus review of what you already hold. A passage counts as committed after " +
          NUMBER_WORD[REVIEWS_TO_COMMIT] +
          " clean reviews.",
  };
}
