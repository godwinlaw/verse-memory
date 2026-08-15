/* Smoke tests for the pure logic modules. These run in Node (no browser) and
 * guard the spaced-repetition and exercise-generation behavior. Run: npm test */

import test from "node:test";
import assert from "node:assert/strict";

import { norm, firstLetters, dayKey } from "../src/text.js";
import { migrate, retrievability, freshness, isDue, nextStability, GROWTH_BASE } from "../src/srs.js";
import { keyBlankSet, chunksFor, BLANK_LEVELS, SCRAMBLE_LEVELS } from "../src/blanks.js";
import { mergeProgress, mergeLog } from "../src/storage.js";
import { emailAllowed, ALLOWED_DOMAINS } from "../src/firebase.js";
import { MINISTRY_GROUPS, GENDERS, cleanDisplayName, isProfileComplete, mergeProfile } from "../src/profile.js";
import { passages } from "../data/passages.js";

test("text helpers", () => {
  assert.equal(norm("Self-Control;"), "selfcontrol");
  assert.equal(firstLetters("self-control; abide"), "s-c; a");
  assert.match(dayKey(new Date("2026-08-14T12:00:00Z")), /^2026-08-14$/);
});

test("migrate returns defaults for unseen verse", () => {
  const rec = migrate(undefined);
  assert.deepEqual(rec, { hits: 0, status: "new", last: null, stability: 0 });
});

test("migrate back-fills stability for legacy records", () => {
  const rec = migrate({ hits: 2, status: "learning", last: Date.now() });
  assert.ok(rec.stability > 0, "legacy record should get a stability");
});

test("retrievability and freshness bounds", () => {
  const fresh = { hits: 1, status: "learning", last: Date.now(), stability: 2 };
  const r = retrievability(fresh);
  assert.ok(r > 0.9 && r <= 1, `just-reviewed verse should be near-fully fresh, got ${r}`);
  assert.equal(freshness({ hits: 0, status: "new", last: null, stability: 0 }), 0);
});

test("never-reviewed verse is due; very fresh verse is not", () => {
  assert.equal(isDue(migrate(undefined)), true);
  assert.equal(isDue({ hits: 1, status: "learning", last: Date.now(), stability: 5 }), false);
});

test("nextStability grows and rewards free recall over recognition", () => {
  const prev = { hits: 1, status: "learning", last: Date.now(), stability: 2 };
  const write = nextStability(prev, { mode: "type", score: 1 });
  const flip = nextStability(prev, { mode: "flip" });
  assert.ok(write > prev.stability, "review should increase stability");
  assert.ok(write > flip, "writing it out should build more stability than a flashcard");
  assert.ok(GROWTH_BASE > 1);
});

test("keyBlankSet picks valid, in-range word indices", () => {
  const p = passages[0];
  const words = p.text.split(" ");
  const blanks = keyBlankSet(p.text, p.id, 1);
  assert.ok(blanks.size > 0, "should blank at least one word");
  for (const i of blanks) assert.ok(i >= 0 && i < words.length, `index ${i} in range`);
  // Fuller level blanks at least as many words as the light level.
  assert.ok(keyBlankSet(p.text, p.id, 2).size >= keyBlankSet(p.text, p.id, 0).size);
  assert.equal(BLANK_LEVELS.length, 3);
});

test("mergeProgress keeps the most recently reviewed record per verse", () => {
  const local = { 1: { last: 100, hits: 1 }, 2: { last: 500, hits: 2 } };
  const remote = { 1: { last: 300, hits: 2 }, 3: { last: 50, hits: 1 } };
  const merged = mergeProgress(local, remote);
  assert.equal(merged[1].last, 300, "newer remote record wins for verse 1");
  assert.equal(merged[2].last, 500, "local-only verse 2 retained");
  assert.equal(merged[3].last, 50, "remote-only verse 3 adopted");
});

test("mergeLog unions days and keeps the larger count", () => {
  const merged = mergeLog({ "2026-08-13": 3, "2026-08-14": 1 }, { "2026-08-14": 5, "2026-08-15": 2 });
  assert.deepEqual(merged, { "2026-08-13": 3, "2026-08-14": 5, "2026-08-15": 2 });
});

test("merge helpers tolerate null/undefined inputs", () => {
  assert.deepEqual(mergeProgress(null, undefined), {});
  assert.deepEqual(mergeLog(undefined, null), {});
});

test("emailAllowed accepts only the approved Acts 2 Network domains", () => {
  assert.deepEqual(ALLOWED_DOMAINS, ["gpmail.org", "acts2.network"]);
  assert.equal(emailAllowed("member@gpmail.org"), true);
  assert.equal(emailAllowed("member@acts2.network"), true);
  assert.equal(emailAllowed("Member@ACTS2.Network"), true, "case-insensitive");
  assert.equal(emailAllowed("member@gmail.com"), false);
  assert.equal(emailAllowed("member@evilgpmail.org"), false, "must match full domain");
  assert.equal(emailAllowed("member@gpmail.org.evil.com"), false);
  assert.equal(emailAllowed("member@sub.acts2.network"), false, "subdomains not allowed");
  assert.equal(emailAllowed(null), false);
  assert.equal(emailAllowed(""), false);
});

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

test("mergeProfile keeps the most recently edited profile", () => {
  const local = { ministryGroup: "Kairos", gender: "Male", gradClass: 2026, updatedAt: 100 };
  const remote = { ministryGroup: "USF", gender: "Female", gradClass: 2025, updatedAt: 200 };
  assert.deepEqual(mergeProfile(local, remote), remote, "newer remote wins");
  assert.deepEqual(mergeProfile(remote, local), remote, "newer wins regardless of arg order");
  assert.deepEqual(mergeProfile(local, null), local);
  assert.deepEqual(mergeProfile(null, remote), remote);
  assert.deepEqual(mergeProfile(null, undefined), {});
});

test("chunksFor splits a passage into ordered chunks that rejoin to the text", () => {
  const p = passages[0];
  for (let level = 0; level < SCRAMBLE_LEVELS.length; level++) {
    const chunks = chunksFor(p.text, level);
    assert.ok(chunks.length >= 1);
    assert.equal(chunks.join(" ").replace(/\s+/g, " ").trim(), p.text.replace(/\s+/g, " ").trim());
  }
});
