/* View-model for Today: what is due, and one press to review it.
 *
 * The board is the whole set at a glance. This screen is the opposite, built
 * for the daily visit, often on a phone: the date, what has come due, and a
 * single button that starts the sitting. It deals from the same reviewPool and
 * learnPool the board and the setup screens read (progress.js), so it can never
 * disagree with them about what is due; it only shows less.
 *
 * todayPlan is the pure half and is what test/today.test.mjs asserts. */

import { copy } from "../copy.js";
import { learnPool, reviewPool, streakOf, STATUS_LABEL } from "../progress.js";
import { reviewSettings } from "../profile.js";
import { freshColor } from "../srs.js";
import { dayKey } from "../text.js";
import { muted, statusTag } from "../ui/tokens.js";

/* What today asks for. `due` is every committed verse at or below the member's
 * threshold, stalest first; `sitting` is the ones the button takes, capped at
 * the member's queue size the way the board's queue is; `next` is the verse a
 * learn sitting would open with, offered when nothing is due. */
export function todayPlan({ passages, progress, dueFreshness, dueTopX, now = Date.now() }) {
  const due = reviewPool(passages, progress, dueFreshness, now);
  const learn = learnPool(passages, progress, now);
  return {
    due,
    sitting: due.slice(0, dueTopX).map((p) => p.id),
    next: learn[0] || null,
    committed: passages.length - learn.length,
  };
}

export function todayVals({ state, prog, actions, today = new Date() }) {
  const { dueTopX, dueFreshness } = reviewSettings(state.profile);
  const now = today.getTime();
  const plan = todayPlan({ passages: state.passages, progress: state.progress, dueFreshness, dueTopX, now });
  const hasDue = plan.due.length > 0;
  const reviewedToday = state.log[dayKey(today)] || 0;

  return {
    todayDateLabel: today.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }),
    todayHeadline: hasDue
      ? copy.today.headlineDue(plan.due.length)
      : plan.committed
        ? copy.today.headlineClear
        : copy.today.headlineNothingCommitted,
    todayBody: hasDue
      ? plan.due.length > plan.sitting.length
        ? copy.today.bodyDueCapped(plan.sitting.length, dueFreshness)
        : copy.today.bodyDue(dueFreshness)
      : plan.committed
        ? copy.today.bodyClear
        : copy.today.bodyNothingCommitted,

    // The one press. A sitting over what is due; with nothing due, the next
    // verse to learn, so the day is never a dead end.
    todayPrimaryLabel: hasDue
      ? copy.today.review(plan.sitting.length)
      : plan.next
        ? copy.today.learnNext(plan.next.ref)
        : copy.today.allDone,
    todayPrimary: hasDue
      ? () => actions.startReviewSession(plan.sitting)
      : plan.next
        ? () => actions.startLearnSession([plan.next.id])
        : () => actions.goto("board"),
    todayPrimaryDisabled: false,
    // And, beside it, the other half of the set when both are open.
    todaySecondaryLabel: hasDue && plan.next ? copy.today.learnNext(plan.next.ref) : "",
    todaySecondary: hasDue && plan.next ? () => actions.startLearnSession([plan.next.id]) : null,

    todayDue: plan.due.map((p, i) => {
      const fresh = prog.freshness(p.id);
      return {
        id: p.id,
        ref: p.ref,
        snippet: p.text.slice(0, 70),
        freshLabel: fresh + "%",
        freshStyle:
          "font-family:var(--font-heading);font-size:12px;font-weight:600;flex:none;color:" + freshColor(fresh),
        statusLabel: STATUS_LABEL[prog.statusOf(p.id)],
        tagStyle: statusTag(prog.statusOf(p.id)),
        style:
          "display:flex;align-items:center;gap:12px;padding:12px 16px;border:none;cursor:pointer;text-align:left;" +
          "font-family:var(--font-body);color:var(--color-text);--stagger-i:" +
          i +
          (i ? ";border-top:1px solid var(--color-divider)" : ""),
        onClick: () => actions.startReviewSession([p.id]),
      };
    }),
    todayDueTitle: copy.today.dueTitle,

    todayStats: [
      { key: "reviewed", label: copy.today.reviewed, value: String(reviewedToday) },
      { key: "streak", label: copy.today.streak, value: copy.today.streakDays(streakOf(state.log, today)) },
      { key: "committed", label: copy.today.committed, value: String(plan.committed) },
    ],
    todayStatStyle: `font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${muted(55)}`,
    todayNote: copy.today.note,
  };
}
