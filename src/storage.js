/* Persistence layer.
 *
 * The app's source of truth is the browser's localStorage. Keeping every read
 * and write here means the component never touches a storage API, and gives one
 * place to hang cloud sync (see the seam at the bottom, filled in by
 * firebase.js). Storage can be disabled, full, or blocked by privacy settings,
 * so every access is guarded — a failure degrades to in-memory state rather than
 * breaking the UI. */

const KEYS = {
  progress: "mv.progress",
  log: "mv.log",
  profile: "mv.profile",
  blankLevel: "mv.blankLevel",
  blankHint: "mv.blankHint",
  scrambleLevel: "mv.scrambleLevel",
  typeFirstLetter: "mv.typeFirstLetter",
  examSetup: "mv.examSetup",
  reviewSetup: "mv.reviewSetup",
};

/* ── guarded primitives ───────────────────────────────────────────────────── */

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* disabled or full — keep running from in-memory state */
  }
}

function readJSON(key, fallback) {
  const raw = read(key);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/* An index into a fixed list of options. Anything out of range or corrupt falls
 * back, so a value left by an older build can't select a level that no longer
 * exists. */
function readIndex(key, fallback, count) {
  const n = parseInt(read(key), 10);
  return n >= 0 && n < count ? n : fallback;
}

function readBool(key, fallback) {
  const raw = read(key);
  return raw === null ? fallback : raw === "1";
}

const writeBool = (key, on) => write(key, on ? "1" : "0");

/* ── the store ────────────────────────────────────────────────────────────── */

export const storage = {
  loadProgress: () => readJSON(KEYS.progress, {}),
  loadLog: () => readJSON(KEYS.log, {}),
  loadProfile: () => readJSON(KEYS.profile, {}),
  loadBlankLevel: (fallback, count) => readIndex(KEYS.blankLevel, fallback, count),
  loadScrambleLevel: (fallback, count) => readIndex(KEYS.scrambleLevel, fallback, count),
  loadBlankHint: (fallback) => readBool(KEYS.blankHint, fallback),
  loadTypeFirstLetter: (fallback) => readBool(KEYS.typeFirstLetter, fallback),
  /* The Test mode setup, as last left. Returned raw — exam.normalizeSetup() is
   * what decides whether a stored value is still a legal one. */
  loadExamSetup: () => readJSON(KEYS.examSetup, null),
  loadReviewSetup: (fallback) => readJSON(KEYS.reviewSetup, fallback),

  /* Progress and the daily log are written together: they change together on
   * every completed review, and the cloud push carries both. */
  saveProgressAndLog(progress, log) {
    write(KEYS.progress, JSON.stringify(progress));
    write(KEYS.log, JSON.stringify(log));
    remoteSync();
  },
  saveProfile(profile) {
    write(KEYS.profile, JSON.stringify(profile));
    remoteSync();
  },

  // Exercise preferences: local to the device, never synced.
  saveBlankLevel: (level) => write(KEYS.blankLevel, level),
  saveScrambleLevel: (level) => write(KEYS.scrambleLevel, level),
  saveBlankHint: (on) => writeBool(KEYS.blankHint, on),
  saveTypeFirstLetter: (on) => writeBool(KEYS.typeFirstLetter, on),
  saveExamSetup: (setup) => write(KEYS.examSetup, JSON.stringify(setup)),
  saveReviewSetup: (setup) => write(KEYS.reviewSetup, JSON.stringify(setup)),
};

/* ── cloud-sync seam ──────────────────────────────────────────────────────── */

/* A no-op until a backend registers itself (see firebase.js). The whole record
 * is pushed on every save, read back out of storage so that saving one slice
 * still pushes the current value of the others in a single document write. */
let syncFn = null;

export function registerRemoteSync(fn) {
  syncFn = fn;
}

function remoteSync() {
  if (!syncFn) return;
  try {
    syncFn({ progress: storage.loadProgress(), log: storage.loadLog(), profile: storage.loadProfile() });
  } catch {
    /* a broken sync must never break a local save */
  }
}

/* ── merges ───────────────────────────────────────────────────────────────── */

/* When a record was written.
 *
 * For a review that is simply `last`: the verse was reviewed at the moment the
 * record was saved. A test result is the exception — it backdates `last` to the
 * freshness the member actually demonstrated (srs.testedLast), so it carries an
 * `updatedAt` saying when it was really written. Records saved before that field
 * existed have only `last`, which for them is the same thing — and a verse
 * reviewed after a test carries both, so take whichever is later. */
const stampOf = (rec) => Math.max((rec && rec.updatedAt) || 0, (rec && rec.last) || 0);

/* Reconcile local and remote progress without losing data: per passage, keep the
 * most recently written record. Used on startup to fold the cloud copy into
 * whatever is already on this device. Pure. */
export function mergeProgress(local, remote) {
  const a = local || {};
  const b = remote || {};
  const out = {};
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!a[id]) out[id] = b[id];
    else if (!b[id]) out[id] = a[id];
    else out[id] = stampOf(b[id]) > stampOf(a[id]) ? b[id] : a[id];
  }
  return out;
}

/* Merge daily review logs: the union of days, keeping the larger count for any
 * day both sides recorded. Pure. */
export function mergeLog(local, remote) {
  const a = local || {};
  const b = remote || {};
  const out = { ...a };
  for (const day of Object.keys(b)) out[day] = Math.max(a[day] || 0, b[day] || 0);
  return out;
}
