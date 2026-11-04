import test from "node:test";
import assert from "node:assert/strict";

import { landingView } from "../src/landing.js";

test("the board is home unless the URL says otherwise", () => {
  assert.equal(landingView(""), "board");
  assert.equal(landingView("?x=1"), "board");
  assert.equal(landingView(undefined), "board");
});

test("an installed copy opens on Today", () => {
  // manifest.webmanifest names ./?screen=today as its start_url.
  assert.equal(landingView("?screen=today"), "today");
  assert.equal(landingView("screen=today"), "today", "with or without the question mark");
  assert.equal(landingView("?screen=list&x=1"), "list");
});

test("a screen the URL cannot name is ignored, not trusted", () => {
  assert.equal(landingView("?screen=review"), "board", "a session screen with no session behind it");
  assert.equal(landingView("?screen=nonsense"), "board");
});

test("a phone falls back to Today rather than the board", () => {
  assert.equal(landingView("", "today"), "today");
  assert.equal(landingView("?screen=board", "today"), "board", "but the URL still has the last word");
});
