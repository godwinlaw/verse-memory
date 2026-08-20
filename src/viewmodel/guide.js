/* The guide — how to get around the app, and why it is shaped the way it is.
 *
 * The two setup screens carry a short explanation each (see explainer.js); this
 * is the long form, and the one screen a member can be pointed at when they ask
 * "what am I looking at". It says the same things in the same words — the
 * ceilings, the commit bar, and the peek cost are read off srs.js here too, the
 * freshness demonstration runs the real curve rather than a drawn one, and the
 * schedule is srs.INTERVALS itself rather than a list typed out again, so a
 * retune of the model retunes the guide with it.
 *
 * The wording itself lives in copy.guide (src/copy.js), including the labels
 * inside the two diagrams and the sample passage they are drawn from: the view
 * owns geometry, copy.js owns words, and this owns the numbers that go into
 * them. */

import { copy } from "../copy.js";
import { reviewSettings } from "../profile.js";
import { MODES } from "../review.js";
import { ADVANCE_R, HOLD_R, INTERVALS, LAPSE_R, PEEK_COST, retrievability, stabilityFor } from "../srs.js";
import { modeCeiling, points } from "./explainer.js";

const DAY_MS = 86400000;

/* ── the freshness demonstration ──────────────────────────────────────────── */

/* Plot box, in the same 520×176 viewBox the view draws the axes in. */
const CURVE = { left: 46, right: 502, top: 18, bottom: 132, span: 30, steps: 60 };

/* Two verses at the same moment: one just learned, one practised a few times.
 * The point of the picture is the gap between them — reviewing does not top a
 * verse up, it flattens the curve the verse falls along.
 *
 * Both are rungs of the real ladder rather than chosen stabilities: the first
 * one (a day) and the one a member reaches after seven clean reviews (a
 * fortnight). The fortnight is picked because it crosses the due mark inside the
 * thirty days the plot spans, so dragging the slider actually flips the verdict
 * under it. */
const RUNG = { fresh: 0, held: 7 };
const STABILITY = { fresh: stabilityFor(RUNG.fresh), held: stabilityFor(RUNG.held) };

const curveX = (days) => CURVE.left + (days / CURVE.span) * (CURVE.right - CURVE.left);
const curveY = (r) => CURVE.bottom - r * (CURVE.bottom - CURVE.top);

/* Freshness of a verse of the given stability, `days` after it was reviewed.
 * Runs the model rather than the formula, so the drawing cannot drift from it.
 * Dated from a non-zero instant because retrievability() reads a falsy `last` as
 * "never reviewed" and returns 0 for it. */
const EPOCH = 86400000;
const rAt = (stability, days) => retrievability({ last: EPOCH, stability }, EPOCH + days * DAY_MS);

function curvePath(stability) {
  let d = "";
  for (let i = 0; i <= CURVE.steps; i++) {
    const day = (i / CURVE.steps) * CURVE.span;
    d += (i ? " L" : "M") + curveX(day).toFixed(1) + "," + curveY(rAt(stability, day)).toFixed(1);
  }
  return d;
}

const clampDays = (n) => Math.max(0, Math.min(CURVE.span, Math.round(Number(n) || 0)));

export function guideVals({ state, actions }) {
  const { dueFreshness, commitThreshold } = reviewSettings(state.profile);
  const days = clampDays(state.guideDays);

  const held = Math.round(rAt(STABILITY.held, days) * 100);
  const fresh = Math.round(rAt(STABILITY.fresh, days) * 100);
  // Where the held curve crosses the member's mark — how long that verse is left
  // alone before the app asks for it again.
  const holdsFor = Math.round(STABILITY.held * Math.log(100 / dueFreshness));
  const dayLabel = copy.guide.dayLabel(days);

  return {
    guideKicker: copy.guide.kicker,
    guideTitle: copy.guide.title,
    guideLead: copy.guide.lead,

    // ── what commits a verse ──────────────────────────────────────────────
    guideCommitTitle: copy.guide.commitTitle,
    guideCommitBody: copy.guide.commitBody(commitThreshold),
    guideCommitFrom: copy.guide.commitFrom,
    guideCommitFromNote: copy.guide.commitFromNote,
    guideCommitTo: copy.guide.commitTo,
    guideCommitToNote: copy.guide.commitToNote,
    guideCommitStamp: copy.guide.commitStamp,
    guideCommitFoot: copy.guide.commitFoot,

    // ── freshness ─────────────────────────────────────────────────────────
    guideFreshTitle: copy.guide.freshTitle,
    guideFreshNote: copy.guide.freshNote,
    guideFreshBody: copy.guide.freshBody(dueFreshness),
    guideDays: days,
    guideDaysMax: CURVE.span,
    guideDaysLabel: dayLabel,
    guideDaysPrompt: copy.guide.daysPrompt,
    setGuideDays: (value) => actions.setGuideDays(clampDays(value)),
    guideCurves: [
      {
        key: "held",
        label: copy.guide.curveHeld,
        d: curvePath(STABILITY.held),
        pct: held,
        cx: curveX(days).toFixed(1),
        cy: curveY(rAt(STABILITY.held, days)).toFixed(1),
        strong: true,
      },
      {
        key: "fresh",
        label: copy.guide.curveFresh,
        d: curvePath(STABILITY.fresh),
        pct: fresh,
        cx: curveX(days).toFixed(1),
        cy: curveY(rAt(STABILITY.fresh, days)).toFixed(1),
        strong: false,
      },
    ],
    guideMarkLabel: copy.guide.markLabel(dueFreshness),
    guideMarkY: curveY(dueFreshness / 100).toFixed(1),
    guidePlot: { left: CURVE.left, right: CURVE.right, top: CURVE.top, bottom: CURVE.bottom },
    guideAxis: [0, 10, 20, 30].map((d) => ({
      day: d,
      x: curveX(d).toFixed(1),
      label: d === 0 ? copy.guide.axisToday : copy.guide.axisDay(d),
    })),
    guideCurveAria: copy.guide.curveAria(dayLabel, held, fresh),
    guideFreshVerdict: held > dueFreshness ? copy.guide.freshVerdictAbove : copy.guide.freshVerdictBelow,
    guideFreshFoot: copy.guide.freshFoot(holdsFor),

    // ── the schedule ──────────────────────────────────────────────────────
    guideLadderTitle: copy.guide.ladderTitle,
    guideLadderNote: copy.guide.ladderNote,
    guideLadderBody: copy.guide.ladderBody(INTERVALS[0], INTERVALS[1]),
    // The ladder itself, not a list typed out beside it — retune INTERVALS and
    // this drawing retunes with it.
    // `weight` is the gap drawn to scale, compressed by a power so a year and a
    // day fit the same strip and no two rungs read as the same length. The point
    // is that the steps widen, not their exact ratio — a plain log flattens the
    // top half into seven bars of one size, which reads as a fault.
    guideRungs: INTERVALS.map((days, i) => ({
      key: i,
      index: i,
      label: copy.guide.rungLabel(days),
      weight: Math.round(Math.pow(days / INTERVALS[INTERVALS.length - 1], 0.35) * 100),
    })),
    guideRungsAria: copy.guide.rungsAria(INTERVALS.length, copy.guide.rungLabel(INTERVALS[INTERVALS.length - 1])),
    // The four bands of srs.nextStep, in the member's terms. The bands are read
    // off the model rather than written out, so moving a hinge moves the words.
    guideLadderRules: [
      {
        key: "advance",
        dir: "up",
        when: copy.guide.ruleAdvanceWhen(points(ADVANCE_R)),
        then: copy.guide.ruleAdvanceThen,
      },
      {
        key: "hold",
        dir: "same",
        when: copy.guide.ruleHoldWhen(points(HOLD_R), points(ADVANCE_R) - 1),
        then: copy.guide.ruleHoldThen,
      },
      {
        key: "back",
        dir: "down",
        when: copy.guide.ruleBackWhen(points(LAPSE_R), points(HOLD_R) - 1),
        then: copy.guide.ruleBackThen,
      },
      { key: "reset", dir: "reset", when: copy.guide.ruleResetWhen(points(LAPSE_R)), then: copy.guide.ruleResetThen },
    ],
    guideLadderFoot: copy.guide.ladderFoot(points(PEEK_COST)),

    // ── the four activities ───────────────────────────────────────────────
    guideActivityTitle: copy.guide.activityTitle,
    guideActivityNote: copy.guide.activityNote,
    guideActivities: MODES.map((m) => ({
      key: m.key,
      name: m.name,
      desc: m.desc,
      pays: m.key === "flip" ? copy.guide.activityUnmarked : copy.guide.activityPays(modeCeiling(m.key)),
      commits: m.key === "type",
    })),
    guideSample: copy.guide.sample,
    guideCommitsFlag: copy.guide.commitsFlag,

    // ── start ─────────────────────────────────────────────────────────────
    guideStart: copy.guide.start,
    guideStartLearning: () => actions.goto("learn-setup"),
  };
}
