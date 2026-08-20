/* The dark theme.
 *
 * It is one block of token overrides in styles.css and no rules of its own, so
 * there is nothing here a unit test could reach: what is asserted is the
 * computed colour a browser actually paints, under a reader who has asked their
 * operating system for dark.
 *
 * Three things are worth holding, and they are the three the block is built on.
 */

import { test, expect } from "./fixtures.mjs";
import { MEMBER } from "./helpers/firebase-stub.mjs";
import { committed, started } from "./helpers/seed.mjs";

const signedIn = { session: MEMBER };
const PROGRESS = { 1: committed(0.6), 3: started() };

/* "rgb(r, g, b)" → its perceived lightness, 0–255. */
const luma = (css) => {
  const [r, g, b] = css.match(/\d+/g).map(Number);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const lumaOf = (page, selector, prop = "background-color") =>
  page.evaluate(([s, p]) => getComputedStyle(document.querySelector(s))[p], [selector, prop]).then(luma);

test.describe("a reader who asked for dark", () => {
  test.use({ colorScheme: "dark" });

  test("gets a dark page, without being asked again", async ({ app, page }) => {
    await app.boot({ progress: PROGRESS, firebase: signedIn });

    expect(await lumaOf(page, "body")).toBeLessThan(60);
    expect(await lumaOf(page, "body", "color")).toBeGreaterThan(180);

    // The system is the whole of the preference: nothing to press, nothing
    // stored. A member has already told their operating system once, and asking
    // again would be the app putting a question to them it can look up.
    const themeSwitch = /^(dark|light)( mode)?$|^theme$/i;
    await expect(page.getByRole("button", { name: themeSwitch })).toHaveCount(0);

    // Including on the settings form, which is where such a switch would go.
    await app.header.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByText("EDIT YOUR PROFILE")).toBeVisible();
    await expect(page.getByRole("button", { name: themeSwitch })).toHaveCount(0);
    expect(await app.stored("mv.theme")).toBeFalsy();
  });

  test("the reversed plate lifts off the page instead of sinking into it", async ({ app, page }) => {
    // The plate is a treatment, not a shade — which is why it has its own two
    // tokens rather than reaching for the end of the accent ramp. On paper it
    // is darker than the page; on ink it has to be lighter.
    await app.boot({ progress: PROGRESS, firebase: signedIn });
    const plate = await lumaOf(page, ".blueprint[style*='background']");
    expect(plate).toBeGreaterThan(await lumaOf(page, "body"));
  });

  test("the browser's own widgets are told which way round the page is", async ({ app, page }) => {
    // The one thing a token cannot reach: form controls, scrollbars, the caret.
    await app.boot({ progress: PROGRESS, firebase: signedIn });
    const scheme = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
    expect(scheme).toBe("dark");
  });
});

test.describe("a reader who asked for light", () => {
  test.use({ colorScheme: "light" });

  test("gets the paper the app was drawn on", async ({ app, page }) => {
    await app.boot({ progress: PROGRESS, firebase: signedIn });
    expect(await lumaOf(page, "body")).toBeGreaterThan(200);
    expect(await lumaOf(page, "body", "color")).toBeLessThan(60);
  });

  test("and the plate sinks into it, the other way round", async ({ app, page }) => {
    await app.boot({ progress: PROGRESS, firebase: signedIn });
    const plate = await lumaOf(page, ".blueprint[style*='background']");
    expect(plate).toBeLessThan(await lumaOf(page, "body"));
  });
});
