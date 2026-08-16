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

const PROFILE = {
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

export const PROPS = {
  groupName: "Acts 2 Network - Berkeley",
  motto: "Every Member a Self Respecting Christian",
  deadline: "2026-10-31",
};

/* The state an App carries once local data has loaded and a member is signed in.
 * Individual scenarios override just the keys they care about. */
export function baseState(overrides = {}) {
  return {
    loaded: true,
    passages,
    view: "board",
    progress: progressFixture(),
    log: LOG,
    mode: null,
    queue: [],
    qi: 0,
    phase: "prompt",
    revealed: false,
    flipLetters: false,
    showHelp: false,
    answers: {},
    blanksChecked: false,
    blankLevel: 1,
    blankHint: true,
    typed: "",
    typeGraded: false,
    typeFirstLetter: false,
    lastTypeScore: undefined,
    scrambleOrder: [],
    scrambleWrong: -1,
    scrambleLevel: 1,
    search: "",
    filter: "All",
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
    ministryOpen: false,
    leaderFilter: { group: "All", gender: "All", gradClass: "All" },
    ...overrides,
  };
}

const reviewing = (overrides) => baseState({ view: "review", queue: [1, 2, 3], qi: 1, sessionCount: 1, ...overrides });

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
  // ── auth gate ──────────────────────────────────────────────────────────────
  { name: "auth/loading", state: baseState({ auth: { status: "loading" } }) },
  { name: "auth/signed-out", state: baseState({ auth: { status: "signed-out" } }) },
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

  // ── board ──────────────────────────────────────────────────────────────────
  { name: "board/populated", state: baseState() },
  { name: "board/fresh-account", state: baseState({ progress: {}, log: {}, peers: [] }) },

  // ── review setup ───────────────────────────────────────────────────────────
  // Most verses are never-reviewed → due, so the default queue is shown.
  { name: "review-setup/due", state: baseState({ view: "review-setup" }) },
  // Every verse committed & fully fresh → nothing due, so the manual controls
  // (how many uncommitted verses, freshness ceiling) take over.
  {
    name: "review-setup/caught-up",
    state: baseState({
      view: "review-setup",
      progress: Object.fromEntries(
        passages.map((p) => [p.id, { hits: 5, status: "memorized", last: daysAgo(0), stability: 30 }]),
      ),
      reviewSetup: { manualSize: 10, manualFreshness: 90 },
    }),
  },

  // ── passage list ───────────────────────────────────────────────────────────
  { name: "list/all", state: baseState({ view: "list" }) },
  { name: "list/filtered-committed", state: baseState({ view: "list", filter: "Committed" }) },
  { name: "list/searched", state: baseState({ view: "list", search: "psalm" }) },
  { name: "list/no-matches", state: baseState({ view: "list", search: "zzzzz" }) },

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
  {
    name: "review/type-first-letters",
    state: reviewing({ mode: "type", typeFirstLetter: true, typed: "h o i t l" }),
  },
  { name: "review/scramble", state: reviewing({ mode: "scramble" }) },
  {
    name: "review/scramble-partial",
    state: reviewing({ mode: "scramble", scrambleOrder: [0, 1], scrambleWrong: 3, scrambleLevel: 0 }),
  },
  { name: "review/peeking", state: reviewing({ mode: "blanks", showHelp: true }) },

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

  // ── pre-load splash ────────────────────────────────────────────────────────
  { name: "app/loading", state: baseState({ loaded: false }) },
].map((s) => ({ props: PROPS, ...s }));
