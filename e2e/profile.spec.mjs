/* The profile: the form that stands between a new member and the app, and the
 * two settings on it that the rest of the app then reads.
 *
 * These boot with the Firebase stub signed in, because the profile is an
 * account's — the header only carries a name, a settings button and a sign-out
 * once there is a session behind them.
 *
 * The second half is the part worth driving in a browser: the member's own
 * threshold is what the board's review queue and the guide both quote, so
 * changing it here has to change both. */

import { test, expect } from "./fixtures.mjs";
import { MEMBER } from "./helpers/firebase-stub.mjs";
import { committed, passageById, started } from "./helpers/seed.mjs";

const signedIn = { session: MEMBER };

/* The sign-up form and the welcome nudge that follows it are switched off as
 * the app ships (src/config.js `features`) — a member signs in and lands on the
 * board. They are hidden rather than deleted, so most of this file puts them
 * back the way a deploy would; the last test is the one that does not, and
 * checks what a member actually meets. `PROFILE_FIELDS` is the narrower flag
 * for a screen that only needs the form's identity fields, not the gate. */
const SIGNUP = { profileSetup: true, welcome: true };
const PROFILE_FIELDS = { profileSetup: true };

test("a member with no profile fills one in before the app", async ({ app, page }) => {
  await app.boot({ profile: null, firebase: signedIn, features: SIGNUP });

  await expect(page.getByText("SET UP YOUR PROFILE")).toBeVisible();
  await expect(app.board).toHaveCount(0);

  // The name arrives pre-filled from the Google account, campus tag stripped.
  await expect(page.getByPlaceholder("Your full name")).toHaveValue("Ada Lovelace");

  const save = page.getByRole("button", { name: "Save and continue" });
  await expect(save).toBeDisabled();

  await page.getByPlaceholder("Your full name").fill("Grace Hopper");
  await page.getByPlaceholder("Start typing to search…").fill("Kai");
  await page.getByRole("button", { name: "Kairos" }).click();
  await page.getByRole("button", { name: "Sister" }).click();
  await page.getByPlaceholder("e.g. 2016").fill("2027");

  await expect(save).toBeEnabled();
  await save.click();

  // Finishing the form for the first time lands on the welcome nudge, not the
  // board — it is shown once, between sign-up and the app (App.submitProfile).
  await page.getByRole("button", { name: "Start learning right away" }).click();
  await app.nav("Home").click();

  await expect(app.board).toBeVisible();
  await expect(app.header).toContainText("Grace Hopper");

  // Saved, so the form is not asked for again.
  await app.revisit();
  await expect(app.board).toBeVisible();
  expect(await app.stored("mv.profile")).toMatchObject({
    name: "Grace Hopper",
    ministryGroup: "Kairos",
    gender: "Female",
  });
});

/* Signing up asks who the member is and stops there. How reviews behave is a
 * set of questions nobody can answer before they have used the app, so they
 * wait for Settings — and nothing is lost by waiting, because the defaults are
 * written either way (App.submitProfile). */
test("signing up never asks how reviews should work", async ({ app, page }) => {
  await app.boot({ profile: null, firebase: signedIn, features: SIGNUP });
  await expect(page.getByText("SET UP YOUR PROFILE")).toBeVisible();

  await expect(page.getByText("REVIEW SETTINGS")).toHaveCount(0);
  await expect(page.getByText("Top X committed verses to review at a time")).toHaveCount(0);
  await expect(page.getByText("You can change how reviews work later, under Settings.")).toBeVisible();

  await page.getByPlaceholder("Your full name").fill("Grace Hopper");
  await page.getByPlaceholder("Start typing to search…").fill("Kai");
  await page.getByRole("button", { name: "Kairos" }).click();
  await page.getByRole("button", { name: "Sister" }).click();
  await page.getByPlaceholder("e.g. 2016").fill("2027");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await page.getByRole("button", { name: "Start learning right away" }).click();

  // The defaults went in all the same — the questions were skipped, not the
  // answers.
  expect(await app.stored("mv.profile")).toMatchObject({
    dueTopX: 10,
    dueFreshness: 75,
    commitThreshold: 95,
    defaultDifficulty: 1,
  });

  // And they are all there to change, the moment the member wants them.
  await app.header.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByText("REVIEW SETTINGS")).toBeVisible();
  await expect(page.getByLabel("Review a committed verse once it fades to (%)")).toHaveValue("75");
});

test("the member's freshness threshold decides what comes back round", async ({ app, page }) => {
  // Committed at 60%: due at the default 75% mark, but not at 40%.
  await app.boot({ progress: { 2: committed(0.6) }, firebase: signedIn, features: { ...PROFILE_FIELDS, guide: true } });
  await expect(app.queue("Review today")).toContainText(passageById(2).ref);

  await app.header.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByText("EDIT YOUR PROFILE")).toBeVisible();
  await page.getByLabel("Review a committed verse once it fades to (%)").fill("40");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(app.board).toBeVisible();
  // The queue's note sits beside its heading, above the rows themselves.
  await expect(app.board).toContainText("committed · faded to 40% or below");
  await expect(app.queue("Review today")).not.toContainText(passageById(2).ref);

  // And the same figure is what the guide teaches.
  await app.nav("Guide").click();
  await expect(page.getByText("asks for it back at 40%")).toBeVisible();
});

test("editing can be backed out of", async ({ app, page }) => {
  await app.boot({ progress: {}, firebase: signedIn, features: PROFILE_FIELDS });

  await app.header.getByRole("button", { name: "Settings" }).click();
  await page.getByPlaceholder("Your full name").fill("Someone Else");
  await page.getByRole("button", { name: "Cancel" }).click();

  await expect(app.board).toBeVisible();
  await expect(app.header).toContainText("Ada Lovelace");
});

/* Resetting the record. Worth driving in a browser rather than asserting on the
 * view-model: what makes a wipe a wipe is that it is still gone on the next
 * visit, and that it went up as a replacement — a merged push would leave every
 * verse in the cloud copy to come back on the following sign-in. */
test("resetting all progress empties the board, and stays empty", async ({ app, page }) => {
  await app.boot({
    progress: { 1: committed(1), 2: committed(0.6), 3: started(0.5) },
    firebase: signedIn,
    features: PROFILE_FIELDS,
  });
  expect(await app.figure(app.committedFigure)).toBe(2);

  await app.header.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Reset all progress" }).click();

  // The warning stands in front of it, counting what would go.
  await expect(app.dialog).toContainText("erases 2 committed passages and 1 passage in progress");
  await expect(app.dialog).toContainText("This cannot be undone.");

  // Backing out changes nothing.
  await page.getByRole("button", { name: "Keep my progress" }).click();
  await expect(app.dialog).toHaveCount(0);
  expect(await app.stored("mv.progress")).toMatchObject({ 1: { status: "memorized" } });

  await page.getByRole("button", { name: "Reset all progress" }).click();
  await page.getByRole("button", { name: "Yes, reset everything" }).click();
  await expect(app.dialog).toHaveCount(0);

  // The profile is not the record, so the form is still open on it.
  await expect(page.getByPlaceholder("Your full name")).toHaveValue("Ada Lovelace");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(app.board).toBeVisible();
  expect(await app.figure(app.committedFigure)).toBe(0);
  expect(await app.stored("mv.progress")).toEqual({});

  // The wipe went up as a whole document — no merge option — since merging an
  // empty map into the stored one would delete nothing, and every wiped verse
  // would come back on the next sign-in. (Ordinary saves after it still merge,
  // so it is the write without options that has to be found.)
  await expect(async () => {
    const wipes = (await app.writes()).filter((w) => w.data && w.data.progress && !w.options);
    expect(wipes).toHaveLength(1);
    expect(wipes[0].data.progress).toEqual({});
    expect(wipes[0].data.log).toEqual({});
    // Written whole, so identity has to be in it or the roster would lose them.
    expect(wipes[0].data.email).toBe(MEMBER.email);
  }).toPass();

  await app.revisit();
  expect(await app.figure(app.committedFigure)).toBe(0);
});

/* And what a member meets today, with both flags where they ship: no form
 * between them and the app, and a settings screen that is only settings. */
test("with the sign-up form put away, a new member goes straight to the board", async ({ app, page }) => {
  await app.boot({ profile: null, firebase: signedIn });

  await expect(app.board).toBeVisible();
  await expect(page.getByText("SET UP YOUR PROFILE")).toHaveCount(0);

  // Settings is still there, and still saves — it just asks nothing about who
  // the member is, so there is nothing left incomplete to hold Save against.
  await app.header.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByText("REVIEW SETTINGS")).toBeVisible();
  await expect(page.getByPlaceholder("Start typing to search…")).toHaveCount(0);

  await page.getByLabel("Review a committed verse once it fades to (%)").fill("40");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(app.board).toBeVisible();
  await expect(app.board).toContainText("committed · faded to 40% or below");
});
