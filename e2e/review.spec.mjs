/* A review sitting, card by card.
 *
 * Everything here is the session as a member meets it: a card turned over, a
 * blank typed into and the focus that follows it, a peek held down, a paper
 * handed in and the freshness it moved. The marks themselves are src/srs.js's
 * and are unit-tested there — what this asserts is that pressing the buttons in
 * order produces them. */

import { test, expect } from "./fixtures.mjs";
import { keyBlankSet } from "../src/blanks.js";
import { firstLetters } from "../src/text.js";
import { committed, logOf, passageByRef } from "./helpers/seed.mjs";

/* Three committed verses, all faded past the member's 75% threshold, so the
 * review pool is exactly these and the setup screen goes straight to them. */
const PROGRESS = { 2: committed(0.4), 3: committed(0.55), 5: committed(0.7) };

async function startReview(app) {
  await app.nav("REVIEW").click();
  await expect(app.page.getByRole("heading", { name: "Configure your review" })).toBeVisible();
  await expect(app.page.getByText("3 verses are due right now.")).toBeVisible();
  await app.page.getByRole("button", { name: "Start Review" }).click();
  await expect(app.page.getByText(/^Review · .* · Passage 1 of 3$/)).toBeVisible();
}

/* The verse on the card in front of us, read off its heading. */
async function currentPassage(page) {
  const ref = await page.locator(".blueprint h2").first().textContent();
  return passageByRef(ref);
}

/* Fill every blank with the word behind it. The indices come from the same pure
 * module the card draws them from, so the answers cannot drift out of step with
 * the exercise. */
async function fillBlanks(page, passage, level = 1) {
  const words = passage.text.split(" ");
  const indexes = [...keyBlankSet(passage.text, passage.id, level)].sort((a, b) => a - b);
  for (const i of indexes) await page.locator(`#blank-${i}`).fill(words[i]);
  return indexes;
}

test("the first letters take the passage's place on the back of the card", async ({ app, page }) => {
  await app.boot({ progress: PROGRESS });
  await startReview(app);

  const card = page.locator(".flip-card");
  const passage = await currentPassage(page);

  // The scaffold is the answer at a lower strength, so asking for it turns the
  // card to the same face the passage would have been on.
  await page.getByRole("button", { name: "Show first letters" }).click();
  await expect(card).toHaveClass(/is-flipped/);
  await expect(page.locator(".flip-card-back")).not.toContainText(passage.text.slice(0, 40));
  await expect(page.locator(".flip-card-back")).toContainText(firstLetters(passage.text).slice(0, 12));

  // The other button swaps the strength without turning the card back.
  await page.getByRole("button", { name: "Show passage" }).click();
  await expect(card).toHaveClass(/is-flipped/);
  await expect(page.locator(".flip-card-back")).toContainText(passage.text.slice(0, 40));

  // And a press that says Hide puts the card back to the reference, rather
  // than handing over the half of the answer it was not showing.
  await page.getByRole("button", { name: "Hide passage" }).click();
  await expect(card).not.toHaveClass(/is-flipped/);
});

test("the flashcard turns over, and is recorded on the way out", async ({ app, page }) => {
  await app.boot({ progress: PROGRESS });
  await startReview(app);

  const card = page.locator(".flip-card");
  await expect(card).not.toHaveClass(/is-flipped/);
  await expect(page.getByText("Say it aloud from memory, then turn the card to check yourself.")).toBeVisible();

  await page.getByRole("button", { name: "Show passage" }).click();
  await expect(card).toHaveClass(/is-flipped/);
  const passage = await currentPassage(page);
  await expect(page.locator(".flip-card-back")).toContainText(passage.text.slice(0, 40));
  // It is a real two-sided card, not a swap: the face is turned by CSS.
  const turn = await page.locator(".flip-card-inner").evaluate((el) => getComputedStyle(el).transform);
  expect(turn).not.toBe("none");

  // Nothing marks a flashcard, so there is no Submit and no confirmation —
  // it is recorded at the full award on the way to the next card.
  await expect(page.getByRole("button", { name: "Submit" })).toHaveCount(0);
  await page.getByRole("button", { name: "Next passage" }).click();
  await expect(page.getByText(/Passage 2 of 3$/)).toBeVisible();
  await expect(app.dialog).toHaveCount(0);
});

test("fill the blanks is marked when it is handed in, and moves the freshness", async ({ app, page }) => {
  await app.boot({ progress: PROGRESS });
  await startReview(app);

  await page.getByRole("button", { name: "Blanks", exact: true }).click();
  const passage = await currentPassage(page);
  const blanks = await fillBlanks(page, passage);

  // Nothing is marked until the paper is in — the card counts the blanks, it
  // does not grade them.
  await expect(page.getByText(`${blanks.length} blanks`)).toBeVisible();
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText(`${blanks.length} of ${blanks.length} right`)).toBeVisible();

  const strip = page.locator(".result-strip");
  await expect(strip).toContainText("Fill the blanks · submitted");
  await expect(strip).toContainText("100% right");
  await expect(strip).toContainText("Was");
  await expect(strip).toContainText("Now");
  // A clean attempt on a faded verse can only send it forwards.
  await expect(page.locator(".fresh-delta")).toContainText("+");

  // A verse is marked at most once a session.
  await expect(page.getByRole("button", { name: "Submitted" })).toBeDisabled();
});

/* The alternating level and its flip. Which words are blank is pure and tested
 * in test/blanks.test.mjs; what needs a browser is that picking the level
 * really redraws the exercise, that the flip is offered only there, and that
 * turning it over hands the member the other half of the passage. */
test("alternating blanks takes every other word, and turns over", async ({ app, page }) => {
  await app.boot({ progress: PROGRESS });
  await startReview(app);

  await page.getByRole("button", { name: "Blanks", exact: true }).click();
  const passage = await currentPassage(page);
  const words = passage.text.split(" ");

  // No half to choose between until there are two of them.
  await expect(page.getByText("Take away")).toHaveCount(0);

  await page.getByRole("button", { name: "Alternating", exact: true }).click();
  await expect(page.getByText("Blanking every other word, key or not")).toBeVisible();
  await expect(page.getByText("Take away")).toBeVisible();

  // Every other word is a box, starting with the first.
  await expect(page.locator("#blank-0")).toBeVisible();
  await expect(page.locator("#blank-2")).toBeVisible();
  await expect(page.locator("#blank-1")).toHaveCount(0);
  await expect(page.getByText(`${Math.ceil(words.length / 2)} blanks`)).toBeVisible();

  // Turned over, the member is asked for the words they were just reading.
  await page.getByRole("button", { name: "2nd, 4th, 6th…" }).click();
  await expect(page.locator("#blank-1")).toBeVisible();
  await expect(page.locator("#blank-0")).toHaveCount(0);
  await expect(page.getByText(`${Math.floor(words.length / 2)} blanks`)).toBeVisible();

  // And it is a real exercise: fill it in and it marks like any other.
  for (let i = 1; i < words.length; i += 2) await page.locator(`#blank-${i}`).fill(words[i]);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.locator(".result-strip")).toContainText("100% right");
});

test("which half was chosen is remembered, like every other exercise setting", async ({ app, page }) => {
  await app.boot({ progress: PROGRESS });
  await startReview(app);
  await page.getByRole("button", { name: "Blanks", exact: true }).click();
  await page.getByRole("button", { name: "Alternating", exact: true }).click();
  await page.getByRole("button", { name: "2nd, 4th, 6th…" }).click();
  await expect(page.locator("#blank-1")).toBeVisible();

  await app.revisit();
  await startReview(app);
  await page.getByRole("button", { name: "Blanks", exact: true }).click();
  await expect(page.locator("#blank-1")).toBeVisible();
  await expect(page.locator("#blank-0")).toHaveCount(0);
});

test("typing a blank in full moves to the next one", async ({ app, page }) => {
  await app.boot({ progress: PROGRESS });
  await startReview(app);

  await page.getByRole("button", { name: "Blanks", exact: true }).click();
  const passage = await currentPassage(page);
  const words = passage.text.split(" ");
  const [first, second] = [...keyBlankSet(passage.text, passage.id, 1)].sort((a, b) => a - b);

  await page.locator(`#blank-${first}`).pressSequentially(words[first]);
  await expect(page.locator(`#blank-${second}`)).toBeFocused();
});

test("a peek latches the passage on, and is counted", async ({ app, page }) => {
  await app.boot({ progress: PROGRESS });
  await startReview(app);

  await page.getByRole("button", { name: "Blanks", exact: true }).click();
  await expect(page.getByText("Each peek costs 5%")).toBeVisible();

  const passage = await currentPassage(page);
  const peek = page.getByRole("button", { name: "Peek" });

  await peek.click();
  await expect(page.locator(".reveal-in")).toContainText(passage.text.slice(0, 40));
  await expect(peek).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("1 peek · −5%")).toBeVisible();

  await peek.click();
  await expect(page.locator(".reveal-in")).toHaveCount(0);
  await expect(peek).toHaveAttribute("aria-pressed", "false");
  // Having seen it is not refunded.
  await expect(page.getByText("1 peek · −5%")).toBeVisible();
});

/* The half a unit test cannot show: the latch is the card's, so the next verse
 * arrives closed rather than opening on its answer. */
test("the latch does not follow the member to the next verse", async ({ app, page }) => {
  await app.boot({ progress: PROGRESS });
  await startReview(app);
  await page.getByRole("button", { name: "Blanks", exact: true }).click();

  await page.getByRole("button", { name: "Peek" }).click();
  const first = await currentPassage(page);
  await expect(page.locator(".reveal-in")).toContainText(first.text.slice(0, 40));

  await page.getByRole("button", { name: "Submit" }).click();
  await page.getByRole("button", { name: /Next passage|Finish session/ }).click();

  const next = await currentPassage(page);
  expect(next.id, "a different verse").not.toBe(first.id);
  await expect(page.getByRole("button", { name: "Peek" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".reveal-in")).toHaveCount(0);
  await expect(page.getByText("Each peek costs 5%")).toBeVisible();
});

test("walking off an unsubmitted card is confirmed first", async ({ app, page }) => {
  await app.boot({ progress: PROGRESS });
  await startReview(app);

  await page.getByRole("button", { name: "Order", exact: true }).click();
  await page.getByRole("button", { name: "Next passage" }).click();

  await expect(app.dialog).toContainText("Move on without submitting?");
  await expect(app.dialog).toContainText("earns no freshness");
  await page.getByRole("button", { name: "Stay on this passage" }).click();
  await expect(page.getByText(/Passage 1 of 3$/)).toBeVisible();

  await page.getByRole("button", { name: "Next passage" }).click();
  await page.getByRole("button", { name: "Move on" }).click();
  await expect(page.getByText(/Passage 2 of 3$/)).toBeVisible();
});

test("leaving keeps every card already submitted and drops the rest", async ({ app, page }) => {
  await app.boot({ progress: PROGRESS, log: logOf({}) });
  await startReview(app);

  await page.getByRole("button", { name: "Blanks", exact: true }).click();
  const passage = await currentPassage(page);
  await fillBlanks(page, passage);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.locator(".result-strip")).toBeVisible();

  await page.getByRole("button", { name: "Leave session" }).click();
  await expect(app.dialog).toContainText("Leave the session?");
  await expect(app.dialog).toContainText("1 passage you have submitted keeps the freshness it earned");
  await page.getByRole("button", { name: "Keep going" }).click();
  await expect(app.dialog).toHaveCount(0);

  await page.getByRole("button", { name: "Leave session" }).click();
  await page.getByRole("button", { name: "Leave the session" }).click();

  await expect(app.board).toBeVisible();
  expect(await app.figure(app.heroStat("Reviewed today"))).toBe(1);
  // The verse was topped up, so it has left the review queue.
  await expect(app.queue("Review today")).not.toContainText(passage.ref);
});

test("a session run to the end reports what it refreshed, and it survives a reload", async ({ app, page }) => {
  await app.boot({ progress: { 2: committed(0.4) } });
  await startReviewOfOne(app);

  await page.getByRole("button", { name: "Finish session" }).click();
  await expect(page.getByRole("heading", { name: "1 passage refreshed" })).toBeVisible();
  await page.getByRole("button", { name: "Back to the board" }).click();

  const beforeReload = await app.figure(app.heroStat("Reviewed today"));
  expect(beforeReload).toBe(1);
  await app.revisit();
  expect(await app.figure(app.heroStat("Reviewed today"))).toBe(1);
});

/* One due verse: the setup screen offers the same session, one card long. */
async function startReviewOfOne(app) {
  await app.nav("REVIEW").click();
  await app.page.getByRole("button", { name: "Start Review" }).click();
  await expect(app.page.getByText(/^Review · .* · Passage 1 of 1$/)).toBeVisible();
}
