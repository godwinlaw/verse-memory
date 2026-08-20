/* Which way round the page is printed.
 *
 * The palette is one block of token overrides in styles.css and no rules of its
 * own, and the choosing is four lines in src/theme.js — so what is left for a
 * browser to assert is everything neither of those can be asked about alone:
 * the computed colour a page is actually painted, that the reader's own system
 * still answers by default, and that a member who says otherwise on this device
 * is still being obeyed on the next visit. */

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

const groundOf = (page) => page.evaluate(() => document.documentElement.dataset.theme);
const settings = (app) => app.header.getByRole("button", { name: "Settings" }).click();
const choice = (page, label) => page.getByRole("button", { name: label, exact: true });

test.describe("a reader who asked their system for dark", () => {
  test.use({ colorScheme: "dark" });

  test("gets a dark page, without being asked", async ({ app, page }) => {
    await app.boot({ progress: PROGRESS, firebase: signedIn });

    expect(await lumaOf(page, "body")).toBeLessThan(60);
    expect(await lumaOf(page, "body", "color")).toBeGreaterThan(180);

    // Following the system is the default and stays the default: a member who
    // never opens Settings has said this once already, to their machine, and
    // nothing is written down on their behalf for saying it.
    expect(await app.storedText("mv.theme")).toBeNull();
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

test.describe("a reader who asked their system for light", () => {
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

/* The switch itself. It is one row under Settings, and everything about how it
 * behaves follows from the theme being device-local: it is not part of the
 * profile draft, so it does not wait for Save and is not undone by Cancel. */
test.describe("a member who wants the other ground on this screen", () => {
  test.use({ colorScheme: "dark" });

  test("turns the page over from Settings, and it stays turned over", async ({ app, page }) => {
    await app.boot({ progress: PROGRESS, firebase: signedIn });
    expect(await lumaOf(page, "body")).toBeLessThan(60);

    await settings(app);
    await expect(page.getByText("APPEARANCE")).toBeVisible();
    await choice(page, "Light").click();

    // Pressed is painted: there is nothing to confirm about a choice the member
    // can already see, so no Save stands between the press and the page.
    await expect.poll(() => lumaOf(page, "body")).toBeGreaterThan(200);
    expect(await groundOf(page)).toBe("light");
    expect(await app.storedText("mv.theme")).toBe("light");

    // Including the browser's own widgets, which would otherwise hand a member
    // on a dark system dark form controls on a paper page.
    const scheme = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
    expect(scheme).toBe("light");

    // And on the next visit, without the system having changed its mind.
    await app.revisit();
    expect(await groundOf(page)).toBe("light");
    expect(await lumaOf(page, "body")).toBeGreaterThan(200);
  });

  test("and can hand the question back to their system", async ({ app, page }) => {
    await app.boot({ progress: PROGRESS, firebase: signedIn, local: { "mv.theme": "light" } });
    expect(await lumaOf(page, "body")).toBeGreaterThan(200);

    await settings(app);
    await choice(page, "System").click();

    await expect.poll(() => lumaOf(page, "body")).toBeLessThan(60);
    expect(await groundOf(page)).toBe("dark");
    // Still written down: "follow my system" is an answer, and it has to beat
    // the light this device was left on.
    expect(await app.storedText("mv.theme")).toBe("system");
  });

  test("is not carried to their other devices", async ({ app }) => {
    // A screen read under office lights and a screen read at night are two
    // different questions, so the theme never joins the pushed record.
    await app.boot({ progress: PROGRESS, firebase: signedIn });
    await settings(app);
    await choice(app.page, "Dark").click();
    await expect.poll(() => app.storedText("mv.theme")).toBe("dark");

    for (const doc of await app.writes()) {
      expect(JSON.stringify(doc)).not.toMatch(/theme/i);
    }
  });
});

/* The page must not open on one ground and turn over onto the other. index.html
 * settles it in the line before the first paint, which is a claim about a page
 * the app has not run on yet — so it is asserted on a page the app never runs
 * on at all. */
test.describe("the ground is settled before anything is drawn", () => {
  test.use({ colorScheme: "light" });

  test("with the app's own module blocked, the member's choice is still on the page", async ({ app, page }) => {
    app.allowConsoleErrors(/main\.js/i, /Failed to load/i, /ERR_FAILED/i);
    await page.route("**/src/main.js", (route) => route.abort());

    await app.boot({ progress: PROGRESS, firebase: signedIn, local: { "mv.theme": "dark" }, waitForApp: false });

    expect(await groundOf(page)).toBe("dark");
    expect(await lumaOf(page, "body")).toBeLessThan(60);
  });
});
