/* The passage list, and the one thing only it can do: hand-pick a sitting.
 *
 * Ticking rows is the app's most interactive surface — a run of them is ticked
 * by shift-click, measured from the last row ticked on its own — and none of
 * that exists until there is a pointer holding shift. */

import { test, expect } from "./fixtures.mjs";
import { TOTAL, committed, passageById, passages, started } from "./helpers/seed.mjs";

const PSALMS = passages.filter((p) => p.category === "psalms").length;

const PROGRESS = { 1: committed(0.9), 2: committed(0.4), 4: started(0.5) };

const row = (page, ref) => page.locator(".item-in").filter({ hasText: ref });
const tick = (page, ref) => page.getByRole("button", { name: new RegExp(`^(Select|Deselect) ${ref}$`) });

async function openList(app) {
  await app.nav("Passages").click();
  await expect(app.page.getByRole("heading", { name: "All passages" })).toBeVisible();
}

test("search narrows the table, and the summary counts what is shown", async ({ app, page }) => {
  await app.boot({ progress: PROGRESS });
  await openList(app);

  await expect(page.locator(".item-in")).toHaveCount(TOTAL);
  await expect(page.getByText(`${TOTAL} shown · 2 committed`)).toBeVisible();

  await page.getByPlaceholder("Search reference or text").fill("Psalm 46");
  await expect(page.locator(".item-in")).toHaveCount(1);
  await expect(page.getByText("1 shown ·")).toBeVisible();
  await expect(row(page, "Psalm 46:10")).toBeVisible();

  await page.getByPlaceholder("Search reference or text").fill("zzzz");
  await expect(page.locator(".item-in")).toHaveCount(0);
});

/* Two tab rows sit side by side above the table — the shelves, then the
 * statuses — and each has an "All". Reached by row so a spec cannot silently
 * press the wrong one. */
const categoryTabs = (page) => page.locator(".seg").first();
const statusTabs = (page) => page.locator(".seg").nth(1);

test("the status tabs show one half of the set at a time", async ({ app, page }) => {
  await app.boot({ progress: PROGRESS });
  await openList(app);

  await statusTabs(page).getByRole("button", { name: "Committed", exact: true }).click();
  await expect(page.locator(".item-in")).toHaveCount(2);
  await expect(row(page, passageById(1).ref)).toBeVisible();

  await statusTabs(page).getByRole("button", { name: "In progress", exact: true }).click();
  await expect(page.locator(".item-in")).toHaveCount(1);
  await expect(row(page, passageById(4).ref)).toBeVisible();

  await statusTabs(page).getByRole("button", { name: "All", exact: true }).click();
  await expect(page.locator(".item-in")).toHaveCount(TOTAL);
});

test("the category tabs show one shelf at a time, and the two rows narrow together", async ({ app, page }) => {
  await app.boot({ progress: PROGRESS });
  await openList(app);

  await categoryTabs(page).getByRole("button", { name: "Psalms", exact: true }).click();
  await expect(page.locator(".item-in")).toHaveCount(PSALMS);
  await expect(row(page, "Psalm 23")).toBeVisible();
  // A core verse is genuinely gone, not merely scrolled past.
  await expect(row(page, passageById(1).ref)).toHaveCount(0);

  // The two rows are separate filters, so a status on top of a shelf narrows
  // again rather than replacing it.
  await statusTabs(page).getByRole("button", { name: "Committed", exact: true }).click();
  await expect(page.locator(".item-in")).toHaveCount(0);

  await statusTabs(page).getByRole("button", { name: "All", exact: true }).click();
  await categoryTabs(page).getByRole("button", { name: "All", exact: true }).click();
  await expect(page.locator(".item-in")).toHaveCount(TOTAL);
});

test("the sections of a long chapter are gathered under its heading", async ({ app, page }) => {
  await app.boot({ progress: PROGRESS });
  await openList(app);

  await categoryTabs(page).getByRole("button", { name: "DT", exact: true }).click();
  // Hebrews 11 ships as several sections, each committing on its own, with one
  // heading over the run so they still read as one chapter.
  await expect(page.getByText("Hebrews 11", { exact: true })).toHaveCount(1);
  await expect(row(page, "Hebrews 11:1-7")).toBeVisible();
  await expect(row(page, "Hebrews 11:39-40")).toBeVisible();
});

test("a row's own button takes that verse as a sitting of one", async ({ app, page }) => {
  await app.boot({ progress: PROGRESS });
  await openList(app);

  // A committed verse is reviewed; an uncommitted one is learned. The label is
  // the rule, so the row says which it will be.
  await expect(row(page, passageById(1).ref).getByRole("button", { name: "Review" })).toBeVisible();
  await row(page, passageById(4).ref).getByRole("button", { name: "Learn" }).click();

  await expect(page.getByText("Learn · Flashcard · Passage 1 of 1")).toBeVisible();
});

test("ticked rows are taken as one sitting", async ({ app, page }) => {
  await app.boot({ progress: PROGRESS });
  await openList(app);

  await tick(page, passageById(6).ref).click();
  await tick(page, passageById(7).ref).click();

  await expect(page.locator(".selection-bar")).toContainText("2 verses selected");
  // Both are uncommitted, so there is one sitting on offer and no note needed.
  await expect(page.locator(".selection-bar")).not.toContainText("two sittings");
  await page.getByRole("button", { name: "Learn 2" }).click();

  await expect(page.getByText("Learn · Flashcard · Passage 1 of 2")).toBeVisible();
});

/* The head is CSS the view only names, and the thing worth asserting is not the
 * declaration but the effect: that it is still on screen, and still under the
 * app header rather than through it, after the list has been scrolled. */
test("the table's head stays on screen while the rows scroll under it", async ({ app, page }) => {
  await app.boot({ progress: PROGRESS });
  await openList(app);

  await tick(page, passageById(6).ref).click();
  await tick(page, passageById(7).ref).click();
  await expect(page.locator(".selection-bar")).toContainText("2 verses selected");

  await page.mouse.wheel(0, 2000);
  await expect(page.locator(".selection-bar")).toBeInViewport();
  await expect(page.getByText("Freshness", { exact: true })).toBeInViewport();

  // Below the app header, not behind it: the measured height is what the head
  // stops at (see App.watchHeaderHeight).
  const header = await page.locator(".app-header").boundingBox();
  const head = await page.locator(".list-head").boundingBox();
  expect(head.y).toBeGreaterThanOrEqual(header.y + header.height - 1);
});

test("shift-click ticks the run between two rows", async ({ app, page }) => {
  await app.boot({ progress: PROGRESS });
  await openList(app);

  await tick(page, passageById(3).ref).click();
  await expect(page.locator(".selection-bar")).toContainText("Shift-click another row");

  await tick(page, passageById(8).ref).click({ modifiers: ["Shift"] });
  await expect(page.locator(".selection-bar")).toContainText("6 verses selected");

  // The anchor's state is what the run takes, so clearing it clears the run.
  await tick(page, passageById(3).ref).click();
  await tick(page, passageById(8).ref).click({ modifiers: ["Shift"] });
  await expect(page.locator(".selection-bar")).toHaveCount(0);
});

test("the run is cut from the rows on screen, so a search bounds it", async ({ app, page }) => {
  await app.boot({ progress: PROGRESS });
  await openList(app);

  await page.getByPlaceholder("Search reference or text").fill("Psalm");
  const shown = await page.locator(".item-in").count();
  expect(shown).toBeGreaterThan(2);

  await page.getByRole("button", { name: "Select the rows shown" }).click();
  await expect(page.locator(".selection-bar")).toContainText(`${shown} verses selected`);

  // Clearing the search leaves the ticks alone: they are the member's, not the
  // filter's.
  await page.getByPlaceholder("Search reference or text").fill("");
  await expect(page.locator(".selection-bar")).toContainText(`${shown} verses selected`);

  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.locator(".selection-bar")).toHaveCount(0);
});

test("picks that straddle both halves are two sittings, and say so", async ({ app, page }) => {
  await app.boot({ progress: PROGRESS });
  await openList(app);

  await tick(page, passageById(1).ref).click(); // committed
  await tick(page, passageById(4).ref).click(); // in progress

  const bar = page.locator(".selection-bar");
  await expect(bar).toContainText("Committed verses are reviewed and the rest are learned, so this is two sittings.");
  await expect(bar.getByRole("button", { name: "Review 1" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Learn 1" })).toBeVisible();

  // A review sitting still cannot reach the uncommitted one.
  await bar.getByRole("button", { name: "Review 1" }).click();
  await expect(page.getByText("Review · Flashcard · Passage 1 of 1")).toBeVisible();
  await expect(page.getByRole("heading", { name: passageById(1).ref })).toBeVisible();
});
