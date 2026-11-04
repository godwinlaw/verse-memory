/* The member's record as one file: exporting it, and reading one back in.
 *
 * A backup is the three slices storage.js keeps, progress, the daily log and
 * the profile, wrapped in an envelope that names the app and the format. It is
 * what a member keeps for themselves: cloud sync is an overlay the app can run
 * without (see firebase.js), and a member on a local-only build, or moving to a
 * new account, had no way to carry their record anywhere.
 *
 * Reading one back is a merge, never a replacement. importBackup folds the
 * file into what the device already holds through the same mergeProgress,
 * mergeLog and mergeProfile the cloud pull uses, so an old backup cannot take
 * a newer record backwards and a committed verse cannot come back uncommitted
 * (committing is one-way, see storage.reconcile). Wiping is a different thing
 * and has its own button (App.resetProgress).
 *
 * Everything here is pure. The file dialog and the download live in files.js. */

import { mergeLog, mergeProgress } from "./storage.js";
import { mergeProfile } from "./profile.js";
import { clampStep } from "./srs.js";
import { dayKey } from "./text.js";

export const BACKUP_APP = "verse-mastery";
export const BACKUP_FORMAT = 1;

const STATUSES = new Set(["new", "learning", "memorized"]);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/* The profile fields a backup carries. Anything else in a stored profile is
 * not the member's and is not brought along. */
const PROFILE_FIELDS = [
  "name",
  "ministryGroup",
  "gender",
  "gradClass",
  "dueTopX",
  "dueFreshness",
  "defaultDifficulty",
  "commitThreshold",
  "shareRanking",
  "updatedAt",
];

/* Why a file could not be read. `code` is what the screen reads to pick a
 * sentence (copy.profileForm.backup.errors). */
export class BackupError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const isMap = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const finite = (v) => typeof v === "number" && Number.isFinite(v);

/* The envelope a download holds. */
export function buildBackup({ progress, log, profile }, now = Date.now()) {
  return {
    app: BACKUP_APP,
    format: BACKUP_FORMAT,
    exportedAt: new Date(now).toISOString(),
    progress: progress || {},
    log: log || {},
    profile: profile || {},
  };
}

export const backupFilename = (now = Date.now()) => `verse-mastery-backup-${dayKey(new Date(now))}.json`;

/* One progress record, kept to the shape srs.js defines and nothing else, or
 * null when there is nothing in it worth keeping. A record that has never been
 * reviewed and is not committed says nothing about the verse. */
export function cleanRecord(raw) {
  if (!isMap(raw)) return null;
  const last = finite(raw.last) && raw.last > 0 ? raw.last : null;
  const status = STATUSES.has(raw.status) ? raw.status : last ? "learning" : "new";
  if (!last && status !== "memorized") return null;
  const rec = { hits: finite(raw.hits) && raw.hits > 0 ? Math.round(raw.hits) : 0, status, last };
  if (raw.step != null && finite(Number(raw.step))) rec.step = clampStep(raw.step);
  if (finite(raw.stability) && raw.stability >= 0) rec.stability = raw.stability;
  if (finite(raw.updatedAt) && raw.updatedAt > 0) rec.updatedAt = raw.updatedAt;
  return rec;
}

/* Read a backup file's text. `knownIds`, when given, drops records for
 * passages that are not in this build's set, a backup from a build with
 * different passages should not leave orphans in the record. */
export function parseBackup(text, { knownIds } = {}) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError("not-json");
  }
  if (!isMap(data) || !isMap(data.progress)) throw new BackupError("not-a-backup");
  if (data.app !== undefined && data.app !== BACKUP_APP) throw new BackupError("not-a-backup");
  if (finite(data.format) && data.format > BACKUP_FORMAT) throw new BackupError("newer-format");

  const known = knownIds ? new Set(knownIds.map(String)) : null;
  const progress = {};
  for (const [id, raw] of Object.entries(data.progress)) {
    if (known && !known.has(String(id))) continue;
    const rec = cleanRecord(raw);
    if (rec) progress[id] = rec;
  }

  const log = {};
  if (isMap(data.log)) {
    for (const [day, n] of Object.entries(data.log)) {
      if (DAY.test(day) && finite(n) && n > 0) log[day] = Math.round(n);
    }
  }

  const profile = {};
  if (isMap(data.profile)) {
    for (const key of PROFILE_FIELDS) {
      const v = data.profile[key];
      if (typeof v === "string" || typeof v === "boolean" || finite(v)) profile[key] = v;
    }
  }

  return { progress, log, profile };
}

/* Fold a parsed backup into what the device holds. Returns the merged record
 * and a count of what the file brought: verses it added, verses where it held
 * the newer copy, and days of the log it filled in. */
export function importBackup(local, backup) {
  const progress = mergeProgress(local.progress, backup.progress);
  const log = mergeLog(local.log, backup.log);
  const profile = mergeProfile(local.profile, backup.profile);
  let added = 0;
  let updated = 0;
  for (const id of Object.keys(backup.progress)) {
    if (!(local.progress || {})[id]) added++;
    else if (progress[id] !== local.progress[id]) updated++;
  }
  let days = 0;
  for (const day of Object.keys(backup.log)) if ((local.log || {})[day] !== log[day]) days++;
  return { progress, log, profile, added, updated, days };
}
