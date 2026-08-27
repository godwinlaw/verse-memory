/* Ranking groups rather than people.
 *
 * The measure is per member throughout, and most of what is worth asserting
 * here is that it stays per member — a total would rank by attendance, which is
 * the one thing the board must not do. */

import test from "node:test";
import assert from "node:assert/strict";

import { RANK_BY, rankFieldFor, rowFromSummary, standingsBy, summarize } from "../src/standings.js";
import { stabilityFor } from "../src/srs.js";
import { dayKey } from "../src/text.js";

/* A roster row as viewmodel/leaderboard.js assembles it. */
const member = (group, count, freshnessScore, over = {}) => ({
  name: "m",
  count,
  freshnessScore,
  ministryGroup: group,
  ...over,
});

test("a small group is not out-run by a large one", () => {
  // Five people holding their verses well beat forty who are not — which is the
  // whole reason the figure is an average.
  const rows = [
    ...Array.from({ length: 5 }, () => member("Kairos", 10, 9)),
    ...Array.from({ length: 40 }, () => member("A2F", 10, 4)),
  ];
  const [first, second] = standingsBy(rows, "ministryGroup");
  assert.equal(first.name, "Kairos");
  assert.equal(first.members, 5);
  assert.equal(second.name, "A2F");
  assert.equal(second.members, 40, "the larger group is still there, just second");
  // And on a total it would have been the other way round.
  assert.ok(second.freshnessScore > first.freshnessScore);
});

test("the figures a group reports are per member", () => {
  const rows = [member("USF", 40, 32), member("USF", 10, 8)];
  const [usf] = standingsBy(rows, "ministryGroup");
  assert.equal(usf.members, 2);
  assert.equal(usf.avgCount, 25);
  assert.equal(usf.avgScore, 20);
  // The totals are still carried, because the average freshness percentage is
  // a ratio of the two and not an average of averages.
  assert.equal(usf.count, 50);
  assert.equal(usf.freshnessScore, 40);
});

test("a member who has not started does not drag their group down", () => {
  // The individual board already leaves them out, so counting them in a group
  // average would quietly re-admit them — and would mean a ministry that
  // recruits well scores worse for it.
  const rows = [member("ECM", 10, 9), member("ECM", 0, 0)];
  const [ecm] = standingsBy(rows, "ministryGroup");
  assert.equal(ecm.members, 1);
  assert.equal(ecm.avgScore, 9);
});

test("a member who has not said which group they are in joins none", () => {
  // Inventing an "Unknown" group to hold them would put a fictional team on
  // the board.
  const rows = [member("VSM", 10, 9), member("", 10, 9), member(null, 10, 9), member(undefined, 10, 9)];
  const standings = standingsBy(rows, "ministryGroup");
  assert.equal(standings.length, 1);
  assert.equal(standings[0].name, "VSM");
  assert.equal(standings[0].members, 1);
});

test("the group the member is standing in is marked", () => {
  const rows = [member("Kairos", 10, 9), member("A2F", 20, 19, { me: true })];
  const standings = standingsBy(rows, "ministryGroup");
  assert.equal(standings.find((g) => g.name === "A2F").mine, true);
  assert.equal(standings.find((g) => g.name === "Kairos").mine, false);
});

test("a tie goes to the group that did it with more people", () => {
  const rows = [member("Kairos", 10, 9), member("A2F", 10, 9), member("A2F", 10, 9)];
  const [first] = standingsBy(rows, "ministryGroup");
  assert.equal(first.name, "A2F", "the same average across more people is a bigger thing");
});

test("any of the three profile fields can be the grouping", () => {
  const rows = [
    { count: 10, freshnessScore: 9, gender: "Female", gradClass: 2025 },
    { count: 10, freshnessScore: 4, gender: "Male", gradClass: 2025 },
  ];
  assert.deepEqual(
    standingsBy(rows, "gender").map((g) => g.name),
    ["Female", "Male"],
  );
  assert.deepEqual(
    standingsBy(rows, "gradClass").map((g) => [g.name, g.members]),
    [["2025", 2]],
  );
});

test("ranking people is the absence of a grouping, not a fourth one", () => {
  assert.equal(rankFieldFor("people"), null);
  assert.deepEqual(standingsBy([member("Kairos", 10, 9)], null), []);
  // An unknown key falls back to people rather than throwing.
  assert.equal(rankFieldFor("nonsense"), null);
  assert.equal(RANK_BY.at(-1).key, "people");
});

test("an empty roster is an empty board, not a crash", () => {
  assert.deepEqual(standingsBy([], "ministryGroup"), []);
});

/* ── the board's own record ───────────────────────────────────────────────── */

const DAY = 86400000;
const NOW = Date.UTC(2026, 4, 20, 18, 0, 0);
const day = (n) => dayKey(new Date(NOW - n * DAY));

/* A committed verse last reviewed `ago` days back, on the rung `step`. */
const held = (ago, step = 6) => ({
  status: "memorized",
  last: NOW - ago * DAY,
  stability: stabilityFor(step),
  step,
  hits: 3,
});

/* A member who has turned their ranking on. `shareRanking` is what publishes a
 * name (profile.sharesRanking), so a fixture without it is exercising the
 * hidden case — which is the default, and has its own tests below. */
const PROFILE = { name: "Ada", ministryGroup: "Kairos", gender: "Female", gradClass: 2027, shareRanking: true };
const HIDDEN = { ...PROFILE, shareRanking: false };

test("a summary carries the board's three figures and nothing else about the member", () => {
  const s = summarize({
    name: "Ada Lovelace",
    profile: PROFILE,
    progress: { 1: held(0), 2: held(1), 3: { status: "learning", last: NOW, stability: 2, step: 1 } },
    log: { [day(0)]: 3 },
    now: NOW,
  });

  assert.equal(s.name, "Ada");
  assert.equal(s.ministryGroup, "Kairos");
  assert.equal(s.fresh.length, 4, "two committed verses, two numbers each — the third is not committed");
  assert.equal(s.streak, 1);
  assert.equal(s.streakDay, day(0));
  assert.equal(s.email, undefined, "the board never needed it, so it is not sent");
  assert.ok(!JSON.stringify(s).includes('"log"'), "nor the log it was derived from");
});

/* ── hiding yourself ──────────────────────────────────────────────────────── */

test("a member who has not asked to be shown is not named on the wire", () => {
  const s = summarize({ name: "Ada Lovelace", profile: HIDDEN, progress: { 1: held(0) }, log: {}, now: NOW });

  assert.equal(s.shareRanking, false);
  assert.equal(s.name, "", "withheld at the source, not just in the view-model");
  assert.ok(!JSON.stringify(s).includes("Ada"), "the account's name is not a way round it either");
  // But the figures still go up: they belong to the ministry's average.
  assert.equal(s.ministryGroup, "Kairos");
  assert.equal(s.fresh.length, 2);
});

test("hiding is the default, so a profile that never mentions it is hidden", () => {
  const noAnswer = { name: "Ada", ministryGroup: "Kairos", gender: "Female", gradClass: 2027 };
  const s = summarize({ name: "Ada Lovelace", profile: noAnswer, progress: {}, log: {}, now: NOW });
  assert.equal(s.shareRanking, false);
  assert.equal(s.name, "");
});

test("a summary written before the switch existed reads as hidden", () => {
  // No shareRanking field at all — every document in the collection on the day
  // this ships. None of those members asked to be shown either.
  const legacy = { v: 1, name: "Grace Hopper", ministryGroup: "USF", gender: "Female", gradClass: 2025, fresh: [] };
  assert.equal(rowFromSummary(legacy, NOW).shareRanking, false);
});

test("a member who has asked to be shown is named, and says so", () => {
  const s = summarize({ profile: PROFILE, progress: { 1: held(0) }, log: {}, now: NOW });
  assert.equal(s.shareRanking, true);
  assert.equal(s.name, "Ada");
  assert.equal(rowFromSummary(s, NOW).shareRanking, true);
});

test("nothing in a summary is nested inside an array, which Firestore refuses", () => {
  const s = summarize({ profile: PROFILE, progress: { 1: held(0) }, log: {}, now: NOW });
  assert.ok(
    s.fresh.every((n) => typeof n === "number"),
    "the pairs are flat",
  );
});

test("a summary read back is the row the board ranks", () => {
  const progress = { 1: held(0), 2: held(30) };
  const row = rowFromSummary(summarize({ profile: PROFILE, progress, log: {}, now: NOW }), NOW);

  assert.equal(row.count, 2);
  assert.equal(row.name, "Ada");
  assert.equal(row.gradClass, 2027);
  assert.ok(row.freshnessScore > 1 && row.freshnessScore < 2, "one verse fresh, one long faded");
});

test("freshness is computed when the board asks, not when the summary was written", () => {
  // The whole reason the pairs are stored rather than the score: a member who
  // stops opening the app sinks down the board over the following weeks.
  const s = summarize({ profile: PROFILE, progress: { 1: held(0) }, log: {}, now: NOW });
  const fresh = rowFromSummary(s, NOW).freshnessScore;
  const stale = rowFromSummary(s, NOW + 30 * DAY).freshnessScore;

  assert.ok(fresh > 0.99);
  assert.ok(stale < fresh / 2, "the same summary, read a month later, is worth less");
  assert.equal(rowFromSummary(s, NOW + 30 * DAY).count, 1, "though the verse is still committed");
});

test("a streak stands only for the day it was true of", () => {
  const s = summarize({ profile: PROFILE, progress: {}, log: { [day(2)]: 1, [day(1)]: 1, [day(0)]: 1 }, now: NOW });
  assert.equal(s.streak, 3);

  assert.equal(rowFromSummary(s, NOW).streak, 3);
  assert.equal(rowFromSummary(s, NOW + DAY).streak, 3, "still live the next day — the member may yet review");
  assert.equal(rowFromSummary(s, NOW + 2 * DAY).streak, 0, "after that it is plainly broken");
});

test("a member with no profile and no progress summarises to an empty row, not a crash", () => {
  const row = rowFromSummary(summarize({ now: NOW }), NOW);
  assert.equal(row.count, 0);
  assert.equal(row.freshnessScore, 0);
  assert.equal(row.streak, 0);
});

test("a summary from a document that is missing or malformed reads as empty", () => {
  for (const bad of [null, undefined, {}, { fresh: "no" }]) {
    const row = rowFromSummary(bad, NOW);
    assert.equal(row.count, 0);
    assert.equal(row.freshnessScore, 0);
  }
});

test("the account name stands in for a member who has not named themselves", () => {
  const s = summarize({ name: "Ada Lovelace", profile: { ministryGroup: "Kairos", shareRanking: true }, now: NOW });
  assert.equal(s.name, "Ada Lovelace");
});
