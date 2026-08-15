/* Representative UI states, shared by the render tests.
 *
 * Each scenario is a plain `{ name, props, state }` that can be pushed straight
 * into an App instance — no store, no mounting. Together they cover every view
 * and every review mode, so a render pass over all of them exercises the whole
 * template layer. Keep them deterministic: fixed timestamps only, no Date.now().
 */

import { passages } from "../../data/passages.js";

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

export const PROPS = { groupName: "Acts 2 Network - Berkeley", deadline: "2026-09-30" };

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
