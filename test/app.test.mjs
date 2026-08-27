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
import { withFeatures } from "./helpers/features.mjs";
import { baseState, NOW, PROFILE, PROPS } from "./helpers/scenarios.mjs";
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

/* A few actions reach for the DOM on purpose: App.focusBlank, following the
 * transcript down as a recitation lands, and returning focus to the recall box
 * after the voice or first-letter toggle steals it. Nothing is mounted here, so
 * there are no elements to find — a document that finds none is exactly right. */
Object.defineProperty(globalThis, "document", {
  configurable: true,
  value: { getElementById: () => null },
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

const sitting = (over) => app(baseState({ view: "test-setup", examSetup: normalizeSetup({ size: 10, ...over }) }));

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

test("the latch keeps the passage up for one peek, not one per look", () => {
  const a = session("blanks");

  a.actions.togglePeekStick();
  assert.equal(a.state.showHelp, true, "switching the latch on is the reveal");
  assert.equal(a.state.peeks, 1, "and is charged as a peek, exactly once");

  // What the latch is for: the presses that used to be needed to keep looking.
  a.actions.setPeek(true);
  a.actions.setPeek(false);
  assert.equal(a.state.showHelp, true, "letting go does not put away what the latch is holding");
  assert.equal(a.state.peeks, 1, "and a peek at a passage already on screen costs nothing further");

  a.actions.togglePeekStick();
  assert.equal(a.state.showHelp, false, "switching it off puts the passage away");
  assert.equal(a.state.peeks, 1, "having seen it is not refunded");
});

test("the latch lasts the sitting, and every card it opens is a card peeked at", () => {
  const a = session("blanks");
  a.actions.togglePeekStick();
  a.actions.submitCard(1);
  a.actions.nextCard();

  assert.equal(a.state.peekStick, true, "how the member wants to work outlives the verse");
  assert.equal(a.state.showHelp, true, "so the next verse opens with its passage on screen");
  assert.equal(a.state.peeks, 1, "which is a peek, and is charged as one — not a free read of the set");
});

test("switching the latch off mid-sitting leaves the rest of the cards clean", () => {
  const a = session("blanks");
  a.actions.togglePeekStick();
  a.actions.submitCard(1);
  a.actions.nextCard();
  a.actions.togglePeekStick();

  assert.equal(a.state.showHelp, false);
  assert.equal(a.state.peeks, 1, "this card had already seen the passage, which is not refunded");

  a.actions.submitCard(1);
  a.actions.nextCard();
  assert.equal(a.state.peeks, 0, "but the one after it starts clean");
  assert.equal(a.state.showHelp, false);
});

test("a new sitting is a fresh answer to how the member wants to work", () => {
  const a = session("blanks");
  a.actions.togglePeekStick();
  a.actions.startSession("blanks", [1, 2]);

  assert.equal(a.state.peekStick, false);
  assert.equal(a.state.showHelp, false);
  assert.equal(a.state.peeks, 0);
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

test("each of the flashcard's buttons turns it to its own side of the answer", () => {
  const a = session("flip");
  const showing = () => [a.state.revealed, a.state.flipLetters];

  a.actions.revealFlipSide(true);
  assert.deepEqual(showing(), [true, true], "the scaffold is on the back, so asking for it turns the card");

  a.actions.revealFlipSide(false);
  assert.deepEqual(showing(), [true, false], "and the passage takes its place on that same face");

  a.actions.revealFlipSide(false);
  assert.equal(a.state.revealed, false, "pressing it again puts the card back to the reference");

  // Hiding the scaffold is never the press that hands over the passage.
  a.actions.revealFlipSide(true);
  a.actions.revealFlipSide(true);
  assert.equal(a.state.revealed, false);
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

  // Starting over is this ordering attempted again from scratch, so the board
  // and the tally the mark reads both go back to nothing.
  a.actions.resetScramble();
  assert.deepEqual(a.state.scrambleOrder, []);
  assert.equal(a.state.scrambleMisses, 0);
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

test("another exercise on a handed-in card is a live exercise", () => {
  const a = session("blanks");
  a.actions.setAnswer(0, "hear");
  a.actions.submitCard(1);
  const marked = a.state.progress[1];

  // A review card is a committed verse, so its mark stands — but the exercise
  // switched to has no paper of its own and has to take answers.
  a.actions.setMode("type");
  a.actions.setTyped("late words");
  assert.equal(a.state.typed, "late words", "the exercise switched to is not dead");
  a.actions.submitCard(1);
  assert.deepEqual(a.state.progress[1], marked, "and cannot mark the verse a second time");

  // Switching back shows the paper that was marked, rather than a cleared one.
  a.actions.setMode("blanks");
  assert.deepEqual(a.state.answers, { 0: "hear" });
  a.actions.setAnswer(0, "changed");
  assert.deepEqual(a.state.answers, { 0: "hear" }, "and it is still not editable");
});

test("switching exercise reopens a learn card that fell short", () => {
  const a = learnSession("type");
  a.actions.submitCard(COMMIT_SCORE - 0.01);
  assert.equal(a.state.progress[4].status, "learning", "the first attempt fell short");

  // What the sitting is for is still open, so the exercise switched to can be
  // handed in — the same relaxation "Try again" makes.
  a.actions.setMode("scramble");
  assert.equal(a.state.results[4], undefined, "the mark is cleared so Submit is live again");
  a.actions.placeChunk(0);
  assert.deepEqual(a.state.scrambleOrder, [0]);
  a.actions.submitCard(1);
  assert.ok(a.state.results[4], "and the second attempt is marked");
});

test("a learn card that committed the verse keeps its mark when the exercise changes", () => {
  const a = learnSession("type");
  a.actions.submitCard(1);
  assert.equal(a.state.results[4].committed, true);
  const marked = a.state.progress[4];

  a.actions.setMode("blanks");
  assert.equal(a.state.results[4].committed, true, "the commitment it earned is not thrown away");
  a.actions.setAnswer(0, "practice");
  assert.deepEqual(a.state.answers, { 0: "practice" }, "and the practice exercise still works");
  a.actions.submitCard(1);
  assert.deepEqual(a.state.progress[4], marked, "without marking the verse again");
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

test("a member's own commit threshold moves the bar the sitting is held to", () => {
  const lowered = learnSession("type", { profile: { ...PROFILE, commitThreshold: 90 } });
  lowered.actions.submitCard(0.9);
  assert.equal(lowered.state.progress[4].status, "memorized", "90% clears the member's own, lower bar");

  const stillDefault = learnSession("type");
  stillDefault.actions.submitCard(0.9);
  assert.equal(stillDefault.state.progress[4].status, "learning", "a profile with no override keeps COMMIT_SCORE");
});

test("a card that did not commit the verse can be tried again", () => {
  const a = learnSession("type");
  a.actions.submitCard(COMMIT_SCORE - 0.01);
  assert.equal(a.state.progress[4].status, "learning", "the first attempt fell short");
  assert.ok(a.state.results[4], "and was marked");

  a.actions.retryCard();
  assert.equal(a.state.results[4], undefined, "the mark is cleared so Submit is live again");
  assert.equal(a.state.typed, "", "and the card's own answer is cleared with it");

  a.actions.submitCard(1);
  assert.equal(a.state.progress[4].status, "memorized", "a clean second attempt still commits it");
  assert.equal(a.state.results[4].committed, true);
});

test("no other activity commits a verse, however well it goes", () => {
  for (const mode of ["flip", "blanks", "scramble"]) {
    const a = learnSession(mode);
    a.actions.submitCard(1);
    assert.equal(a.state.progress[4].status, "learning", `${mode} is practice, not a write-out`);
  }
});

test("a passage that was peeked at was not written from memory", () => {
  const peeked = learnSession("type");
  peeked.actions.setPeek(true);
  peeked.actions.setPeek(false);
  peeked.actions.submitCard(1);
  assert.equal(peeked.state.progress[4].status, "learning", "a passage read is not a passage recalled");
});

test("the first-letter scaffold still commits a verse in Learn — that is what Learn is for", () => {
  const scaffolded = learnSession("type", { typeFirstLetter: true });
  scaffolded.actions.submitCard(1);
  assert.equal(scaffolded.state.progress[4].status, "memorized");
  assert.equal(scaffolded.state.results[4].committed, true);
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
  assert.equal(a.state.exam.ids.length, 10);

  const questions = a.state.exam.questions.length;
  for (let i = 0; i < questions; i++) {
    assert.equal(a.state.examIndex, i);
    answerRight(a);
    a.actions.nextQuestion();
  }

  assert.equal(a.state.view, "test-done");
  assert.equal(a.state.examResult.score, 1, "every question was answered right");
  assert.equal(a.state.examResult.rows.length, 10);
  // Every tested verse is now fully fresh and has a clean review to its name.
  for (const id of a.state.exam.ids) {
    assert.equal(a.state.progress[id].hits, 1);
    assert.equal(a.state.progress[id].updatedAt, NOW);
  }
  assert.equal(a.state.log[dayKey(new Date())], baseState().log[dayKey(new Date())] + 10);

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
  // Ten verses deal into blocks of four; take the first.
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

/* ── the first-letter drill is forward-only ───────────────────────────────── */

/* The rule itself is pure and asserted in test/grading.test.mjs (lockedInput).
 * What is asserted here is that the box is actually wired to it, and only in
 * the one mode where the reveal would otherwise be answering its own question. */

test("a first-letter attempt cannot be taken back", () => {
  const a = learnSession("type", { typeFirstLetter: true });
  a.actions.setTyped("t");
  a.actions.setTyped("ti");
  assert.equal(a.state.typed, "ti");

  a.actions.setTyped("t");
  assert.equal(a.state.typed, "ti", "backspace changes nothing");
  a.actions.setTyped("");
  assert.equal(a.state.typed, "ti", "and neither does clearing the box");
  a.actions.setTyped("xy");
  assert.equal(a.state.typed, "ti", "nor retyping over a selection");

  a.actions.setTyped("tit");
  assert.equal(a.state.typed, "tit", "but typing the next letter goes in");
});

test("writing the passage out in full is still an ordinary box", () => {
  // The lock is the price of a live reveal. Free recall reveals nothing until
  // it is handed in, so there is nothing there to cheat and backspace stays.
  const a = learnSession("type", { typeFirstLetter: false });
  a.actions.setTyped("Trust in the Lard");
  a.actions.setTyped("Trust in the");
  assert.equal(a.state.typed, "Trust in the", "a typo can be fixed");
});

test("starting over is still offered, it is just not silent", () => {
  const a = learnSession("type", { typeFirstLetter: true });
  a.actions.setTyped("tx");
  a.actions.toggleTypeFirstLetter();
  a.actions.toggleTypeFirstLetter();
  assert.equal(a.state.typed, "", "switching the scaffold off and on is a fresh attempt");
  assert.equal(a.state.typeFirstLetter, true);
});

/* ── reciting aloud ───────────────────────────────────────────────────────────
 *
 * Recognition needs a browser, so what is driven here is the seam below it: the
 * phrases the engine hands over (App.hearRecitation) and the one switch. Where
 * the words go is pure and tested in test/voice.test.mjs. */

/* A learn session on the recall card, as if a microphone were open on it. */
function reciting(over) {
  const a = learnSession("type", over);
  a.setVoice({ supported: true, status: "listening" });
  return a;
}

/* Phrases arriving from the engine. A bare string is a settled one. */
const say = (a, ...phrases) =>
  phrases.forEach((p) => (Array.isArray(p) ? a.hearRecitation(p[0], p[1]) : a.hearRecitation(p, true)));

test("a recited phrase lands in the same box typing fills, capitalised", () => {
  const a = reciting();
  say(a, "hear O Israel", "the LORD our God");
  assert.equal(a.state.typed, "Hear O Israel the LORD our God");
});

test("words appear in the box as they are spoken, without piling up", () => {
  const a = reciting();
  say(a, ["hear", false], ["hear O", false], ["hear O Israel", false]);
  assert.equal(a.state.typed, "Hear O Israel", "each revision replaces the last");
  say(a, ["hear O Israel", true], ["the LORD", false]);
  assert.equal(a.state.typed, "Hear O Israel the LORD");
});

test("reciting a passage cleanly commits the verse, exactly as typing it would", () => {
  const a = learnSession("type");
  const verse = a.state.passages.find((p) => p.id === 4);
  a.setVoice({ supported: true, status: "listening" });
  // Said in three breaths, as the engine would deliver it.
  const words = verse.text.split(" ");
  const third = Math.ceil(words.length / 3);
  say(a, words.slice(0, third).join(" "), words.slice(third, third * 2).join(" "), words.slice(third * 2).join(" "));

  a.actions.submitCard(1);
  assert.equal(a.state.progress[4].status, "memorized");
  assert.equal(a.state.results[4].committed, true);
  assert.ok(COMMIT_SCORE <= 1);
});

test("correcting by hand settles the box, so the next phrase appends after it", () => {
  const a = reciting();
  say(a, "hear O Israel", ["the LORD our dog", false]);
  a.actions.setTyped("Hear O Israel the LORD our God");
  assert.equal(a.state.voice.tail, a.state.typed.length, "the member has taken it over");

  say(a, ["the LORD is one", false]);
  assert.equal(a.state.typed, "Hear O Israel the LORD our God the LORD is one", "their edit is not overwritten");
});

test("the verse is handed over, so what is recited comes out as the verse reads", () => {
  // The fitting itself is pure and tested in test/voice.test.mjs; what is
  // asserted here is that the card actually knows which passage it is on.
  const a = reciting();
  const verse = a.state.passages.find((p) => p.id === a.state.queue[a.state.qi]);
  const spoken = verse.text
    .split(" ")
    .map((w) => w.replace(/[^A-Za-z0-9']/g, "").toLowerCase())
    .join(" ");

  say(a, spoken);
  // Every word was right, so the box holds the verse itself — bar the closing
  // punctuation, which has no following word to earn it.
  assert.equal(a.state.typed, verse.text.replace(/[^\p{L}\p{N}]+$/u, ""));
});

test("the cursor is where the next phrase goes in", () => {
  const a = reciting();
  say(a, "hear O Israel");
  const at = "Hear,".length;

  // The member puts the caret back into the middle of what they have said.
  a.actions.setCaret(at);
  assert.equal(a.state.voice.tail, at);
  assert.equal(a.state.voice.rest, a.state.typed.length - at);

  // And the next phrase lands there, with what followed put back after it.
  const before = a.state.typed;
  say(a, "the LORD");
  assert.ok(a.state.typed.startsWith(before.slice(0, at)), "what was before the caret is untouched");
  assert.ok(a.state.typed.endsWith(before.slice(at).trim()), "and what was after it is still there");
});

test("a hand edit settles the box at the caret, not past the end of it", () => {
  const a = reciting();
  say(a, "hear O Israel");
  a.actions.setTyped("Hear, O Israel: one.", "Hear, O Israel:".length);
  assert.equal(a.state.voice.tail, "Hear, O Israel:".length);
  assert.equal(a.state.voice.rest, " one.".length);

  // No caret given is the old behaviour: the whole box is the member's.
  a.actions.setTyped("Hear, O Israel: one.");
  assert.equal(a.state.voice.tail, "Hear, O Israel: one.".length);
  assert.equal(a.state.voice.rest, 0);
});

test("the caret is only tracked while the microphone is open", () => {
  // Nothing else in the app reads it, and a member who is only typing should
  // not pay for a setState per keystroke.
  const a = learnSession("type");
  a.setVoice({ status: "off" });
  a.actions.setCaret(3);
  assert.equal(a.state.voice.tail, 0);
  assert.equal(a.state.voice.rest, 0);
});

test("the switch turns the microphone on and off, and off keeps what was said", () => {
  const a = reciting({}, {});
  a.setVoice({ status: "off" });
  a.actions.toggleVoice();
  // Nothing in Node offers recognition, so this is the path a member on Firefox
  // takes: it reports rather than failing quietly.
  assert.equal(a.state.voice.status, "off");
  assert.equal(a.state.voice.error, "failed");

  const b = reciting();
  say(b, ["hear O Israel", false]);
  b.actions.toggleVoice();
  assert.equal(b.state.voice.status, "off");
  assert.equal(b.state.typed, "Hear O Israel", "the last thing they said is theirs to keep");
  assert.equal(b.state.voice.tail, b.state.typed.length);
});

test("nothing is taken down once the card has been handed in", () => {
  const a = reciting();
  say(a, "hear O Israel");
  a.actions.submitCard(0.5);
  say(a, "the LORD our God");
  assert.equal(a.state.typed, "Hear O Israel", "the mark is final, so the transcript is too");
  assert.equal(a.state.voice.status, "off", "and the microphone is let go");
});

test("a late phrase from another activity, or from the scaffold, is dropped", () => {
  const other = reciting();
  other.actions.setMode("blanks");
  say(other, "hear O Israel");
  assert.equal(other.state.typed, "", "there is no recall box to recite into");

  const scaffolded = reciting();
  scaffolded.actions.toggleTypeFirstLetter();
  say(scaffolded, "hear O Israel");
  assert.equal(scaffolded.state.typed, "", "and no reciting a first-letter drill");
  assert.equal(scaffolded.state.voice.status, "off");
});

test("the transcript and the microphone belong to the card, not the session", () => {
  const a = reciting();
  say(a, "hear O Israel");
  // An unsubmitted card is confirmed before it is walked off, recited or typed
  // — the attempt is thrown away either way.
  a.actions.nextCard();
  assert.equal(a.state.reviewMoveAsk, "next");
  assert.equal(a.state.typed, "Hear O Israel", "and it is still there until they say so");

  a.actions.confirmMoveCard();
  assert.equal(a.state.typed, "");
  assert.equal(a.state.voice.status, "off");
  assert.equal(a.state.voice.tail, 0);
  assert.equal(a.state.voice.supported, true, "but what the browser can do is not per-card");
});

/* ── sign-up welcome prompt ───────────────────────────────────────────────── */

test("finishing the profile form for the first time is met with the welcome prompt", () => {
  // Both halves of this are behind their flags now (src/config.js) — there is
  // no sign-up form to finish, so there is no prompt on the way out of it. The
  // rule is still here and still tested; it is just not on offer.
  withFeatures({ profileSetup: true, welcome: true }, () => {
    const a = app(baseState({ profile: {}, profileDraft: { ...PROFILE } }));
    a.actions.submitProfile();
    assert.equal(a.state.welcomePrompt, true);
  });
});

/* ── being on the leaderboard, or not ─────────────────────────────────────── */

test("a member who signs up without touching the switch is saved as hidden", () => {
  // The whole point of the default: nobody is put on a board their ministry can
  // read because they filled in a form, only because they said so.
  const a = app(baseState({ profile: {}, profileDraft: { ...PROFILE } }));
  a.actions.submitProfile();
  assert.equal(a.state.profile.shareRanking, false);
  assert.equal(a.state.profile.ministryGroup, "Kairos", "and what the draft carried is still written");
});

test("turning it on is what shares the ranking, and it survives the save", () => {
  const a = app(baseState({ editingProfile: true, profileDraft: { ...PROFILE } }));
  a.actions.setProfileField("shareRanking", true);
  a.actions.submitProfile();
  assert.equal(a.state.profile.shareRanking, true);

  const b = app(baseState({ editingProfile: true, profileDraft: { ...PROFILE, shareRanking: true } }));
  b.actions.setProfileField("shareRanking", false);
  b.actions.submitProfile();
  assert.equal(b.state.profile.shareRanking, false, "and turning it back off hides them again");
});

test("nothing but an explicit yes counts as sharing", () => {
  // A profile from before the switch existed, and a truthy-looking value that
  // is not `true` — both are members who have never asked to be shown.
  for (const value of [undefined, "yes", 1, null]) {
    const a = app(baseState({ editingProfile: true, profileDraft: { ...PROFILE, shareRanking: value } }));
    a.actions.submitProfile();
    assert.equal(a.state.profile.shareRanking, false, `${String(value)} is not consent`);
  }
});

test("reopening an already-complete profile to edit it never shows the prompt again", () => {
  const a = app(baseState({ editingProfile: true, profileDraft: { ...PROFILE, ministryGroup: "ECM" } }));
  a.actions.submitProfile();
  assert.equal(a.state.welcomePrompt, false);
});

test("the guide button dismisses the prompt and opens the guide", () => {
  const a = app(baseState({ welcomePrompt: true }));
  a.actions.dismissWelcome("guide");
  assert.equal(a.state.welcomePrompt, false);
  assert.equal(a.state.view, "guide");
});

test("the learn button dismisses the prompt and heads straight into learn setup", () => {
  const a = app(baseState({ welcomePrompt: true }));
  a.actions.dismissWelcome("learn-setup");
  assert.equal(a.state.welcomePrompt, false);
  assert.equal(a.state.view, "learn-setup");
});

/* ── resetting the record ─────────────────────────────────────────────────── */

test("resetting clears the record — in state and in storage — and only the record", () => {
  const a = app(baseState({ editingProfile: true, profileDraft: { ...PROFILE }, selection: [1, 2] }));
  saved.set("mv.progress", JSON.stringify(a.state.progress));
  saved.set("mv.log", JSON.stringify(a.state.log));

  a.actions.askResetProgress();
  assert.equal(a.state.resetAsk, true, "the button asks rather than wipes");
  assert.notDeepEqual(a.state.progress, {}, "and nothing has gone yet");

  a.actions.resetProgress();
  assert.deepEqual(a.state.progress, {});
  assert.deepEqual(a.state.log, {});
  assert.deepEqual(JSON.parse(saved.get("mv.progress")), {}, "the wipe reached storage");
  assert.deepEqual(JSON.parse(saved.get("mv.log")), {});
  assert.deepEqual(a.state.selection, [], "ticks picked against the old record go with it");
  assert.equal(a.state.resetAsk, false);

  // The profile and the settings on the same screen are not the record.
  assert.deepEqual(a.state.profile, PROFILE);
  assert.equal(a.state.editingProfile, true);
});

test("backing out of the warning leaves everything where it was", () => {
  const a = app(baseState({ editingProfile: true }));
  const before = a.state.progress;

  a.actions.askResetProgress();
  a.actions.cancelResetProgress();

  assert.equal(a.state.resetAsk, false);
  assert.deepEqual(a.state.progress, before);
});

/* ── hydrating the cloud record ─────────────────────────────────────────────
 *
 * The pull can land before componentDidMount's setState has flushed, so
 * `this.state` at that moment is still initialState()'s empty maps. Merging
 * against those would drop whatever this device already had, and the queued
 * setState would then overwrite the merge with the local copy alone. So the
 * merge reads storage, which is the source of truth either way. */

test("a cloud record merges with what is on the device, not with stale state", () => {
  saved.clear();
  // What this device has, written down but not yet reflected in state.
  saved.set("mv.progress", JSON.stringify({ 4: { hits: 2, status: "learning", last: NOW - 1000, stability: 2 } }));
  saved.set("mv.log", JSON.stringify({ "2026-08-14": 3 }));
  saved.set("mv.profile", JSON.stringify({ ...PROFILE, name: "Ada on this laptop" }));

  const a = app(baseState({ progress: {}, log: {}, profile: {} })); // state as it is mid-boot
  a.hydrateRemote({
    progress: { 1: { hits: 5, status: "memorized", last: NOW - 2000, stability: 9 } },
    log: { "2026-08-13": 7 },
    profile: { ...PROFILE, name: "Ada from the cloud", updatedAt: NOW },
  });

  // Both sides survive: the device's in-progress verse and the cloud's committed one.
  assert.deepEqual(Object.keys(a.state.progress).sort(), ["1", "4"]);
  assert.equal(a.state.log["2026-08-14"], 3);
  assert.equal(a.state.log["2026-08-13"], 7);
  // The profile is still last-write-wins, and the cloud's is the newer edit.
  assert.equal(a.state.profile.name, "Ada from the cloud");
  // And the merge is written back, so the push carries it.
  assert.deepEqual(Object.keys(JSON.parse(saved.get("mv.progress"))).sort(), ["1", "4"]);
});

test("an older cloud profile does not displace a newer local one", () => {
  saved.clear();
  saved.set("mv.progress", JSON.stringify({}));
  saved.set("mv.log", JSON.stringify({}));
  saved.set("mv.profile", JSON.stringify({ ...PROFILE, name: "Newer", updatedAt: NOW }));

  const a = app(baseState({ progress: {}, log: {}, profile: {} }));
  a.hydrateRemote({ progress: {}, log: {}, profile: { ...PROFILE, name: "Older", updatedAt: NOW - 86400000 } });

  assert.equal(a.state.profile.name, "Newer");
});
