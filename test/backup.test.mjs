import test from "node:test";
import assert from "node:assert/strict";

import {
  BACKUP_APP,
  BACKUP_FORMAT,
  BackupError,
  backupFilename,
  buildBackup,
  cleanRecord,
  importBackup,
  parseBackup,
} from "../src/backup.js";
import { MAX_STEP, stabilityFor } from "../src/srs.js";

const T = 1787000000000;
const day = 86400000;

const committed = (over = {}) => ({
  hits: 4,
  status: "memorized",
  last: T,
  step: 6,
  stability: stabilityFor(6),
  ...over,
});
const learning = (over = {}) => ({
  hits: 1,
  status: "learning",
  last: T - day,
  step: 0,
  stability: stabilityFor(0),
  ...over,
});

/* ── the file ─────────────────────────────────────────────────────────────── */

test("a backup names the app, its format, and carries the three slices", () => {
  const data = buildBackup({ progress: { 1: committed() }, log: { "2026-08-15": 3 }, profile: { name: "Ada" } }, T);
  assert.equal(data.app, BACKUP_APP);
  assert.equal(data.format, BACKUP_FORMAT);
  assert.equal(data.exportedAt, new Date(T).toISOString());
  assert.deepEqual(data.progress, { 1: committed() });
  assert.deepEqual(data.log, { "2026-08-15": 3 });
  assert.deepEqual(data.profile, { name: "Ada" });
});

test("a backup with nothing in it is still a well-formed file", () => {
  const data = buildBackup({}, T);
  assert.deepEqual(data.progress, {});
  assert.deepEqual(data.log, {});
  assert.deepEqual(data.profile, {});
});

test("the filename carries the day it was made, by local date", () => {
  assert.match(backupFilename(new Date("2026-08-15T12:00:00").getTime()), /^verse-mastery-backup-2026-08-15\.json$/);
});

test("what buildBackup writes, parseBackup reads back unchanged", () => {
  const record = { progress: { 1: committed(), 2: learning() }, log: { "2026-08-15": 3 }, profile: { name: "Ada" } };
  const back = parseBackup(JSON.stringify(buildBackup(record, T)));
  assert.deepEqual(back.progress, record.progress);
  assert.deepEqual(back.log, record.log);
  assert.deepEqual(back.profile, record.profile);
});

/* ── reading one ──────────────────────────────────────────────────────────── */

test("a file that is not JSON, or not a backup, is refused by name", () => {
  assert.throws(
    () => parseBackup("not json"),
    (e) => e instanceof BackupError && e.code === "not-json",
  );
  assert.throws(
    () => parseBackup("[1,2,3]"),
    (e) => e.code === "not-a-backup",
  );
  assert.throws(
    () => parseBackup('{"name":"Ada"}'),
    (e) => e.code === "not-a-backup",
    "a profile alone is not a record",
  );
  assert.throws(
    () => parseBackup('{"app":"other-app","progress":{}}'),
    (e) => e.code === "not-a-backup",
  );
});

test("a backup from a newer format is refused rather than half-read", () => {
  const data = { app: BACKUP_APP, format: BACKUP_FORMAT + 1, progress: {} };
  assert.throws(
    () => parseBackup(JSON.stringify(data)),
    (e) => e.code === "newer-format",
  );
});

test("a bare progress map is accepted, the envelope is optional", () => {
  // What a member pasting the mv.progress key out of devtools would have.
  const back = parseBackup(JSON.stringify({ progress: { 1: committed() } }));
  assert.deepEqual(back.progress, { 1: committed() });
  assert.deepEqual(back.log, {});
  assert.deepEqual(back.profile, {});
});

test("records are kept to the shape the model defines", () => {
  const raw = { ...committed(), extra: "field", hits: "4", step: 99, stability: -1, updatedAt: "yesterday" };
  const rec = cleanRecord(raw);
  assert.deepEqual(rec, { hits: 0, status: "memorized", last: T, step: MAX_STEP });
  assert.ok(!("extra" in rec), "nothing the model does not read is carried");
});

test("a record with nothing in it is dropped", () => {
  assert.equal(cleanRecord({ status: "new" }), null);
  assert.equal(cleanRecord({}), null);
  assert.equal(cleanRecord("memorized"), null);
  assert.equal(cleanRecord(null), null);
  // A record that says committed is kept even with no history behind it:
  // the status is the one fact that matters and it is never lost.
  assert.equal(cleanRecord({ status: "memorized" }).status, "memorized");
});

test("a record with a review but no status is read as in progress", () => {
  assert.equal(cleanRecord({ last: T }).status, "learning");
  assert.equal(cleanRecord({ last: T, status: "done" }).status, "learning", "an unknown status is not trusted");
});

test("a legacy record without a step is left for migrate() to place", () => {
  const rec = cleanRecord({ hits: 3, status: "memorized", last: T, stability: 12 });
  assert.ok(!("step" in rec));
  assert.equal(rec.stability, 12);
});

test("records for passages not in this build are left out", () => {
  const data = { progress: { 1: committed(), 999: committed() } };
  const back = parseBackup(JSON.stringify(data), { knownIds: [1, 2, 3] });
  assert.deepEqual(Object.keys(back.progress), ["1"]);
});

test("the log keeps only real days with real counts", () => {
  const data = {
    progress: {},
    log: { "2026-08-15": 3, "2026-08-16": 2.6, yesterday: 4, "2026-08-17": 0, "2026-08-18": "x" },
  };
  assert.deepEqual(parseBackup(JSON.stringify(data)).log, { "2026-08-15": 3, "2026-08-16": 3 });
});

test("the profile keeps only the fields a profile has", () => {
  const data = { progress: {}, profile: { name: "Ada", gradClass: 2026, shareRanking: false, uid: "x", token: "y" } };
  assert.deepEqual(parseBackup(JSON.stringify(data)).profile, { name: "Ada", gradClass: 2026, shareRanking: false });
});

/* ── folding one in ───────────────────────────────────────────────────────── */

const local = () => ({
  progress: { 1: committed({ updatedAt: T }), 2: learning({ updatedAt: T - day }) },
  log: { "2026-08-15": 3 },
  profile: { name: "Ada", ministryGroup: "Kairos", gender: "Female", gradClass: 2026, updatedAt: T },
});

test("importing adds what the device did not have and counts it", () => {
  const backup = { progress: { 3: committed(), 4: learning() }, log: { "2026-08-14": 2 }, profile: {} };
  const out = importBackup(local(), backup);
  assert.deepEqual(Object.keys(out.progress).sort(), ["1", "2", "3", "4"]);
  assert.equal(out.added, 2);
  assert.equal(out.updated, 0);
  assert.equal(out.days, 1);
  assert.deepEqual(out.log, { "2026-08-15": 3, "2026-08-14": 2 });
});

test("importing never removes anything the device holds", () => {
  const out = importBackup(local(), { progress: {}, log: {}, profile: {} });
  assert.deepEqual(out.progress, local().progress);
  assert.deepEqual(out.log, local().log);
  assert.deepEqual(out.profile, local().profile);
  assert.equal(out.added + out.updated + out.days, 0);
});

test("an older backup does not take a verse backwards", () => {
  const stale = {
    progress: { 1: committed({ step: 2, stability: stabilityFor(2), updatedAt: T - 30 * day }) },
    log: {},
    profile: {},
  };
  const out = importBackup(local(), stale);
  assert.equal(out.progress[1].step, 6, "the device's newer record wins");
  assert.equal(out.updated, 0, "so nothing was updated");
});

test("a newer backup brings a verse forward, and counts it as updated", () => {
  const newer = { progress: { 2: committed({ updatedAt: T + day, last: T + day }) }, log: {}, profile: {} };
  const out = importBackup(local(), newer);
  assert.equal(out.progress[2].status, "memorized");
  assert.equal(out.updated, 1);
  assert.equal(out.added, 0);
});

test("a committed verse cannot come back uncommitted from a backup", () => {
  // Committing is one-way (storage.reconcile): a newer record that says
  // learning is a device that had not heard, not a demotion.
  const newer = { progress: { 1: learning({ updatedAt: T + day, last: T + day }) }, log: {}, profile: {} };
  const out = importBackup(local(), newer);
  assert.equal(out.progress[1].status, "memorized");
});

test("the log keeps the larger count for a day both sides have", () => {
  const out = importBackup(local(), { progress: {}, log: { "2026-08-15": 9 }, profile: {} });
  assert.equal(out.log["2026-08-15"], 9);
  assert.equal(out.days, 1);
  const smaller = importBackup(local(), { progress: {}, log: { "2026-08-15": 1 }, profile: {} });
  assert.equal(smaller.log["2026-08-15"], 3);
  assert.equal(smaller.days, 0);
});

test("the profile follows the same rule as the cloud merge", () => {
  // A complete profile beats an incomplete one; otherwise the newer wins.
  const partial = importBackup(local(), {
    progress: {},
    log: {},
    profile: { name: "Someone Else", updatedAt: T + day },
  });
  assert.equal(partial.profile.name, "Ada", "a half-filled profile never replaces a complete one");
  const newer = {
    progress: {},
    log: {},
    profile: { name: "Ada L", ministryGroup: "USF", gender: "Female", gradClass: 2026, updatedAt: T + day },
  };
  assert.equal(importBackup(local(), newer).profile.ministryGroup, "USF");
});

test("importing onto an empty device is the backup, whole", () => {
  const backup = parseBackup(JSON.stringify(buildBackup(local(), T)));
  const out = importBackup({ progress: {}, log: {}, profile: {} }, backup);
  assert.deepEqual(out.progress, local().progress);
  assert.deepEqual(out.log, local().log);
  assert.deepEqual(out.profile, local().profile);
  assert.equal(out.added, 2);
});
