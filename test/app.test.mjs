/* The shell's action table, for the one flow whose wiring the render tests
 * cannot reach: a test from setup to summary.
 *
 * Every other screen is a function of state that test/views.test.mjs renders
 * directly, but a test session is a sequence — answer, advance, finish, and the
 * progress map written at the end. Nothing is mounted here either: the instance
 * is given a synchronous stand-in for React's update queue, so an action's
 * setState lands on `state` immediately and the next action can read it. */

import test from "node:test";
import assert from "node:assert/strict";

import { freezeClock } from "./helpers/dom-env.mjs";
import { baseState, NOW, PROPS } from "./helpers/scenarios.mjs";
import { normalizeSetup } from "../src/exam.js";
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
  for (const key of ["name-ref", "pick-ref", "finish", "match", "scramble", "blanks", "type"]) a.actions.toggleExamActivity(key);
  assert.deepEqual(a.state.examSetup.activities, ["type"], "the last one on cannot be turned off");
});

test("a setup that matches no verses cannot start a test", () => {
  const a = app(baseState({ view: "test-setup", progress: {}, examSetup: normalizeSetup({ committedOnly: true }) }));
  a.actions.startExam();
  assert.equal(a.state.view, "test-setup");
  assert.equal(a.state.exam, null);
});
