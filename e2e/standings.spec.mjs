/* Ranking the groups themselves.
 *
 * How a group's figure is worked out is pure and covered in
 * test/standings.test.mjs. What needs a browser is the roster arriving over the
 * wire and the board changing the question it is answering when the member asks
 * it to, including that the filters above still apply, since ranking and
 * filtering are meant to compose rather than replace one another.
 */

import { test, expect } from "./fixtures.mjs";
import { MEMBER } from "./helpers/firebase-stub.mjs";
import { committed } from "./helpers/seed.mjs";

/* A roster as Firestore hands it back: whole user documents. Two members of one
 * ministry and one of another, so a group's figure is visibly an average. */
const peer = (uid, name, group, gender, gradClass, progress) => ({
  uid,
  name,
  email: uid + "@acts2.network",
  profile: { name, ministryGroup: group, gender, gradClass, shareRanking: true },
  progress,
  log: {},
});

const ROSTER = [
  peer("p1", "Grace Hopper", "USF", "Female", 2025, { 1: committed(0.9), 2: committed(0.9), 3: committed(0.9) }),
  peer("p2", "Dorothy Vaughan", "USF", "Female", 2025, { 1: committed(0.9) }),
  peer("p3", "Alan Turing", "Kairos", "Male", 2026, { 1: committed(0.9), 2: committed(0.9) }),
];

/* The same three, as the board actually reads them now: one summary document
 * each in `standings`, holding the figures and nothing else. */
const summary = (uid, name, group, gender, gradClass, verses) => ({
  uid,
  name,
  // A summary that carries a name is one whose member turned the switch on,
  // src/standings.js withholds the name otherwise, so the two travel together.
  shareRanking: true,
  ministryGroup: group,
  gender,
  gradClass,
  // last, stability, last, stability, see src/standings.js, summarize.
  fresh: Array.from({ length: verses }, () => [Date.now(), 30]).flat(),
  streak: 2,
  streakDay: new Date().toISOString().slice(0, 10),
});

/* Stats ships on, and these boots say so explicitly rather than leaning on the
 * default, the suite is about the board, so what it needs should not move when
 * a flag in src/config.js does. */
const STATS = { leaderboard: true };

async function stats(app) {
  await app.nav("Stats").click();
  return app.page;
}

test("the board is built from the summaries, not from everybody's record", async ({ app, page }) => {
  // Both collections are answered, holding different people. Only the summaries
  // may appear: reading `users` for the board is the cost this replaced.
  await app.boot({
    features: STATS,
    progress: {},
    firebase: {
      session: MEMBER,
      standings: [summary("p1", "Ada Lovelace", "USF", "Female", 2025, 3)],
      roster: ROSTER,
    },
  });
  await stats(app);

  await expect(page.getByRole("cell", { name: "Ada Lovelace" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Grace Hopper" })).toHaveCount(0);
});

test("a group with no summaries yet still has a board, read the old way", async ({ app, page }) => {
  // The day the change ships, nobody has pushed one. The fallback is what keeps
  // the board whole until they have.
  await app.boot({ features: STATS, progress: {}, firebase: { session: MEMBER, standings: [], roster: ROSTER } });
  await stats(app);

  await expect(page.getByRole("cell", { name: "Grace Hopper" })).toBeVisible();
});

test("the groups can be ranked against each other, per member", async ({ app, page }) => {
  await app.boot({ features: STATS, progress: {}, firebase: { session: MEMBER, roster: ROSTER } });
  await stats(app);

  // The board opens on people, as it always has.
  await expect(page.getByRole("cell", { name: "Grace Hopper" })).toBeVisible();

  await page.getByRole("button", { name: "Ministry", exact: true }).click();
  await expect(page.getByText("a small group is not out-run by a large one")).toBeVisible();

  // USF holds 3 + 1 across two members; Kairos holds 2 across one. Per member
  // that is 2.0 against 2.0 on committed, but Kairos is one person, so USF's
  // two members break the tie in its favour.
  const usf = page.getByRole("row", { name: /USF/ });
  await expect(usf).toContainText("2 members");
  await expect(usf).toContainText("2.0");

  const kairos = page.getByRole("row", { name: /Kairos/ });
  await expect(kairos).toContainText("1 member");

  // Counting groups now, not people.
  await expect(page.getByText(/^\d+ groups?$/i)).toBeVisible();
});

test("and by the other two things a member says about themselves", async ({ app, page }) => {
  await app.boot({ features: STATS, progress: {}, firebase: { session: MEMBER, roster: ROSTER } });
  await stats(app);

  await page.getByRole("button", { name: "Bros & Sis" }).click();
  await expect(page.getByRole("row", { name: /Sister/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Brother/ })).toBeVisible();

  await page.getByRole("button", { name: "Class", exact: true }).click();
  await expect(page.getByRole("row", { name: /2025/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /2026/ })).toBeVisible();
});

test("filtering and ranking compose rather than replacing each other", async ({ app, page }) => {
  await app.boot({ features: STATS, progress: {}, firebase: { session: MEMBER, roster: ROSTER } });
  await stats(app);

  await page.getByRole("button", { name: "Ministry", exact: true }).click();
  await expect(page.getByRole("row", { name: /USF/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Kairos/ })).toBeVisible();

  // Narrow to one class and the ministries are ranked within it.
  await page.getByLabel("Class").selectOption("2026");
  await expect(page.getByRole("row", { name: /Kairos/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /USF/ })).toHaveCount(0);
});

test("going back to people gives back the board it has always been", async ({ app, page }) => {
  await app.boot({ features: STATS, progress: { 1: committed(0.8) }, firebase: { session: MEMBER, roster: ROSTER } });
  await stats(app);

  // The column heading, not the podium caption beside it, both say the same
  // thing, which is the point, so this has to name which one it means.
  const perMemberColumn = page.getByRole("columnheader", { name: "Committed each" });
  await page.getByRole("button", { name: "Ministry", exact: true }).click();
  await expect(perMemberColumn).toBeVisible();

  await page.getByRole("button", { name: "Individuals", exact: true }).click();
  await expect(perMemberColumn).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "Grace Hopper" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "You", exact: true })).toBeVisible();
});
