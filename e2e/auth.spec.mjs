/* The gate, driven through the app's own Firebase code path.
 *
 * src/firebase.js loads the SDK from a CDN by dynamic import, so a browser test
 * can answer that import itself (e2e/helpers/firebase-stub.mjs) and press the
 * real button. What is under test is the app's half of the bargain — who it lets
 * in, what it does with a refused account, what it pulls down and pushes back —
 * not Google's. The authoritative check is deploy/firestore.rules, and nothing
 * here says otherwise. */

import { test, expect } from "./fixtures.mjs";
import { MEMBER, OUTSIDER } from "./helpers/firebase-stub.mjs";
import { PROFILE, committed } from "./helpers/seed.mjs";

test("no session: the app stops at the sign-in gate", async ({ app, page }) => {
  await app.boot({ firebase: { session: null } });

  await expect(page.getByText("VERSE MASTERY")).toBeVisible();
  await expect(page.getByRole("button", { name: /Sign in with Google/ })).toBeVisible();
  // The prompt names one of the allowed Workspace domains (PRIMARY_DOMAIN).
  await expect(page.getByText("@acts2.network")).toBeVisible();
  await expect(app.board).toHaveCount(0);
});

test("an Acts 2 account signs in and lands on the board", async ({ app, page }) => {
  await app.boot({ firebase: { session: null, popup: MEMBER }, progress: { 1: committed(1) } });

  await page.getByRole("button", { name: /Sign in with Google/ }).click();

  await expect(app.board).toBeVisible();
  await expect(app.avatar).toHaveAttribute("aria-label", "Ada Lovelace");
});

test("an outside account is refused and told why", async ({ app, page }) => {
  await app.boot({ firebase: { session: null, popup: OUTSIDER } });

  await page.getByRole("button", { name: /Sign in with Google/ }).click();

  await expect(page.getByText(/isn't an Acts 2 Network account/)).toBeVisible();
  await expect(app.board).toHaveCount(0);
});

test("a sign-in that never completes says so and leaves the gate up", async ({ app, page }) => {
  await app.boot({ firebase: { session: null, popup: "error" } });

  await page.getByRole("button", { name: /Sign in with Google/ }).click();

  await expect(page.getByText("Sign-in didn't complete. Please try again.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Sign in with Google/ })).toBeEnabled();
});

test("progress saved on another device is merged in on arrival", async ({ app }) => {
  // Two verses committed here, three more waiting in the cloud: the board's
  // figure is the union, not either half (storage.mergeProgress).
  await app.boot({
    progress: { 1: committed(1), 2: committed(1) },
    firebase: {
      session: MEMBER,
      remote: {
        progress: { 3: committed(1), 4: committed(1), 5: committed(1) },
        log: {},
        profile: PROFILE,
      },
    },
  });

  await expect(async () => {
    expect(await app.figure(app.committedFigure)).toBe(5);
  }).toPass();
});

test("finishing a card pushes it to the member's document", async ({ app, page }) => {
  await app.boot({ firebase: { session: MEMBER }, progress: {} });

  // One flashcard, which is recorded on the way out at the full award.
  await app.nav("LEARN").click();
  await page.getByRole("button", { name: "Start learning" }).click();
  await page.getByRole("button", { name: "Next passage" }).click();

  // The push is debounced (PUSH_DEBOUNCE_MS in firebase.js), so wait for it.
  await expect(async () => {
    const writes = await app.writes();
    const pushed = writes.filter((w) => w.data && w.data.progress);
    expect(pushed.length).toBeGreaterThan(0);
    expect(Object.keys(pushed.at(-1).data.progress)).not.toHaveLength(0);
  }).toPass();
});

test("signing out puts the gate back", async ({ app, page }) => {
  await app.boot({ firebase: { session: MEMBER } });

  await app.account("Sign out");

  await expect(page.getByRole("button", { name: /Sign in with Google/ })).toBeVisible();
});

test("an unreachable Firebase runs local-only rather than locking the member out", async ({ app, page }) => {
  app.allowConsoleErrors(/gstatic\.com|ERR_FAILED|Failed to fetch/i);
  await app.boot({ firebase: { mode: "unreachable" }, progress: { 1: committed(1) } });

  // Status "disabled": no gate, no account in the header, and the local record
  // is still the member's.
  await expect(app.board).toBeVisible();
  await expect(page.getByRole("button", { name: /Sign in with Google/ })).toHaveCount(0);
  await expect(app.avatar).toHaveCount(0);
  expect(await app.figure(app.committedFigure)).toBe(1);
  // Local-only, but not silently so: there is an account this build could not
  // reach, which is different from a build that has none (see sync.spec.mjs).
  await expect(page.getByText(/saved on this device only/)).toBeVisible();
});
