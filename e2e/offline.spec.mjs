/* The app with no signal (the "offline" project in playwright.config.mjs).
 *
 * sw.js is run in node by test/offline.test.mjs, file by file. What needs a
 * browser is the whole thing end to end: a first visit installs the worker and
 * fills its cache, and a second visit with the network switched off still
 * opens the app from that cache, the member's record and all.
 *
 * The one thing this project cannot do is stub the CDN: a request the worker
 * answers never reaches page.route, so the three scripts come from the real
 * unpkg here, exactly as E2E_LIVE_CDN=1 runs the rest of the suite. Where the
 * browser cannot reach it (a sandbox with no outbound network) the spec says
 * so and skips rather than failing on the network it is not about. */

import { test, expect } from "./fixtures.mjs";
import { committed, passageById, started } from "./helpers/seed.mjs";

const PROGRESS = { 1: committed(0.98), 2: committed(0.4), 4: started(0.5) };
const PROBE = "https://unpkg.com/htm@3.1.1/dist/htm.umd.js";

/* Whether this browser can reach the CDN at all. Asked from a page, since that
 * is where the worker's fetches run from. */
async function cdnReachable(page) {
  await page.goto("/");
  return page.evaluate(
    (url) =>
      fetch(url, { mode: "cors" })
        .then((r) => r.ok)
        .catch(() => false),
    PROBE,
  );
}

test("installed on a first visit, the app opens with no signal on the second", async ({ app, page, context }) => {
  test.skip(!(await cdnReachable(page)), "the browser cannot reach the CDN, so the worker has nothing to cache");
  // The worker's own fetches, and the SDK import, fail offline and the browser
  // logs each one; those are the errors this test is about.
  app.allowConsoleErrors(/Failed to load resource/, /net::ERR_/, /Failed to fetch/, /503/);

  await app.boot({ progress: PROGRESS, liveCdn: true });
  await expect(app.board).toBeVisible();

  // The worker is in and its cache is filled: `ready` resolves once install
  // (and so the precache it waits on) has finished.
  const scope = await page.evaluate(() => navigator.serviceWorker.ready.then((r) => r.scope));
  expect(scope).toMatch(/\/$/);
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    const cache = await caches.open(keys.find((k) => k.startsWith("verse-mastery-")));
    return (await cache.keys()).map((r) => r.url);
  });
  expect(cached.some((url) => url.endsWith("/src/App.js"))).toBe(true);
  expect(cached.some((url) => url.includes("unpkg.com/react@"))).toBe(true);

  // Now the signal goes, and the app is opened again.
  await context.setOffline(true);
  await app.open("/");

  await expect(app.board).toBeVisible();
  expect(await app.figure(app.committedFigure)).toBe(2);
  await expect(app.queue("Review today")).toContainText(passageById(2).ref);

  // A sitting still works, and is saved on the device for the push to carry
  // once the signal is back.
  await app.queue("Review today").getByRole("button").first().click();
  await page.getByRole("button", { name: "Finish session" }).click();
  await expect(page.getByRole("heading", { name: "1 passage refreshed" })).toBeVisible();
  const saved = await app.stored("mv.progress");
  expect(saved[2].last).toBeGreaterThan(PROGRESS[2].last);

  await context.setOffline(false);
});

test("the installed copy's start address opens on Today, offline too", async ({ app, page, context }) => {
  test.skip(!(await cdnReachable(page)), "the browser cannot reach the CDN, so the worker has nothing to cache");
  app.allowConsoleErrors(/Failed to load resource/, /net::ERR_/, /Failed to fetch/, /503/);

  await app.boot({ progress: PROGRESS, liveCdn: true });
  await page.evaluate(() => navigator.serviceWorker.ready);

  await context.setOffline(true);
  // An address the cache has never seen: the worker falls back to the page.
  await app.open("/?screen=today");
  await expect(app.today).toBeVisible();
  await expect(page.getByRole("heading", { name: "1 passage is due" })).toBeVisible();
  await context.setOffline(false);
});
