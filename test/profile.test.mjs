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
