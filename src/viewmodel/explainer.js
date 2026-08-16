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
import { reviewSettings } from "../profile.js";
import { MODES } from "../review.js";
import { awardCeiling, COMMIT_SCORE, freshColor, PEEK_COST } from "../srs.js";

const points = (r) => Math.round(r * 100);

/* A freshness meter: the track a bar is drawn on, and the bar itself. */
const METER_TRACK = "flex:1;height:9px;background:var(--color-fresh-track);overflow:hidden";
const meterBar = (pct) => "height:100%;width:" + pct + "%;background:" + freshColor(pct);

export function explainerVals({ state }) {
  const { dueFreshness } = reviewSettings(state.profile);

  // Quoted at each mode's hardest setting, which is the one that pays its full
  // ceiling; the modes without a difficulty setting only have the one.
  const levels = { blanks: BLANK_LEVELS.length, scramble: SCRAMBLE_LEVELS.length };
  const ceilingOf = (mode) => {
    const level = (levels[mode] || 1) - 1;
    return points(awardCeiling({ mode, blankLevel: level, scrambleLevel: level }));
  };

  return {
    freshnessTitle: "How freshness works",
    freshnessBody:
      "Every passage carries a freshness — how much of it you would still recall right now. It falls a little " +
      "every day along a forgetting curve, fast at first and then more slowly the better you know it. Once a " +
      "committed passage has faded to " +
      dueFreshness +
      "% it comes back round to you, most faded first. (That mark is yours to set, on your profile.)",
    freshnessRules: MODES.map((m) => ({
      key: m.key,
      name: m.name,
      note:
        m.key === "flip"
          ? "Unmarked — nothing to grade, so it counts as reviewed in full, but builds the least lasting memory."
          : "Up to " + ceilingOf(m.key) + "%, on a clean attempt.",
      meterStyle: METER_TRACK + ";max-width:120px",
      barStyle: meterBar(ceilingOf(m.key)),
    })),
    freshnessNotes: [
      "Submitting is what marks a passage: what you get right is what it earns.",
      "Harder settings pay more — the finest cut of phrases and the fullest set of blanks are worth the most.",
      "Each press of Peek costs " + points(PEEK_COST) + "%, so a passage you look up stays due sooner.",
    ],

    // The one rule that decides which half of the set a passage sits in, said
    // the same way wherever it is said.
    commitTitle: "What commits a passage",
    commitBody:
      "A passage is committed when you write the whole thing out from memory — " +
      points(COMMIT_SCORE) +
      "% of the words right, with the first-letter scaffold off and without peeking. " +
      "Take as many attempts as you like; only the one you get right counts, and none of them cost you anything.",
  };
}
