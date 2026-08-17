/* View-model for Test mode: the setup form, the running paper, the summary.
 *
 * The exam itself — which questions, and what they are worth — is built and
 * marked in exam.js. This turns the current question into the shapes and style
 * strings the three screens render, and the marked paper into rows.
 *
 * All three screens are handled here because they share the setup and the
 * running session; the keys are namespaced (setup*, q*, exam*) so they stay
 * disjoint from the review session's. */

import { copy } from "../copy.js";
import { freshColor } from "../srs.js";
import { committedCount } from "../progress.js";
import {
  ACTIVITIES,
  activityByKey,
  eligiblePassages,
  examPassages,
  FRESHNESS_STEP,
  NONE_OF_THE_ABOVE,
  plannedQuestions,
  SIZE_OPTIONS,
} from "../exam.js";
import { COLOR_ERROR, muted, segButton } from "../ui/tokens.js";

const percent = (score) => Math.round(score * 100) + "%";

/* A card in the activity picker: the same blueprint box whether or not it is
 * chosen, with the accent carrying the state. */
const activityCard = (active) =>
  "cursor:pointer;text-align:left;padding:16px 18px;display:flex;flex-direction:column;gap:6px;" +
  "font-family:var(--font-body);background:" +
  (active ? "var(--color-accent-100)" : "transparent") +
  ";color:var(--color-text);border:1px solid " +
  (active ? "var(--color-accent)" : "var(--color-divider)");

/* One colour per pair in a matching grid: a verse and the reference filed under
 * it are tinted the same, so a finished grid can be read down both columns at a
 * glance. Four hues spaced around the wheel, held at the low saturation the
 * rest of the palette works in. Keyed by the verse's position, so a pair keeps
 * its colour however the grid is filled in. */
const PAIR_HUES = [210, 150, 32, 285];
const pairHue = (i) => PAIR_HUES[i % PAIR_HUES.length];
const pairTint = (hue) => `hsl(${hue},42%,92%)`;
const pairInk = (hue) => `hsl(${hue},38%,38%)`;

/* A verse or reference tile in a matching grid: paired (its pair's colour),
 * picked (waiting for a reference), or open. */
const matchTile = ({ hue = null, picked = false } = {}) => {
  const base =
    "cursor:pointer;text-align:left;padding:12px 14px;font-family:var(--font-body);font-size:14px;line-height:1.5;";
  if (hue != null) return base + `background:${pairTint(hue)};color:var(--color-text);border:1px solid ${pairInk(hue)}`;
  if (picked) {
    return base + "background:var(--color-accent-100);color:var(--color-text);border:1px solid var(--color-accent)";
  }
  return base + "background:transparent;color:var(--color-text);border:1px solid var(--color-divider)";
};

/* One multiple-choice option. */
const choiceStyle = (active) =>
  "cursor:pointer;text-align:left;padding:11px 14px;font-family:var(--font-body);font-size:15px;" +
  "display:flex;align-items:center;gap:10px;background:" +
  (active ? "var(--color-accent-100)" : "transparent") +
  ";color:var(--color-text);border:1px solid " +
  (active ? "var(--color-accent)" : "var(--color-divider)");

/* ── the setup form ───────────────────────────────────────────────────────── */

function setupVals({ state, actions, now }) {
  const setup = state.examSetup;
  const pool = eligiblePassages(state.passages, state.progress, setup, now);
  const chosen = examPassages(state.passages, state.progress, setup, now);
  const questions = plannedQuestions(chosen.length, setup.activities);

  return {
    setupSizes: SIZE_OPTIONS.map((n) => ({
      key: String(n),
      label: n === 0 ? copy.common.all : String(n),
      onClick: () => actions.setExamSetup({ size: n }),
      style: segButton(setup.size === n),
    })),

    setupCommittedOn: setup.committedOnly,
    setupCommittedLabel: setup.committedOnly ? copy.common.on : copy.common.off,
    setupCommittedStyle: segButton(setup.committedOnly),
    toggleSetupCommitted: () => actions.setExamSetup({ committedOnly: !setup.committedOnly }),

    setupFreshness: setup.maxFreshness,
    setupFreshnessStep: FRESHNESS_STEP,
    setupFreshnessLabel: setup.maxFreshness + "%",
    setupFreshnessDesc:
      setup.maxFreshness >= 100 ? copy.exam.setupFreshnessDescAny : copy.exam.setupFreshnessDesc(setup.maxFreshness),
    onSetupFreshness: (e) => actions.setExamSetup({ maxFreshness: Number(e.target.value) }),

    setupActivities: ACTIVITIES.map((a) => {
      const active = setup.activities.includes(a.key);
      return {
        key: a.key,
        name: a.name,
        desc: a.desc,
        state: active ? copy.common.on : copy.common.off,
        stateStyle: `font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:${
          active ? "var(--color-accent-700)" : muted(45)
        }`,
        onClick: () => actions.toggleExamActivity(a.key),
        style: activityCard(active),
      };
    }),

    setupPoolNote: chosen.length
      ? copy.exam.setupPoolNote(chosen.length, pool.length, questions)
      : setup.committedOnly && committedCount(state.progress) === 0
        ? copy.exam.setupPoolEmptyUncommitted
        : copy.exam.setupPoolEmpty,
    setupCanStart: chosen.length > 0,
    startExam: actions.startExam,
    cancelExam: () => actions.goto("board"),
  };
}

/* ── the running paper ────────────────────────────────────────────────────── */

/* Whether a question has anything in it at all. Each activity collects a
 * different shape, and none of them is graded until the paper is handed in, so
 * this is the only feedback the session can honestly give. */
function isBlank(q, answer) {
  if (q.kind === "match") return !Object.keys(answer || {}).length;
  if (q.kind === "finish") return !(answer && (answer.text || answer.ref));
  if (q.kind === "scramble") return !(answer && answer.length > 0);
  if (q.kind === "blanks") return !Object.keys(answer || {}).some((k) => (answer[k] || "").trim());
  return answer == null || answer === "";
}

function questionVals({ state, actions }) {
  const exam = state.exam;
  const questions = exam ? exam.questions : [];
  const q = questions[state.examIndex];
  if (!q)
    return {
      qIsName: false,
      qIsPick: false,
      qIsFinish: false,
      qIsMatch: false,
      qIsScramble: false,
      qIsBlanks: false,
      qIsType: false,
    };

  const answer = state.examAnswers[state.examIndex];
  const last = state.examIndex >= questions.length - 1;
  const activity = activityByKey(q.kind);

  const vals = {
    examActivityName: activity.name,
    // The view keys the question panel on this, so each question arrives as a
    // replacement rather than a redraw (styles.css, .card-swap) — the same
    // gesture a review card is dealt with.
    examCardKey: String(state.examIndex),
    examPosLabel: copy.exam.position(state.examIndex + 1, questions.length),
    examBarStyle:
      "height:100%;background:var(--color-accent);width:" +
      Math.round((state.examIndex / questions.length) * 100) +
      "%",
    examNextLabel: last ? copy.exam.finish : copy.exam.next,
    examNext: actions.nextQuestion,
    examBack: actions.prevQuestion,
    examCanGoBack: state.examIndex > 0,
    examLeave: actions.askLeaveExam,
    examLeaveAsk: state.examLeaveAsk,
    examLeaveCancel: actions.cancelLeaveExam,
    examLeaveConfirm: actions.leaveExam,
    // Nothing is graded until the end, so the only nudge available is whether
    // this question has anything in it at all.
    examUnanswered: isBlank(q, answer),

    qIsName: q.kind === "name-ref",
    qIsPick: q.kind === "pick-ref",
    qIsFinish: q.kind === "finish",
    qIsMatch: q.kind === "match",
    qIsScramble: q.kind === "scramble",
    qIsBlanks: q.kind === "blanks",
    qIsType: q.kind === "type",
    qPrompt: q.prompt || "",
    qLead: q.lead || "",
    qTyped: typeof answer === "string" ? answer : "",
    onQTyped: (e) => actions.answerExam(e.target.value),
  };

  if (q.kind === "name-ref") {
    vals.qHint = "";
    vals.qPlaceholder = copy.exam.refPlaceholder;
  }
  if (q.kind === "finish") {
    // Two fields, one answer: the sentence carries most of the mark and the
    // reference the rest (exam.FINISH_REF_WEIGHT).
    const given = answer || {};
    vals.qHint = copy.exam.finishHint;
    vals.qPlaceholder = "";
    vals.qTyped = given.text || "";
    vals.onQTyped = (e) => actions.answerExam({ ...given, text: e.target.value });
    vals.qRefTyped = given.ref || "";
    vals.onQRefTyped = (e) => actions.answerExam({ ...given, ref: e.target.value });
    vals.qRefLabel = copy.exam.whereFrom;
    vals.qRefPlaceholder = copy.exam.refPlaceholder;
    vals.qRefHint = copy.exam.refHint;
  }
  if (q.kind === "pick-ref") {
    vals.qOptions = q.options.map((o) => ({
      key: o.key,
      label: o.label,
      onClick: () => actions.answerExam(o.key),
      style: choiceStyle(answer === o.key),
      markStyle:
        "width:9px;height:9px;flex:none;border:1px solid var(--color-accent);background:" +
        (answer === o.key ? "var(--color-accent)" : "transparent"),
    }));
  }
  if (q.kind === "match") {
    const filed = answer || {};
    // The colour belongs to the pair, so the reference tile has to look up the
    // verse it was filed under rather than carry a colour of its own.
    const hueOfRef = new Map();
    q.verses.forEach((verse, i) => {
      if (filed[verse.key]) hueOfRef.set(filed[verse.key], pairHue(i));
    });
    vals.qVerses = q.verses.map((verse, i) => {
      const ref = q.refs.find((r) => r.key === filed[verse.key]);
      const hue = ref ? pairHue(i) : null;
      return {
        key: verse.key,
        text: verse.text,
        filedLabel: ref ? ref.label : state.examPick === verse.key ? copy.exam.matchNowPick : copy.exam.matchUnpaired,
        filedStyle: `font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${
          hue != null ? pairInk(hue) : muted(45)
        }`,
        onClick: () => actions.pickMatchVerse(verse.key),
        style: matchTile({ hue, picked: state.examPick === verse.key }),
      };
    });
    vals.qRefs = q.refs.map((r) => ({
      key: r.key,
      label: r.label,
      onClick: () => actions.pickMatchRef(r.key),
      style: matchTile({ hue: hueOfRef.has(r.key) ? hueOfRef.get(r.key) : null }),
    }));
    vals.qMatchNote = state.examPick ? copy.exam.matchPickRef : copy.exam.matchNote;
  }
  if (q.kind === "scramble") {
    const placed = answer || [];
    vals.qScrambleBuilt = placed.map((i) => q.chunks[i]).join(" ");
    vals.qScrambleEmpty = placed.length === 0;
    vals.qScrambleChunks = q.shuffled
      .filter((c) => !placed.includes(c.i))
      .map((c, i) => ({
        key: c.i,
        text: c.v,
        onClick: () => actions.answerExam([...placed, c.i]),
        style:
          "cursor:pointer;font-family:var(--font-body);font-size:15px;line-height:1.5;text-align:left;max-width:340px;padding:9px 13px;background:transparent;color:var(--color-text);--stagger-i:" +
          i +
          ";border:1px solid var(--color-divider)",
      }));
    vals.resetScramble = () => actions.answerExam([]);
  }
  if (q.kind === "blanks") {
    const given = answer || {};
    const blanksSet = new Set(q.blanks);
    vals.qBlankWords = q.words.map((word, i) => {
      const isBlank = blanksSet.has(i);
      const value = given[i] || "";
      const targetLength = word.length;
      return {
        word,
        isBlank,
        id: "blank-" + i,
        value,
        wrapStyle: "display:inline-flex;align-items:baseline",
        inputStyle:
          "width:" +
          Math.max(64, targetLength * 13) +
          "px;font:inherit;font-size:19px;padding:0 4px;background:transparent;color:var(--color-text);border:0;border-bottom:1px solid var(--color-neutral-400);outline:none",
        onChange: (e) => actions.answerExam({ ...given, [i]: e.target.value }),
      };
    });
  }
  if (q.kind === "type") {
    vals.qTyped = typeof answer === "string" ? answer : "";
    vals.onQTyped = (e) => actions.answerExam(e.target.value);
    vals.qPlaceholder = copy.exam.typePlaceholder;
  }
  return vals;
}

/* ── the summary ──────────────────────────────────────────────────────────── */

/* What the member wrote (or chose, or paired), in a form the summary can show
 * back to them. */
function givenLabel(m) {
  if (m.q.kind === "pick-ref") return m.chosenLabel || copy.exam.givenNothingChosen;
  if (m.q.kind === "match") return copy.exam.givenPairs(m.hits, m.total);
  if (m.q.kind === "scramble" || m.q.kind === "blanks") return copy.exam.givenParts(m.hits, m.total);
  if (m.q.kind === "finish") {
    const given = m.answer || {};
    const text = String(given.text || "").trim();
    const ref = String(given.ref || "").trim();
    if (!text && !ref) return copy.exam.givenBlank;
    return copy.exam.givenFinish(text, ref);
  }
  return String(m.answer || "").trim() || copy.exam.givenBlank;
}

/* What it should have been. Multiple choice is answered by an option, not by a
 * reference, so when the right option was "None of the above" the summary has
 * to say both — otherwise it reads as if the reference shown was on offer. */
function expectedLabel(m) {
  if (m.q.kind === "finish") return copy.exam.expectedFinish(m.q.answer, m.q.ref);
  if (m.q.kind === "match") return "";
  if (m.q.kind === "pick-ref" && m.q.correctKey === NONE_OF_THE_ABOVE) {
    return copy.exam.expectedNoneOfTheAbove(m.q.ref);
  }
  return m.q.ref;
}

function summaryVals({ state, byId }) {
  const result = state.examResult;
  if (!result) return { examVerseRows: [], examAnswerRows: [] };

  return {
    examScoreLabel: percent(result.score),
    examScoreNote: copy.exam.doneScoreNote(result.right, result.total),
    examHeadline:
      result.score >= 0.9
        ? copy.exam.doneHeadlineHigh
        : result.score >= 0.6
          ? copy.exam.doneHeadlineMid
          : copy.exam.doneHeadlineLow,
    examBody: copy.exam.doneBody,

    examVerseRows: result.rows.map((row) => {
      const p = byId.get(row.id);
      return {
        id: row.id,
        ref: p ? p.ref : String(row.id),
        scoreLabel: percent(row.score),
        scoreStyle:
          "font-family:var(--font-heading);font-weight:600;font-size:15px;color:" + freshColor(row.score * 100),
        beforeLabel: row.before + "%",
        afterLabel: row.after + "%",
        beforeStyle: `font-size:13px;color:${muted(50)}`,
        afterStyle: "font-size:13px;font-weight:600;color:" + freshColor(row.after),
        // A verse that came back weaker than it went in is the one worth the
        // member's eye, so it is the only drift the summary colours.
        driftLabel:
          row.after > row.before
            ? copy.exam.driftFresher
            : row.after === row.before
              ? copy.exam.driftHeld
              : copy.exam.driftFaded,
        driftStyle: `font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${
          row.after < row.before ? COLOR_ERROR : muted(45)
        }`,
      };
    }),

    examAnswerRows: result.marked.map((m) => ({
      key: m.q.key,
      activity: activityByKey(m.q.kind).short,
      ref: m.q.ref || copy.exam.versesUnderTest(m.q.ids.length),
      prompt: m.q.prompt || m.q.lead || "",
      given: givenLabel(m),
      expected: expectedLabel(m),
      scoreLabel: percent(m.score),
      markLabel: m.correct ? "✓" : "✗",
      markStyle:
        "font-family:var(--font-heading);font-weight:600;font-size:16px;width:18px;flex:none;color:" +
        (m.correct ? "var(--color-accent-700)" : COLOR_ERROR),
      style: "display:flex;gap:14px;align-items:flex-start;padding:14px 18px;border-top:1px solid var(--color-divider)",
    })),
  };
}

export function examVals({ state, actions, now = Date.now() }) {
  const byId = new Map(state.passages.map((p) => [p.id, p]));
  return {
    ...setupVals({ state, actions, now }),
    ...questionVals({ state, actions }),
    ...summaryVals({ state, byId }),
    // Board → setup, and summary → setup: both are "take a test".
    goTest: () => actions.goto("test-setup"),
    examAgain: () => actions.goto("test-setup"),
  };
}
