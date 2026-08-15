/* Render smoke tests for the view layer.
 *
 * There is no DOM in this test suite (see test/helpers/dom-env.mjs) — every
 * scenario in test/helpers/scenarios.mjs is instantiated as an App and
 * rendered to static markup. This is what makes the views/ + viewmodel/
 * split safe to change: a broken template throws here, and a stray leading
 * space (see docs/refactor-plan.md §4.1) shows up as a captured console.error
 * rather than silently reappearing. */

import test from "node:test";
import assert from "node:assert/strict";

import { render, freezeClock } from "./helpers/dom-env.mjs";
import { scenarios } from "./helpers/scenarios.mjs";

const restore = freezeClock();
const { App } = await import("../src/App.js");

function renderScenario(state, props) {
  const app = new App(props);
  app.state = state;
  const warnings = [];
  const origError = console.error;
  console.error = (...args) => warnings.push(args.map(String).join(" "));
  let markup;
  try {
    markup = render(app.render());
  } finally {
    console.error = origError;
  }
  return { markup, warnings };
}

test.after(() => restore());

for (const s of scenarios) {
  test(`renders without throwing: ${s.name}`, () => {
    assert.doesNotThrow(() => renderScenario(s.state, s.props));
  });

  test(`renders with zero React warnings: ${s.name}`, () => {
    const { warnings } = renderScenario(s.state, s.props);
    assert.deepEqual(warnings, []);
  });
}

test("board shows the committed count", () => {
  const s = scenarios.find((x) => x.name === "board/populated");
  const { markup } = renderScenario(s.state, s.props);
  // progressFixture() commits passages 1, 2, and 3.
  assert.match(markup, />3</);
  assert.match(markup, /passages committed/);
});

test("the empty leaderboard filter shows its empty message", () => {
  const s = scenarios.find((x) => x.name === "leaderboard/empty");
  const { markup } = renderScenario(s.state, s.props);
  assert.match(markup, /No one matches these filters yet\./);
});

test("list/no-matches renders no rows", () => {
  const s = scenarios.find((x) => x.name === "list/no-matches");
  const { markup } = renderScenario(s.state, s.props);
  assert.match(markup, /0 shown/);
});

test("review/type-graded shows a percentage", () => {
  const s = scenarios.find((x) => x.name === "review/type-graded");
  const { markup } = renderScenario(s.state, s.props);
  assert.match(markup, /\d+%/);
});
