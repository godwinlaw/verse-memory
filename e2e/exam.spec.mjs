/* Test mode: a paper set, sat, and marked.
 *
 * Two things are worth driving here that no render test reaches. The paper is a
 * walk — every question has to be answerable and the last one has to end the
 * test — and the marking is a write: freshness moves, backdated to what the
 * member actually demonstrated, while the status is left alone. Test mode never
 * commits a verse, and that is asserted on the board rather than in the model. */

import { test, expect } from "./fixtures.mjs";
import { committed, passageById } from "./helpers/seed.mjs";

async function openSetup(app) {
  await app.nav("TEST").click();
  await expect(app.page.getByRole("heading", { name: "Set the test" })).toBeVisible();
}

/* Narrow the paper to one activity, so what each question asks is known. */
async function onlyActivity(page, name) {
  for (const other of [
    "Pick the reference",
    "Finish the sentence",
    "Match verse to reference",
    "Order the phrases",
    "Fill the blanks",
    "Write it out",
    "Name the passage",
  ]) {
    if (other === name) continue;
    await page.locator(".option").filter({ hasText: other }).click();
  }
  await expect(page.locator(".option").filter({ hasText: name })).toContainText("On");
}

test("a paper is dealt, walked to the end, and marked", async ({ app, page }) => {
  await app.boot({ progress: {} });
  expect(await app.figure(app.committedFigure)).toBe(0);

  await openSetup(app);
  await page.getByRole("button", { name: "10", exact: true }).click();
  await page.getByRole("button", { name: "Start the test" }).click();

  // The activity and the position share one line ("Fill the blanks · Question 1
  // of 10"), so the paper's length is read out of it. textContent, not innerText:
  // the line is upper-cased by CSS, and innerText would hand back what is drawn.
  const [, total] = (await page.getByText(/Question \d+ of \d+/).textContent()).match(/of (\d+)/);

  for (let i = 1; i < Number(total); i++) {
    await page.getByRole("button", { name: "Next question" }).click();
    await expect(page.getByText(`Question ${i + 1} of ${total}`)).toBeVisible();
  }
  await page.getByRole("button", { name: "Finish and mark" }).click();

  await expect(page.getByText("Test complete")).toBeVisible();
  await expect(page.getByText(`0 of ${total} question`)).toBeVisible();
  await expect(page.getByText("Where each verse landed")).toBeVisible();

  // A test moves freshness, never status: nothing sat here can commit a verse.
  await page.getByRole("button", { name: "Back to the board" }).click();
  expect(await app.figure(app.committedFigure)).toBe(0);
  await expect(app.board).toContainText("10 in progress");
});

test("a paper answered right is marked right", async ({ app, page }) => {
  // Two committed verses and committed-only on, so the pool is exactly these
  // two and every question is about a verse the test knows the reference of.
  await app.boot({ progress: { 2: committed(0.5), 3: committed(0.5) } });
  await openSetup(app);

  await page.getByRole("button", { name: "10", exact: true }).click();
  await page.getByRole("button", { name: "Off", exact: true }).click(); // committed verses only
  await onlyActivity(page, "Name the passage");
  await expect(page.getByText("2 verses under test, out of 2 that match — 2 questions.")).toBeVisible();
  await page.getByRole("button", { name: "Start the test" }).click();

  for (const step of [1, 2]) {
    await expect(page.getByText(`Question ${step} of 2`)).toBeVisible();
    // Only two verses are on the paper; the quoted words say which.
    const quoted = await page.locator(".card-swap p").first().innerText();
    const passage = [passageById(2), passageById(3)].find((p) => p.text.includes(quoted.replace(/[“”]/g, "").trim()));
    await page.getByPlaceholder("Book and chapter, verse optional").fill(passage.ref);
    await page.getByRole("button", { name: step === 2 ? "Finish and mark" : "Next question" }).click();
  }

  await expect(page.getByText("2 of 2 questions right")).toBeVisible();
  await expect(page.getByText("Held, all of it.")).toBeVisible();
  await expect(page.getByText("freshness before and after")).toBeVisible();
});

test("leaving a test marks nothing", async ({ app, page }) => {
  await app.boot({ progress: { 2: committed(0.5) } });
  await openSetup(app);
  await page.getByRole("button", { name: "10", exact: true }).click();
  await page.getByRole("button", { name: "Start the test" }).click();

  await page.getByRole("button", { name: "Leave the test" }).click();
  await expect(app.dialog).toContainText("Leave the test?");
  await expect(app.dialog).toContainText("no verse's freshness will change");
  await page.getByRole("button", { name: "Keep going" }).click();
  await expect(app.dialog).toHaveCount(0);

  await page.getByRole("button", { name: "Leave the test" }).click();
  await app.dialog.getByRole("button", { name: "Leave the test" }).click();

  await expect(app.board).toBeVisible();
  expect(await app.figure(app.heroStat("Reviewed today"))).toBe(0);
});

test("the setup refuses to deal a paper it has no verses for", async ({ app, page }) => {
  await app.boot({ progress: {} });
  await openSetup(app);

  await page.getByRole("button", { name: "Off", exact: true }).click(); // committed only
  await expect(page.getByText("has nothing to test")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start the test" })).toBeDisabled();
});
