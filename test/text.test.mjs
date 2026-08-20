import test from "node:test";
import assert from "node:assert/strict";

import { norm, firstLetters, sentences, dayKey } from "../src/text.js";

test("norm lowercases and strips punctuation", () => {
  assert.equal(norm("Self-Control;"), "selfcontrol");
  assert.equal(norm(""), "");
  assert.equal(norm(null), "");
});

test("an apostrophe is punctuation like any other", () => {
  // Nobody pronounces one, and a member typing from the sound of the verse
  // cannot tell where it belongs — so these are one word.
  assert.equal(norm("eagles"), norm("eagles'"));
  assert.equal(norm("eagles"), norm("eagle's"));
  assert.equal(norm("dont"), norm("don't"));

  // And straight and typographic are the same apostrophe. ESV text carries ’
  // where a keyboard produces ', which used to grade as two different words.
  assert.equal(norm("eagles’"), norm("eagles'"));
  assert.equal(norm("God’s"), norm("God's"));
});

test("firstLetters keeps punctuation, spacing, and hyphens", () => {
  assert.equal(firstLetters("self-control; abide"), "s-c; a");
  assert.equal(firstLetters(""), "");
  assert.equal(firstLetters(null), "");
});

test("sentences splits on terminal punctuation, keeping a closing quote", () => {
  assert.deepEqual(sentences("Hear, O Israel: the Lord is one. You shall love the Lord."), [
    "Hear, O Israel: the Lord is one.",
    "You shall love the Lord.",
  ]);
  assert.deepEqual(sentences("“The Lord is one.” You shall love him."), ["“The Lord is one.”", "You shall love him."]);
});

test("sentences returns text with no full stop whole, and empty text as nothing", () => {
  assert.deepEqual(sentences("be strong and courageous"), ["be strong and courageous"]);
  assert.deepEqual(sentences(""), []);
  assert.deepEqual(sentences(null), []);
});

test("dayKey formats an ISO-ish local key", () => {
  assert.match(dayKey(new Date("2026-08-14T12:00:00")), /^2026-08-14$/);
});

test("dayKey returns the local day, not UTC", () => {
  // A date constructed late in the evening, local time. Regardless of the
  // machine's TZ, dayKey must agree with getFullYear/getMonth/getDate — not
  // roll over the way toISOString() would for timezones behind UTC.
  const d = new Date();
  d.setHours(23, 30, 0, 0);
  const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  assert.equal(dayKey(d), expected);
});
