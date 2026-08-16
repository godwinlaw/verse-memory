import test from "node:test";
import assert from "node:assert/strict";

import { keyBlankSet, chunksFor, BLANK_LEVELS, SCRAMBLE_LEVELS } from "../src/blanks.js";
import { passages } from "../data/passages.js";

test("keyBlankSet picks valid, in-range word indices", () => {
  const p = passages[0];
  const words = p.text.split(" ");
  const blanks = keyBlankSet(p.text, p.id, 1);
  assert.ok(blanks.size > 0, "should blank at least one word");
  for (const i of blanks) assert.ok(i >= 0 && i < words.length, `index ${i} in range`);
  // Fuller level blanks at least as many words as the light level.
  assert.ok(keyBlankSet(p.text, p.id, 2).size >= keyBlankSet(p.text, p.id, 0).size);
  assert.equal(BLANK_LEVELS.length, 3);
});

test("chunksFor splits a passage into ordered chunks that rejoin to the text", () => {
  const p = passages[0];
  for (let level = 0; level < SCRAMBLE_LEVELS.length; level++) {
    const chunks = chunksFor(p.text, level);
    assert.ok(chunks.length >= 1);
    assert.equal(chunks.join(" ").replace(/\s+/g, " ").trim(), p.text.replace(/\s+/g, " ").trim());
  }
});
