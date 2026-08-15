/* Persistence layer.
 *
 * The app's single source of truth is the browser's localStorage. Isolating all
 * reads/writes here keeps the component free of storage details and gives us one
 * place to add cloud sync later (see remoteSync below). Every access is wrapped
 * in try/catch so a disabled/full storage never breaks the UI. */

const KEYS = {
  progress: "mv.progress",
  log: "mv.log",
  blankLevel: "mv.blankLevel",
  blankHint: "mv.blankHint",
  scrambleLevel: "mv.scrambleLevel",
};

function readJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch (e) {
    return fallback;
  }
}

function readInt(key, fallback, { min = 0, max = Infinity } = {}) {
  try {
    const n = parseInt(localStorage.getItem(key), 10);
    return n >= min && n < max ? n : fallback;
  } catch (e) {
    return fallback;
  }
}

export const storage = {
  loadProgress: () => readJSON(KEYS.progress, {}),
  loadLog: () => readJSON(KEYS.log, {}),

  loadBlankLevel: (fallback, count) => readInt(KEYS.blankLevel, fallback, { max: count }),
  loadScrambleLevel: (fallback, count) => readInt(KEYS.scrambleLevel, fallback, { max: count }),
  loadBlankHint: (fallback) => {
    try {
      const h = localStorage.getItem(KEYS.blankHint);
      return h === null ? fallback : h === "1";
    } catch (e) {
      return fallback;
    }
  },

  saveProgressAndLog(progress, log) {
    try {
      localStorage.setItem(KEYS.progress, JSON.stringify(progress));
      localStorage.setItem(KEYS.log, JSON.stringify(log));
    } catch (e) {
      /* storage disabled or full — keep running from in-memory state */
    }
    remoteSync(progress, log);
  },

  saveBlankLevel(i) { try { localStorage.setItem(KEYS.blankLevel, i); } catch (e) {} },
  saveScrambleLevel(i) { try { localStorage.setItem(KEYS.scrambleLevel, i); } catch (e) {} },
  saveBlankHint(on) { try { localStorage.setItem(KEYS.blankHint, on ? "1" : "0"); } catch (e) {} },
};

/* Cloud-sync seam. Wired to a no-op until a backend is configured; see
 * firebase.js. When present, progress/log are pushed on every save. */
let syncFn = null;
export function registerRemoteSync(fn) { syncFn = fn; }
function remoteSync(progress, log) {
  if (syncFn) {
    try { syncFn({ progress, log }); } catch (e) {}
  }
}

/* Merge local and remote progress without losing data: per verse, keep the most
 * recently reviewed record (larger `last`). Used to reconcile cloud state pulled
 * on startup with whatever is already on this device. Pure. */
export function mergeProgress(local, remote) {
  const a = local || {}, b = remote || {};
  const out = {};
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const la = a[id], lb = b[id];
    if (!la) out[id] = lb;
    else if (!lb) out[id] = la;
    else out[id] = (lb.last || 0) > (la.last || 0) ? lb : la;
  }
  return out;
}

/* Merge daily review logs: union of days, keeping the larger count per day. */
export function mergeLog(local, remote) {
  const a = local || {}, b = remote || {};
  const out = { ...a };
  for (const day of Object.keys(b)) out[day] = Math.max(a[day] || 0, b[day] || 0);
  return out;
}
