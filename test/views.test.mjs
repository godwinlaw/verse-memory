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

test("the flashcard's show and hide are one button in one place", () => {
  // Same row, same order, same neighbour — only the label turns over.
  const pair = /Show first letters<\/button><button[^>]*>(Show|Hide) passage<\/button>/;
  assert.match(shown("review/flip-hidden").replace(/\s+</g, "<"), pair);
  assert.match(shown("review/flip-revealed").replace(/\s+</g, "<"), pair);
  assert.match(shown("review/flip-hidden"), /Show passage/);
  assert.match(shown("review/flip-revealed"), /Hide passage/);
  assert.doesNotMatch(shown("review/flip-revealed"), /Reveal the passage/);
});

test("every mode but the flashcard is walked with Previous, Submit and Next", () => {
  for (const name of ["review/blanks", "review/type-empty", "review/scramble"]) {
    assert.match(shown(name), /Previous<\/button>/, name);
    assert.match(shown(name), />Submit<\/button>/, name);
    assert.match(shown(name), /Next passage<\/button>/, name);
  }
  assert.doesNotMatch(shown("review/flip-hidden"), />Submit</, "a flashcard has nothing to mark");
  assert.match(shown("review/first-card"), /disabled="">Previous/, "and the first card has nothing behind it");
  assert.doesNotMatch(shown("review/blanks"), /disabled="">Previous/);
  assert.match(shown("review/last-card"), /Finish session<\/button>/);
});

test("a card already handed in cannot be submitted again", () => {
  assert.match(shown("review/submitted"), /disabled="">Submitted</);
});

test("what a card is worth is quoted before it is submitted", () => {
  assert.match(shown("review/peeking"), /2 peeks · −10%/, "and what the peeks have cost so far");
  assert.match(shown("review/blanks"), /Each peek costs 5%/);
});

test("submitting shows the freshness earned as two bars and a signed figure", () => {
  const markup = shown("review/submitted");
  assert.match(markup, /Was/);
  assert.match(markup, /41%/);
  assert.match(markup, /73%/);
  assert.match(markup, /\+32%/);
  // The second bar is the animated one, run between the two freshness values.
  assert.match(markup, /class="fresh-fill"/);
  assert.match(markup, /--fresh-from:41%/);
  assert.match(markup, /--fresh-to:73%/);
});

test("a card that went badly shows freshness coming off the passage", () => {
  const markup = shown("review/submitted-faded");
  assert.match(markup, /−76%/);
  assert.match(markup, /3 peeks\./);
});

test("leaving a session asks first, and says what survives it", () => {
  assert.match(shown("review/leaving"), /Leave the session\?/);
  assert.match(shown("review/leaving"), /Nothing has been submitted yet/);
  assert.match(shown("review/leaving-after-submitting"), /1 passage you have submitted keeps/);
});

test("walking off an unsubmitted card asks first, either way", () => {
  const onward = shown("review/moving-on-unsubmitted");
  assert.match(onward, /Move on without submitting\?/);
  assert.match(onward, /earns no freshness/);
  assert.match(onward, /Stay on this passage/);
  assert.match(onward, />Move on<\/button>/);

  const back = shown("review/going-back-unsubmitted");
  assert.match(back, /Go back without submitting\?/);
  assert.match(back, /earns no freshness/);
  assert.match(back, />Go back<\/button>/);
});

test("the setup screen explains what freshness is and what each activity pays", () => {
  const markup = shown("review-setup/due");
  assert.match(markup, /How freshness works/);
  assert.match(markup, /forgetting curve/);
  assert.match(markup, /Write it out<\/span>/);
  assert.match(markup, /Up to 100%, on a clean attempt/, "writing it out pays in full");
  assert.match(markup, /Up to 90%, on a clean attempt/, "and ordering the phrases pays the least");
  assert.match(markup, /Each press of Peek costs 5%/);
});

/* ── the board's two queues ───────────────────────────────────────────────── */

test("the board splits the set into what to review and what to learn", () => {
  const markup = shown("board/populated");
  assert.match(markup, /Review today/);
  assert.match(markup, /Learn today/);
  assert.match(markup, /committed · faded to 75% or below/, "and says what each queue is");
  assert.match(markup, /write one out in full to commit it/);
});

test("each queue says why it is empty, and they say different things", () => {
  const fresh = shown("board/fresh-account");
  assert.match(fresh, /Nothing to review yet — a verse arrives here once you have committed it/);

  const done = shown("board/all-committed");
  assert.match(done, /Every passage in the set is committed. Nothing left to learn/);
  assert.match(done, /Every verse you have committed is still fresh/);
});

/* ── learning ─────────────────────────────────────────────────────────────── */

test("the learn screen leads with what commits a passage", () => {
  const markup = shown("learn-setup/default");
  assert.match(markup, /What commits a passage/);
  assert.match(markup, /write the whole thing out from memory/);
  assert.match(markup, /95% of the words right/, "the bar is quoted from the model, not prose");
  assert.match(markup, /Take as many attempts as you like/);
  assert.match(markup, /Start learning/);
});

test("the learn screen previews the verses the sitting will open with", () => {
  const markup = shown("learn-setup/default");
  assert.match(markup, /What you will work on/);
  assert.match(markup, /In progress/);
});

test("a fully committed set offers no learn session", () => {
  const markup = shown("learn-setup/nothing-left");
  assert.match(markup, /nothing left to learn/i);
  assert.match(markup, /disabled=""/);
});

test("a member with nothing committed is sent to learn, not review", () => {
  const markup = shown("review-setup/nothing-committed");
  assert.match(markup, /not committed a verse yet/);
  assert.match(markup, /What commits a passage/, "and is told what would");
  assert.match(markup, /disabled="">\s*Start Review/);
});

test("a learn session says what this card would take to commit the verse", () => {
  const writing = shown("learn/writing");
  assert.match(writing, /Learn · Write it out/, "the session names itself");
  assert.match(writing, /To commit/);
  assert.match(writing, /95% of the words right, without peeking/);

  const practising = shown("learn/practising");
  assert.match(practising, /Write the passage in full to commit/);

  assert.match(
    shown("learn/scaffolded"),
    /Write the passage in full to commit/,
    "first letters is a hint, not a write-out",
  );
});

test("a review session says none of that", () => {
  const markup = shown("review/type-empty");
  assert.match(markup, /Review · Write it out/);
  assert.doesNotMatch(markup, /To commit/, "review is not trying to commit anything");
  assert.doesNotMatch(markup, /Practice counts/);
});

test("committing a verse is marked on the card that did it", () => {
  const markup = shown("learn/committed");
  assert.match(markup, /wrote the passage out in full from memory/);
  assert.match(markup, /moves to your review list/);

  assert.doesNotMatch(shown("learn/writing"), /wrote the passage out in full/, "before it is earned");
});

test("a verse already committed is shown as such rather than re-explained", () => {
  const markup = shown("learn/already-committed");
  assert.match(markup, /written this one out in full from memory/);
  assert.doesNotMatch(markup, /To commit</);
});

/* ── a learn session never mentions freshness ─────────────────────────────── */

/* Freshness is the upkeep idea: how much of a committed passage has decayed and
 * when it is worth topping up. A member committing a passage for the first time
 * cannot act on it, and quoting a percentage invites them to optimise it instead
 * of writing the passage out. The scheduling still runs underneath — it is just
 * never what the learn screens are about. */
const LEARN_SCREENS = [
  "learn-setup/default",
  "learn-setup/all",
  "learn-setup/nothing-left",
  "learn/writing",
  "learn/practising",
  "learn/scaffolded",
  "learn/committed",
  "learn/already-committed",
  "learn/moving-on-unsubmitted",
  "learn/leaving",
  "learn/leaving-after-committing",
  "learn/done",
  "learn/done-nothing-committed",
];

test("no learn screen says anything about freshness", () => {
  for (const name of LEARN_SCREENS) {
    const markup = shown(name);
    assert.doesNotMatch(markup, /fresh/i, `${name} mentions freshness`);
    assert.doesNotMatch(markup, /decay/i, `${name} mentions decay`);
    assert.doesNotMatch(markup, /Worth up to/, `${name} quotes a freshness stake`);
  }
});

test("the review half still does, so the absence is a choice and not a loss", () => {
  assert.match(shown("review-setup/due"), /How freshness works/);
  assert.match(shown("review/submitted"), /Freshness decays from here/);
});

test("a learn card reports whether it committed, not a freshness delta", () => {
  const committed = shown("learn/committed");
  assert.doesNotMatch(committed, /class="fresh-fill"/, "no animated freshness bar");
  assert.doesNotMatch(committed, /--fresh-from/);
  assert.match(committed, />Committed</);

  const missed = shown("learn/practising");
  assert.match(shown("learn/writing"), /A peek means this attempt cannot commit/, "and peeks cost a commitment");
  assert.match(missed, /Write the passage in full to commit/);
});

test("the learn session's dialogs say what is at stake in its own terms", () => {
  // A review session says the passages submitted "keep the freshness they
  // earned"; a learn session has to say something, and it has to be this.
  assert.match(shown("learn/leaving-after-committing"), /1 passage stays committed/);
  assert.match(shown("learn/leaving"), /Nothing has been submitted yet/);
  assert.match(shown("learn/moving-on-unsubmitted"), /nothing about it is recorded/);
  assert.match(shown("review/moving-on-unsubmitted"), /earns no freshness/, "where review still says freshness");
});

test("the end of a learn session counts what was committed, not what was seen", () => {
  assert.match(shown("learn/done"), /1 passage committed/);
  assert.match(shown("learn/done-nothing-committed"), /0 passages committed/);
  assert.match(shown("learn/done-nothing-committed"), /Nothing was committed this time/);
  assert.match(shown("done/session"), /8 passages refreshed/, "a review session still counts refreshes");
});

/* ── the manual commit button is gone ─────────────────────────────────────── */

test("the passage list offers the sitting that suits the row, and no commit button", () => {
  const markup = shown("list/all");
  assert.doesNotMatch(markup, /Mark committed/);
  assert.doesNotMatch(markup, /Un-commit/);
  assert.match(markup, />Learn<\/button>/, "an uncommitted passage is learned");
  assert.match(markup, />Review<\/button>/, "a committed one is reviewed");
});

/* ── hand-picking a sitting from the list ─────────────────────────────────── */

test("the list has nothing to say until a row is ticked", () => {
  const markup = shown("list/all");
  assert.doesNotMatch(markup, /verses selected/);
  assert.doesNotMatch(markup, />Clear</);
  assert.match(markup, /aria-label="Select the rows shown"/, "but the header box is there to tick them with");
});

test("ticked rows offer the sitting their half of the set belongs to", () => {
  const committed = shown("list/selected-committed");
  assert.match(committed, /2 verses selected/);
  assert.match(committed, />Review 2</);
  assert.doesNotMatch(committed, />Learn \d</, "nothing uncommitted was picked");

  const mixed = shown("list/selected-mixed");
  assert.match(mixed, /3 verses selected/);
  assert.match(mixed, />Review 1</);
  assert.match(mixed, />Learn 2</);
  assert.match(mixed, /so this is two sittings/, "and says why it is two buttons");
});

test("a tick the current filter hides is still counted, and flagged", () => {
  assert.match(shown("list/selected-hidden"), /2 verses selected · 1 not shown/);
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
