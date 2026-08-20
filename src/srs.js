/* Spaced-repetition scheduling — the "freshness" (forgetting curve) model.
 *
 * Each verse has a "freshness" = retrievability R = e^(−t/S), the Ebbinghaus
 * forgetting curve: t is days since the last review, S is the memory's stability
 * (in days). Reviewing raises S, so the curve decays more slowly afterward.
 *
 * What is *not* a free-running product is how much S rises. S is read off a
 * fixed ladder of intervals — a day, two days, three, … a week, a fortnight, a
 * month, and on out to a year — and a review moves the verse one rung along it.
 * That is deliberate, and it replaced a multiplicative (FSRS-shaped) model that
 * compounded about 3.9× a review: three good reviews put a verse out of sight
 * for a month and five put it away for a year and a half, so the app never
 * asked for the next-day review that is what actually makes a verse stick.
 *
 * The same hierarchy that decides how much a card is worth decides whether it
 * moves the verse along: an activity pays a ceiling of freshness, the attempt's
 * mark and every peek take from it, and that one figure is both the freshness
 * the verse is dated to (see reviewAward and backdatedLast) and the evidence
 * the ladder is moved on (see nextStep). All constants are tunable starting
 * points informed by the spaced-repetition literature, not fitted data.
 *
 * Everything here is a pure function of a progress record + the current time, so
 * it is trivial to unit-test and reason about independently of React state. */

const DAY_MS = 86400000;

/* ── the ladder ───────────────────────────────────────────────────────────── */

/* Days between reviews, rung by rung: daily, out to a week a day at a time,
 * then a fortnight, three weeks, a month, and month by month to a year. A verse
 * advances one rung per clean review and falls back on a poor one, so the gap
 * widens quickly at the start — where forgetting is steepest — and then more and
 * more slowly, which is the whole shape the model is trying to have. */
export const INTERVALS = [1, 2, 3, 4, 5, 6, 7, 14, 21, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 365];

export const MAX_STEP = INTERVALS.length - 1;
export const clampStep = (step) => Math.max(0, Math.min(MAX_STEP, Math.round(Number(step) || 0)));

/* The freshness a verse is meant to read at when its interval runs out — the
 * point the app asks for it back. It is `profile.DEFAULT_DUE_FRESHNESS` written
 * as a ratio, and it is deliberately the default rather than the member's own
 * setting: srs.js knows nothing about a profile, and a member who moves their
 * threshold is scaling the whole ladder, which is a coherent thing for that
 * knob to mean. */
export const DUE_R = 0.75;
const LADDER_K = Math.log(1 / DUE_R); // ≈ 0.2877

/* Days a verse on this rung is left alone for. */
export const intervalFor = (step) => INTERVALS[clampStep(step)];

/* Stability for a rung: chosen so the verse reads exactly at DUE_R when the
 * interval runs out. Rung 0 is a day, so a verse committed today is at 75%
 * tomorrow and back on the review list; rung 6 is a week, reading 96% the next
 * day and 75% on the seventh. */
export const stabilityFor = (step) => intervalFor(step) / LADDER_K;

/* The rung whose interval is nearest a loose stability — how a record written
 * by the old multiplicative model finds its place on the ladder. */
export function stepNear(stability) {
  const days = (Number(stability) || 0) * LADDER_K;
  let best = 0;
  for (let i = 1; i < INTERVALS.length; i++) {
    if (Math.abs(INTERVALS[i] - days) < Math.abs(INTERVALS[best] - days)) best = i;
  }
  return best;
}

/* Floor on the freshness a graded attempt can leave behind, so a zero score
 * backdates a verse by a finite amount rather than by ln(1/0) days. */
export const R_FLOOR = 0.05;

const clampR = (r) => Math.max(R_FLOOR, Math.min(1, r));

/* Normalize a stored progress record, placing a legacy one (hits/status/last,
 * with or without a loose stability) on the ladder. Returns a fresh default for
 * an unseen verse.
 *
 * The rung is the nearer of two readings: where the record's own stability puts
 * it, and how many reviews it has actually had. The second is the cap that
 * matters — the model this replaced let stability run away, so a verse reviewed
 * three times could be carrying a hundred-day interval it never earned, and
 * taking `hits` as the ceiling walks those back onto the ladder. That is a
 * one-time correction rather than a preservation: a member with verses parked on
 * long intervals will see a batch of them come due, which is the point. */
export function migrate(raw) {
  if (!raw) return { hits: 0, status: "new", last: null, stability: 0, step: 0 };
  if (raw.step != null) return raw;
  const step = Math.min(stepNear(raw.stability), Math.max(0, (raw.hits || 1) - 1));
  return { ...raw, step, stability: raw.last ? stabilityFor(step) : 0 };
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

/* ── moving along the ladder ──────────────────────────────────────────────── */

/* The three hinges. A card is worth what reviewAward() says it is worth — the
 * activity's ceiling, its difficulty setting and the mark, less a peek's cost —
 * and that one figure decides which way the verse moves.
 *
 * They are set where they are so that the hierarchy already in MODE_AWARD does
 * the work without a second table beside it: a perfect write-out advances, and
 * still advances through two peeks but not three; blanks at medium (0.95 × 0.96)
 * advances; order-the-phrases at its coarsest (0.9 × 0.92) holds the rung it has
 * but can never lengthen it. Peeking buys freshness and costs the rung, which is
 * the honest reading of a peek. */
export const ADVANCE_R = 0.9; // clean enough to earn a longer interval
export const HOLD_R = 0.6; // good enough to keep the interval it has
export const LAPSE_R = 0.3; // below this the verse was not recalled at all

/* Activities that measure nothing. The flashcard is the only one, and it is why
 * nextStep takes a mode at all: turning a card over says the member reviewed the
 * verse and nothing more, so it pays a full freshness award (MODE_AWARD.flip)
 * but can never be the evidence that earns a longer interval. Without this a
 * member could click through flashcards until a verse was on a two-month rung.
 * It is the same argument that already gives the flashcard no Submit button. */
export const UNMARKED_MODES = new Set(["flip"]);

/* The rung a verse lands on after a graded card.
 *
 * `award` is what the attempt was worth: reviewAward() for a session card, the
 * mark itself for a test paper — a test is marked throughout, so it has no
 * unmarked mode to pass. A verse that has never been reviewed starts at the
 * first rung whatever it scored, because there is no interval yet to lengthen
 * or lose. */
export function nextStep(prev, award, mode) {
  if (!prev.last) return 0;
  const step = clampStep(prev.step);
  if (UNMARKED_MODES.has(mode)) return step;
  if (award >= ADVANCE_R) return clampStep(step + 1);
  if (award >= HOLD_R) return step;
  if (award >= LAPSE_R) return clampStep(step - 1);
  return 0; // forgotten outright — the schedule starts again
}

/* ── what a card is worth ─────────────────────────────────────────────────── */

/* Finishing a card no longer just stamps the clock. Each activity is worth a
 * ceiling of freshness — writing the passage out from memory can leave it fully
 * fresh, putting shuffled phrases back cannot — and the attempt's own mark, its
 * difficulty setting, and every peek move the award below that ceiling. The
 * award is the freshness the verse is then dated to (see reviewedLast) and the
 * figure the ladder moves on (see nextStep), so what the member demonstrated is
 * both what the board shows and when they will see the verse again.
 *
 * A review context is `{ mode, blankLevel, scrambleLevel, firstLetters, score,
 * peeks }` — the same object nextStep() is handed the mode from. */

/* Ceiling per mode: free recall > cued recall > recognition. The flashcard is
 * unmarked — there is nothing to measure — so it stays the plain "I reviewed
 * it" stamp it has always been, and holds its rung (see UNMARKED_MODES). */
export const MODE_AWARD = { type: 1.0, blanks: 0.95, scramble: 0.9, flip: 1.0 };

/* Difficulty setting, indexed like BLANK_LEVELS / SCRAMBLE_LEVELS: the finer the
 * cut and the more words blanked, the closer to the mode's ceiling it pays.
 *
 * The fourth entry is the blanks list's alternating level, which has no
 * counterpart in SCRAMBLE_LEVELS and is never reached by a scramble card. It
 * pays the mode's full ceiling because it is at least as hard as blanking every
 * key word: half the passage is gone, and the member cannot lean on the little
 * words that the keyword levels always leave standing. Deliberately not left to
 * the `!= null` fallback below — a difficulty that pays full marks should say so
 * here rather than by omission. */
export const LEVEL_AWARD = [0.92, 0.96, 1.0, 1.0];

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

/* Self study is ungraded in the sense that the member never says how it went —
 * but every card is marked, so a session can send a verse backwards down the
 * ladder just as a test can. What separates a test is only that its paper is
 * marked as a whole, and that a pass is named: `TEST_PASS` is the same hinge as
 * HOLD_R, so "did well enough to keep the interval" and "passed" are one bar
 * rather than two that could drift apart. */
export const TEST_PASS = HOLD_R;

/* Floor on the freshness a test result can leave. Kept as its own name because
 * exam.js reasons in test terms; it is the shared R_FLOOR. */
export const TEST_R_FLOOR = R_FLOOR;

/* When a graded verse should read as last reviewed.
 *
 * A verse is dated back to the point on its new forgetting curve that matches
 * what the member demonstrated: 55% leaves it reading 55% fresh, and it decays
 * on from there. Only a mode that pays a full award (the flashcard, and a
 * flawless unaided write-out) lands on `now` itself — so an attempt that just
 * clears the bar earns the longer interval and still starts a little way down
 * it, and comes back sooner than a flawless one would.
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

/* A committed verse shows the "Fading" tag below this. */
export const FADING_R = 0.6;

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
