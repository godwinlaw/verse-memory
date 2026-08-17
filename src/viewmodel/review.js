/* View-model for the review session and the end-of-session summary.
 *
 * Builds the current card for whichever mode is active. The matching itself
 * lives in grading.js and the exercise generation in blanks.js; this module
 * turns their output into the shapes and style strings the view renders. */

import { copy } from "../copy.js";
import { norm, firstLetters as firstLetterScaffold } from "../text.js";
import { keyBlankSet, chunksFor, BLANK_LEVELS, SCRAMBLE_LEVELS } from "../blanks.js";
import { gradeWritten, matchesWord, revealFirstLetters } from "../grading.js";
import { countByStatus, reviewPool } from "../progress.js";
import { reviewSettings } from "../profile.js";
import { LEARN, MODES, modeByKey, seededShuffle, scrambleScore } from "../review.js";
import { COMMIT_SCORE, freshColor, PEEK_COST } from "../srs.js";
import { COLOR_ERROR, muted, WORD_RIGHT, WORD_WRONG, segButton } from "../ui/tokens.js";

/* Spreads consecutive passage ids across the shuffle's seed space, so verse 12
 * and verse 13 don't scramble into near-identical orders. */
const SEED_SPREAD = 13;

/* The recall box. Named here because two places need to agree on it: the view,
 * which labels the element, and App.js, which follows the transcript down as
 * recitation adds to it (the one thing about the box that needs the DOM). */
export const RECALL_INPUT_ID = "recall-input";

/* Width of a blank input, in px per character, with a floor so one- and
 * two-letter words still present a usable target. */
const BLANK_PX_PER_CHAR = 13;
const BLANK_MIN_WIDTH = 64;

const percent = (score, total) => (total ? Math.round(score * 100) + "%" : "—");

/* Freshness as a whole number of points, the unit the session talks in. */
const points = (r) => Math.round(r * 100);

/* The freshness bar drawn on the result strip's track. */
const meterBar = (pct) => "height:100%;width:" + pct + "%;background:" + freshColor(pct);

/* The bar the submitted card animates: same fill, but its width is driven from
 * the freshness the verse had to the one it just earned, by the CSS keyframes
 * .fresh-fill runs (see styles.css). */
const meterGrow = (from, to) =>
  "height:100%;background:" + freshColor(to) + ";--fresh-from:" + from + "%;--fresh-to:" + to + "%";

/* The passage's words with a blank input in place of each selected key word. */
function blankWords({ words, blanks, state, actions }) {
  const indexes = words.map((w, i) => (blanks.has(i) ? i : -1)).filter((i) => i >= 0);
  return words.map((word, i) => {
    const isBlank = blanks.has(i);
    const value = state.answers[i] || "";
    const ok = isBlank && matchesWord(word, value);
    const position = isBlank ? indexes.indexOf(i) : -1;
    const nextIndex = position >= 0 && position < indexes.length - 1 ? indexes[position + 1] : null;
    const targetLength = norm(word).length;
    return {
      word,
      isBlank,
      id: "blank-" + i,
      hint: state.blankHint ? norm(word)[0] + "—" : "",
      value,
      wrapStyle: "display:inline-flex;align-items:baseline",
      inputStyle:
        "width:" +
        Math.max(BLANK_MIN_WIDTH, targetLength * BLANK_PX_PER_CHAR) +
        "px;font:inherit;font-size:19px;padding:0 4px;background:transparent;color:var(--color-text);border:0;border-bottom:1px solid " +
        (state.blanksChecked ? (ok ? "var(--color-accent)" : COLOR_ERROR) : "var(--color-neutral-400)") +
        ";outline:none",
      onChange: (e) => {
        const typed = e.target.value;
        // Jump to the next blank as soon as this word is fully typed, so the
        // exercise flows without reaching for the mouse.
        const full = targetLength > 0 && norm(typed).length >= targetLength;
        actions.setAnswer(i, typed, full ? nextIndex : null);
      },
      onKeyDown: (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          actions.focusBlank(nextIndex);
        }
      },
    };
  });
}

/* A level picker (blanks or scramble granularity) as segmented buttons. */
const levelButtons = (levels, current, onPick) =>
  levels.map((lv, i) => ({
    key: lv.key,
    label: lv.label,
    active: i === current,
    onClick: () => onPick(i),
    style: segButton(i === current),
  }));

/* A learn session talks about committing; a review session talks about
 * freshness. They are the same cards, but not the same errand, and mixing the
 * two vocabularies is what made the old single session hard to explain: a member
 * trying to commit a verse for the first time has no use for a percentage that
 * decays, and quoting one invites them to optimise the wrong number.
 *
 * So everything the card says about what an attempt is worth comes from here,
 * in one voice or the other. The scheduling underneath is unchanged — a learn
 * card still earns stability and still costs freshness for a peek — it is only
 * never the thing the screen is about. */
function stakeVals({ state, prog, cur, isLearn, result }) {
  const commitDone = cur ? prog.statusOf(cur.id) === "memorized" : false;
  // The one activity that can commit: the passage written out, unaided.
  const writing = state.mode === "type" && !state.typeFirstLetter;
  const bar = points(COMMIT_SCORE);

  if (!isLearn) {
    return {
      isLearn: false,
      commitDone,
      commitNote: "",
      // What the member is playing for, so the trade between an easier setting
      // and the freshness it pays is visible before they submit. Once it is in,
      // the result strip says what it actually paid.
      stakeLabel: "",
      peekNote: result
        ? ""
        : state.peeks
          ? copy.review.peekSpent(state.peeks, points(PEEK_COST * state.peeks))
          : copy.review.peekCost(points(PEEK_COST)),
      moveNote: copy.review.moveNoteReview,
    };
  }

  return {
    isLearn: true,
    commitDone,
    commitNote: commitDone
      ? copy.review.commitDoneNote
      : writing
        ? copy.review.commitWritingNote(bar)
        : copy.review.commitOtherNote,
    // The banner above already states the stake, and it is not a number.
    stakeLabel: "",
    // Peeking is what separates reading a passage from recalling one, so in a
    // learn session the cost worth quoting is the commitment, not the freshness.
    peekNote:
      result || commitDone || !writing ? "" : state.peeks ? copy.review.peekSpentCommit : copy.review.peekCostsCommit,
    moveNote: copy.review.moveNoteLearn,
  };
}

/* Reciting the passage aloud, as the card offers it: one switch.
 *
 * Speaking fills the same box as typing, so there is no second exercise and no
 * second grade — and no controls of its own, because correcting a misheard word
 * is what the textarea was already for. The switch is offered on exactly one
 * card: the recall activity, with the first-letter scaffold off (there is no
 * reciting a scaffold) and the paper not yet handed in. Whether this browser
 * can listen at all was settled at startup and arrives in `state.voice`, so
 * nothing here asks the window a question. */
function voiceVals({ state, actions, submitted }) {
  const voice = state.voice || {};
  const status = voice.status || "off";
  const on = status !== "off";
  const error = voice.error ? copy.review.voiceErrors[voice.error] || copy.review.voiceErrors.failed : "";

  return {
    voiceShown: state.mode === "type" && !state.typeFirstLetter && !submitted,
    voiceSupported: !!voice.supported,
    voiceLabel: copy.review.voiceLabel,
    voiceOn: on,
    voiceToggle: actions.toggleVoice,
    // The dot beats only once the engine is actually listening, which is what
    // separates "switched on" from "the microphone is open" — there is a
    // permission prompt in between, and it is not instant.
    voiceListening: status === "listening",
    voiceStyle: segButton(on) + ";display:inline-flex;align-items:center;gap:7px",
    // Silent when it is working. A browser that cannot listen says so, and a
    // microphone that stopped says why; nothing else is worth a line.
    voiceNote: !voice.supported ? copy.review.voiceUnsupported : error || (on ? "" : copy.review.voiceNote),
    voiceNoteStyle: `font-size:12px;color:${error ? COLOR_ERROR : muted(55)}`,
  };
}

export function reviewVals({ state, prog, totals, actions }) {
  const isLearn = state.sessionKind === LEARN;
  const cur = state.passages.find((p) => p.id === state.queue[state.qi]);
  const curText = cur ? cur.text : "";
  const words = curText ? curText.split(" ") : [];

  // ── fill the blanks ───────────────────────────────────────────────────────
  const blanks = keyBlankSet(curText, cur ? cur.id : null, state.blankLevel);
  const blankCells = blankWords({ words, blanks, state, actions });
  const blanksTotal = blankCells.filter((w) => w.isBlank).length;
  const blanksRight = blankCells.filter((w) => w.isBlank && matchesWord(w.word, w.value)).length;

  // ── write it out ──────────────────────────────────────────────────────────
  const written = gradeWritten(words, state.typed, { firstLetters: state.typeFirstLetter });
  // The live first-letter reveal is only rendered in that mode; skip the work
  // (and the different tokenisation) otherwise.
  const live = state.typeFirstLetter ? revealFirstLetters(words, state.typed) : null;

  // ── order the phrases ─────────────────────────────────────────────────────
  const chunks = curText ? chunksFor(curText, state.scrambleLevel) : [];
  const shuffled = seededShuffle(chunks, (cur ? cur.id : 1) * SEED_SPREAD);
  const placed = state.scrambleOrder;
  const scrambleDone = chunks.length > 0 && placed.length === chunks.length;
  const scrambleMark = scrambleScore(placed.length, chunks.length, state.scrambleMisses);

  // ── what handing this card in is worth ────────────────────────────────────
  // The mark the attempt has earned so far, in the terms each mode measures.
  // The flashcard is the one activity with nothing to measure, so it has none.
  const isFlip = state.mode === "flip";
  const score = isFlip
    ? undefined
    : state.mode === "blanks"
      ? blanksTotal
        ? blanksRight / blanksTotal
        : 0
      : state.mode === "type"
        ? (state.typeFirstLetter ? live : written).score
        : scrambleMark;

  // A card is marked once a session: the result is kept by passage, so walking
  // back to a verse shows what it was worth rather than marking it again.
  const result = cur ? state.results[cur.id] : null;
  const drift = result ? result.after - result.before : 0;
  // Committed, but not by this card — the member is meeting a verse they had
  // already written out, so the learn card congratulates rather than instructs.
  const wasAlreadyCommitted = !!(result && !result.committed && cur && prog.statusOf(cur.id) === "memorized");
  const lastCard = state.qi >= state.queue.length - 1;
  const submittedCount = Object.keys(state.results).length;
  const committedHere = Object.values(state.results).filter((r) => r.committed).length;

  return {
    ...stakeVals({ state, prog, cur, isLearn, result }),
    ...voiceVals({ state, actions, submitted: !!result }),

    sessionLabel: isLearn ? copy.review.sessionLearn : copy.review.sessionReview,
    // What makes the card a card rather than a redraw: the view keys the panel
    // on this, so the next verse and a different exercise on this one both
    // arrive as a replacement (styles.css, .card-swap).
    cardKey: state.qi + ":" + state.mode,
    modeName: modeByKey(state.mode).name,
    posLabel: copy.review.position(Math.min(state.qi + 1, state.queue.length), state.queue.length),
    modeSwitch: MODES.map((m) => ({
      key: m.key,
      short: m.short,
      onClick: () => actions.setMode(m.key),
      style: segButton(state.mode === m.key),
    })),
    sessionBarStyle:
      "height:100%;background:var(--color-accent);width:" +
      (state.queue.length ? Math.round((state.qi / state.queue.length) * 100) : 0) +
      "%",

    curRef: cur ? cur.ref : "",
    curText,
    curMeta: cur ? copy.review.meta(cur.testament, words.length) : "",

    // Peeking at the text is available in every mode except the flashcard,
    // which is already a reveal. It is allowed and counted either way; what it
    // is said to cost depends on the errand (see stakeVals).
    helpLabel: copy.review.peek,
    peekOn: () => actions.setPeek(true),
    peekOff: () => actions.setPeek(false),
    showHelp: state.showHelp && !isFlip,
    peekSpent: state.peeks > 0,

    isFlip,
    flipShown: isFlip && state.revealed,
    // One button, one place: it reads Show or Hide and never moves.
    flipToggleLabel: state.revealed ? copy.review.flipHide : copy.review.flipShow,
    toggleFlip: () => actions.setRevealed(!state.revealed),
    flipLettersLabel: state.flipLetters ? copy.review.flipLettersHide : copy.review.flipLettersShow,
    flipLettersOn: state.flipLetters,
    flipFirstLetters: firstLetterScaffold(curText),
    toggleFlipLetters: actions.toggleFlipLetters,
    // The card is two-sided, so the front says which side it is, and the whole
    // card is a control — hence a label for it that names the turn, not the
    // state, since a screen reader reads it before the member acts.
    flipFrontLabel: copy.review.flipFront,
    flipHint: copy.review.flipHint,
    flipCardLabel: state.revealed ? copy.review.flipCardToFront : copy.review.flipCardToBack,

    isBlanks: state.mode === "blanks",
    blankWords: blankCells,
    blanksResult: state.blanksChecked
      ? copy.review.blanksResult(blanksRight, blanksTotal)
      : copy.review.blanksCount(blanksTotal),
    blankLevels: levelButtons(BLANK_LEVELS, state.blankLevel, actions.setBlankLevel),
    blankLevelDesc: copy.review.blanksLevelDesc((BLANK_LEVELS[state.blankLevel] || BLANK_LEVELS[1]).desc),
    blankHintOn: state.blankHint,
    toggleBlankHint: actions.toggleBlankHint,
    blankHintStyle: segButton(state.blankHint),

    isType: state.mode === "type",
    typeInputId: RECALL_INPUT_ID,
    typed: state.typed,
    onTyped: (e) => actions.setTyped(e.target.value),
    typeUngraded: state.mode === "type" && !state.typeGraded,
    typeGraded: state.mode === "type" && state.typeGraded,
    typeScore: percent(written.score, words.length),
    typeDiff: written.diff.map((d) => ({ word: d.word, style: d.hit ? WORD_RIGHT : WORD_WRONG })),
    // First-letter mode is a live drill: the reveal updates as you type and
    // there is no separate "Grade it" step.
    typeLive: state.mode === "type" && state.typeFirstLetter,
    typeReveal: (live ? live.words : []).map((w) => ({
      text: w.text,
      style: w.state === "right" ? WORD_RIGHT : w.state === "wrong" ? WORD_WRONG : "color:var(--color-neutral-400)",
    })),
    typeRevealScore: percent(live ? live.score : 0, words.length),
    typeFirstLetterOn: state.typeFirstLetter,
    toggleTypeFirstLetter: actions.toggleTypeFirstLetter,
    typeFirstLetterStyle: segButton(state.typeFirstLetter),
    typePlaceholder: state.typeFirstLetter ? copy.review.typeFirstLetterPlaceholder : copy.review.typePlaceholder,

    isScramble: state.mode === "scramble",
    scrambleChunks: shuffled
      .filter((c) => !placed.includes(c.i))
      .map((c, i) => ({
        key: c.i,
        text: c.v,
        onClick: () => actions.placeChunk(c.i),
        style:
          "cursor:pointer;font-family:var(--font-body);font-size:15px;line-height:1.5;text-align:left;max-width:340px;padding:9px 13px;background:transparent;color:var(--color-text);--stagger-i:" +
          i +
          ";border:1px solid " +
          (state.scrambleWrong === c.i ? COLOR_ERROR : "var(--color-divider)") +
          ";" +
          (state.scrambleWrong === c.i ? "animation:nudge .25s" : ""),
      })),
    scrambleBuilt: placed.map((i) => chunks[i]).join(" "),
    scrambleEmpty: placed.length === 0,
    scrambleResult: scrambleDone
      ? copy.review.scrambleDone
      : copy.review.scrambleProgress(placed.length, chunks.length),
    scrambleMissNote: state.scrambleMisses ? copy.review.scrambleMisses(state.scrambleMisses) : "",
    resetScramble: actions.resetScramble,
    scrambleLevels: levelButtons(SCRAMBLE_LEVELS, state.scrambleLevel, actions.setScrambleLevel),
    scrambleLevelDesc: copy.review.scrambleLevelDesc((SCRAMBLE_LEVELS[state.scrambleLevel] || SCRAMBLE_LEVELS[1]).desc),

    // ── handing the card in, and walking the queue ──────────────────────────
    // The flashcard has nothing to mark, so it has no Submit: it is recorded on
    // the way out. Every other mode is submitted, once, by the member.
    canSubmit: !isFlip,
    submitDone: !!result,
    submitLabel: result ? copy.review.submitted : copy.review.submit,
    submit: () => actions.submitCard(score),
    goPrev: actions.prevCard,
    goNext: actions.nextCard,
    canGoBack: state.qi > 0,
    nextLabel: lastCard ? copy.review.finish : copy.review.next,

    // What the submission was worth. A review card reports it as freshness —
    // the mark, the value before and after, and the two bars the view animates
    // between them. A learn card reports whether it committed the verse, which
    // is the only outcome that sitting is playing for.
    resultShown: !!result,
    resultKey: result ? result.id + ":" + result.after : "none",
    resultModeName: result ? modeByKey(result.mode).name : "",
    resultScoreLabel:
      result && result.score != null ? copy.review.resultScore(points(result.score)) : copy.review.resultReviewed,
    resultBeforeLabel: result ? result.before + "%" : "",
    resultAfterLabel: result ? result.after + "%" : "",
    resultBeforeBar: result ? meterBar(result.before) : "",
    resultAfterBar: result ? meterGrow(result.before, result.after) : "",
    resultDriftLabel: (drift > 0 ? "+" : drift < 0 ? "−" : "±") + Math.abs(drift) + "%",
    resultDriftStyle:
      "font-family:var(--font-heading);font-weight:600;font-size:26px;line-height:1;color:" +
      (drift > 0 ? "var(--color-accent-700)" : drift < 0 ? COLOR_ERROR : muted(45)),
    resultNote: result
      ? result.peeks
        ? copy.review.resultDecaysAfterPeeks(result.peeks)
        : copy.review.resultDecays
      : "",

    // The learn card's verdict: did this attempt commit the verse, and if not,
    // what would have. Never a percentage of anything that decays.
    learnResultHeadline: !result
      ? ""
      : result.committed
        ? copy.review.learnCommitted
        : wasAlreadyCommitted
          ? copy.review.learnStillCommitted
          : copy.review.learnNotYet,
    learnResultNote: !result
      ? ""
      : result.committed
        ? copy.review.learnCommittedNote
        : wasAlreadyCommitted
          ? copy.review.learnStillCommittedNote
          : result.mode === "type"
            ? copy.review.learnWriteOutNote(points(COMMIT_SCORE))
            : copy.review.learnPracticeNote,
    learnResultDone: !!(result && (result.committed || wasAlreadyCommitted)),

    // Leaving mid-session keeps what has been handed in; the rest of the queue
    // is simply dropped. Both of those are worth saying out loud.
    askLeaveReview: actions.askLeaveReview,
    reviewLeaveAsk: !!state.reviewLeaveAsk,
    reviewLeaveCancel: actions.cancelLeaveReview,
    reviewLeaveConfirm: actions.leaveReview,
    reviewLeaveNote: !submittedCount
      ? copy.review.leaveNothing
      : isLearn
        ? copy.review.leaveLearn(committedHere)
        : copy.review.leaveReview(submittedCount),

    // Walking off a card that was never handed in — forwards or back — throws
    // the attempt away, so either direction asks first.
    reviewMoveAsk: !!state.reviewMoveAsk,
    reviewMoveTitle: state.reviewMoveAsk === "prev" ? copy.review.moveBackTitle : copy.review.moveOnTitle,
    reviewMoveConfirmLabel: state.reviewMoveAsk === "prev" ? copy.review.moveBack : copy.review.moveOn,
    reviewMoveCancel: actions.cancelMoveCard,
    reviewMoveConfirm: actions.confirmMoveCard,

    doneHeadline: isLearn ? copy.done.headlineLearn(committedHere) : copy.done.headlineReview(state.sessionCount),
    doneBody:
      (isLearn ? (committedHere ? copy.done.leadCommitted : copy.done.leadNothingCommitted) : copy.done.leadReviewed) +
      copy.done.tally(totals.memorized, totals.goal, totals.daysLeft),
    // The obvious next sitting is another of the same; the other one is offered
    // beside it rather than buried back on the board.
    doneAgainLabel: isLearn ? copy.done.againLearn : copy.done.againReview,
    doneAgain: () => actions.goto(isLearn ? "learn-setup" : "review-setup"),
    doneOtherLabel: isLearn ? copy.done.otherReview : copy.done.otherLearn,
    doneOther: () => actions.goto(isLearn ? "review-setup" : "learn-setup"),
  };
}

/* What a review session should target before it starts.
 *
 * Review is the upkeep half of the app: it draws only on verses already
 * committed, and only those that have faded to the member's threshold. An empty
 * due queue therefore means they have genuinely caught up — and only then do the
 * manual controls come into play, which reach further up the same committed
 * shelf rather than into uncommitted verses. Learning those is a learn session's
 * job (see viewmodel/learn.js). */
export function reviewSetupVals({ state, actions, now = Date.now() }) {
  const setup = state.reviewSetup || {};
  const manualSize = setup.manualSize !== undefined ? setup.manualSize : 10;
  const manualFreshness = setup.manualFreshness !== undefined ? setup.manualFreshness : 90;
  const { dueTopX, dueFreshness } = reviewSettings(state.profile);

  const dueNow = reviewPool(state.passages, state.progress, dueFreshness, now).slice(0, dueTopX);
  const hasDue = dueNow.length > 0;

  // Committed verses at or below the chosen ceiling; size 0 = "All".
  const manualPool = reviewPool(state.passages, state.progress, manualFreshness, now);
  const manualVerses = manualSize === 0 ? manualPool : manualPool.slice(0, manualSize);

  const versesToReview = hasDue ? dueNow : manualVerses;
  const poolSize = versesToReview.length;
  const committed = countByStatus(state.passages, state.progress, "memorized");

  return {
    // The due queue's availability, not a toggle, decides which controls show.
    reviewHasDue: hasDue,
    reviewNothingCommitted: committed === 0,

    reviewSetupSizes: [5, 10, 20, 0].map((n) => ({
      key: String(n),
      label: n === 0 ? copy.common.all : String(n),
      onClick: () => actions.setReviewSetup({ manualSize: n }),
      style: segButton(manualSize === n),
    })),
    reviewSetupFreshness: manualFreshness,
    onReviewSetupFreshness: (e) => actions.setReviewSetup({ manualFreshness: Number(e.target.value) }),

    reviewSetupCanStart: poolSize > 0,
    reviewSetupTarget: hasDue
      ? copy.reviewSetup.targetDue(dueFreshness)
      : committed
        ? copy.reviewSetup.targetCaughtUp
        : copy.reviewSetup.targetNothingCommitted,
    reviewSetupNote: hasDue
      ? copy.reviewSetup.noteDue(dueNow.length)
      : poolSize
        ? copy.reviewSetup.noteManual(poolSize)
        : copy.reviewSetup.noteNone,

    startReviewSession: () => actions.startReviewSession(versesToReview.map((v) => v.id)),
    cancelReviewSession: () => actions.goto("board"),
    reviewSetupGoLearn: () => actions.goto("learn-setup"),
  };
}
