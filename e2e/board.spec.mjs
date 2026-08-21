/* The board: the five hero figures, the two queues, and where its buttons go.
 *
 * The figures are the part a render test cannot read. They are drawn by CSS from
 * a registered --count (styles.css, .count-up), so the element carries no text
 * node at all — what a browser can check, and nothing else can, is that the
 * counter the member actually sees is the one the model computed. */

import { test, expect } from "./fixtures.mjs";
import { GOAL, TOTAL, committed, logOf, passageById, started } from "./helpers/seed.mjs";

/* Three committed verses at three ages, and two opened but not given back. The
 * member's threshold is the default 75%, so the two faded ones are due and the
 * fresh one is not. */
const PROGRESS = {
  1: committed(0.98),
  2: committed(0.4),
  3: committed(0.55),
  4: started(0.6),
  5: started(0.3),
};

test("the hero figures count what the member has", async ({ app }) => {
  await app.boot({ progress: PROGRESS, log: logOf({ 0: 6, 1: 4, 2: 3 }) });

  expect(await app.figure(app.committedFigure)).toBe(3);
  await expect(app.board).toContainText(`/ ${GOAL}`);
  await expect(app.board).toContainText("2 in progress");
  await expect(app.board).toContainText(`${GOAL - 5} not started`);

  expect(await app.figure(app.heroStat("Reviewed today"))).toBe(6);
  // Three days running, today included (progress.streakOf, by local day).
  expect(await app.figure(app.heroStat("Streak"))).toBe(3);
  expect(await app.figure(app.heroStat("Days left"))).toBeGreaterThan(0);
});

test("the two queues split the set by what commits a verse", async ({ app }) => {
  await app.boot({ progress: PROGRESS });

  const review = app.queue("Review today");
  // Committed and faded to the threshold or below: the stalest first.
  await expect(review).toContainText(passageById(2).ref);
  await expect(review).toContainText(passageById(3).ref);
  await expect(review).not.toContainText(passageById(1).ref);
  await expect(review).toContainText("Committed");

  const learn = app.queue("Learn today");
  // Not committed, verses already started first.
  await expect(learn).toContainText(passageById(4).ref);
  await expect(learn).toContainText(passageById(5).ref);
  await expect(learn).not.toContainText(passageById(2).ref);
  // A learn queue never quotes freshness — the member cannot act on it yet.
  await expect(learn).not.toContainText("%");
});

test("an empty board says what each queue is waiting for", async ({ app }) => {
  await app.boot({ progress: {} });

  expect(await app.figure(app.committedFigure)).toBe(0);
  await expect(app.queue("Review today")).toContainText("a verse arrives here once you have committed it");
  await expect(app.queue("Learn today")).toContainText(passageById(1).ref);
});

test("a queue row opens that verse as a sitting of one", async ({ app, page }) => {
  await app.boot({ progress: PROGRESS });

  await app.queue("Review today").getByRole("button").first().click();

  await expect(page.getByRole("heading", { name: passageById(2).ref })).toBeVisible();
  await expect(page.getByText("Review · Flashcard · Passage 1 of 1")).toBeVisible();
});

test("the header and the pace check reach every screen", async ({ app, page }) => {
  await app.boot({ progress: PROGRESS });

  await app.nav("Passages").click();
  await expect(page.getByRole("heading", { name: "All passages" })).toBeVisible();

  await app.nav("Stats").click();
  await expect(page.getByRole("heading", { name: "Leaderboard" })).toBeVisible();

  await app.nav("Guide").click();
  await expect(page.getByRole("heading", { name: "How this app works" })).toBeVisible();

  await app.nav("Home").click();
  await expect(app.board).toBeVisible();

  await page.getByRole("button", { name: "Learn a passage" }).click();
  await expect(page.getByRole("heading", { name: "Commit a passage to memory" })).toBeVisible();

  await page.getByRole("button", { name: "Back to the board" }).click();
  await page.getByRole("button", { name: "Take a test" }).click();
  await expect(page.getByRole("heading", { name: "Set the test" })).toBeVisible();
});

test("the map draws one cell per passage, and says what each one is", async ({ app, page }) => {
  await app.boot({ progress: PROGRESS });

  const cells = page.locator(".board-map-grid > button");
  await expect(cells).toHaveCount(TOTAL);
  await expect(cells.first()).toHaveAttribute("title", `${passageById(1).ref} — Committed · 98% fresh`);
  await expect(cells.nth(5)).toHaveAttribute("title", `${passageById(6).ref} — Not started`);
});
