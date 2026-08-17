/* The shell's action table, for the flows whose wiring the render tests cannot
 * reach: a review session card by card, and a test from setup to summary.
 *
 * Every other screen is a function of state that test/views.test.mjs renders
 * directly, but a sitting is a sequence — answer, advance, finish, and the
 * progress map written at the end. Nothing is mounted here either: the instance
 * is given a synchronous stand-in for React's update queue, so an action's
 * setState lands on `state` immediately and the next action can read it. */

import test from "node:test";
import assert from "node:assert/strict";

import { freezeClock } from "./helpers/dom-env.mjs";
import { baseState, NOW, PROPS } from "./helpers/scenarios.mjs";
import { normalizeSetup } from "../src/exam.js";
import { LEARN } from "../src/review.js";
import { COMMIT_SCORE } from "../src/srs.js";
import { dayKey } from "../src/text.js";

const restore = freezeClock();

/* storage.js degrades gracefully when localStorage is missing, which would make
 * the persistence half of these flows a no-op. Give it a real one. */
const saved = new Map();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (k) => (saved.has(k) ? saved.get(k) : null),
    setItem: (k, v) => saved.set(k, String(v)),
    removeItem: (k) => saved.delete(k),
  },
});

const { App } = await import("../src/App.js");
test.after(() => restore());

/* An App whose setState applies at once, standing in for the mounted queue. */
function app(state) {
  const instance = new App(PROPS);
  instance.state = state;
  instance.updater = {
    isMounted: () => true,
    enqueueSetState(inst, partial, callback) {
      const patch = typeof partial === "function" ? partial(inst.state) : partial;
      inst.state = { ...inst.state, ...patch };
      if (callback) callback();
    },
    enqueueForceUpdate() {},
    enqueueReplaceState() {},
  };
  return instance;
}

const sitting = (over) => app(baseState({ view: "test-setup", examSetup: normalizeSetup({ size: 5, ...over }) }));

/* A review session over two passages, in the given mode. */
function session(mode, over) {
  const a = app(baseState(over));
  a.actions.startSession(mode, [1, 2]);
  return a;
}

/* A learn session over uncommitted verses. progressFixture() leaves 4, 5 and 6
 * in progress, so those are the ones a learn session would be given. */
function learnSession(mode, over) {
  const a = app(baseState(over));
  a.actions.startSession(mode, [4, 5], LEARN);
  return a;
}

/* ── review sessions ──────────────────────────────────────────────────────── */

test("submitting a card writes what the attempt was worth", () => {
  const a = session("type");
  const before = baseState().progress[1];

  a.actions.submitCard(1);
  const after = a.state.progress[1];

  assert.equal(after.hits, before.hits + 1);
  assert.ok(after.stability > before.stability, "a review lengthens the interval");
  assert.equal(after.last, NOW, "a clean write-out is worth full freshness, so it is dated to now");
  assert.equal(after.updatedAt, NOW, "and stamped, since `last` is an award rather than a clock reading");
  assert.equal(a.state.results[1].after, 100);
  assert.equal(a.state.log[dayKey(new Date())], baseState().log[dayKey(new Date())] + 1);
});

test("a weaker attempt lands the passage lower down its curve", () => {
  const write = session("type");
  write.actions.submitCard(1);
  const half = session("type");
  half.actions.submitCard(0.5);

  assert.equal(write.state.results[1].after, 100);
  assert.equal(half.state.results[1].after, 50, "half the passage recalled leaves it half fresh");
  assert.ok(half.state.progress[1].last < NOW, "so it is dated back rather than stamped now");
});

test("ordering the phrases is worth less than writing it out", () => {
  const write = session("type");
  write.actions.submitCard(1);
  const order = session("scramble");
  order.actions.submitCard(1);

  assert.ok(order.state.results[1].after < write.state.results[1].after);
});

test("each peek costs the card freshness", () => {
  const clean = session("blanks");
  clean.actions.submitCard(1);

  const peeked = session("blanks");
  for (let i = 0; i < 2; i++) {
    peeked.actions.setPeek(true);
    peeked.actions.setPeek(false);
  }
  assert.equal(peeked.state.peeks, 2, "only the press counts, not letting go");
  peeked.actions.submitCard(1);

  assert.equal(peeked.state.results[1].after, clean.state.results[1].after - 10);
  assert.equal(peeked.state.results[1].peeks, 2);
});

test("moving on without submitting asks first, and records nothing", () => {
  const a = session("blanks");

  a.actions.nextCard();
  assert.equal(a.state.reviewMoveAsk, "next");
  assert.equal(a.state.qi, 0, "asking does not move on");

  a.actions.cancelMoveCard();
  assert.equal(a.state.reviewMoveAsk, null);
  assert.equal(a.state.qi, 0);

  a.actions.nextCard();
  a.actions.confirmMoveCard();
  assert.equal(a.state.qi, 1);
  assert.deepEqual(a.state.progress[1], baseState().progress[1], "a passage never handed in is untouched");
  assert.deepEqual(a.state.results, {});
});

test("going back without submitting asks too, and goes back when confirmed", () => {
  const a = session("blanks");
  a.actions.submitCard(1);
  a.actions.nextCard();
  assert.equal(a.state.qi, 1);

  a.actions.prevCard();
  assert.equal(a.state.reviewMoveAsk, "prev", "the card behind us is unmarked either way we walk off it");
  assert.equal(a.state.qi, 1, "asking does not go back");

  a.actions.cancelMoveCard();
  assert.equal(a.state.reviewMoveAsk, null);
  assert.equal(a.state.qi, 1);

  a.actions.prevCard();
  a.actions.confirmMoveCard();
  assert.equal(a.state.qi, 0, "confirming goes back, not on");
  assert.deepEqual(a.state.progress[2], baseState().progress[2], "and the card left behind is untouched");
});

test("a submitted card moves on without asking, and is never marked twice", () => {
  const a = session("blanks");
  a.actions.submitCard(1);
  const marked = a.state.progress[1];

  a.actions.nextCard();
  assert.equal(a.state.reviewMoveAsk, null, "there is nothing left to hand in");
  assert.equal(a.state.qi, 1);

  // Walk back to it and on again: the mark it already earned stands. Going
  // back leaves card 2 unsubmitted, so that step is confirmed.
  a.actions.prevCard();
  a.actions.confirmMoveCard();
  assert.equal(a.state.qi, 0);
  a.actions.submitCard(0);
  assert.deepEqual(a.state.progress[1], marked, "submitting again does nothing");
  a.actions.nextCard();
  assert.equal(a.state.reviewMoveAsk, null);
  assert.deepEqual(a.state.progress[1], marked);
});

test("the flashcard has nothing to submit, so moving on marks it", () => {
  const a = session("flip");
  a.actions.nextCard();

  assert.equal(a.state.reviewMoveAsk, null);
  assert.equal(a.state.qi, 1);
  assert.equal(a.state.progress[1].hits, baseState().progress[1].hits + 1);
  assert.equal(a.state.progress[1].last, NOW, "an unmarked activity still counts as reviewed");
});

test("the first card is as far back as a session goes, and the last ends it", () => {
  const a = session("flip");
  a.actions.prevCard();
  assert.equal(a.state.qi, 0);

  a.actions.nextCard();
  a.actions.nextCard();
  assert.equal(a.state.view, "done");
  assert.equal(a.state.sessionCount, 2);
});

test("leaving a session asks first, and keeps what was submitted", () => {
  const a = session("type");
  a.actions.submitCard(1);
  const marked = a.state.progress[1];

  a.actions.askLeaveReview();
  assert.equal(a.state.reviewLeaveAsk, true);
  assert.equal(a.state.view, "review", "asking does not leave");

  a.actions.cancelLeaveReview();
  assert.equal(a.state.reviewLeaveAsk, false);
  assert.equal(a.state.view, "review");

  a.actions.askLeaveReview();
  a.actions.leaveReview();
  assert.equal(a.state.view, "board");
  assert.equal(a.state.reviewLeaveAsk, false);
  assert.deepEqual(a.state.progress[1], marked, "the card handed in keeps its freshness");
  assert.deepEqual(a.state.progress[2], baseState().progress[2], "the rest of the queue is dropped");
});

test("a wrong chunk is refused, counted, and costs the ordering mark", () => {
  const a = session("scramble");
  a.actions.placeChunk(3);
  assert.deepEqual(a.state.scrambleOrder, [], "the wrong chunk is not placed");
  assert.equal(a.state.scrambleMisses, 1);

  a.actions.placeChunk(0);
  assert.deepEqual(a.state.scrambleOrder, [0]);
  assert.equal(a.state.scrambleMisses, 1);

  // Starting over clears the board but not the wrong tries.
  a.actions.resetScramble();
  assert.equal(a.state.scrambleMisses, 1);
});

test("a card that has been handed in stops taking answers", () => {
  const a = session("blanks");
  a.actions.setAnswer(0, "hear");
  a.actions.submitCard(1);

  a.actions.setAnswer(0, "changed");
  assert.deepEqual(a.state.answers, { 0: "hear" }, "the marked paper is not editable");
  a.actions.setTyped("late");
  assert.equal(a.state.typed, "");
  a.actions.placeChunk(0);
  assert.deepEqual(a.state.scrambleOrder, []);
});

/* ── learning: what commits a verse ───────────────────────────────────────── */

test("writing the passage out in full is what commits it", () => {
  const a = learnSession("type");
  assert.equal(a.state.progress[4].status, "learning", "verse 4 starts uncommitted");

  a.actions.submitCard(1);

  assert.equal(a.state.progress[4].status, "memorized");
  assert.equal(a.state.results[4].committed, true, "and the card says it is what did it");
});

test("the bar is a near-perfect write-out, not a passable one", () => {
  const pass = learnSession("type");
  pass.actions.submitCard(COMMIT_SCORE);
  assert.equal(pass.state.progress[4].status, "memorized", "the bar itself is a pass");

  const under = learnSession("type");
  under.actions.submitCard(COMMIT_SCORE - 0.01);
  assert.equal(under.state.progress[4].status, "learning");
  assert.equal(under.state.results[4].committed, false);

  const half = learnSession("type");
  half.actions.submitCard(0.5);
  assert.equal(half.state.progress[4].status, "learning", "half a passage is half a passage");
});

test("no other activity commits a verse, however well it goes", () => {
  for (const mode of ["flip", "blanks", "scramble"]) {
    const a = learnSession(mode);
    a.actions.submitCard(1);
    assert.equal(a.state.progress[4].status, "learning", `${mode} is practice, not a write-out`);
  }
});

test("a passage that was peeked at or scaffolded was not written from memory", () => {
  const peeked = learnSession("type");
  peeked.actions.setPeek(true);
  peeked.actions.setPeek(false);
  peeked.actions.submitCard(1);
  assert.equal(peeked.state.progress[4].status, "learning", "a passage read is not a passage recalled");

  const scaffolded = learnSession("type", { typeFirstLetter: true });
  scaffolded.actions.submitCard(1);
  assert.equal(scaffolded.state.progress[4].status, "learning", "first letters is a hint");
});

test("repetition alone no longer commits anything", () => {
  // The old rule promoted a verse on its third clean review of any kind. Ten
  // flashcards should now leave it exactly where it started.
  let a = learnSession("flip");
  for (let i = 0; i < 10; i++) {
    a = learnSession("flip", { progress: a.state.progress });
    a.actions.submitCard(1);
  }
  assert.ok(a.state.progress[4].hits >= 10, "the clean reviews are still counted");
  assert.equal(a.state.progress[4].status, "learning", "but they do not add up to a commitment");
});

test("a verse already committed is never demoted by a bad card", () => {
  const a = session("type"); // verses 1 and 2, both committed in the fixture
  a.actions.submitCard(0);

  assert.equal(a.state.progress[1].status, "memorized");
  assert.equal(a.state.results[1].committed, false, "it was already committed, so this card did not commit it");
  assert.ok(a.state.results[1].after < a.state.results[1].before, "it only costs freshness");
});

test("there is no longer a button that commits a passage", () => {
  const a = app(baseState());
  assert.equal(a.actions.setStatus, undefined, "the manual commit toggle is gone from the action table");
});

test("a session remembers which kind it is", () => {
  assert.equal(learnSession("type").state.sessionKind, LEARN);
  assert.equal(session("type").state.sessionKind, "review");
});

test("what commits a verse is the attempt, not the kind of session it happened in", () => {
  // A review session cannot reach an uncommitted verse, so this is unreachable
  // rather than special-cased — but the rule is about what the member
  // demonstrated, and pinning that here keeps it from quietly acquiring a
  // dependency on which menu they came from.
  const a = app(baseState());
  a.actions.startSession("type", [4]); // verse 4 is uncommitted, in a review sitting
  a.actions.submitCard(1);

  assert.equal(a.state.progress[4].status, "memorized");
});

/* ── test mode ────────────────────────────────────────────────────────────── */

/* Answer the question in front of us, correctly. */
function answerRight(a) {
  const q = a.state.exam.questions[a.state.examIndex];
  if (q.kind === "name-ref") return a.actions.answerExam(q.ref);
  if (q.kind === "pick-ref") return a.actions.answerExam(q.correctKey);
  if (q.kind === "finish") return a.actions.answerExam({ text: q.answer, ref: q.ref });
  if (q.kind === "scramble") return a.actions.answerExam(q.chunks.map((_, i) => i));
  if (q.kind === "blanks") return a.actions.answerExam(Object.fromEntries(q.blanks.map((idx) => [idx, q.words[idx]])));
  if (q.kind === "type") return a.actions.answerExam(q.text);
  for (const verse of q.verses) {
    a.actions.pickMatchVerse(verse.key);
    a.actions.pickMatchRef(verse.key);
  }
}

test("a test runs from setup to summary and writes what it measured", () => {
  const a = sitting();
  a.actions.startExam();
  assert.equal(a.state.view, "test");
  assert.equal(a.state.exam.ids.length, 5);

  const questions = a.state.exam.questions.length;
  for (let i = 0; i < questions; i++) {
    assert.equal(a.state.examIndex, i);
    answerRight(a);
    a.actions.nextQuestion();
  }

  assert.equal(a.state.view, "test-done");
  assert.equal(a.state.examResult.score, 1, "every question was answered right");
  assert.equal(a.state.examResult.rows.length, 5);
  // Every tested verse is now fully fresh and has a clean review to its name.
  for (const id of a.state.exam.ids) {
    assert.equal(a.state.progress[id].hits, 1);
    assert.equal(a.state.progress[id].updatedAt, NOW);
  }
  assert.equal(a.state.log[dayKey(new Date())], baseState().log[dayKey(new Date())] + 5);

  // …and the result reached storage, not just state.
  const stored = JSON.parse(saved.get("mv.progress"));
  for (const id of a.state.exam.ids) assert.ok(stored[id], `verse ${id} was not saved`);
});

test("a test sat blank sends its verses backwards, not forwards", () => {
  const a = sitting({ committedOnly: true, activities: ["finish"] });
  a.actions.startExam();
  const before = a.state.progress[1];
  while (a.state.view === "test") a.actions.nextQuestion();

  assert.equal(a.state.examResult.score, 0);
  const after = a.state.progress[1];
  assert.ok(after.stability < before.stability, "a blank paper shortens the interval");
  assert.equal(after.hits, before.hits, "and earns no clean review");
  assert.equal(after.status, "memorized", "but does not un-commit the verse");
});

test("questions can be walked back and forth, keeping their answers", () => {
  const a = sitting();
  a.actions.startExam();
  assert.equal(a.state.examIndex, 0);

  answerRight(a);
  const first = a.state.examAnswers[0];
  a.actions.nextQuestion();
  answerRight(a);
  a.actions.prevQuestion();

  assert.equal(a.state.examIndex, 0);
  assert.deepEqual(a.state.examAnswers[0], first, "the first answer is still there to be changed");
  assert.equal(a.state.examAnswers[1] !== undefined, true, "and so is the one walked back from");

  // The first question is as far back as it goes.
  a.actions.prevQuestion();
  assert.equal(a.state.examIndex, 0);
});

test("leaving a test asks first, and marks nothing when confirmed", () => {
  const a = sitting();
  a.actions.startExam();
  answerRight(a);
  a.actions.nextQuestion();

  a.actions.askLeaveExam();
  assert.equal(a.state.examLeaveAsk, true);
  assert.equal(a.state.view, "test", "asking does not leave");

  a.actions.cancelLeaveExam();
  assert.equal(a.state.examLeaveAsk, false);
  assert.equal(a.state.view, "test");

  a.actions.askLeaveExam();
  a.actions.leaveExam();
  assert.equal(a.state.view, "board");
  assert.equal(a.state.examLeaveAsk, false);
  assert.deepEqual(a.state.progress, baseState().progress);
  assert.equal(a.state.examResult, null);
});

test("matching pairs one reference at a time, and lets a pairing be undone", () => {
  const a = sitting({ activities: ["match"] });
  a.actions.startExam();
  // Five verses deal into a block of four and a block of one; take the four.
  const q = a.state.exam.questions.find((x) => x.verses.length > 1);
  const index = a.state.exam.questions.indexOf(q);
  const [first, second] = q.verses;

  a.state.examIndex = index;
  a.actions.pickMatchVerse(first.key);
  assert.equal(a.state.examPick, first.key);
  a.actions.pickMatchRef(second.key);
  assert.deepEqual(a.state.examAnswers[index], { [first.key]: second.key });
  assert.equal(a.state.examPick, null, "filing a reference clears the selection");

  // The same reference filed under another verse moves rather than duplicates.
  a.actions.pickMatchVerse(second.key);
  a.actions.pickMatchRef(second.key);
  assert.deepEqual(a.state.examAnswers[index], { [second.key]: second.key });

  // Clicking a paired verse takes the pairing back and re-selects it.
  a.actions.pickMatchVerse(second.key);
  assert.deepEqual(a.state.examAnswers[index], {});
  assert.equal(a.state.examPick, second.key);
});

test("the setup keeps at least one activity switched on", () => {
  const a = sitting();
  for (const key of ["name-ref", "pick-ref", "finish", "match", "scramble", "blanks", "type"])
    a.actions.toggleExamActivity(key);
  assert.deepEqual(a.state.examSetup.activities, ["type"], "the last one on cannot be turned off");
});

test("a setup that matches no verses cannot start a test", () => {
  const a = app(baseState({ view: "test-setup", progress: {}, examSetup: normalizeSetup({ committedOnly: true }) }));
  a.actions.startExam();
  assert.equal(a.state.view, "test-setup");
  assert.equal(a.state.exam, null);
});

/* ── hand-picking a sitting from the passage list ─────────────────────────── */

test("ticking a row adds it, ticking it again takes it back", () => {
  const a = app(baseState({ view: "list" }));

  a.actions.toggleSelect(4);
  a.actions.toggleSelect(1);
  assert.deepEqual(a.state.selection, [4, 1], "kept in the order they were ticked");

  a.actions.toggleSelect(4);
  assert.deepEqual(a.state.selection, [1]);
});

test("a row ticked on its own becomes the end a run is drawn from", () => {
  const a = app(baseState({ view: "list" }));

  a.actions.toggleSelect(2);
  assert.equal(a.state.selectAnchor, 2);

  a.actions.toggleSelect(2);
  assert.equal(a.state.selectAnchor, 2, "including a row just clicked off");

  // Ticking every shown row, or clearing, leaves no one row to extend from.
  a.actions.setSelection([1, 2, 3]);
  assert.equal(a.state.selectAnchor, null);
});

test("a run adds the rows it covers, or takes them all back, and holds the anchor", () => {
  const a = app(baseState({ view: "list", selection: [4], selectAnchor: 4 }));

  a.actions.selectRange([1, 2, 3, 4], true);
  assert.deepEqual(a.state.selection, [4, 1, 2, 3], "a row already ticked is not ticked twice");
  assert.equal(a.state.selectAnchor, 4, "so the same run can be re-drawn from the same end");

  a.actions.selectRange([2, 3], false);
  assert.deepEqual(a.state.selection, [4, 1], "and the rest keep their ticks");
});

test("a hand-picked session survives, so the other half can be taken next", () => {
  const a = app(baseState({ view: "list", selection: [1, 4] }));
  // What the list's Review button hands the shell: the committed half only.
  a.actions.startSession(undefined, [1], "review");

  assert.equal(a.state.view, "review");
  assert.deepEqual(a.state.queue, [1]);
  assert.deepEqual(a.state.selection, [1, 4], "the ticks are the member's to clear");
});
