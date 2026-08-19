/* Cloud sync, driven in a browser — specifically the case that made a member's
 * progress vanish on every device: a Firestore read the rules refuse.
 *
 * The app cannot tell a refused read from an empty one by looking at the data,
 * and it used to treat both as "new member" — showing the sign-up form, whose
 * freshly stamped profile then won the merge and replaced the real one. So the
 * thing worth asserting in a real browser is the negative: that a refused read
 * never puts that form on screen, and that what is already on the device is
 * still there afterwards.
 *
 * `refuseReads` is the stub scenario for it (e2e/helpers/firebase-stub.mjs). */

import { test, expect } from "./fixtures.mjs";
import { MEMBER } from "./helpers/firebase-stub.mjs";
import { committed, passageById } from "./helpers/seed.mjs";

const signedIn = { session: MEMBER };

test("a refused read is not mistaken for a new member", async ({ app, page }) => {
  await app.boot({ profile: null, firebase: { ...signedIn, refuseReads: true } });

  await expect(page.getByText("COULD NOT REACH YOUR RECORD")).toBeVisible();
  // The form that would overwrite the real profile is not offered.
  await expect(page.getByText("SET UP YOUR PROFILE")).toHaveCount(0);
  await expect(app.board).toHaveCount(0);
  // And the member is told this is a setup problem, not their account.
  await expect(page.getByText(/setup problem, not your account/)).toBeVisible();
});

test("a member whose profile is already on this device gets the app, and a warning", async ({ app, page }) => {
  await app.boot({
    progress: { 2: committed(0.6) },
    firebase: { ...signedIn, refuseReads: true },
  });

  // Past the gate — the profile is complete here, so the app is usable.
  await expect(app.board).toBeVisible();
  await expect(app.queue("Review today")).toContainText(passageById(2).ref);
  // But the strip says the work is not leaving the device.
  await expect(page.getByText(/saved on this device only/)).toBeVisible();
});

test("a healthy read shows neither the gate nor the warning", async ({ app, page }) => {
  await app.boot({ progress: { 2: committed(0.6) }, firebase: signedIn });

  await expect(app.board).toBeVisible();
  await expect(page.getByText("COULD NOT REACH YOUR RECORD")).toHaveCount(0);
  await expect(page.getByText(/saved on this device only/)).toHaveCount(0);
});

test("a record in the cloud reaches a device that has never seen it", async ({ app }) => {
  // Nothing local; everything in the cloud document. This is the cross-device
  // case the whole overlay exists for.
  await app.boot({
    progress: {},
    profile: null,
    firebase: {
      ...signedIn,
      remote: {
        name: "Ada Lovelace",
        email: MEMBER.email,
        profile: { name: "Ada Lovelace", ministryGroup: "Kairos", gender: "Female", gradClass: 2026, updatedAt: 1 },
        progress: { 2: committed(0.6) },
        log: {},
      },
    },
  });

  // No sign-up form: the record answered for them.
  await expect(app.board).toBeVisible();
  await expect(app.header).toContainText("Ada Lovelace");
  await expect(app.queue("Review today")).toContainText(passageById(2).ref);
});

/* The SDK never arriving is the same class of failure one step earlier: no
 * sign-in, so no read, so no idea what the member has. "disabled" skips the
 * sign-in gate by design, which is why this one fell all the way through to the
 * sign-up form and a private local record. */

test("an SDK blocked by the network does not look like a new member", async ({ app, page }) => {
  app.allowConsoleErrors(/gstatic\.com|ERR_FAILED|Failed to fetch/i);
  await app.boot({ profile: null, firebase: { mode: "unreachable" } });

  await expect(page.getByText("COULD NOT REACH YOUR ACCOUNT")).toBeVisible();
  await expect(page.getByText("SET UP YOUR PROFILE")).toHaveCount(0);
  await expect(app.board).toHaveCount(0);
  // It names what is actually worth checking, rather than blaming the account.
  await expect(page.getByText(/gstatic\.com/)).toBeVisible();
});

test("a blocked SDK still lets a member with a profile work, and says so", async ({ app, page }) => {
  app.allowConsoleErrors(/gstatic\.com|ERR_FAILED|Failed to fetch/i);
  await app.boot({ progress: { 2: committed(0.6) }, firebase: { mode: "unreachable" } });

  await expect(app.board).toBeVisible();
  await expect(page.getByText(/saved on this device only/)).toBeVisible();
});

test("a build with no Firebase configured stays silent and local", async ({ app, page }) => {
  // firebase: false — no stub, no config. Nothing to reach, so nothing to warn about.
  await app.boot({ progress: { 2: committed(0.6) } });

  await expect(app.board).toBeVisible();
  await expect(page.getByText(/saved on this device only/)).toHaveCount(0);
  await expect(page.getByText("COULD NOT REACH YOUR ACCOUNT")).toHaveCount(0);
});

/* A merge push is not "leave everything else alone" — it writes the fields in
 * the payload, and an empty map has no leaves for the mask to reach, so it
 * replaces the stored one with nothing. A device that has not pulled yet holds
 * exactly those empties, which is how one browser signing in erased the profile
 * every other device was reading. See mergeable() in src/firebase.js. */

test("a device that has not pulled yet never pushes an empty slice", async ({ app }) => {
  const cloudProfile = {
    name: "Ada Lovelace",
    ministryGroup: "Kairos",
    gender: "Female",
    gradClass: 2026,
    updatedAt: 1,
  };
  // A brand-new browser: nothing local, everything in the cloud.
  await app.boot({
    progress: {},
    profile: null,
    firebase: {
      ...signedIn,
      remote: {
        name: "Ada Lovelace",
        email: MEMBER.email,
        profile: cloudProfile,
        progress: { 2: committed(0.6) },
        log: {},
      },
    },
  });

  await expect(app.board).toBeVisible();

  // Let the debounced push (PUSH_DEBOUNCE_MS) land, then read every write made.
  await expect(async () => {
    expect((await app.writes()).some((w) => w.data && w.data.progress)).toBe(true);
  }).toPass();

  for (const w of await app.writes()) {
    const d = w.data || {};
    // The identity write carries neither, and is not a merge of the record.
    for (const slice of ["profile", "progress", "log"]) {
      if (slice in d) {
        expect(
          Object.keys(d[slice]).length,
          `a merge push carried an empty ${slice}, which erases the stored one`,
        ).toBeGreaterThan(0);
      }
    }
  }
});

test("the cloud profile survives a fresh device signing in", async ({ app, page }) => {
  await app.boot({
    progress: {},
    profile: null,
    firebase: {
      ...signedIn,
      remote: {
        name: "Ada Lovelace",
        email: MEMBER.email,
        profile: { name: "Ada Lovelace", ministryGroup: "Kairos", gender: "Female", gradClass: 2026, updatedAt: 1 },
        progress: { 2: committed(0.6) },
        log: {},
      },
    },
  });

  // Straight to the board: the pulled profile answered for them, and no write
  // went up that would have emptied it for the next device.
  await expect(app.board).toBeVisible();
  await expect(page.getByText("SET UP YOUR PROFILE")).toHaveCount(0);
  expect(await app.stored("mv.profile")).toMatchObject({ name: "Ada Lovelace", ministryGroup: "Kairos" });
});

/* The incognito bug: a brand-new browser was shown the sign-up form while the
 * server held a full record. Firestore's getDoc can answer from the local view,
 * and the identity write the app makes on sign-in is a pending write inside it
 * — so the read came back as a document with a name and an email and nothing
 * else, which is exactly what a member who has never used the app looks like.
 * An established browser has the real document cached, so only a cold one
 * showed it. `localView` below is that half-built view. */

test("a cold browser reads the server, not its own pending writes", async ({ app, page }) => {
  const full = {
    name: "Ada Lovelace",
    email: MEMBER.email,
    profile: { name: "Ada Lovelace", ministryGroup: "Kairos", gender: "Female", gradClass: 2026, updatedAt: 1 },
    progress: { 2: committed(0.6) },
    log: {},
  };
  await app.boot({
    progress: {},
    profile: null,
    firebase: {
      ...signedIn,
      remote: full,
      // What getDoc would hand back before the identity write settles.
      localView: { name: "Ada Lovelace", email: MEMBER.email },
    },
  });

  // The record is on the server, so the member goes straight through.
  await expect(app.board).toBeVisible();
  await expect(page.getByText("SET UP YOUR PROFILE")).toHaveCount(0);
  await expect(app.queue("Review today")).toContainText(passageById(2).ref);
  // And the half-built view is never saved over the local copy.
  expect(await app.stored("mv.profile")).toMatchObject({ name: "Ada Lovelace", ministryGroup: "Kairos" });
});
