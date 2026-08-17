/* The motion block, both ways round.
 *
 * Every animation in this app lives in styles.css and is named by a class, and
 * every one of them is dropped under prefers-reduced-motion. That contract can
 * only be checked where there is a compositor: these are the same screens under
 * the two settings.
 *
 * The rest of the suite boots reduced (see the harness), so this file is also
 * what stops that convenience from hiding a broken animation. */

import { test, expect } from "./fixtures.mjs";
import { committed } from "./helpers/seed.mjs";

const PROGRESS = { 1: committed(1), 2: committed(0.4), 3: committed(0.5) };

const animationOf = (locator) => locator.evaluate((el) => getComputedStyle(el).animationName);

test("screens arrive, and the hero figures climb to their value", async ({ app }) => {
  await app.boot({ progress: PROGRESS, reducedMotion: "no-preference" });

  expect(await animationOf(app.board)).toBe("rise-in");
  expect(await animationOf(app.committedFigure)).toBe("count-up");
  // The climb is an interpolation of a registered --count, so the figure the
  // view set is still the one it lands on.
  await expect(async () => {
    expect(await app.figure(app.committedFigure)).toBe(3);
  }).toPass();
});

test("the splash turns while it waits", async ({ app, page }) => {
  await app.boot({ splashMinMs: 2_000, waitForApp: false, reducedMotion: "no-preference" });

  expect(await animationOf(page.locator(".splash-mark-ring"))).toBe("splash-rotate");
  expect(await animationOf(page.locator(".splash-fill"))).toBe("splash-advance");
});

test("under prefers-reduced-motion nothing moves, and every figure is true from the first frame", async ({
  app,
  page,
}) => {
  await app.boot({ progress: PROGRESS });

  expect(await animationOf(app.board)).toBe("none");
  expect(await animationOf(app.committedFigure)).toBe("none");
  // The counter is not an animation, so the number is still drawn.
  expect(await app.figure(app.committedFigure)).toBe(3);

  await app.nav("Passages").click();
  expect(await animationOf(page.locator(".item-in").first())).toBe("none");
});

test("the splash stands still, and still names the step", async ({ app, page }) => {
  await app.boot({ splashMinMs: 1_500, waitForApp: false });

  expect(await animationOf(page.locator(".splash-mark-ring"))).toBe("none");
  // One of the three lines has to stay up, since the cycle is what carries them.
  await expect(page.locator(".splash-cycle > div").first()).toBeVisible();
});
