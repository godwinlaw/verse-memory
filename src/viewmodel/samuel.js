/* Samuel mode: state + actions → what the study screen shows.
 *
 * Two halves, and they are the two things a member does the fortnight before an
 * exam: answer questions until the weak spots surface, and read the chapters
 * those weak spots point at. Nothing here reaches the passage set or the SRS —
 * see the note at the top of src/samuel.js for why the two models stay apart. */

import { copy } from "../copy.js";
import { SAMUEL_QUESTIONS } from "../../data/samuel.js";
import { BOOKS, chaptersOf, choicesFor, daysUntil, isRight, readiness, weakChapters } from "../samuel.js";
import { segButton } from "../ui/tokens.js";

export function samuelVals({ state, actions, now = Date.now() }) {
  // Defensive default: a saved state from before this mode existed has no slice.
  const s = state.samuel || { record: {}, round: [], index: 0, answer: null, scope: null, view: "quiz", results: [] };
  const record = s.record || {};
  const round = s.round || [];
  const question = round[s.index] || null;
  const ready = readiness(record);
  const days = daysUntil(undefined, now);

  const answered = s.answer !== null && s.answer !== undefined;
  const correct = answered && question ? isRight(question, s.answer) : false;

  return {
    isSamuel: state.view === "samuel",
    samuelTitle: copy.samuel.title,
    samuelLead: copy.samuel.lead,
    samuelCountdown: copy.samuel.countdown(days),
    samuelUrgent: days >= 0 && days <= 7,

    /* Readiness is coverage, not a score — see readiness() for why. */
    samuelReadyLabel: copy.samuel.readiness(ready.held, ready.total),
    samuelReadyPct: ready.pct,
    samuelSeenLabel: copy.samuel.seen(ready.seen, ready.total),

    samuelTab: s.view,
    samuelTabs: [
      {
        key: "quiz",
        label: copy.samuel.tabQuiz,
        style: segButton(s.view === "quiz"),
        onClick: () => actions.setSamuelTab("quiz"),
      },
      {
        key: "read",
        label: copy.samuel.tabRead,
        style: segButton(s.view === "read"),
        onClick: () => actions.setSamuelTab("read"),
      },
    ],

    samuelScopeLabel: copy.samuel.scopeLabel,
    samuelScopes: [
      {
        key: "",
        label: copy.samuel.bothBooks,
        style: segButton(!s.scope),
        onClick: () => actions.setSamuelScope(null),
      },
      ...BOOKS.map((b) => ({
        key: b,
        label: b,
        style: segButton(s.scope === b),
        onClick: () => actions.setSamuelScope(b),
      })),
    ],

    samuelStartLabel: round.length ? copy.samuel.again : copy.samuel.start,
    onSamuelStart: actions.startSamuelRound,

    samuelQuestion: question
      ? {
          prompt: question.prompt,
          ref: question.ref,
          kind: question.kind,
          position: copy.samuel.position(s.index + 1, round.length),
          choices: choicesFor(question).map((choice) => ({
            key: choice,
            label: choice,
            /* Once answered, the right one is always marked and the member's
             * pick is marked too — being shown the answer is the whole point of
             * getting it wrong. */
            state: !answered ? "open" : choice === question.answer ? "right" : choice === s.answer ? "wrong" : "idle",
            onClick: answered ? undefined : () => actions.answerSamuel(choice),
          })),
        }
      : null,

    samuelAnswered: answered,
    samuelCorrect: correct,
    samuelVerdict: answered ? (correct ? copy.samuel.right : copy.samuel.wrong(question.answer)) : "",
    samuelNextLabel: s.index + 1 >= round.length ? copy.samuel.finish : copy.samuel.next,
    onSamuelNext: actions.nextSamuel,

    samuelRoundDone: round.length > 0 && s.index >= round.length,
    samuelRoundScore: copy.samuel.roundScore((s.results || []).filter(Boolean).length, round.length),

    /* What to read tonight. Empty until something has actually been got wrong,
     * because a chapter nobody has been asked about is unmet, not weak. */
    samuelWeakLabel: copy.samuel.weakest,
    samuelWeak: weakChapters(record).map((c) => ({
      key: c.key,
      label: c.key,
      note: copy.samuel.missedCount(c.wrong),
      onClick: () => actions.readSamuelChapter(c.book, c.chapter),
    })),

    samuelBook: s.book || BOOKS[0],
    samuelBooks: BOOKS.map((b) => ({
      key: b,
      label: b,
      style: segButton((s.book || BOOKS[0]) === b),
      onClick: () => actions.setSamuelBook(b),
    })),
    samuelChapters: chaptersOf(s.book || BOOKS[0]).map((c) => ({
      key: c.book + " " + c.chapter,
      chapter: c.chapter,
      title: c.title,
      summary: c.summary,
      people: (c.people || []).join(", "),
      places: (c.places || []).join(", "),
      open: s.openChapter === c.book + " " + c.chapter,
      onClick: () => actions.openSamuelChapter(c.book + " " + c.chapter),
    })),

    samuelBankSize: SAMUEL_QUESTIONS.length,
    samuelEmpty: round.length === 0 ? copy.samuel.idle : "",
  };
}
