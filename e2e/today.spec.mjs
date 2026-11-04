/* Today: what is due, one press to review it, and the address that opens on it.
 *
 * The plan behind the screen is pure and asserted in test/today.test.mjs, and
 * the screen's words in test/views.test.mjs. What needs a browser is the
 * press: that the button starts the sitting over exactly the due verses, that a
 * finished sitting leaves nothing due, and that ./?screen=today, the installed
 * copy's start_url, lands here (src/landing.js). */

import { test, expect } from "./fixtures.mjs";
import { committed, passageById, started } from "./helpers/seed.mjs";

/* Two due, one holding, two started. The default threshold is 75%. */
const PROGRESS = {
  1: committed(0.98),
  2: committed(0.4),
  3: committed(0.55),
  4: started(0.6),
  5: started(0.3),
};

test("Today lists what is due and the button takes all of it", async ({ app, page }) => {
  await app.boot({ progress: PROGRESS });
  await app.nav("Today").click();

  await expect(page.getByRole("heading", { name: "2 passages are due" })).toBeVisible();
  // Stalest first, and nothing that is holding.
  await expect(app.today).toContainText(passageById(2).ref);
  await expect(app.today).toContainText(passageById(3).ref);
  await expect(app.today).not.toContainText(passageById(1).ref);
  // The next verse to learn is beside it, since both halves are open: the most
  // faded of the started ones, which is 5 (progress.learnPool).
  await expect(page.getByRole("button", { name: `Learn ${passageById(5).ref}` })).toBeVisible();

  await page.getByRole("button", { name: "Review 2 passages" }).click();
  await expect(page.getByText("Review · Flashcard · Passage 1 of 2")).toBeVisible();
  await expect(page.getByRole("heading", { name: passageById(2).ref })).toBeVisible();
});

test("a sitting from Today leaves nothing due, and Today says so", async ({ app, page }) => {
  await app.boot({ progress: { 1: committed(0.98), 2: committed(0.4) } });
  await app.nav("Today").click();
  await page.getByRole("button", { name: "Review 1 passage" }).click();

  // The flashcard is recorded on the way out at the full award.
  await page.getByRole("button", { name: "Finish session" }).click();
  await expect(page.getByRole("heading", { name: "1 passage refreshed" })).toBeVisible();

  await app.nav("Today").click();
  await expect(page.getByRole("heading", { name: "Nothing is due. Well held." })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Learn / })).toBeVisible();
  await expect(app.today).toContainText("Reviewed today");
});

test("with nothing committed, Today sends the member to learn their first verse", async ({ app, page }) => {
  await app.boot({ progress: {} });
  await app.nav("Today").click();

  await expect(page.getByRole("heading", { name: "Nothing to review yet" })).toBeVisible();
  await page.getByRole("button", { name: `Learn ${passageById(1).ref}` }).click();
  await expect(page.getByText("Learn · Flashcard · Passage 1 of 1")).toBeVisible();
});

test("the installed copy's address opens on Today, and the plain one on the board", async ({ app }) => {
  await app.boot({ progress: PROGRESS, path: "/?screen=today" });
  await expect(app.today).toBeVisible();
  await expect(app.board).toHaveCount(0);

  await app.open("/");
  await expect(app.board).toBeVisible();
  await expect(app.today).toHaveCount(0);
});
