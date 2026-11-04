/* The app on a phone (the "mobile" project in playwright.config.mjs).
 *
 * As the app ships a phone is let in and opens on Today, the one screen laid
 * out for it: the daily review is the thing a phone is for. The refusal the
 * phone used to meet instead is still there behind `features.mobileGate`
 * (src/config.js), and most of this file drives it with the flag back on, the
 * way a deploy that would rather keep the sitting at a desk would: it has to
 * stay total, it has to arrive before anything else, and nothing behind it may
 * leak through.
 *
 * The rule itself (which user agents count) is asserted in test/device.test.mjs;
 * this is the half that needs a browser actually claiming to be a Pixel. */

import { test, expect } from "./fixtures.mjs";
import { committed, passageById, started } from "./helpers/seed.mjs";

const MESSAGE = /This app is not available on a mobile device to reduce screen time/;
const GATE = { mobileGate: true };

/* A member with a real past: signed in, profile filled, verses committed. */
const PROGRESS = { 1: committed(0.98), 2: committed(0.4), 4: started(0.5) };

/* ── as it ships: the phone opens on Today ────────────────────────────────── */

test("a phone opens on Today, with the day's review one press away", async ({ app, page }) => {
  await app.boot({ progress: PROGRESS });

  await expect(app.today).toBeVisible();
  await expect(app.board).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "1 passage is due" })).toBeVisible();
  await expect(app.today).toContainText(passageById(2).ref);

  // The one press.
  await page.getByRole("button", { name: "Review 1 passage" }).click();
  await expect(page.getByRole("heading", { name: passageById(2).ref })).toBeVisible();
  await expect(page.getByText("Review · Flashcard · Passage 1 of 1")).toBeVisible();
});

test("the screens a phone gets fit the phone", async ({ app, page }) => {
  await app.boot({ progress: PROGRESS });
  await expect(app.today).toBeVisible();

  const overflow = () =>
    page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(await overflow()).toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "Review 1 passage" }).click();
  await expect(page.getByRole("heading", { name: passageById(2).ref })).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(1);
});

test("the header still reaches the rest of the app from a phone", async ({ app }) => {
  await app.boot({ progress: PROGRESS });
  await app.nav("Home").click();
  await expect(app.board).toBeVisible();
  await app.nav("Today").click();
  await expect(app.today).toBeVisible();
});

/* ── with the gate on: the refusal, total and first ────────────────────────── */

test("with the gate on, a phone is met by the refusal instead of the app", async ({ app, page }) => {
  await app.boot({ progress: PROGRESS, features: GATE });

  await expect(page.getByText(MESSAGE)).toBeVisible();
  await expect(page.getByText(/Access with a non-mobile device instead/)).toBeVisible();
  // The screen still says whose app it is.
  await expect(page.getByText("VERSE MASTERY")).toBeVisible();

  // Nothing behind the gate: no header to navigate with, no board, no queues.
  await expect(app.header).toHaveCount(0);
  await expect(app.board).toHaveCount(0);
  await expect(app.today).toHaveCount(0);
  await expect(page.getByRole("button")).toHaveCount(0);
});

test("the refusal comes before the boot, not after it", async ({ app, page }) => {
  // A floor the splash would plainly serve if it were ever shown: the phone is
  // turned away without being made to watch it, and without Firebase being
  // asked anything.
  await app.boot({ splashMinMs: 4000, firebase: { session: null }, features: GATE, waitForApp: false });

  await expect(page.getByText(MESSAGE)).toBeVisible();
  await expect(app.splash).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Sign in with Google/ })).toHaveCount(0);
});

test("a member with no profile yet is refused rather than asked to fill one in", async ({ app, page }) => {
  await app.boot({ profile: null, features: GATE });

  await expect(page.getByText(MESSAGE)).toBeVisible();
  await expect(page.getByRole("heading", { name: /SET UP YOUR PROFILE/ })).toHaveCount(0);
});

test("reloading does not get past it", async ({ app, page }) => {
  await app.boot({ progress: PROGRESS, features: GATE });
  await expect(page.getByText(MESSAGE)).toBeVisible();

  await page.reload();
  await expect(page.getByText(MESSAGE)).toBeVisible();
  await expect(app.board).toHaveCount(0);
});

test("the sentence is what is read out; the drawing beside it is not", async ({ app, page }) => {
  await app.boot({ features: GATE });

  // Two marks, the device refused and the one to open it on, drawn as SVG and
  // hidden from assistive tech, since the sentence under them already says it.
  const marks = page.locator("[aria-hidden='true'] svg");
  await expect(marks).toHaveCount(3);
  await expect(page.locator("svg").first()).toBeVisible();
});

test("the refusal fits the phone it is refusing", async ({ app, page }) => {
  await app.boot({ features: GATE });
  await expect(page.getByText(MESSAGE)).toBeVisible();

  // Content too wide for the viewport would scroll the page sideways.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
