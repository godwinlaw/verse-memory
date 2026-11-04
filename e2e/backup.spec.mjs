/* The record as a file: exported from one browser, imported into another.
 *
 * backup.js is pure and asserted in test/backup.test.mjs. What needs a browser
 * is the two seams in src/files.js: that pressing Export really hands the
 * member a file, and that choosing one in the picker really folds it in. The
 * "other browser" is the same tab after its storage is cleared, which is what
 * a new device looks like to the app. */

import { test, expect } from "./fixtures.mjs";
import { MEMBER } from "./helpers/firebase-stub.mjs";
import { committed, logOf, passageById, started } from "./helpers/seed.mjs";

const PROGRESS = { 1: committed(0.98), 2: committed(0.4), 4: started(0.5) };

/* Settings is behind the account circle, which is only drawn for a member who
 * is signed in, so every boot here restores a session. */
const signedIn = { session: MEMBER };

test("Export hands the member a JSON file holding their record", async ({ app, page }) => {
  await app.boot({ progress: PROGRESS, log: logOf({ 0: 3 }), firebase: signedIn });
  await app.account("Settings");

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export progress" }).click();
  const file = await download;

  expect(file.suggestedFilename()).toMatch(/^verse-mastery-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const text = await (await file.createReadStream()).toArray().then((chunks) => Buffer.concat(chunks).toString("utf8"));
  const data = JSON.parse(text);
  expect(data.app).toBe("verse-mastery");
  expect(Object.keys(data.progress).sort()).toEqual(["1", "2", "4"]);
  expect(data.progress[1].status).toBe("memorized");
  expect(Object.values(data.log)).toEqual([3]);
  expect(data.profile.name).toBe("Ada Lovelace");
  await expect(page.getByText("Saved. Keep the file somewhere safe.")).toBeVisible();
});

test("Import folds a backup into an empty device, and the board shows it", async ({ app, page }) => {
  await app.boot({ progress: {}, firebase: signedIn });
  expect(await app.figure(app.committedFigure)).toBe(0);

  await app.account("Settings");
  const backup = {
    app: "verse-mastery",
    format: 1,
    progress: PROGRESS,
    log: logOf({ 1: 4 }),
    profile: {},
  };
  await page.getByLabel("Import a backup").setInputFiles({
    name: "verse-mastery-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });

  await expect(page.getByText("Imported 3 new passages, updated 0 passages and filled in 1 day")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  expect(await app.figure(app.committedFigure)).toBe(2);
  await expect(app.queue("Review today")).toContainText(passageById(2).ref);
  // And it is saved: a second visit still has it.
  await app.revisit();
  expect(await app.figure(app.committedFigure)).toBe(2);
});

test("importing never removes what the device already has", async ({ app, page }) => {
  await app.boot({ progress: PROGRESS, firebase: signedIn });
  await app.account("Settings");

  await page.getByLabel("Import a backup").setInputFiles({
    name: "old.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ app: "verse-mastery", format: 1, progress: { 7: committed(0.9) } })),
  });
  await expect(page.getByText("Imported 1 new passage, updated 0 passages")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  expect(await app.figure(app.committedFigure)).toBe(3);
});

test("a file that is not a backup is refused in words, and changes nothing", async ({ app, page }) => {
  await app.boot({ progress: PROGRESS, firebase: signedIn });
  await app.account("Settings");

  await page.getByLabel("Import a backup").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Trust in the Lord with all your heart"),
  });
  await expect(page.getByText("That file could not be read.")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  expect(await app.figure(app.committedFigure)).toBe(2);
});
