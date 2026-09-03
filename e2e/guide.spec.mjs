/* The guide, the one screen that draws the app rather than describing it.
 *
 * Two things are worth pressing here. The figures on it are read off the model
 * (srs.js and the member's own profile), so they have to agree with what the
 * rest of the app prints. And the forgetting curve is a slider: dragging it is
 * the only way to see that the picture is really the model's `e^(−t/S)` and not
 * a drawing of one. */

import { test, expect } from "./fixtures.mjs";
import { COMMIT_SCORE } from "../src/srs.js";
import { DEFAULT_DUE_FRESHNESS } from "../src/profile.js";

const BAR = Math.round(COMMIT_SCORE * 100);

/* The guide is one of the screens currently switched off (src/config.js
 * `features`), hidden, not deleted. Every boot here puts it back the way a
 * deploy would, so the screen goes on being pressed while it is put away. */
const GUIDE = { guide: true };

test("the guide quotes the model's own figures", async ({ app, page }) => {
  await app.boot({ progress: {}, features: GUIDE });
  await app.nav("Guide").click();

  await expect(page.getByRole("heading", { name: "How this app works" })).toBeVisible();
  await expect(page.getByText(new RegExp(`You need ${BAR}% of the words right`))).toBeVisible();
  await expect(page.getByText(`asks for it back at ${DEFAULT_DUE_FRESHNESS}%`)).toBeVisible();
  // The commit rule, drawn as a crossing from one half of the set to the other.
  await expect(page.getByText("gave it back from memory")).toBeVisible();
  await expect(page.getByText("not committed yet")).toBeVisible();
  await expect(page.getByText("committed, now you keep it fresh")).toBeVisible();
});

test("the slider redraws the forgetting curve", async ({ app, page }) => {
  await app.boot({ progress: {}, features: GUIDE });
  await app.nav("Guide").click();

  const slider = page.getByRole("slider");
  await expect(page.getByText("6 days later")).toBeVisible();

  await slider.fill("0");
  await expect(page.getByText("Days since you last reviewed it, the same day")).toBeVisible();
  // Day zero: both curves read full, which is the one figure the curve cannot
  // get wrong, and the verse is plainly not due.
  await expect(page.getByText("100%").first()).toBeVisible();
  await expect(page.getByText("Still above the line, so the app leaves this verse alone.")).toBeVisible();

  await slider.fill("30");
  await expect(page.getByText("30 days later")).toBeVisible();
  await expect(page.getByText("Below the line, so this verse goes back on your review list.")).toBeVisible();
});

test("the flashcard demonstration is the real card", async ({ app, page }) => {
  await app.boot({ progress: {}, features: GUIDE });
  await app.nav("Guide").click();

  // Same component as views/review.js, turned by a keyframe instead of a press.
  await expect(page.locator(".guide-page .flip-card")).toHaveCount(1);
  await expect(page.getByText("the only one that commits")).toBeVisible();
});

test("the guide hands the member on to a first sitting", async ({ app, page }) => {
  await app.boot({ progress: {}, features: GUIDE });
  await app.nav("Guide").click();

  await page.getByRole("button", { name: "Start learning" }).click();
  await expect(page.getByRole("heading", { name: "Commit a passage to memory" })).toBeVisible();
});

test("the board's pace check opens the guide", async ({ app, page }) => {
  await app.boot({ progress: {}, features: GUIDE });

  await page.getByRole("button", { name: "How this works" }).click();
  await expect(page.getByRole("heading", { name: "How this app works" })).toBeVisible();
});
