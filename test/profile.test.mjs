import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_COMMIT_THRESHOLD,
  MAX_COMMIT_THRESHOLD,
  MINISTRY_GROUPS,
  MIN_COMMIT_THRESHOLD,
  GENDERS,
  cleanDisplayName,
  isProfileComplete,
  mergeProfile,
  reviewSettings,
} from "../src/profile.js";

test("isProfileComplete requires name, ministry group, gender, and class", () => {
  assert.equal(isProfileComplete(null), false);
  assert.equal(isProfileComplete({}), false);
  assert.equal(isProfileComplete({ ministryGroup: "Kairos", gender: "Male", gradClass: 2026 }), false, "name required");
  assert.equal(isProfileComplete({ name: "Ada Lovelace", gender: "Male", gradClass: 2026 }), false);
  assert.equal(
    isProfileComplete({ name: "Ada Lovelace", ministryGroup: "Kairos", gender: "Male", gradClass: 2026 }),
    true,
  );
});

test("cleanDisplayName strips a trailing (Berk) tag", () => {
  assert.equal(cleanDisplayName("Ada Lovelace (Berk)"), "Ada Lovelace");
  assert.equal(cleanDisplayName("Ada Lovelace  (berk)"), "Ada Lovelace", "case/space tolerant");
  assert.equal(cleanDisplayName("Ada Lovelace"), "Ada Lovelace", "untouched when absent");
  assert.equal(cleanDisplayName("Berk (Berk)"), "Berk", "only the trailing tag");
  assert.equal(cleanDisplayName(null), "");
  assert.equal(cleanDisplayName(""), "");
});

test("profile option lists are well-formed", () => {
  assert.ok(MINISTRY_GROUPS.includes("Kairos") && MINISTRY_GROUPS.includes("ECM"));
  assert.equal(new Set(MINISTRY_GROUPS).size, MINISTRY_GROUPS.length, "no duplicate groups");
  assert.deepEqual(GENDERS, ["Male", "Female"]);
});

test("reviewSettings defaults the commit threshold, and keeps it within bounds", () => {
  assert.equal(reviewSettings({}).commitThreshold, DEFAULT_COMMIT_THRESHOLD, "no override reads the default");
  assert.equal(reviewSettings({ commitThreshold: 92 }).commitThreshold, 92, "a member's own value is honored");
  assert.equal(
    reviewSettings({ commitThreshold: MIN_COMMIT_THRESHOLD - 20 }).commitThreshold,
    MIN_COMMIT_THRESHOLD,
    "clamped to the floor, so the bar still means recalling the passage",
  );
  assert.equal(
    reviewSettings({ commitThreshold: MAX_COMMIT_THRESHOLD + 20 }).commitThreshold,
    MAX_COMMIT_THRESHOLD,
    "clamped to the ceiling",
  );
});

test("mergeProfile keeps the most recently edited profile", () => {
  const local = { ministryGroup: "Kairos", gender: "Male", gradClass: 2026, updatedAt: 100 };
  const remote = { ministryGroup: "USF", gender: "Female", gradClass: 2025, updatedAt: 200 };
  assert.deepEqual(mergeProfile(local, remote), remote, "newer remote wins");
  assert.deepEqual(mergeProfile(remote, local), remote, "newer wins regardless of arg order");
  assert.deepEqual(mergeProfile(local, null), local);
  assert.deepEqual(mergeProfile(null, remote), remote);
  assert.deepEqual(mergeProfile(null, undefined), {});
});

/* ── merging a profile across devices ───────────────────────────────────────
 *
 * The rule these pin down is "a real profile is never lost to a lesser one".
 * An empty object is what both an unseeded device and a cloud document with no
 * profile field look like, and it is truthy — so it used to survive the merge
 * against a real profile that happened to tie on `updatedAt`, which reads to
 * the member as being asked to set up a profile they already have. */

const REAL = { name: "Ada", ministryGroup: "Kairos", gender: "Female", gradClass: 2026 };

test("an empty profile never displaces a real one, in either direction", () => {
  assert.equal(mergeProfile({}, REAL).name, "Ada");
  assert.equal(mergeProfile(REAL, {}).name, "Ada");
  assert.equal(mergeProfile(null, REAL).name, "Ada");
  assert.equal(mergeProfile(REAL, null).name, "Ada");
});

test("a complete profile beats an incomplete one, however recently edited", () => {
  const halfFilled = { name: "Half", ministryGroup: "Kairos", updatedAt: 9_000_000_000_000 };
  assert.equal(mergeProfile(halfFilled, { ...REAL, updatedAt: 1 }).name, "Ada");
  assert.equal(mergeProfile({ ...REAL, updatedAt: 1 }, halfFilled).name, "Ada");
});

test("between two complete profiles the most recent edit wins", () => {
  const older = { ...REAL, name: "Older", updatedAt: 1 };
  const newer = { ...REAL, name: "Newer", updatedAt: 2 };
  assert.equal(mergeProfile(older, newer).name, "Newer");
  assert.equal(mergeProfile(newer, older).name, "Newer");
});

test("nothing on either side stays nothing", () => {
  assert.deepEqual(mergeProfile({}, {}), {});
  assert.deepEqual(mergeProfile(null, undefined), {});
});
