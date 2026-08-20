/* Which way round the page is printed (src/theme.js).
 *
 * The whole of the rule is two pure functions — what a stored value is allowed
 * to be, and what "system" comes out as once the reader's machine has answered.
 * The stamping itself is the window seam and is asserted in a browser
 * (e2e/theme.spec.mjs), where there is a root element to read it off. */

import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_THEME, THEMES, normalizeTheme, resolveTheme } from "../src/theme.js";

test("the choices are the two grounds and the standing instruction to ask", () => {
  assert.deepEqual(THEMES, ["light", "dark", "system"]);
  // Following the reader is what the app did before there was a switch, and it
  // stays what a member who never touches this one gets.
  assert.equal(DEFAULT_THEME, "system");
});

test("normalizeTheme keeps every choice the switch offers", () => {
  for (const theme of THEMES) assert.equal(normalizeTheme(theme), theme);
});

test("normalizeTheme falls back to the system for anything else", () => {
  // Nothing stored yet, a build that offered a choice this one does not, and
  // the shapes a corrupt localStorage hands back.
  for (const raw of [null, undefined, "", "sepia", "Dark", 1, {}]) {
    assert.equal(normalizeTheme(raw), DEFAULT_THEME);
  }
});

test("a chosen ground is that ground, whatever the machine says", () => {
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("light", false), "light");
  assert.equal(resolveTheme("dark", false), "dark");
  assert.equal(resolveTheme("dark", true), "dark");
});

test("system is whichever the reader asked their machine for", () => {
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
});

test("resolveTheme never hands back anything the stylesheet cannot paint", () => {
  // Including for a stored value that made no sense: it is normalized on the
  // way through, so `data-theme` is only ever one of the two grounds.
  for (const prefersDark of [true, false]) {
    for (const raw of [...THEMES, null, "sepia"]) {
      assert.ok(["light", "dark"].includes(resolveTheme(raw, prefersDark)));
    }
  }
});
