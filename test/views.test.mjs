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
import { readFileSync } from "node:fs";

import { render, freezeClock } from "./helpers/dom-env.mjs";
import { scenarios, EXAM, questionAt } from "./helpers/scenarios.mjs";
import { ACTIVITY_KEYS } from "../src/exam.js";
import { ADVANCE_R, HOLD_R, INTERVALS, LAPSE_R } from "../src/srs.js";

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

/* ── run mode ─────────────────────────────────────────────────────────────── */

test("the run screen offers the pinned Psalms playlist and the beat controls", () => {
  const markup = shown("run/default");
  assert.match(markup, /Psalms memory playlist \(by Emily\)/);
  assert.match(markup, /open\.spotify\.com\/playlist\/2J256T9x2D6ysT1zOwpNyE/);
  assert.match(markup, /Steady/);
  assert.match(markup, /Hype/);
  assert.match(markup, /Sprint/);
});

test("a playing run shows the verse being called out", () => {
  const markup = shown("run/playing");
  assert.match(markup, /John 11:35/);
  assert.match(markup, /Jesus wept\./);
  assert.match(markup, /Shane (&amp;|&) Shane/);
});

test("a browser with no WebAudio still gets the playlist", () => {
  const markup = shown("run/unsupported");
  assert.doesNotMatch(markup, /Steady/);
  assert.match(markup, /Psalms memory playlist/);
});

/* No screen prints arithmetic that did not work out.
 *
 * This is cheap and it earns its place: the leaderboard quoted "NaN%" on every
 * peer row for as long as the roster fixture went without a freshnessScore, and
 * nothing here noticed, because a NaN renders as text rather than as a warning.
 * A figure the member cannot read is a bug wherever it appears. */
for (const s of scenarios) {
  test(`prints no NaN: ${s.name}`, () => {
    const { markup } = renderScenario(s.state, s.props);
    assert.doesNotMatch(markup, /NaN|undefined%|Infinity/, `${s.name} shows a figure that did not compute`);
  });
}

for (const s of scenarios) {
  test(`renders without throwing: ${s.name}`, () => {
    assert.doesNotThrow(() => renderScenario(s.state, s.props));
  });

  test(`renders with zero React warnings: ${s.name}`, () => {
    const { warnings } = renderScenario(s.state, s.props);
    assert.deepEqual(warnings, []);
  });
}

/* The alternating level is the one blanks setting with a second control of its
 * own, and it is only offered where there are two halves to choose between. */
test("the alternating level asks which half goes; the keyword levels do not", () => {
  const alternating = shown("review/blanks-alternating");
  assert.match(alternating, /Take away/);
  assert.match(alternating, /1st, 3rd, 5th/);
  assert.match(alternating, /2nd, 4th, 6th/);
  assert.match(alternating, /Blanking every other word/);

  // Nothing to choose between at a keyword level, so the row is not there to be
  // ignored.
  assert.doesNotMatch(shown("review/blanks"), /Take away/);
  assert.doesNotMatch(shown("review/blanks-no-hint"), /Take away/);
});

test("turning the passage over asks for the other words", () => {
  // The two ways round are different exercises, not a relabelling of one — so
  // the markup of the two screens must actually differ.
  assert.notEqual(shown("review/blanks-alternating"), shown("review/blanks-alternating-flipped"));
});

test("a phone is turned away before the app, and before the splash", () => {
  const blocked = shown("device/mobile");
  assert.match(blocked, /not available on a mobile device/);
  // Nothing behind the gate leaks past it: no board, no sign-in, no boot.
  assert.doesNotMatch(blocked, /passages committed/);
  assert.doesNotMatch(blocked, /Sign in with Google/);
  assert.doesNotMatch(blocked, /class="splash-mark"/);

  // Still refused mid-boot: the decision does not wait on anything loading,
  // since none of it changes the answer.
  const loading = shown("device/mobile-while-loading");
  assert.match(loading, /not available on a mobile device/);
  assert.doesNotMatch(loading, /class="splash-mark"/);
});

test("the splash decides where the member lands, so neither destination shows early", () => {
  // Firebase has not answered yet: no sign-in prompt (a returning member would
  // be asked to sign in when they already are) and no board (they may not be).
  const checking = shown("splash/checking-session");
  assert.match(checking, /class="blueprint splash-field"/);
  assert.match(checking, /Checking your session…/);
  assert.doesNotMatch(checking, /Sign in with Google/);
  assert.doesNotMatch(checking, /passages committed/);

  // Once it has: a restored session goes straight home, no session to the gate.
  assert.match(shown("board/populated"), /passages committed/);
  assert.match(shown("auth/signed-out"), /Sign in with Google/);
});

test("the splash holds its minimum even when there is nothing left to wait for", () => {
  // Local data is in and the member is signed in — only splashHold is up, and
  // the animation still gets its turn rather than flashing past.
  const holding = shown("splash/holding");
  assert.match(holding, /class="splash-mark"/);
  assert.doesNotMatch(holding, /passages committed/);
});

test("the splash names the steps but announces only what is true", () => {
  // The three lines cycle on a CSS timer, not on the boot's real state, so they
  // are drawn and hidden from assistive tech; the one live line is the note.
  const checking = shown("splash/checking-session");
  assert.match(checking, /Indexing \d+ passages/);
  assert.match(checking, /Building today&#x27;s queue/);
  assert.match(checking, /class="splash-cycle" aria-hidden="true"/);
});

/* The app's mark: the "marked passage" ribbon, standing beside the wordmark on
 * the way in and at the top of every screen once inside. Both places the
 * wordmark is already, which is why it is never announced. */
test("the mark stands beside the wordmark, on the way in and once inside", () => {
  for (const screen of ["auth/signed-out", "board/populated"]) {
    const markup = shown(screen);
    assert.match(markup, /<svg[^>]*aria-hidden="true"/, `${screen} draws no mark`);
    assert.match(markup, /points="19,8 45,8 45,56 32,46 19,56"/, `${screen} draws something else`);
  }
});

test("and it is the same drawing as the favicon, not a second one", () => {
  // src/icon.svg has to be a standalone file a browser can fetch, so the
  // geometry is copied rather than imported — which is exactly why it is worth
  // a test. An app with two marks has no mark.
  const file = readFileSync(new URL("../src/icon.svg", import.meta.url), "utf8");
  const inline = shown("auth/signed-out");

  const ribbon = /points="([^"]+)"/.exec(file)[1];
  assert.match(inline, new RegExp(`points="${ribbon}"`), "the ribbon differs from the favicon's");
  for (const rule of file.match(/d="M[^"]+"/g)) {
    assert.ok(inline.includes(rule), `the favicon's rule ${rule} is missing from the inline mark`);
  }
  // The one thing the file cannot do is read the palette: it writes the steel
  // longhand where the inline mark names the reversed-plate token, which is
  // also what lifts the mark off a dark page instead of sinking it in.
  assert.match(file, /#1d2d3d/);
  assert.match(inline, /var\(--color-reverse-bg\)/);
});

test("and it is drawn, not announced", () => {
  const gate = shown("auth/signed-out");
  const mark = gate.slice(gate.indexOf("<svg"), gate.indexOf("</svg>"));
  assert.match(mark, /aria-hidden="true"/);
  assert.doesNotMatch(mark, /<title>|aria-label/);
});

/* Ranking groups rather than people. The rule is pure (src/standings.js); what
 * is asserted here is that the screen changes the question it is answering,
 * rather than relabelling the same table. */
test("the board can rank the groups themselves, per member", () => {
  const byGroup = shown("leaderboard/by-group");

  // The fixture holds two USF members (41 + 9 committed), so a group's figure
  // has to be the average and visibly not either row.
  assert.match(byGroup, /USF/);
  assert.match(byGroup, /25\.0/, "the average of 41 and 9, not either of them");
  assert.match(byGroup, /2 members/);
  assert.match(byGroup, /Committed each/, "and the heading says it is per member");
  assert.match(byGroup, /a small group is not out-run by a large one/);

  // Counting whatever the table holds: three ministries, not four people.
  assert.match(byGroup, /3 groups/);
});

test("and each of the three things a member says about themselves", () => {
  assert.match(shown("leaderboard/by-gender"), /Female/);
  assert.match(shown("leaderboard/by-class"), /2025/);
  // The member's own group is pointed out, as their own row is on the people
  // board.
  assert.match(shown("leaderboard/by-group"), /Yours/);
});

test("ranking people is still the board it has always been", () => {
  const people = shown("leaderboard/all");
  assert.match(people, /Grace Hopper/);
  assert.match(people, /5 people/, "four peers and you");
  assert.doesNotMatch(people, /Committed each/);
  assert.doesNotMatch(people, /a small group is not out-run/);
});

test("a grouping with nobody left in it says so in its own words", () => {
  const empty = shown("leaderboard/by-group-empty");
  assert.match(empty, /No one has filled this in yet\./);
  assert.doesNotMatch(empty, /No one matches these filters yet\./);
});

test("the settings form offers a reset, and the setup form does not", () => {
  const editing = shown("profile/edit");
  assert.match(editing, /Reset all progress/);
  // What it would cost, from the fixture: 3 committed, 3 in progress. The
  // warning itself is behind the button, so none of it is on the form.
  assert.match(editing, /You have 3 passages committed and 3 passages in progress\./);
  assert.doesNotMatch(editing, /cannot be undone/);

  // The setup form is a gate with nothing behind it yet — no record to wipe.
  assert.doesNotMatch(shown("profile/setup-empty"), /Reset all progress/);
});

/* Signing up asks for who the member is and nothing else. How reviews behave
 * is a set of questions nobody can answer before they have used the app — how
 * many verses a sitting should hold, how far one may fade — so they wait until
 * there is something to judge them against. */
test("signing up asks for personal details only", () => {
  const setup = shown("profile/setup-empty");

  // Who they are: still asked, and still the whole gate.
  for (const field of [/Name/, /Ministry group/, /Gender/, /Graduating class/]) {
    assert.match(setup, field);
  }

  // How reviews behave: not asked yet, and the form says where it went.
  assert.doesNotMatch(setup, /REVIEW SETTINGS/);
  assert.doesNotMatch(setup, /Top X committed verses/);
  assert.doesNotMatch(setup, /once it fades to/);
  assert.doesNotMatch(setup, /Default difficulty/);
  assert.match(setup, /You can change how reviews work later, under Settings\./);
});

test("and the settings form still carries every one of them", () => {
  // The absence above is a choice about when to ask, not a setting being lost.
  const editing = shown("profile/edit");
  assert.match(editing, /REVIEW SETTINGS/);
  assert.match(editing, /Top X committed verses/);
  assert.match(editing, /once it fades to/);
  assert.match(editing, /Default difficulty/);
  assert.doesNotMatch(editing, /You can change how reviews work later/);
});

/* The appearance switch. The theme itself is a token block in styles.css and a
 * stamp on the root element — neither of which a static render can see — so what
 * is asserted here is the part the form owns: that the three choices are offered
 * where a setting belongs, that the one in force is the one standing selected,
 * and that the note does not promise the member's other devices anything. */
test("the settings form offers the three grounds, and says which device they are for", () => {
  const editing = shown("profile/edit");
  assert.match(editing, /APPEARANCE/);
  for (const label of [/>Light</, /Dark</, />System</]) assert.match(editing, label);
  assert.match(editing, /this device only/);

  // Sign-up asks who the member is and nothing else; the system already answers
  // this one for a member who has never thought about it.
  assert.doesNotMatch(shown("profile/setup-empty"), /APPEARANCE/);
});

test("the ground in force is the one standing selected", () => {
  // segButton() fills the active choice with the accent and reverses its text,
  // which is the only difference between the three buttons in the markup.
  const selected = (markup, label) => {
    const [button] = markup.match(new RegExp("<button[^>]*>" + label + "</button>")) || [];
    return /background:var\(--color-accent\)/.test(button || "");
  };
  const following = shown("profile/edit");
  assert.ok(selected(following, "System"));
  assert.ok(!selected(following, "Dark"));

  const dark = shown("profile/edit-theme-dark");
  assert.ok(selected(dark, "Dark"));
  assert.ok(!selected(dark, "System"));
});

test("resetting says what goes, where it goes from, and what stays", () => {
  const asking = shown("profile/edit-reset-ask");
  assert.match(asking, /Reset all progress\?/);
  // The three counts a member would lose, all read off their own record.
  assert.match(asking, /erases 3 committed passages and 3 passages in progress/);
  assert.match(asking, /streak of 3 days/);
  assert.match(asking, /back to Not started/);
  // That it is not just this device, and that the profile survives it.
  assert.match(asking, /every device you sign in on/);
  assert.match(asking, /review settings above are kept\. This cannot be undone\./);
  // And a way out that is not the destructive one.
  assert.match(asking, />Keep my progress<\/button>/);
});

test("a member with nothing recorded has nothing to reset", () => {
  const empty = shown("profile/edit-nothing-to-reset");
  assert.match(empty, /not recorded anything yet/);
  // The button is there, but dead — there is no record behind it.
  const [button] = empty.match(/<button[^>]*>Reset all progress<\/button>/) || [];
  assert.match(button || "", /disabled=""/);
});

test("board shows the committed count", () => {
  const s = scenarios.find((x) => x.name === "board/populated");
  const { markup } = renderScenario(s.state, s.props);
  // progressFixture() commits passages 1, 2, and 3. The hero's figures count up
  // to themselves in CSS (styles.css, .count-up), so the number reaches the page
  // as the --count a counter is reset to rather than as a text node. The hero's
  // own figure is the first of them.
  const [hero] = markup.match(/<div class="count-up"[^>]*>/) || [];
  assert.match(hero || "", /--count:3"/);
  assert.match(markup, /passages committed/);
});

test("the empty leaderboard filter shows its empty message", () => {
  const s = scenarios.find((x) => x.name === "leaderboard/empty");
  const { markup } = renderScenario(s.state, s.props);
  assert.match(markup, /No one matches these filters yet\./);
});

test("a member with nothing committed has no row on the stats board", () => {
  const s = scenarios.find((x) => x.name === "leaderboard/unfinished-peer");
  const { markup } = renderScenario(s.state, s.props);
  assert.doesNotMatch(markup, /Nobody Yet/);
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

test("a missed recall word shows what was written in its place", () => {
  const markup = shown("review/type-graded-mistakes");
  assert.match(markup, />O<\/span>/, "the missed word is still shown in full");
  assert.match(markup, />israel</, "and what was typed in its place, right there beside it");
  assert.match(markup, />load</, "a wrong word shows what was actually written, not just that it's wrong");
  // Once the input runs out there is nothing to show having been typed —
  // "the", "is", "one" and the rest of the passage past "god" are missed with
  // no annotation, so exactly the two real mistakes get a strike-through line.
  assert.equal((markup.match(/text-decoration:line-through/g) || []).length, 2);
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

test("the flashcard is a two-sided card: reference out, passage in", () => {
  // Both faces are always in the card — turning it is what decides which one the
  // member looks at, and which one a screen reader is given.
  const front = shown("review/flip-hidden");
  assert.match(front, /class="flip-card-face" aria-hidden="false"/);
  assert.match(front, /class="flip-card-face flip-card-back" aria-hidden="true"/);
  assert.match(front, /Deuteronomy 6:4-5/, "the reference is on the front");
  assert.doesNotMatch(front, /class="flip-card is-flipped"/);
  assert.match(front, /title="Turn the card over to show the passage"/);

  const back = shown("review/flip-revealed");
  assert.match(back, /class="flip-card is-flipped"/);
  assert.match(back, /class="flip-card-face" aria-hidden="true"/);
  assert.match(back, /class="flip-card-face flip-card-back" aria-hidden="false"/);
  assert.match(back, /title="Turn the card back to the reference"/);
});

test("the first letters stand in for the passage, so they take its place on the back", () => {
  const letters = shown("review/flip-letters");
  assert.match(letters, /class="flip-card is-flipped"/, "the answer is on the back, at either strength");
  assert.match(letters, /H, O I: T L o G/, "the scaffold");
  assert.doesNotMatch(letters, /Israel:/, "and not the passage it stands in for");
  assert.match(letters, /Deuteronomy 6:4-5/, "the reference stays with it");
  assert.match(letters, /Hide first letters<\/button>/);
  assert.match(letters, /Show passage<\/button>/, "the other button still offers the full text");
});

test("each of the flashcard's buttons reads by what is on screen, not by the switch", () => {
  // A press that says Hide must be undoing something the member can see, and a
  // press that says Show must change what they are looking at.
  assert.match(shown("review/flip-hidden"), /Show first letters<\/button>/);
  assert.match(shown("review/flip-revealed"), /Show first letters<\/button>/);
  // Front-side out with the switch still set: the letters are not on screen,
  // so the button offers them rather than offering to take them away.
  const front = shown("review/flip-letters-front");
  assert.match(front, /Show first letters<\/button>/);
  assert.doesNotMatch(front, /class="flip-card is-flipped"/);
  assert.match(front, /title="Turn the card over to show the first letters"/, "and the turn says what it will show");
});

test("the guide demonstrates the flashcard component itself, not a drawing of one", () => {
  // Both reach for the same classes, so the picture cannot drift from the thing
  // it is a picture of.
  assert.match(shown("guide/default"), /class="guide-demo guide-flip flip-card"/);
  assert.match(shown("guide/default"), /class="flip-card-face flip-card-back"/);
  assert.match(shown("review/flip-hidden"), /class="flip-card-face flip-card-back"/);
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

test("looking the passage up is offered two ways, below the activity", () => {
  const markup = shown("review/blanks");
  assert.match(markup, /Peek/, "held down for a glance");
  assert.match(markup, /Keep shown/, "or latched on, for a member checking line by line");
  assert.ok(
    markup.indexOf("Keep shown") > markup.indexOf("blank-input"),
    "and the control sits below the activity, beside where the passage appears",
  );
  assert.doesNotMatch(shown("review/flip-hidden"), /Keep shown/, "a flashcard is already a reveal");
});

test("a latched peek reads as on, and says what it has cost", () => {
  const latched = shown("review/peek-latched");
  assert.match(latched, /aria-label="Keep shown" aria-pressed="true"/, "the switch says which way it is set");
  assert.match(latched, /1 peek · −5%/, "and the sitting is a peek down on this card");
  assert.doesNotMatch(shown("review/blanks"), /aria-pressed="true"/, "unlatched, it is not");
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

test("the setup screen explains what freshness is and what each activity pays, once opened", () => {
  const markup = shown("review-setup/explainer-open");
  assert.match(markup, /How it works/);
  assert.match(markup, /forgetting curve/);
  assert.match(markup, /From memory<\/span>/);
  assert.match(markup, /Up to 100%, on a clean attempt/, "writing it out pays in full");
  assert.match(markup, /Up to 90%, on a clean attempt/, "and ordering the phrases pays the least");
  assert.match(markup, /Each press of Peek costs 5%/);
});

test("both setup screens name the explanation 'How it works', hidden until opened", () => {
  const closed = shown("review-setup/due");
  assert.match(closed, /How it works/, "the title always shows");
  assert.doesNotMatch(closed, /forgetting curve/, "but not the body, by default");
  assert.match(closed, />Show<\/button>/);

  const open = shown("review-setup/explainer-open");
  assert.match(open, /How it works/);
  assert.match(open, /forgetting curve/, "opened, it shows");
  assert.match(open, />Hide<\/button>/);

  const learnClosed = shown("learn-setup/default");
  assert.match(learnClosed, /How it works/);
  assert.doesNotMatch(learnClosed, /give the whole thing back from memory/);

  const learnOpen = shown("learn-setup/explainer-open");
  assert.match(learnOpen, /give the whole thing back from memory/);
});

/* ── the guide ────────────────────────────────────────────────────────────── */

test("the guide quotes the model rather than prose", () => {
  const markup = shown("guide/default");
  assert.match(markup, /95% of the words right/, "the commit bar comes from srs.COMMIT_SCORE");
  assert.match(markup, /Worth up to 100% freshness/, "writing it out pays in full");
  assert.match(markup, /Worth up to 90% freshness/, "and ordering the phrases pays the least");
  assert.match(markup, /asks for it back at 75%/, "and the due mark comes from the profile");
});

test("the freshness demonstration runs the real curve under the slider", () => {
  // Day 0: nothing has decayed, whatever the passage's stability.
  const start = shown("guide/day-zero");
  assert.match(start, /the same day/);
  assert.match(start, />100%</);
  assert.match(start, /Still above the line/);

  // A month on, a well-held passage is just under the mark and a new one is all
  // but gone — which is the whole point of the picture. Both curves are rungs of
  // the real ladder: the fortnight one a member reaches after seven clean
  // reviews, and the very first, a day.
  const later = shown("guide/month-later");
  assert.match(later, /30 days later/);
  assert.match(later, />54%</, "the fortnight rung, e^(−30/48.7)");
  assert.match(later, />0%</, "the first rung, e^(−30/3.5), rounds away");
  assert.match(later, /Below the line/);
});

test("the schedule is drawn from the model's own ladder, rung for rung", () => {
  const markup = shown("guide/default");
  // Not a list typed out beside srs.INTERVALS — the same list, in the member's
  // words, so retuning the model redraws the picture.
  assert.equal((markup.match(/guide-rung"/g) || []).length, INTERVALS.length);
  for (const [days, label] of [
    [1, "1 day"],
    [7, "1 week"],
    [30, "1 month"],
    [365, "1 year"],
  ]) {
    assert.ok(INTERVALS.includes(days), `${days} days should be a rung`);
    assert.match(markup, new RegExp(">" + label + "<"), `the ${days}-day rung should read "${label}"`);
  }
});

test("the guide names the four bands a mark can fall in, off the model's hinges", () => {
  const markup = shown("guide/default");
  assert.match(markup, new RegExp("You get " + Math.round(ADVANCE_R * 100) + "% or more right"));
  assert.match(markup, new RegExp("You get " + Math.round(HOLD_R * 100) + "–" + (Math.round(ADVANCE_R * 100) - 1)));
  assert.match(markup, new RegExp("You get under " + Math.round(LAPSE_R * 100) + "% right"));
  assert.match(markup, /Flashcards do not count/, "and says why the one unmarked activity cannot move you up");
});

test("every activity is demonstrated, and only one is flagged as committing", () => {
  const markup = shown("guide/default");
  for (const cls of ["guide-flip", "guide-order", "guide-blanks", "guide-type"]) {
    assert.match(markup, new RegExp(cls), `no ${cls} demonstration`);
  }
  assert.equal((markup.match(/the only one that commits/g) || []).length, 1);
});

/* The guide is the screen a member reads before they know how any of this
 * works, so it is written plainly on purpose (see the note atop
 * viewmodel/guide.js). These are the words the rest of the app is free to use
 * and this screen is not — a rewrite that reaches for them has drifted back. */
const GUIDE_JARGON = [
  /sitting/i,
  /upkeep/i,
  /retrievabilit/i,
  /stability/i,
  /canonical/i,
  /marked paper/i,
  /scaffold/i,
];

test("the guide says none of it in the app's own shorthand", () => {
  for (const name of ["guide/default", "guide/month-later"]) {
    const markup = shown(name);
    for (const word of GUIDE_JARGON) {
      assert.doesNotMatch(markup, word, `${name} reaches for ${word}`);
    }
  }
});

/* The app is not offered on a device you hold (src/device.js, views/mobile-gate.js),
 * so a guide that tells a member to recite into their phone is describing a
 * screen they will never be shown. The recall card takes the words either way —
 * spoken or typed — and says so without naming hardware, which is the wording
 * the guide now borrows. */
test("the guide never sends a member to a device the app refuses to run on", () => {
  for (const name of ["guide/default", "guide/day-zero", "guide/month-later"]) {
    const markup = shown(name);
    for (const word of [/phone/i, /tablet/i, /mobile/i, /\bipad\b/i, /\btap\b/i]) {
      assert.doesNotMatch(markup, word, `${name} reaches for ${word}`);
    }
  }
});

test("and teaches the two words it does keep, rather than dodging them", () => {
  // "committed" and "freshness" are printed on every other screen, so a synonym
  // here would match nothing the member goes on to see.
  const markup = shown("guide/default");
  assert.match(markup, /only counts as committed when you can say or write the whole thing from memory/);
  assert.match(markup, /it calls that freshness/);
});

test("the board offers a way into the guide", () => {
  assert.match(shown("board/populated"), /How this works<\/button>/);
});

/* ── the board's two queues ───────────────────────────────────────────────── */

test("the board splits the set into what to review and what to learn", () => {
  const markup = shown("board/populated");
  assert.match(markup, /Review today/);
  assert.match(markup, /Learn today/);
  assert.match(markup, /committed · faded to 75% or below/, "and says what each queue is");
  assert.match(markup, /give one back in full to commit it/);
});

test("each queue says why it is empty, and they say different things", () => {
  const fresh = shown("board/fresh-account");
  assert.match(fresh, /Nothing to review yet — a verse arrives here once you have committed it/);

  const done = shown("board/all-committed");
  assert.match(done, /Every passage in the set is committed. Nothing left to learn/);
  assert.match(done, /Every verse you have committed is still fresh/);
});

/* ── learning ─────────────────────────────────────────────────────────────── */

test("the learn screen leads with 'How it works', and opening it explains what commits a passage", () => {
  const markup = shown("learn-setup/default");
  assert.match(markup, /How it works/);
  assert.match(markup, /Start learning/);

  const open = shown("learn-setup/explainer-open");
  assert.match(open, /give the whole thing back from memory/);
  assert.match(open, /95% of the words right/, "the bar is quoted from the model, not prose");
  assert.match(open, /Take as many attempts as you like/);
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
  assert.match(markup, /How it works/, "and is offered the explanation");
  assert.match(markup, /disabled="">\s*Start Review/);
});

test("a learn session says what this card would take to commit the verse", () => {
  const writing = shown("learn/writing");
  assert.match(writing, /Learn · From memory/, "the session names itself");
  assert.match(writing, /To commit/);
  assert.match(writing, /95% of the words right, without peeking/);

  const practising = shown("learn/practising");
  assert.match(practising, /Head over to the Recall tab to commit/);

  assert.match(
    shown("learn/scaffolded"),
    /95% of the words right, without peeking/,
    "the first-letter scaffold still commits in Learn",
  );
});

test("a review session says none of that", () => {
  const markup = shown("review/type-empty");
  assert.match(markup, /Review · From memory/);
  assert.doesNotMatch(markup, /To commit/, "review is not trying to commit anything");
  assert.doesNotMatch(markup, /Practice counts/);
});

test("committing a verse is marked on the card that did it", () => {
  const markup = shown("learn/committed");
  assert.match(markup, /gave the passage back in full from memory/);
  assert.match(markup, /moves to your review list/);

  assert.doesNotMatch(shown("learn/writing"), /gave the passage back in full/, "before it is earned");
});

test("a verse already committed is shown as such rather than re-explained", () => {
  const markup = shown("learn/already-committed");
  assert.match(markup, /given this one back in full from memory/);
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
  "learn/not-committed",
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
  assert.match(shown("review-setup/explainer-open"), /how much of it you would still recall/);
  assert.match(shown("review/submitted"), /Freshness decays from here/);
});

test("a learn card reports whether it committed, not a freshness delta", () => {
  const committed = shown("learn/committed");
  assert.doesNotMatch(committed, /class="fresh-fill"/, "no animated freshness bar");
  assert.doesNotMatch(committed, /--fresh-from/);
  assert.match(committed, />Committed</);

  const missed = shown("learn/practising");
  assert.match(shown("learn/writing"), /A peek means this attempt cannot commit/, "and peeks cost a commitment");
  assert.match(missed, /Head over to the Recall tab to commit/);
});

test("a card that fell short of committing offers a try again — a done one does not", () => {
  assert.match(
    shown("learn/not-committed"),
    /Try again/,
    "so a first miss is not the only chance this sitting gives it",
  );
  assert.doesNotMatch(shown("learn/committed"), /Try again/, "nothing to retry once the verse is in");
  assert.doesNotMatch(shown("learn/already-committed"), /Try again/, "or once it already was");
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
  assert.match(markup, /nothing to test/);
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

/* Every other activity puts the passage in front of the member — quoted, cut
 * into phrases, or blanked — and the four that ask where a verse is from must
 * not. "Write it out" is the one that shows nothing, so it names the reference,
 * or there is no way to tell which passage is being asked for. */
test("write it out names the passage it wants, since it quotes none of it", () => {
  const markup = shown("test/type");
  assert.ok(markup.includes(EXAM.questions[questionAt("type")].ref), "the reference is the question here");
  assert.match(markup, /Write out this passage/);
});

test("an activity that asks for the reference still does not print it", () => {
  // Nothing answered yet, so anything on screen is the question rather than
  // what the member typed into it.
  const markup = shown("test/name-ref-blank");
  assert.ok(!markup.includes(EXAM.questions[questionAt("name-ref")].ref), "that would be its own answer");
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

/* ── reciting aloud ───────────────────────────────────────────────────────────
 *
 * One switch, in the same row as the first-letter scaffold's, on the one card
 * that has a box to recite into. The words land in that box; there is nothing
 * else to draw. */

test("voice is one switch beside the scaffold's, on the recall card only", () => {
  const markup = shown("voice/off");
  assert.match(markup, />Voice</);
  // The same On/Off segmented control the rest of the card uses, not a panel.
  assert.doesNotMatch(markup, /Undo|Back a word|Clear|Hearing|Heard by/);
  for (const elsewhere of ["review/blanks", "review/scramble", "review/flip-hidden"]) {
    assert.doesNotMatch(shown(elsewhere), />Voice</, `${elsewhere} has no box to recite into`);
  }
});

test("a browser that cannot listen says so, and the switch is dead", () => {
  const markup = shown("voice/unsupported");
  assert.match(markup, /Not available in this browser/);
  assert.match(markup, /disabled=""/);
});

test("the first-letter scaffold takes the switch away — there is nothing to recite", () => {
  assert.doesNotMatch(shown("voice/scaffold-on"), />Voice</);
});

test("the dot beats only once the microphone is really open", () => {
  assert.doesNotMatch(shown("voice/off"), /class="mic-dot"/, "off");
  assert.doesNotMatch(shown("voice/starting"), /class="mic-dot"/, "still waiting on permission");
  assert.match(shown("voice/listening"), /class="mic-dot"/, "listening");
});

test("the words appear in the box the grader reads, and nowhere else", () => {
  const markup = shown("voice/listening");
  const box = /<textarea[^>]*>([^<]*)<\/textarea>/.exec(markup);
  assert.ok(box, "the transcript box is still there while listening");
  assert.match(box[1], /Hear O Israel the LORD our God the LORD is one/);
  assert.doesNotMatch(markup, /class="voice-interim"/, "no second surface to keep in step");
});

test("the hint gives way once it is on, and to an error if one lands", () => {
  assert.match(shown("voice/off"), /Say the passage — the words appear as you go/);
  assert.doesNotMatch(shown("voice/listening"), /Say the passage/, "not worth repeating while they are");
  assert.match(shown("voice/blocked"), /The microphone was blocked\. Allow it in your browser/);
});

test("a review sitting gets the same one switch", () => {
  assert.match(shown("voice/review-session"), />Voice</);
});

/* ── the sync gate ──────────────────────────────────────────────────────────
 *
 * The bug these guard: a member whose cloud record could not be read looks
 * exactly like a member who has none, so the app used to show them the sign-up
 * profile form on every device — and the profile they filled in, being newer,
 * then won the merge and replaced the real one. */

test("a member whose record is still being read is not asked to sign up", () => {
  const pulling = shown("sync/pulling");
  assert.doesNotMatch(pulling, /SET UP YOUR PROFILE/);
  assert.match(pulling, /FINDING YOUR RECORD/);
  // Nothing to press while a read is in flight — only the failed state offers a way on.
  assert.doesNotMatch(pulling, /Try again/);
});

test("a refused read says so, and offers only the two safe moves", () => {
  const refused = shown("sync/refused");
  assert.doesNotMatch(refused, /SET UP YOUR PROFILE/);
  assert.match(refused, /COULD NOT REACH YOUR RECORD/);
  // It must not tell the member they have no progress — the app does not know.
  assert.doesNotMatch(refused, /no progress/i);
  // A permission-denied read is a rules problem, and the member is told it is not theirs.
  assert.match(refused, /setup problem, not your account/);
  assert.match(refused, />Try again<\/button>/);
  assert.match(refused, />Sign out<\/button>/);
});

test("an unreachable read blames the connection rather than the account", () => {
  const offline = shown("sync/unreachable");
  assert.match(offline, /could not reach the server/);
  assert.doesNotMatch(offline, /setup problem/);
});

test("a retry in flight disables its own button", () => {
  const retrying = shown("sync/retrying");
  const [button] = retrying.match(/<button[^>]*>Trying…<\/button>/) || [];
  assert.match(button || "", /disabled=""/);
});

test("a member with a profile already on this device gets the app and a warning", () => {
  const board = shown("sync/banner-on-board");
  // Past the gate: the board is there.
  assert.match(board, /passages committed/);
  // But the strip says the work is not leaving the device.
  assert.match(board, /saved on this device only/);
  assert.match(board, />Retry sync<\/button>/);
});

test("a healthy sync shows neither the gate nor the banner", () => {
  const board = shown("board/populated");
  assert.doesNotMatch(board, /COULD NOT REACH YOUR RECORD/);
  assert.doesNotMatch(board, /saved on this device only/);
  // And a genuinely new member — record read, nothing in it — still gets the form.
  assert.match(shown("profile/setup-empty"), /SET UP YOUR PROFILE/);
});

test("an SDK that never loaded does not hand the member a sign-up form", () => {
  const gone = shown("sync/sdk-unreachable");
  // The bug: "disabled" skips the sign-in gate, so this fell through to sign-up.
  assert.doesNotMatch(gone, /SET UP YOUR PROFILE/);
  assert.match(gone, /COULD NOT REACH YOUR ACCOUNT/);
  // And it names the things actually worth checking.
  assert.match(gone, /gstatic\.com/);
  assert.match(gone, />Try again<\/button>/);
});

test("an unreachable SDK still lets a member with a profile work, with the warning", () => {
  const board = shown("sync/sdk-unreachable-with-profile");
  assert.match(board, /passages committed/);
  assert.match(board, /saved on this device only/);
});

test("a build with no Firebase configured is local-only and says nothing", () => {
  // Not a fault — there is no account to reach, so the form is correct here.
  const local = shown("sync/unconfigured");
  assert.match(local, /SET UP YOUR PROFILE/);
  assert.doesNotMatch(local, /COULD NOT REACH/);
  assert.doesNotMatch(local, /saved on this device only/);
});
