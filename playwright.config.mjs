/* Playwright: the app driven end to end in a real browser.
 *
 * This suite is deliberately the complement of `npm test`, not a second copy of
 * it. The node:test suite renders every screen to static markup and asserts the
 * pure modules directly; what it cannot do is press a button. So everything
 * here is a behaviour that only exists once the app is running: state that
 * survives a reload, a card actually committed by typing a passage out, a run of
 * rows ticked by shift-click, the CSS the views only name (the count-up figures,
 * the two-sided card, the reduced-motion block), and the Firebase seam answering
 * over the wire.
 *
 * The app is served exactly as `npm run dev` serves it, no bundler, no build,
 * so what runs under test is the shipped tree. The three CDN scripts index.html
 * loads are the one substitution, fulfilled from the dev-only npm copies (see
 * e2e/helpers/app.mjs) so the suite neither needs the network nor pins itself to
 * unpkg's uptime. Set E2E_LIVE_CDN=1 to exercise the real CDN path. */

import { defineConfig, devices } from "@playwright/test";

/* Seeds are built in node (e2e/helpers/seed.mjs) and read in the browser, and
 * both halves date by the local day, text.dayKey(). They have to agree on which
 * day that is, so the runner takes the same zone `use.timezoneId` gives the
 * page. Node re-reads TZ per call, so setting it here is enough. */
process.env.TZ = process.env.TZ || "America/Los_Angeles";

const PORT = Number(process.env.E2E_PORT || 8080);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // The node:test suite is test/**/*.test.mjs; this one is *.spec.mjs, so the
  // two runners can never pick up each other's files.
  testMatch: "**/*.spec.mjs",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  timeout: 30_000,
  expect: { timeout: 7_000 },

  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
    // Note: prefers-reduced-motion is not set here. Every screen in this app
    // arrives with an animation and the app drops all of them under that query
    // (styles.css), so the suite wants the reduced branch by default, but the
    // context-level `reducedMotion` option is a no-op in this Chromium build,
    // so the harness emulates it per page instead (e2e/helpers/app.mjs, boot's
    // `reducedMotion` option). motion.spec.mjs is what opts back in.
    // text.dayKey() is local-day, and the deadline countdown is a local-date
    // subtraction, so the clock the browser reads is pinned.
    timezoneId: "America/Los_Angeles",
    locale: "en-US",
    // The app registers a service worker (sw.js) that answers the page's
    // requests from its own cache, and a request the worker answers never
    // reaches page.route, so the two seams the harness takes over would be
    // bypassed on every second visit. Blocked here, and allowed again only in
    // the "offline" project below, which is the one that is about the worker.
    serviceWorkers: "block",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: ["**/mobile.spec.mjs", "**/offline.spec.mjs"],
    },
    {
      // A browser that really claims to be a phone: the one screen the app
      // used to show one (the refusal, src/device.js, now behind a flag) and
      // the one it opens on now (Today, src/landing.js).
      name: "mobile",
      use: { ...devices["Pixel 5"] },
      testMatch: "**/mobile.spec.mjs",
    },
    {
      // The worker itself: installed, then the app opened with the network
      // off. The CDN cannot be stubbed under a worker (see the note on
      // serviceWorkers above), so this project reaches the real one, as
      // E2E_LIVE_CDN=1 does, and the spec skips itself where it cannot.
      name: "offline",
      use: { ...devices["Desktop Chrome"], serviceWorkers: "allow" },
      testMatch: "**/offline.spec.mjs",
    },
  ],

  webServer: {
    // The same static server `npm run dev` runs, on a port the suite can move.
    command: `npx serve -l ${PORT} .`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    timeout: 60_000,
  },
});
