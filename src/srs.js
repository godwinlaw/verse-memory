/* Spaced-repetition scheduling — the "freshness" (forgetting curve) model.
 *
 * Each verse has a "freshness" = retrievability R = e^(−t/S), the Ebbinghaus
 * forgetting curve: t is days since the last review, S is the memory's stability
 * (in days). Reviewing raises S (FSRS/DSR model) so the curve decays more slowly
 * afterward. Different activities raise S by different amounts — free recall
 * (writing it all out) builds more durable memory than cued recall (fill the
 * blanks) than recognition (reorder / flashcard). All constants are tunable
 * starting points informed by the spaced-repetition literature, not fitted data.
 *
 * Everything here is a pure function of a progress record + the current time, so
 * it is trivial to unit-test and reason about independently of React state. */

const DAY_MS = 86400000;

export const S0 = 1.0;            // initial stability (days) after the first clean review
export const GROWTH_BASE = 2.2;   // baseline stability growth per success (~SM-2/FSRS 2–2.5x)
export const TARGET_R = 0.90;     // a verse is "due" once retrievability falls to this
export const FADING_R = 0.60;     // a committed verse shows the "Fading" tag below this
export const SPACING_MAX = 1.0;   // max extra stability gain from the spacing effect (R low)

// Testing effect: free recall > cued recall > recognition.
export const ACTIVITY_MULT = { type: 1.30, blanks: 1.00, scramble: 0.80, flip: 0.80 };
export const BLANK_MULT = { 0: 0.85, 1: 1.00, 2: 1.15 }; // light / medium / full blanks

/* Stability to seed when a verse is marked committed by hand (rather than
 * earned through reviews), so it doesn't immediately read as 0% fresh. */
export const SEED_STABILITY = S0 * GROWTH_BASE;

/* Normalize a stored progress record, back-filling a stability for legacy
 * records (hits/status/last only) consistent with how many clean reviews the
 * verse already had. Returns a fresh default for an unseen verse. */
export function migrate(raw) {
  if (!raw) return { hits: 0, status: "new", last: null, stability: 0 };
  if (raw.stability == null)
    return { ...raw, stability: raw.hits > 0 ? S0 * Math.pow(GROWTH_BASE, raw.hits - 1) : 0 };
  return raw;
}

/* Retrievability R ∈ [0, 1] — the Ebbinghaus curve for a (migrated) record. */
export function retrievability(rec, now = Date.now()) {
  if (!rec.last || !rec.stability) return 0;
  return Math.exp(-((now - rec.last) / DAY_MS) / rec.stability);
}

/* Whole-number freshness (0–100) for display. */
export function freshness(rec, now = Date.now()) {
  return Math.round(retrievability(rec, now) * 100);
}

/* A verse is due if it has never been reviewed or has decayed past TARGET_R. */
export function isDue(rec, now = Date.now()) {
  return !rec.last || retrievability(rec, now) < TARGET_R;
}

/* Stability after a completed review. Driven by the act of reviewing alone —
 * no self-report. The activity and its measured performance decide how much
 * stability is gained, and a spacing bonus rewards reviewing when nearly
 * forgotten. `ctx` is { mode, blankLevel, score }. */
export function nextStability(prev, ctx, now = Date.now()) {
  const R = retrievability(prev, now);
  const spacingBoost = 1 + SPACING_MAX * (1 - R);          // bigger gain when nearly forgotten
  let act = ACTIVITY_MULT[ctx && ctx.mode] || 1.0;         // testing-effect hierarchy
  if (ctx && ctx.mode === "blanks") act *= BLANK_MULT[ctx.blankLevel] != null ? BLANK_MULT[ctx.blankLevel] : 1.0;
  if (ctx && ctx.mode === "type" && typeof ctx.score === "number") act *= 0.5 + ctx.score; // 100% → ×1.5
  const base = prev.stability > 0 ? prev.stability : S0;
  return base * (1 + (GROWTH_BASE - 1) * act * spacingBoost);
}

/* Continuous freshness colour: red (0%) → amber → green (100%), per the design. */
const freshHue = (pct) => Math.round(pct * 1.3); // 0 → hue 0 (red), 100 → hue 130 (green)
export const freshColor = (pct) => "hsl(" + freshHue(pct) + ",55%,45%)";
export const freshBar = (pct) =>
  "height:6px;border-radius:3px;background:var(--color-fresh-track);" +
  "background-image:linear-gradient(90deg," + freshColor(pct) + " " + pct + "%,transparent " + pct + "%)";
