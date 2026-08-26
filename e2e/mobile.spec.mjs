/* The app on a phone (the "mobile" project in playwright.config.mjs).
 *
 * A phone is no longer refused — it is warned. The app was designed for a desk
 * sitting and is at its best on a computer, so a phone gets one screen saying
 * so, with the Speak-mode safety warning on it and a single Continue button
 * through. What these check is that the warning is first — it arrives before
 * anything else, whatever the member has already done — that Continue really
 * does reach the app, and that the acknowledgement is deliberately not saved,
 * so the safety warning is shown again on the next visit.
 *
 * The rule itself (which user agents count) is asserted in test/device.test.mjs;
 * this is the half that needs a browser actually claiming to be a Pixel. */

import { test, expect } from "./fixtures.mjs";
import { committed, started } from "./helpers/seed.mjs";

const MESSAGE = /designed for a sitting at a desk, and it is at its best on a computer/;
const SAFETY = /never look at or touch the screen while driving/;

/* A member with a real past: signed in, profile filled, verses committed. None
 * of it skips the warning, which is the point of seeding it. */
const PROGRESS = { 1: committed(0.98), 2: committed(0.4), 4: started(0.5) };

test("a phone is met by the warning instead of the app", async ({ app, page }) => {
  await app.boot({ progress: PROGRESS });

  await expect(page.getByText(MESSAGE)).toBeVisible();
  await expect(page.getByText(SAFETY)).toBeVisible();
  // The screen still says whose app it is.
  await expect(page.getByText("VERSE MASTERY")).toBeVisible();

  // Nothing behind the gate yet: no header to navigate with, no board, and the
  // one thing to press is Continue.
  await expect(app.header).toHaveCount(0);
  await expect(app.board).toHaveCount(0);
  await expect(page.getByRole("button")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
});

test("Continue passes through the warning to the app", async ({ app, page }) => {
  await app.boot({ progress: PROGRESS });
  await expect(page.getByText(MESSAGE)).toBeVisible();

  await page.getByRole("button", { name: "Continue" }).click();

  await expect(app.board).toBeVisible();
  await expect(app.header).toBeVisible();
  await expect(page.getByText(MESSAGE)).toHaveCount(0);
});

test("the warning comes before the boot, not after it", async ({ app, page }) => {
  // A floor the splash would plainly serve if it came first: the phone gets the
  // warning without being made to watch it, and without Firebase being asked
  // anything.
  await app.boot({ splashMinMs: 4000, firebase: { session: null }, waitForApp: false });

  await expect(page.getByText(MESSAGE)).toBeVisible();
  await expect(app.splash).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Sign in with Google/ })).toHaveCount(0);
});

test("the acknowledgement is not saved: a reload shows the warning again", async ({ app, page }) => {
  await app.boot({ progress: PROGRESS });
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(app.board).toBeVisible();

  // A second visit is warned again — the safety line is re-shown each visit,
  // deliberately, so the acknowledgement lives in state and nowhere else.
  await page.reload();
  await expect(page.getByText(MESSAGE)).toBeVisible();
  await expect(page.getByText(SAFETY)).toBeVisible();
  await expect(app.board).toHaveCount(0);
});

test("the sentences are what is read out; the drawing beside them is not", async ({ app, page }) => {
  await app.boot();

  // Three marks — the device in hand, the arrow, and the computer it is best on
  // — drawn as SVG and hidden from assistive tech, since the sentences under
  // them already say it.
  const marks = page.locator("[aria-hidden='true'] svg");
  await expect(marks).toHaveCount(3);
  await expect(page.locator("svg").first()).toBeVisible();
});

test("the screen fits the phone it is warning", async ({ app, page }) => {
  await app.boot();
  await expect(page.getByText(MESSAGE)).toBeVisible();

  // Content too wide for the viewport would scroll the page sideways. The first
  // screen a phone sees has to fit on it.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
