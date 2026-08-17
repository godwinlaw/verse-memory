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
import { committed, passageById } from "./helpers/seed.mjs";

const signedIn = { session: MEMBER };

test("a member with no profile fills one in before the app", async ({ app, page }) => {
  await app.boot({ profile: null, firebase: signedIn });

  await expect(page.getByText("SET UP YOUR PROFILE")).toBeVisible();
  await expect(app.board).toHaveCount(0);

  // The name arrives pre-filled from the Google account, campus tag stripped.
  await expect(page.getByPlaceholder("Your full name")).toHaveValue("Ada Lovelace");

  const save = page.getByRole("button", { name: "Save and continue" });
  await expect(save).toBeDisabled();

  await page.getByPlaceholder("Your full name").fill("Grace Hopper");
  await page.getByPlaceholder("Start typing to search…").fill("Kai");
  await page.getByRole("button", { name: "Kairos" }).click();
  await page.getByRole("button", { name: "Female" }).click();
  await page.getByPlaceholder("e.g. 2016").fill("2027");

  await expect(save).toBeEnabled();
  await save.click();

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

test("the member's freshness threshold decides what comes back round", async ({ app, page }) => {
  // Committed at 60%: due at the default 75% mark, but not at 40%.
  await app.boot({ progress: { 2: committed(0.6) }, firebase: signedIn });
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
  await app.boot({ progress: {}, firebase: signedIn });

  await app.header.getByRole("button", { name: "Settings" }).click();
  await page.getByPlaceholder("Your full name").fill("Someone Else");
  await page.getByRole("button", { name: "Cancel" }).click();

  await expect(app.board).toBeVisible();
  await expect(app.header).toContainText("Ada Lovelace");
});
