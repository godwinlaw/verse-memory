/* Landing: the splash, and what it decides.
 *
 * The splash is the one screen with a clock in it — a floor it stays up for and
 * a ceiling it waits on Firebase under — so it is the one screen a render test
 * cannot say much about. These are the two ends of that wait, plus the seam the
 * whole thing is configured through. */

import { test, expect } from "./fixtures.mjs";
import { PROFILE, TOTAL, committed } from "./helpers/seed.mjs";
import { MEMBER } from "./helpers/firebase-stub.mjs";

test("the splash names the set, then hands the member to their board", async ({ app, page }) => {
  await app.boot({ splashMinMs: 1500, waitForApp: false });

  await expect(app.splash).toBeVisible();
  await expect(page.locator(".splash-wordmark")).toHaveText("VERSE MASTERY");
  // The one thing on it drawn from data, and it comes from the passage module
  // rather than from state — which is still loading behind it.
  await expect(page.locator(".splash-cycle")).toContainText(`Indexing ${TOTAL} passages`);
  // The cycle is drawn but not announced; the truthful line is read instead.
  await expect(page.getByRole("status")).toHaveText("Checking your session…");

  await app.splash.waitFor({ state: "detached" });
  await expect(app.board).toBeVisible();
});

test("with no floor to serve, the app opens straight onto the board", async ({ app }) => {
  const started = Date.now();
  await app.boot({ splashMinMs: 0 });

  await expect(app.board).toBeVisible();
  expect(Date.now() - started, "nothing should be waiting on the splash").toBeLessThan(10_000);
});

test("the splash holds until Firebase says whether there is a session to restore", async ({ app }) => {
  // Local data loads at once; it is the session check that keeps the splash up.
  await app.boot({ firebase: { mode: "hang" }, waitForApp: false });

  await expect(app.splash).toBeVisible();
  await expect(app.splash).toBeVisible({ timeout: 3_000 });

  // SPLASH_MAX_MS (8s in App.js) is the failsafe under it: a Firebase that never
  // answers must not strand the member, so the sign-in gate arrives anyway.
  await expect(app.page.getByRole("button", { name: /Sign in with Google/ })).toBeVisible({ timeout: 20_000 });
});

test("a restored session goes straight to the board, never past the sign-in gate", async ({ app, page }) => {
  await app.boot({ firebase: { session: MEMBER }, progress: { 1: committed(1) } });

  await expect(app.board).toBeVisible();
  await expect(page.getByRole("button", { name: /Sign in with Google/ })).toHaveCount(0);
  // The Workspace campus tag is stripped on the way in (profile.cleanDisplayName).
  // The name is on the account circle now, as its initials and its label.
  await expect(app.avatar).toHaveAttribute("aria-label", PROFILE.name);
});

test("a deploy's config.js decides the group and the deadline", async ({ app, page }) => {
  await app.boot({ groupName: "Acts 2 Network - Testing", deadline: "2027-01-31" });

  await expect(app.board).toContainText("Progress to 31 January");
  // The group is no longer printed under the wordmark, so the screen that
  // carries it is the board it belongs to rather than every screen at once.
  await expect(app.header).not.toContainText("Acts 2 Network - Testing");
  await app.nav("Stats").click();
  await expect(page.getByText("Acts 2 Network - Testing")).toBeVisible();
});
