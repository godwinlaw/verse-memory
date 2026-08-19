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
  learnSetup: "mv.learnSetup",
  explainerOpen: "mv.explainerOpen",
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
  // Hidden by default on a setup screen; left however a member last leaves it.
  loadExplainerOpen: (fallback) => readBool(KEYS.explainerOpen, fallback),
  /* The Test mode setup, as last left. Returned raw — exam.normalizeSetup() is
   * what decides whether a stored value is still a legal one. */
  loadExamSetup: () => readJSON(KEYS.examSetup, null),
  loadReviewSetup: (fallback) => readJSON(KEYS.reviewSetup, fallback),
  loadLearnSetup: (fallback) => readJSON(KEYS.learnSetup, fallback),

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

  /* Start the set over: the record of what has been memorized, emptied. Only
   * progress and the daily log go — the profile and the device-local exercise
   * preferences are not that record.
   *
   * `replace` is the whole reason this is not just saveProgressAndLog({}, {}):
   * an ordinary push merges into the cloud document, and merging an empty map
   * into a stored one deletes nothing, so the next sign-in would fold every
   * wiped verse straight back in (see the seam below). */
  clearProgressAndLog() {
    write(KEYS.progress, JSON.stringify({}));
    write(KEYS.log, JSON.stringify({}));
    remoteSync({ replace: true });
  },

  // Exercise preferences: local to the device, never synced.
  saveBlankLevel: (level) => write(KEYS.blankLevel, level),
  saveScrambleLevel: (level) => write(KEYS.scrambleLevel, level),
  saveBlankHint: (on) => writeBool(KEYS.blankHint, on),
  saveTypeFirstLetter: (on) => writeBool(KEYS.typeFirstLetter, on),
  saveExamSetup: (setup) => write(KEYS.examSetup, JSON.stringify(setup)),
  saveReviewSetup: (setup) => write(KEYS.reviewSetup, JSON.stringify(setup)),
  saveLearnSetup: (setup) => write(KEYS.learnSetup, JSON.stringify(setup)),
  saveExplainerOpen: (open) => writeBool(KEYS.explainerOpen, open),
};

/* ── cloud-sync seam ──────────────────────────────────────────────────────── */

/* A no-op until a backend registers itself (see firebase.js). The whole record
 * is pushed on every save, read back out of storage so that saving one slice
 * still pushes the current value of the others in a single document write.
 *
 * `replace` says the push is a wipe rather than an edit: the backend must store
 * exactly what it is handed instead of folding it into what is already there,
 * because a merge cannot express a deletion. */
let syncFn = null;

export function registerRemoteSync(fn) {
  syncFn = fn;
}

function remoteSync({ replace = false } = {}) {
  if (!syncFn) return;
  try {
    syncFn({
      progress: storage.loadProgress(),
      log: storage.loadLog(),
      profile: storage.loadProfile(),
      replace,
    });
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

/* One passage, as two devices last left it. The newer record wins — that is
 * what carries freshness and stability across devices — with one exception.
 *
 * **Committing is one-way.** Nothing in the app demotes a verse: App.record()
 * short-circuits on `prev.status === "memorized"`, and Test mode moves
 * freshness without touching status. So a newer record that says "learning" is
 * never a demotion that happened; it is a device that had not yet heard about
 * the commit, writing from what it knew. Taking that record wholesale is how a
 * verse the member committed on one device quietly goes back to uncommitted
 * when another device syncs — the count on the board dropping with nothing to
 * explain it. The newer record still wins on every other field; only the
 * status is carried forward. */
function reconcile(a, b) {
  const winner = stampOf(b) > stampOf(a) ? b : a;
  const other = winner === b ? a : b;
  if (other && other.status === "memorized" && winner.status !== "memorized") {
    return { ...winner, status: "memorized" };
  }
  return winner;
}

/* Reconcile local and remote progress without losing data: the union of both
 * sides, each passage settled by reconcile() above. Used on startup to fold the
 * cloud copy into whatever is already on this device. Pure. */
export function mergeProgress(local, remote) {
  const a = local || {};
  const b = remote || {};
  const out = {};
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!a[id]) out[id] = b[id];
    else if (!b[id]) out[id] = a[id];
    else out[id] = reconcile(a[id], b[id]);
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
