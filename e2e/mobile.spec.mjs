/* The app on a phone (the "mobile" project in playwright.config.mjs).
 *
 * There is nothing to drive here, because there is nothing to use: The Memory
 * Board is not offered on a device you hold, so a phone gets one screen with
 * one sentence on it and no way past. What these check is that the refusal is
 * total, it arrives before anything else, it does not depend on what the
 * member has already done, and nothing behind it leaks through, since the rule
 * only means anything if none of the app is reachable around it.
 *
 * The rule itself (which user agents count) is asserted in test/device.test.mjs;
 * this is the half that needs a browser actually claiming to be a Pixel. */

import { test, expect } from "./fixtures.mjs";
import { committed, started } from "./helpers/seed.mjs";

const MESSAGE = /This app is not available on a mobile device to reduce screen time/;

/* A member with a real past: signed in, profile filled, verses committed. None
 * of it earns a way in, which is the point of seeding it. */
const PROGRESS = { 1: committed(0.98), 2: committed(0.4), 4: started(0.5) };

test("a phone is met by the refusal instead of the app", async ({ app, page }) => {
  await app.boot({ progress: PROGRESS });

  await expect(page.getByText(MESSAGE)).toBeVisible();
  await expect(page.getByText(/Access with a non-mobile device instead/)).toBeVisible();
  // The screen still says whose app it is.
  await expect(page.getByText("VERSE MASTERY")).toBeVisible();

  // Nothing behind the gate: no header to navigate with, no board, no queues.
  await expect(app.header).toHaveCount(0);
  await expect(app.board).toHaveCount(0);
  await expect(page.getByRole("button")).toHaveCount(0);
});

test("the refusal comes before the boot, not after it", async ({ app, page }) => {
  // A floor the splash would plainly serve if it were ever shown: the phone is
  // turned away without being made to watch it, and without Firebase being
  // asked anything.
  await app.boot({ splashMinMs: 4000, firebase: { session: null }, waitForApp: false });

  await expect(page.getByText(MESSAGE)).toBeVisible();
  await expect(app.splash).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Sign in with Google/ })).toHaveCount(0);
});

test("a member with no profile yet is refused rather than asked to fill one in", async ({ app, page }) => {
  await app.boot({ profile: null });

  await expect(page.getByText(MESSAGE)).toBeVisible();
  await expect(page.getByRole("heading", { name: /SET UP YOUR PROFILE/ })).toHaveCount(0);
});

test("reloading does not get past it", async ({ app, page }) => {
  await app.boot({ progress: PROGRESS });
  await expect(page.getByText(MESSAGE)).toBeVisible();

  await page.reload();
  await expect(page.getByText(MESSAGE)).toBeVisible();
  await expect(app.board).toHaveCount(0);
});

test("the sentence is what is read out; the drawing beside it is not", async ({ app, page }) => {
  await app.boot();

  // Two marks, the device refused and the one to open it on, drawn as SVG and
  // hidden from assistive tech, since the sentence under them already says it.
  const marks = page.locator("[aria-hidden='true'] svg");
  await expect(marks).toHaveCount(3);
  await expect(page.locator("svg").first()).toBeVisible();
});

test("the screen fits the phone it is refusing", async ({ app, page }) => {
  await app.boot();
  await expect(page.getByText(MESSAGE)).toBeVisible();

  // Content too wide for the viewport would scroll the page sideways. The one
  // screen a phone ever sees is the one screen that has to fit on it.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
