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
import { scenarios, EXAM, questionAt } from "./helpers/scenarios.mjs";
import { ACTIVITY_KEYS } from "../src/exam.js";

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

/* The markup of one named scenario. */
function shown(name) {
  const s = scenarios.find((x) => x.name === name);
  return renderScenario(s.state, s.props).markup;
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

/* The test-mode scenarios are indexed into a generated paper, so a paper that
 * stopped covering an activity would silently render nothing at all. */
test("the fixture paper asks every activity", () => {
  for (const kind of ACTIVITY_KEYS) assert.ok(questionAt(kind) >= 0, `no ${kind} question in the fixture paper`);
  assert.equal(EXAM.ids.length, 20);
});

test("test/setup-empty-pool says so instead of offering a start", () => {
  const s = scenarios.find((x) => x.name === "test/setup-empty-pool");
  const { markup } = renderScenario(s.state, s.props);
  assert.match(markup, /No verses match these settings yet/);
  assert.match(markup, /disabled=""/);
});

test("each activity renders its own panel", () => {
  assert.match(shown("test/name-ref"), /Where is it from\?/);
  assert.match(shown("test/pick-ref"), /None of the above/);
  assert.match(shown("test/finish"), /Finish the sentence from memory/);
  assert.match(shown("test/finish"), /worth a quarter of the mark/, "and asks for the reference too");
  assert.match(shown("test/match"), /Click a verse, then its reference/);
  assert.match(shown("test/last-question"), /Finish and mark/);
});

test("questions can be walked back, except the first", () => {
  assert.match(shown("test/first-question"), /Back<\/button>/);
  assert.match(shown("test/first-question"), /disabled="">Back/, "nothing to go back to");
  assert.doesNotMatch(shown("test/last-question"), /disabled="">Back/);
});

test("a matched pair is tinted the same on both sides of the grid", () => {
  // test/match pairs the first verse with its own reference, so exactly two
  // tiles — one in each column — carry that pair's colour.
  const markup = shown("test/match");
  const tint = markup.match(/hsl\(\d+,42%,92%\)/g) || [];
  assert.equal(tint.length, 2, "the verse and the reference filed under it, and nothing else");
  assert.equal(tint[0], tint[1]);
});

test("leaving a test asks before it throws the paper away", () => {
  const markup = shown("test/leaving");
  assert.match(markup, /Leave the test\?/);
  assert.match(markup, /will\s+not be saved/);
  assert.match(markup, /Keep going/);
});

test("the summary shows a mark, the freshness each verse landed on, and the paper", () => {
  const s = scenarios.find((x) => x.name === "test/summary");
  const { markup } = renderScenario(s.state, s.props);
  assert.match(markup, /Test complete/);
  assert.match(markup, /\d+%/);
  assert.match(markup, /Where each verse landed/);
  assert.match(markup, /The paper/);
  // Answered right and wrong both appear.
  assert.match(markup, /✓/);
  assert.match(markup, /✗/);
});

test("a verse that came out of a test weaker is marked faded", () => {
  assert.match(shown("test/summary-faded"), /faded/);
  assert.doesNotMatch(shown("test/summary"), /faded/, "verses that only gained are not flagged");
});
