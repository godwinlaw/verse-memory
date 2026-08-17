/* How the app works, in the member's terms.
 *
 * Two ideas carry the whole thing — what commits a verse, and freshness — and a
 * member meets one of the setup screens before their first sitting either way.
 * Both explanations are built here, once, so they cannot drift apart, and the
 * numbers are read off the model rather than written out, so retuning srs.js
 * retunes the explanation with it.
 *
 * The two are not both shown everywhere. Review-setup carries the freshness
 * explainer; learn-setup deliberately does not, because a member committing a
 * passage for the first time has no use for a percentage that decays. Which
 * screen renders which is the view's call (see views/explainer.js). */

import { BLANK_LEVELS, SCRAMBLE_LEVELS } from "../blanks.js";
import { copy } from "../copy.js";
import { reviewSettings } from "../profile.js";
import { MODES } from "../review.js";
import { awardCeiling, freshColor, PEEK_COST } from "../srs.js";

export const points = (r) => Math.round(r * 100);

/* What one activity pays, quoted at its hardest setting — the one that earns its
 * full ceiling. The modes without a difficulty setting only have the one.
 *
 * Exported because the guide (viewmodel/guide.js) lists the same four activities
 * at length, and the two must not be able to quote different numbers. */
export function modeCeiling(mode) {
  const levels = { blanks: BLANK_LEVELS.length, scramble: SCRAMBLE_LEVELS.length };
  const level = (levels[mode] || 1) - 1;
  return points(awardCeiling({ mode, blankLevel: level, scrambleLevel: level }));
}

/* A freshness meter: the track a bar is drawn on, and the bar itself. */
const METER_TRACK = "flex:1;height:9px;background:var(--color-fresh-track);overflow:hidden";
const meterBar = (pct) => "height:100%;width:" + pct + "%;background:" + freshColor(pct);

export function explainerVals({ state, actions }) {
  const { dueFreshness, commitThreshold } = reviewSettings(state.profile);

  return {
    // Hidden by default on both setup screens; a member who opens it stays
    // opened until they collapse it again. One flag for both cards — they are
    // the same "How it works" explanation, just split across two screens.
    explainerOpen: state.explainerOpen,
    toggleExplainer: actions.toggleExplainer,

    freshnessTitle: copy.explainer.freshnessTitle,
    freshnessBody: copy.explainer.freshnessBody(dueFreshness),
    freshnessRules: MODES.map((m) => ({
      key: m.key,
      name: m.name,
      note: m.key === "flip" ? copy.explainer.ruleUnmarked : copy.explainer.ruleCeiling(modeCeiling(m.key)),
      meterStyle: METER_TRACK + ";max-width:120px",
      barStyle: meterBar(modeCeiling(m.key)),
    })),
    freshnessNotes: [
      copy.explainer.noteSubmitting,
      copy.explainer.noteDifficulty,
      copy.explainer.notePeek(points(PEEK_COST)),
    ],

    // The one rule that decides which half of the set a passage sits in, said
    // the same way wherever it is said.
    commitTitle: copy.explainer.commitTitle,
    commitBody: copy.explainer.commitBody(commitThreshold),
  };
}
