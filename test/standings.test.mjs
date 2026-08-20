/* Ranking groups rather than people.
 *
 * The measure is per member throughout, and most of what is worth asserting
 * here is that it stays per member — a total would rank by attendance, which is
 * the one thing the board must not do. */

import test from "node:test";
import assert from "node:assert/strict";

import { RANK_BY, rankFieldFor, standingsBy } from "../src/standings.js";

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
  assert.equal(RANK_BY[0].key, "people");
});

test("an empty roster is an empty board, not a crash", () => {
  assert.deepEqual(standingsBy([], "ministryGroup"), []);
});
