/* The `app` fixture every spec imports its `test` from.
 *
 * It hands over an unbooted AppHarness — a spec's first line is its own
 * `app.boot(...)`, because what the member arrives with is usually the point of
 * the test — and, on the way out, fails the test if the page logged an error.
 * That last part is the browser half of the rule test/views.test.mjs enforces
 * over static markup: a screen that renders but warns is a screen that is
 * broken, and in a real browser the same net also catches a module that failed
 * to load or a handler that threw. A spec that means to provoke one — a blocked
 * CDN, say — says so with `app.allowConsoleErrors(/…/)`. */

import { test as base, expect } from "@playwright/test";
import { AppHarness } from "./helpers/app.mjs";

export const test = base.extend({
  app: async ({ page }, use) => {
    const app = new AppHarness(page);
    await use(app);
    expect(app.unexpectedConsoleErrors, "the page logged errors").toEqual([]);
  },
});

export { expect };
