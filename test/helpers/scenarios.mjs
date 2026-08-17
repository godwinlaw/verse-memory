/* Representative UI states, shared by the render tests.
 *
 * Each scenario is a plain `{ name, props, state }` that can be pushed straight
 * into an App instance — no store, no mounting. Together they cover every view
 * and every review mode, so a render pass over all of them exercises the whole
 * template layer. Keep them deterministic: fixed timestamps only, no Date.now().
 */

import { passages } from "../../data/passages.js";
import { applyExam, buildExam, DEFAULT_SETUP, normalizeSetup, scoreExam } from "../../src/exam.js";

/* 2026-08-15T12:00:00Z — matches freezeClock()'s default so freshness values are
 * stable. Offsets are expressed in days before that instant. */
export const NOW = new Date("2026-08-15T12:00:00.000Z").getTime();
const daysAgo = (n) => NOW - n * 86400000;

export const PROFILE = {
  name: "Ada Lovelace",
  ministryGroup: "Kairos",
  gender: "Female",
  gradClass: 2026,
  updatedAt: daysAgo(30),
};

/* A progress map spanning all three statuses and a range of freshness, so the
 * board's colour/fade logic and the list's "Fading" tag both get exercised. */
function progressFixture() {
  return {
    1: { hits: 5, status: "memorized", last: daysAgo(0.2), stability: 12 }, // very fresh
    2: { hits: 4, status: "memorized", last: daysAgo(9), stability: 8 }, // fading
    3: { hits: 3, status: "memorized", last: daysAgo(40), stability: 6 }, // stale
    4: { hits: 2, status: "learning", last: daysAgo(3), stability: 2.2 },
    5: { hits: 1, status: "learning", last: daysAgo(1), stability: 1 },
    6: { hits: 2, status: "learning", last: daysAgo(0.5) }, // legacy: no stability
  };
}

const LOG = {
  "2026-08-15": 6,
  "2026-08-14": 11,
  "2026-08-13": 4,
  "2026-08-11": 9,
  "2026-08-05": 2,
};

const PEERS = [
  { name: "Grace Hopper", count: 41, streak: 12, ministryGroup: "USF", gender: "Female", gradClass: 2025 },
  { name: "Alan Turing", count: 27, streak: 3, ministryGroup: "Kairos", gender: "Male", gradClass: 2026 },
  { name: "Katherine Johnson", count: 12, streak: 0, ministryGroup: "ECM", gender: "Female", gradClass: 2024 },
];

/* A microphone at rest. `supported: false` is a browser with no recognition at
 * all; the voice scenarios below override it. */
const quietVoice = (overrides = {}) => ({ supported: false, status: "off", error: null, tail: 0, ...overrides });

export const PROPS = {
  groupName: "Acts 2 Network - Berkeley",
  motto: "Every Member a Self Respecting Christian",
  deadline: "2026-10-31",
};

/* The state an App carries once local data has loaded and a member is signed in.
 * Individual scenarios override just the keys they care about. */
export function baseState(overrides = {}) {
  return {
    isMobile: false, // read on a computer; device/mobile is the scenario that is not
    loaded: true,
    splashHold: false, // the opening splash has had its minimum turn
    passages,
    view: "board",
    progress: progressFixture(),
    log: LOG,
    sessionKind: "review",
    mode: null,
    queue: [],
    qi: 0,
    results: {},
    reviewLeaveAsk: false,
    reviewMoveAsk: null,
    phase: "prompt",
    revealed: false,
    flipLetters: false,
    showHelp: false,
    peeks: 0,
    answers: {},
    blanksChecked: false,
    blankLevel: 1,
    blankHint: true,
    typed: "",
    typeGraded: false,
    typeFirstLetter: false,
    // No microphone in this suite, so the default is a browser that cannot
    // listen — the state App.js would be in on Firefox. The voice/* scenarios
    // below are what exercise one that can.
    voice: quietVoice(),
    scrambleOrder: [],
    scrambleWrong: -1,
    scrambleMisses: 0,
    scrambleLevel: 1,
    search: "",
    filter: "All",
    selection: [],
    sessionCount: 0,
    examSetup: DEFAULT_SETUP,
    exam: null,
    examIndex: 0,
    examAnswers: {},
    examPick: null,
    examLeaveAsk: false,
    examResult: null,
    peers: PEERS,
    auth: {
      status: "signed-in",
      user: { uid: "u1", email: "ada@acts2.network", name: "Ada Lovelace", photo: null },
    },
    profile: PROFILE,
    profileDraft: null,
    editingProfile: false,
    resetAsk: false,
    welcomePrompt: false,
    ministryOpen: false,
    leaderFilter: { group: "All", gender: "All", gradClass: "All" },
    reviewSetup: { manualSize: 10, manualFreshness: 90 },
    learnSetup: { size: 5 },
    explainerOpen: false,
    guideDays: 6,
    ...overrides,
  };
}

const reviewing = (overrides) => baseState({ view: "review", queue: [1, 2, 3], qi: 1, sessionCount: 1, ...overrides });

/* A learn session. Verses 4, 5 and 6 are the in-progress ones in the fixture,
 * so they are what a learn session would be handed; qi 1 puts verse 5 in front
 * of us, which is what `results` keys on. */
const learning = (overrides) =>
  baseState({ view: "review", sessionKind: "learn", queue: [4, 5, 6], qi: 1, sessionCount: 1, ...overrides });

/* Reciting, on a browser that can listen. Set on the recall activity of a learn
 * session, since that is the one sitting where giving the passage back aloud is
 * the whole errand. */
const listening = (voice, overrides) =>
  learning({ mode: "type", voice: quietVoice({ supported: true, ...voice }), ...overrides });

/* Every passage committed and fully fresh — nothing to review, nothing to
 * learn. Both empty states at once. */
const allCommitted = () =>
  Object.fromEntries(passages.map((p) => [p.id, { hits: 5, status: "memorized", last: daysAgo(0), stability: 30 }]));

/* One fixed paper, covering all four activities (ten verses dealt round-robin
 * over four activities reaches every one). The seed is fixed, so the questions —
 * and therefore the markup — are the same on every run. */
export const EXAM = buildExam({
  passages,
  progress: progressFixture(),
  setup: normalizeSetup({ ...DEFAULT_SETUP, size: 20 }),
  now: NOW,
  seed: 20260815,
});

export const questionAt = (kind) => EXAM.questions.findIndex((q) => q.kind === kind);

/* A part-finished paper: references named right, multiple choice guessed wrong,
 * sentences half written, one pair matched. Enough for the summary to show both
 * a tick and a cross, and both a verse that held and one that faded. */
const EXAM_ANSWERS = Object.fromEntries(
  EXAM.questions.map((q, i) => {
    if (q.kind === "name-ref") return [i, q.ref];
    if (q.kind === "pick-ref") return [i, q.options[0].key];
    if (q.kind === "finish") return [i, { text: q.answer.split(" ").slice(0, 3).join(" "), ref: q.ref }];
    if (q.kind === "match") return [i, { [q.verses[0].key]: q.verses[0].key }];
    if (q.kind === "scramble") return [i, [0, 1]];
    if (q.kind === "blanks") return [i, { [q.blanks[0]]: q.words[q.blanks[0]] }];
    return [i, q.text.split(" ").slice(0, 3).join(" ")]; // type
  }),
);

const scored = scoreExam(EXAM.questions, EXAM_ANSWERS);
const EXAM_RESULT = {
  ...scored,
  rows: applyExam({ progress: progressFixture(), results: scored.results, now: NOW }).rows,
};

/* A paper over committed verses only — the three with real history — sat badly.
 * Verse 1 goes into it nearly fully fresh, so this is the fixture where the
 * summary has a verse that came out faded. */
const COMMITTED_EXAM = buildExam({
  passages,
  progress: progressFixture(),
  setup: normalizeSetup({ ...DEFAULT_SETUP, committedOnly: true, activities: ["name-ref"] }),
  now: NOW,
  seed: 7,
});
const badly = scoreExam(COMMITTED_EXAM.questions, {});
const FADED_RESULT = {
  ...badly,
  rows: applyExam({ progress: progressFixture(), results: badly.results, now: NOW }).rows,
};

const testing = (kind, overrides) =>
  baseState({ view: "test", exam: EXAM, examIndex: questionAt(kind), examAnswers: EXAM_ANSWERS, ...overrides });

export const scenarios = [
  // ── the mobile gate ────────────────────────────────────────────────────────
  // The app on a phone: refused before the splash, whatever else is ready. The
  // second one is a member who was mid-boot when it was decided, which is what
  // the ordering in App.render is for.
  { name: "device/mobile", state: baseState({ isMobile: true }) },
  { name: "device/mobile-while-loading", state: baseState({ isMobile: true, loaded: false, splashHold: true }) },

  // ── the opening splash ─────────────────────────────────────────────────────
  // The two waits it covers, and the floor under both: local data still
  // loading, Firebase yet to say whether there is a session to restore, and
  // everything ready but the minimum hold still running.
  { name: "splash/loading-data", state: baseState({ loaded: false }) },
  { name: "splash/checking-session", state: baseState({ auth: { status: "loading" } }) },
  { name: "splash/holding", state: baseState({ splashHold: true }) },

  // ── auth gate ──────────────────────────────────────────────────────────────
  { name: "auth/signed-out", state: baseState({ auth: { status: "signed-out" } }) },
  { name: "auth/signing-in", state: baseState({ auth: { status: "signing-in" } }) },
  { name: "auth/denied", state: baseState({ auth: { status: "denied", reason: "x@gmail.com" } }) },
  {
    name: "auth/failed",
    state: baseState({ auth: { status: "signed-out", error: "sign-in-failed" } }),
  },

  // ── profile form ───────────────────────────────────────────────────────────
  { name: "profile/setup-empty", state: baseState({ profile: {} }) },
  {
    name: "profile/setup-partial",
    state: baseState({ profile: {}, profileDraft: { name: "Ada", ministryGroup: "Ka" }, ministryOpen: true }),
  },
  { name: "profile/edit", state: baseState({ editingProfile: true, profileDraft: { ...PROFILE } }) },
  // The warning that stands in front of wiping the record, and the same screen
  // for a member who has nothing to wipe (the button is dead there).
  {
    name: "profile/edit-reset-ask",
    state: baseState({ editingProfile: true, profileDraft: { ...PROFILE }, resetAsk: true }),
  },
  {
    name: "profile/edit-nothing-to-reset",
    state: baseState({ editingProfile: true, profileDraft: { ...PROFILE }, progress: {}, log: {} }),
  },

  // ── welcome prompt ─────────────────────────────────────────────────────────
  // Shown once, right after sign-up completes the profile form.
  { name: "welcome/after-signup", state: baseState({ welcomePrompt: true }) },

  // ── board ──────────────────────────────────────────────────────────────────
  { name: "board/populated", state: baseState() },
  // Nothing committed and nothing started: both queues are empty, for opposite
  // reasons, so both empty states render.
  { name: "board/fresh-account", state: baseState({ progress: {}, log: {}, peers: [] }) },
  { name: "board/all-committed", state: baseState({ progress: allCommitted() }) },

  // ── review setup ───────────────────────────────────────────────────────────
  // Verses 2 and 3 are committed and faded past the threshold, so they are due.
  { name: "review-setup/due", state: baseState({ view: "review-setup" }) },
  // Every verse committed & fully fresh → nothing due, so the manual controls
  // (how many committed verses, freshness ceiling) take over.
  {
    name: "review-setup/caught-up",
    state: baseState({
      view: "review-setup",
      progress: allCommitted(),
      reviewSetup: { manualSize: 10, manualFreshness: 100 },
    }),
  },
  // Nothing committed at all — there is no review to configure, so the screen
  // explains what commits a passage and points at a learn session instead.
  { name: "review-setup/nothing-committed", state: baseState({ view: "review-setup", progress: {} }) },
  // A member who has opened "How it works" this visit.
  { name: "review-setup/explainer-open", state: baseState({ view: "review-setup", explainerOpen: true }) },

  // ── learn setup ────────────────────────────────────────────────────────────
  { name: "learn-setup/default", state: baseState({ view: "learn-setup" }) },
  { name: "learn-setup/explainer-open", state: baseState({ view: "learn-setup", explainerOpen: true }) },
  { name: "learn-setup/all", state: baseState({ view: "learn-setup", learnSetup: { size: 0 } }) },
  { name: "learn-setup/nothing-left", state: baseState({ view: "learn-setup", progress: allCommitted() }) },

  // ── passage list ───────────────────────────────────────────────────────────
  { name: "list/all", state: baseState({ view: "list" }) },
  { name: "list/filtered-committed", state: baseState({ view: "list", filter: "Committed" }) },
  { name: "list/searched", state: baseState({ view: "list", search: "psalm" }) },
  { name: "list/no-matches", state: baseState({ view: "list", search: "zzzzz" }) },
  // Hand-picked sittings. The fixture commits 1–3 and leaves 4–6 in progress,
  // so these three cover a selection in one half, one straddling both, and one
  // holding a verse the current filter has hidden.
  { name: "list/selected-committed", state: baseState({ view: "list", selection: [1, 3] }) },
  { name: "list/selected-mixed", state: baseState({ view: "list", selection: [1, 4, 9] }) },
  {
    name: "list/selected-hidden",
    state: baseState({ view: "list", filter: "Committed", selection: [1, 9] }),
  },

  // ── review, one per mode ───────────────────────────────────────────────────
  { name: "review/flip-hidden", state: reviewing({ mode: "flip" }) },
  { name: "review/flip-letters", state: reviewing({ mode: "flip", flipLetters: true }) },
  { name: "review/flip-revealed", state: reviewing({ mode: "flip", revealed: true }) },
  { name: "review/blanks", state: reviewing({ mode: "blanks" }) },
  {
    name: "review/blanks-checked",
    state: reviewing({ mode: "blanks", blanksChecked: true, answers: { 2: "hear", 4: "wrong" }, blankLevel: 2 }),
  },
  { name: "review/blanks-no-hint", state: reviewing({ mode: "blanks", blankHint: false, blankLevel: 0 }) },
  { name: "review/type-empty", state: reviewing({ mode: "type" }) },
  {
    name: "review/type-graded",
    state: reviewing({ mode: "type", typed: "hear o israel the lord our god", typeGraded: true }),
  },
  // "O" is skipped outright and "Lord" is written as "load" — one miss with
  // nothing typed in its place, one with the wrong word right there.
  {
    name: "review/type-graded-mistakes",
    state: reviewing({ mode: "type", typed: "hear israel the load our god", typeGraded: true }),
  },
  {
    name: "review/type-first-letters",
    state: reviewing({ mode: "type", typeFirstLetter: true, typed: "h o i t l" }),
  },
  { name: "review/scramble", state: reviewing({ mode: "scramble" }) },
  {
    name: "review/scramble-partial",
    state: reviewing({
      mode: "scramble",
      scrambleOrder: [0, 1],
      scrambleWrong: 3,
      scrambleMisses: 2,
      scrambleLevel: 0,
    }),
  },
  { name: "review/peeking", state: reviewing({ mode: "blanks", showHelp: true, peeks: 2 }) },
  // qi 1 → the card in front of us is passage 2, which is what `results` keys on.
  {
    name: "review/submitted",
    state: reviewing({
      mode: "blanks",
      blanksChecked: true,
      answers: { 2: "hear" },
      results: { 2: { id: 2, mode: "blanks", score: 0.82, peeks: 1, before: 41, after: 73 } },
    }),
  },
  {
    name: "review/submitted-faded",
    state: reviewing({
      mode: "scramble",
      scrambleOrder: [0],
      scrambleMisses: 3,
      results: { 2: { id: 2, mode: "scramble", score: 0.3, peeks: 3, before: 88, after: 12 } },
    }),
  },
  { name: "review/first-card", state: reviewing({ mode: "blanks", qi: 0, sessionCount: 0 }) },
  { name: "review/last-card", state: reviewing({ mode: "flip", qi: 2 }) },
  { name: "review/leaving", state: reviewing({ mode: "type", reviewLeaveAsk: true }) },
  {
    name: "review/leaving-after-submitting",
    state: reviewing({
      mode: "type",
      reviewLeaveAsk: true,
      results: { 2: { id: 2, mode: "type", score: 1, peeks: 0, before: 41, after: 100 } },
    }),
  },
  { name: "review/moving-on-unsubmitted", state: reviewing({ mode: "type", reviewMoveAsk: "next" }) },
  { name: "review/going-back-unsubmitted", state: reviewing({ mode: "type", reviewMoveAsk: "prev" }) },

  // ── learn session: the same cards, told what commits the verse ─────────────
  // Writing it out is the activity that can commit, so the banner names the bar.
  { name: "learn/writing", state: learning({ mode: "type" }) },
  // Any other activity is practice, and the banner says so.
  { name: "learn/practising", state: learning({ mode: "blanks" }) },
  // First letters is a hint, so it cannot commit either.
  { name: "learn/scaffolded", state: learning({ mode: "type", typeFirstLetter: true, typed: "h o i" }) },
  // The moment the session exists for: a clean write-out, and the verse commits.
  {
    name: "learn/committed",
    state: learning({
      mode: "type",
      typed: "hear o israel the lord our god",
      typeGraded: true,
      progress: { ...progressFixture(), 5: { hits: 2, status: "memorized", last: NOW, stability: 4 } },
      results: { 5: { id: 5, mode: "type", score: 1, peeks: 0, before: 37, after: 100, committed: true } },
    }),
  },
  // An attempt that fell short — the retry offered right on the result strip.
  {
    name: "learn/not-committed",
    state: learning({
      mode: "type",
      typed: "hear o israel",
      typeGraded: true,
      results: { 5: { id: 5, mode: "type", score: 0.4, peeks: 0, before: 0, after: 40, committed: false } },
    }),
  },
  // A verse that has already been committed, met again in a later sitting.
  {
    name: "learn/already-committed",
    state: learning({
      mode: "type",
      progress: { ...progressFixture(), 5: { hits: 6, status: "memorized", last: daysAgo(2), stability: 9 } },
    }),
  },
  // The two dialogs, which are where a review session talks about freshness
  // most plainly — so the learn wording of both needs exercising.
  { name: "learn/moving-on-unsubmitted", state: learning({ mode: "type", reviewMoveAsk: "next" }) },
  { name: "learn/leaving", state: learning({ mode: "type", reviewLeaveAsk: true }) },
  {
    name: "learn/leaving-after-committing",
    state: learning({
      mode: "type",
      reviewLeaveAsk: true,
      results: { 4: { id: 4, mode: "type", score: 1, peeks: 0, before: 20, after: 100, committed: true } },
    }),
  },
  {
    name: "learn/done",
    state: baseState({
      view: "done",
      sessionKind: "learn",
      sessionCount: 3,
      results: {
        4: { id: 4, mode: "type", score: 1, peeks: 0, before: 20, after: 100, committed: true },
        5: { id: 5, mode: "blanks", score: 0.7, peeks: 0, before: 30, after: 66, committed: false },
      },
    }),
  },
  {
    name: "learn/done-nothing-committed",
    state: baseState({ view: "done", sessionKind: "learn", sessionCount: 2, results: {} }),
  },

  // ── reciting aloud ─────────────────────────────────────────────────────────
  // One switch on the recall card, so these are all learn/type. Every state it
  // can be in: nothing to listen with, off, waiting on the permission prompt,
  // listening with words landing in the box, and refused.
  { name: "voice/unsupported", state: learning({ mode: "type" }) },
  { name: "voice/off", state: listening() },
  { name: "voice/starting", state: listening({ status: "starting" }) },
  {
    name: "voice/listening",
    state: listening({ status: "listening", tail: 46 }, { typed: "Hear O Israel the LORD our God the LORD is one" }),
  },
  { name: "voice/blocked", state: listening({ error: "not-allowed" }) },
  // The scaffold has nothing to recite, so the switch is not offered with it on.
  { name: "voice/scaffold-on", state: listening({}, { typeFirstLetter: true, typed: "h o i" }) },
  // A review sitting recites too — the same one switch.
  {
    name: "voice/review-session",
    state: reviewing({ mode: "type", voice: quietVoice({ supported: true, status: "listening" }) }),
  },

  // ── test mode: setup, one screen per activity, summary ─────────────────────
  { name: "test/setup-default", state: baseState({ view: "test-setup" }) },
  {
    name: "test/setup-narrowed",
    state: baseState({
      view: "test-setup",
      examSetup: normalizeSetup({ size: 30, committedOnly: true, maxFreshness: 40, activities: ["match"] }),
    }),
  },
  {
    name: "test/setup-empty-pool",
    state: baseState({
      view: "test-setup",
      progress: {},
      examSetup: normalizeSetup({ ...DEFAULT_SETUP, committedOnly: true }),
    }),
  },
  { name: "test/name-ref", state: testing("name-ref") },
  { name: "test/name-ref-blank", state: testing("name-ref", { examAnswers: {} }) },
  { name: "test/pick-ref", state: testing("pick-ref") },
  { name: "test/finish", state: testing("finish") },
  { name: "test/match", state: testing("match") },
  {
    name: "test/match-picking",
    state: testing("match", { examPick: EXAM.questions[questionAt("match")].verses[1].key }),
  },
  { name: "test/scramble", state: testing("scramble") },
  { name: "test/blanks", state: testing("blanks") },
  { name: "test/type", state: testing("type") },
  { name: "test/first-question", state: testing("name-ref", { examIndex: 0 }) },
  { name: "test/last-question", state: testing("name-ref", { examIndex: EXAM.questions.length - 1 }) },
  { name: "test/leaving", state: testing("finish", { examLeaveAsk: true }) },
  { name: "test/summary", state: baseState({ view: "test-done", exam: EXAM, examResult: EXAM_RESULT }) },
  {
    name: "test/summary-faded",
    state: baseState({ view: "test-done", exam: COMMITTED_EXAM, examResult: FADED_RESULT }),
  },

  // ── session end + leaderboard ──────────────────────────────────────────────
  { name: "done/session", state: baseState({ view: "done", sessionCount: 8 }) },
  { name: "done/single", state: baseState({ view: "done", sessionCount: 1 }) },
  { name: "leaderboard/all", state: baseState({ view: "leaderboard" }) },
  {
    name: "leaderboard/filtered",
    state: baseState({ view: "leaderboard", leaderFilter: { group: "Kairos", gender: "All", gradClass: "All" } }),
  },
  {
    name: "leaderboard/empty",
    state: baseState({
      view: "leaderboard",
      leaderFilter: { group: "A2F", gender: "Male", gradClass: "2019" },
    }),
  },
  { name: "leaderboard/solo", state: baseState({ view: "leaderboard", peers: [] }) },
  {
    name: "leaderboard/unfinished-peer",
    state: baseState({
      view: "leaderboard",
      peers: PEERS.concat([
        { name: "Nobody Yet", count: 0, streak: 0, ministryGroup: "USF", gender: "Female", gradClass: 2025 },
      ]),
    }),
  },

  // ── the guide ──────────────────────────────────────────────────────────────
  { name: "guide/default", state: baseState({ view: "guide" }) },
  // Both ends of the freshness slider: day 0, where every curve reads 100%, and
  // a month on, where the held passage is well under the member's mark.
  { name: "guide/day-zero", state: baseState({ view: "guide", guideDays: 0 }) },
  { name: "guide/month-later", state: baseState({ view: "guide", guideDays: 30 }) },
].map((s) => ({ props: PROPS, ...s }));
