/* A learn sitting: the one place a verse can be committed.
 *
 * The rule is srs.commitsVerse() and it is unit-tested there. What only a
 * browser can show is the rule being met — a member typing a passage into the
 * box and the verse moving across — and, just as importantly, the three ways it
 * is not met: a peek, the scaffold, and any activity but recall. */

import { test, expect } from "./fixtures.mjs";
import { fullText, passageByRef, passageById, started } from "./helpers/seed.mjs";

const FIRST = passageById(1);

async function startLearning(app) {
  await app.nav("LEARN").click();
  await expect(app.page.getByRole("heading", { name: "Commit a passage to memory" })).toBeVisible();
  await app.page.getByRole("button", { name: "Start learning" }).click();
  await expect(app.page.getByText(/^Learn · .* · Passage 1 of 5$/)).toBeVisible();
}

async function recallCard(page) {
  await page.getByRole("button", { name: "Recall", exact: true }).click();
  return page.getByPlaceholder(/Type the passage from memory/);
}

/* Give the verse on the card back in full, whichever verse the pool dealt. */
async function writeOutCurrent(page) {
  const ref = await page.locator(".blueprint h2").first().textContent();
  await page.getByPlaceholder(/Type the passage from memory/).fill(passageByRef(ref).text);
}

test("giving the passage back in full commits the verse", async ({ app, page }) => {
  await app.boot({ progress: {} });
  await startLearning(app);

  await expect(page.getByRole("heading", { name: FIRST.ref })).toBeVisible();
  const box = await recallCard(page);
  await expect(
    page.getByText("Get 95% of the words right, without peeking, and this verse is committed."),
  ).toBeVisible();

  await box.fill(fullText(FIRST.id));
  await page.getByRole("button", { name: "Submit" }).click();

  const strip = page.locator(".result-strip");
  await expect(strip).toContainText("From memory · submitted");
  await expect(strip).toContainText("100% right");
  await expect(strip).toContainText("Committed");
  await expect(strip).toContainText("It moves to your review list from here.");
  // A learn screen never quotes freshness: there is nothing a member committing
  // a passage for the first time could do with it.
  await expect(strip).not.toContainText(/fresh/i);
  await expect(strip).not.toContainText("Was");

  await page.getByRole("button", { name: "Leave session" }).click();
  await page.getByRole("button", { name: "Leave the session" }).click();

  expect(await app.figure(app.committedFigure)).toBe(1);
  await expect(app.queue("Learn today")).not.toContainText(FIRST.ref);

  // And it is still committed on the next visit — the record is the member's,
  // not the session's.
  await app.revisit();
  expect(await app.figure(app.committedFigure)).toBe(1);
});

test("a peek means this attempt cannot commit the verse", async ({ app, page }) => {
  await app.boot({ progress: {} });
  await startLearning(app);
  const box = await recallCard(page);

  await expect(page.getByText("A peek means this attempt cannot commit the verse.")).toBeVisible();
  await page.getByRole("button", { name: "Peek" }).click();
  await expect(page.getByText("Peeked — this attempt can no longer commit the verse.")).toBeVisible();

  await box.fill(fullText(FIRST.id));
  await page.getByRole("button", { name: "Submit" }).click();

  const strip = page.locator(".result-strip");
  await expect(strip).toContainText("100% right");
  await expect(strip).toContainText("Not committed yet");

  await page.getByRole("button", { name: "Leave session" }).click();
  await page.getByRole("button", { name: "Leave the session" }).click();
  expect(await app.figure(app.committedFigure)).toBe(0);
  // The work still counted: the verse is in progress rather than untouched.
  await expect(app.board).toContainText("1 in progress");
});

test("the first-letter scaffold cannot commit either", async ({ app, page }) => {
  await app.boot({ progress: {} });
  await startLearning(app);
  await recallCard(page);

  // The scaffold's own switch, above the box.
  await page.getByRole("button", { name: "Off", exact: true }).first().click();
  const drill = page.getByPlaceholder(/Type just the first letter of each word/);
  await drill.fill(
    fullText(FIRST.id)
      .split(" ")
      .map((w) => w.replace(/[^A-Za-z]/g, "")[0] || "")
      .join(" "),
  );

  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.locator(".result-strip")).toContainText("Not committed yet");
});

test("any other activity is practice, and the card says so", async ({ app, page }) => {
  await app.boot({ progress: {} });
  await startLearning(app);

  await page.getByRole("button", { name: "Blanks", exact: true }).click();
  await expect(
    page.getByText("Recite or type the passage in full to commit the verse into your memory bank."),
  ).toBeVisible();
  // Reciting is offered on the recall card and nowhere else — it is a second way
  // to fill that one box, not an activity of its own.
  await expect(page.getByText("Voice", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Recall", exact: true }).click();
  await expect(page.getByText("Voice", { exact: true })).toBeVisible();
});

test("a browser that cannot listen says so, and is still a box you type in", async ({ app, page }) => {
  await app.boot({ progress: {}, voice: "unsupported" });
  await startLearning(app);
  const box = await recallCard(page);

  await expect(page.getByText("Not available in this browser.")).toBeVisible();
  const voiceSwitch = page.locator(".seg-btn").filter({ hasText: /^Off$/ }).last();
  await expect(voiceSwitch).toBeDisabled();

  // Nothing about the activity depends on it.
  await box.fill(fullText(FIRST.id));
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.locator(".result-strip")).toContainText("Committed");
});

test("a sitting run to the end counts what it committed", async ({ app, page }) => {
  // Two verses already opened, so the learn pool starts with them.
  await app.boot({ progress: { 4: started(0.4), 7: started(0.3) }, local: { "mv.learnSetup": '{"size":2}' } });

  await app.nav("LEARN").click();
  await page.getByRole("button", { name: "Start learning" }).click();
  await expect(page.getByText(/Passage 1 of 2$/)).toBeVisible();

  await recallCard(page);
  await writeOutCurrent(page);
  await page.getByRole("button", { name: "Submit" }).click();
  await page.getByRole("button", { name: "Next passage" }).click();

  await expect(page.getByText(/Passage 2 of 2$/)).toBeVisible();
  await writeOutCurrent(page);
  await page.getByRole("button", { name: "Submit" }).click();
  await page.getByRole("button", { name: "Finish session" }).click();

  await expect(page.getByRole("heading", { name: "2 passages committed" })).toBeVisible();
  await expect(page.getByText(/Written out in full from memory/)).toBeVisible();

  await page.getByRole("button", { name: "Back to the board" }).click();
  expect(await app.figure(app.committedFigure)).toBe(2);
});
