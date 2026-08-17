/* Spaced-repetition scheduling — the "freshness" (forgetting curve) model.
 *
 * Each verse has a "freshness" = retrievability R = e^(−t/S), the Ebbinghaus
 * forgetting curve: t is days since the last review, S is the memory's stability
 * (in days). Reviewing raises S (FSRS/DSR model) so the curve decays more slowly
 * afterward. Different activities raise S by different amounts — free recall
 * (writing it all out) builds more durable memory than cued recall (fill the
 * blanks) than recognition (reorder / flashcard).
 *
 * The same hierarchy decides where on the curve a finished card lands: an
 * activity pays a ceiling of freshness, the attempt's mark and every peek take
 * from it, and the verse is dated back to what is left (see reviewAward and
 * backdatedLast). All constants are tunable starting points informed by the
 * spaced-repetition literature, not fitted data.
 *
 * Everything here is a pure function of a progress record + the current time, so
 * it is trivial to unit-test and reason about independently of React state. */

const DAY_MS = 86400000;

export const S0 = 1.0; // initial stability (days) after the first clean review
export const GROWTH_BASE = 2.2; // baseline stability growth per success (~SM-2/FSRS 2–2.5x)
export const TARGET_R = 0.9; // a verse is "due" once retrievability falls to this
export const FADING_R = 0.6; // a committed verse shows the "Fading" tag below this
export const SPACING_MAX = 1.0; // max extra stability gain from the spacing effect (R low)

// Testing effect: free recall > cued recall > recognition.
export const ACTIVITY_MULT = { type: 1.3, blanks: 1.0, scramble: 0.8, flip: 0.8 };
export const BLANK_MULT = { 0: 0.85, 1: 1.0, 2: 1.15 }; // light / medium / full blanks
export const SCRAMBLE_MULT = { 0: 0.85, 1: 1.0, 2: 1.15 }; // coarse / medium / fine phrases

/* Floor on the freshness a graded attempt can leave behind, so a zero score
 * backdates a verse by a finite amount rather than by ln(1/0) days. */
export const R_FLOOR = 0.05;

const clampR = (r) => Math.max(R_FLOOR, Math.min(1, r));

/* Normalize a stored progress record, back-filling a stability for legacy
 * records (hits/status/last only) consistent with how many clean reviews the
 * verse already had. Returns a fresh default for an unseen verse. */
export function migrate(raw) {
  if (!raw) return { hits: 0, status: "new", last: null, stability: 0 };
  if (raw.stability == null) return { ...raw, stability: raw.hits > 0 ? S0 * Math.pow(GROWTH_BASE, raw.hits - 1) : 0 };
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

/* Stability after a completed review. Driven by what the member did — no
 * self-report. The activity, its difficulty setting, and the mark the attempt
 * earned decide how much stability is gained, and a spacing bonus rewards
 * reviewing when nearly forgotten. `ctx` is a review context (see below). */
export function nextStability(prev, ctx, now = Date.now()) {
  const c = ctx || {};
  const R = retrievability(prev, now);
  const spacingBoost = 1 + SPACING_MAX * (1 - R); // bigger gain when nearly forgotten
  let act = ACTIVITY_MULT[c.mode] || 1.0; // testing-effect hierarchy
  if (c.mode === "blanks") act *= BLANK_MULT[c.blankLevel] != null ? BLANK_MULT[c.blankLevel] : 1.0;
  if (c.mode === "scramble") act *= SCRAMBLE_MULT[c.scrambleLevel] != null ? SCRAMBLE_MULT[c.scrambleLevel] : 1.0;
  if (typeof c.score === "number") act *= 0.5 + Math.max(0, Math.min(1, c.score)); // 100% → ×1.5
  const base = prev.stability > 0 ? prev.stability : S0;
  return base * (1 + (GROWTH_BASE - 1) * act * spacingBoost);
}

/* ── what a card is worth ─────────────────────────────────────────────────── */

/* Finishing a card no longer just stamps the clock. Each activity is worth a
 * ceiling of freshness — writing the passage out from memory can leave it fully
 * fresh, putting shuffled phrases back cannot — and the attempt's own mark, its
 * difficulty setting, and every peek move the award below that ceiling. The
 * award is the freshness the verse is then dated to (see reviewedLast), so what
 * the member demonstrated is what the board shows.
 *
 * A review context is `{ mode, blankLevel, scrambleLevel, firstLetters, score,
 * peeks }` — the same object nextStability() reads. */

/* Ceiling per mode: free recall > cued recall > recognition. The flashcard is
 * unmarked — there is nothing to measure — so it stays the plain "I reviewed
 * it" stamp it has always been. */
export const MODE_AWARD = { type: 1.0, blanks: 0.95, scramble: 0.9, flip: 1.0 };

/* Difficulty setting, indexed like BLANK_LEVELS / SCRAMBLE_LEVELS: the finer the
 * cut and the more words blanked, the closer to the mode's ceiling it pays. */
export const LEVEL_AWARD = [0.92, 0.96, 1.0];

/* Typing first letters only is scaffolded recall, so it is worth less than
 * writing the passage out in full. */
export const FIRST_LETTER_AWARD = 0.92;

/* What one press of "Peek" costs, in freshness. Looking at the passage is
 * allowed, and often the right thing to do — it just isn't free. */
export const PEEK_COST = 0.05;

/* Freshness a completed card is worth, in [R_FLOOR, 1]. */
export function reviewAward(ctx = {}) {
  let award = MODE_AWARD[ctx.mode] != null ? MODE_AWARD[ctx.mode] : 1.0;
  if (ctx.mode === "blanks") award *= LEVEL_AWARD[ctx.blankLevel] != null ? LEVEL_AWARD[ctx.blankLevel] : 1.0;
  if (ctx.mode === "scramble") award *= LEVEL_AWARD[ctx.scrambleLevel] != null ? LEVEL_AWARD[ctx.scrambleLevel] : 1.0;
  if (ctx.mode === "type" && ctx.firstLetters) award *= FIRST_LETTER_AWARD;
  if (typeof ctx.score === "number") award *= Math.max(0, Math.min(1, ctx.score));
  return clampR(award - PEEK_COST * (ctx.peeks || 0));
}

/* The most a card can pay before the attempt is marked — what the member is
 * playing for, quoted by the session and by the setup screen's explainer. */
export const awardCeiling = (ctx = {}) => reviewAward({ ...ctx, score: 1, peeks: 0 });

/* ── committing a verse ───────────────────────────────────────────────────── */

/* One thing, and only this, commits a verse: writing the whole passage out from
 * memory. Not three reviews of any kind, not a hand-set flag — the member has to
 * produce the text.
 *
 * "From memory" is the whole point, so the bar is the unaided write-out: a
 * passage that had to be peeked at was read rather than recalled, and never
 * commits, in Learn or Review alike. The first-letter scaffold is narrower —
 * Learn is where an uncommitted verse is trying to become one, so a clean
 * write-out with the scaffold on still counts there. (Review never reaches
 * this rule over the scaffold in practice: every verse it offers is already
 * committed, so `App.record()` never needs commitsVerse to say so again.) Both
 * peeking and the scaffold still earn freshness through reviewAward() — the
 * scaffold just does not commit outside Learn.
 *
 * The mark is not held at a literal 100% because gradeWritten() matches word by
 * word: one dropped article would otherwise deny a passage the member plainly
 * knows. COMMIT_SCORE is the margin that buys, and the default bar — a member
 * can move their own (see profile.reviewSettings, threaded in as `threshold`
 * below), bounded to profile.MIN_COMMIT_THRESHOLD so the bar still means
 * recalling the passage rather than approximating it. */
export const COMMIT_SCORE = 0.95;

export function commitsVerse(ctx = {}, threshold = COMMIT_SCORE) {
  if (ctx.mode !== "type" || ctx.peeks) return false;
  if (ctx.firstLetters && ctx.sessionKind !== "learn") return false;
  return typeof ctx.score === "number" && ctx.score >= threshold;
}

/* ── tests ────────────────────────────────────────────────────────────────── */

/* Self study is ungraded — the act of reviewing is the whole signal, so every
 * mode can only ever raise stability. A test is graded, so it can go badly, and
 * these three constants are what let it. */

/* Score at which a tested verse holds its ground: above it stability grows, and
 * the better the score the more; below it stability shrinks. */
export const TEST_PASS = 0.6;

/* Fraction of stability a wholly blank answer leaves behind. A lapse costs
 * most of the interval but not all of it — the verse was learned once. */
export const TEST_LAPSE_KEEP = 0.35;

/* Floor on the freshness a test result can leave. Kept as its own name because
 * exam.js reasons in test terms; it is the shared R_FLOOR. */
export const TEST_R_FLOOR = R_FLOOR;

/* Stability after a graded test, continuous through TEST_PASS: exactly at the
 * pass mark the verse keeps the stability it had, a perfect score compounds it
 * like a strong free-recall review (with the same spacing bonus), and a blank
 * one leaves TEST_LAPSE_KEEP of it. */
export function testStability(prev, score, now = Date.now()) {
  const s = Math.max(0, Math.min(1, score));
  const base = prev.stability > 0 ? prev.stability : S0;
  if (s < TEST_PASS) return base * (TEST_LAPSE_KEEP + (1 - TEST_LAPSE_KEEP) * (s / TEST_PASS));
  const spacingBoost = 1 + SPACING_MAX * (1 - retrievability(prev, now));
  // 0 at the pass mark, 1 at a perfect score, scaled by the free-recall multiplier.
  const act = ACTIVITY_MULT.type * ((s - TEST_PASS) / (1 - TEST_PASS));
  return base * (1 + (GROWTH_BASE - 1) * act * spacingBoost);
}

/* When a graded verse should read as last reviewed.
 *
 * A verse is dated back to the point on its new forgetting curve that matches
 * what the member demonstrated: 55% leaves it reading 55% fresh, and it decays
 * on from there. Only a mode that pays a full award (the flashcard, and a
 * flawless unaided write-out) lands on `now` itself.
 *
 * These are the writes where `last` is not the moment of writing, which is why
 * such a record also carries an `updatedAt` — see the stamp
 * storage.mergeProgress reconciles on. */
export function backdatedLast(stability, r, now = Date.now()) {
  return now - stability * Math.log(1 / clampR(r)) * DAY_MS;
}

/* …after a test (exam.js), */
export const testedLast = backdatedLast;

/* …and after a self-study card, which is dated to the award it earned. */
export const reviewedLast = backdatedLast;

/* Continuous freshness colour: red (0%) → amber → green (100%), per the design. */
const freshHue = (pct) => Math.round(pct * 1.3); // 0 → hue 0 (red), 100 → hue 130 (green)
export const freshColor = (pct) => "hsl(" + freshHue(pct) + ",55%,45%)";
export const freshBar = (pct) =>
  "height:6px;border-radius:3px;background:var(--color-fresh-track);" +
  "background-image:linear-gradient(90deg," +
  freshColor(pct) +
  " " +
  pct +
  "%,transparent " +
  pct +
  "%)";
