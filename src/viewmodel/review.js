/* View-model for the review session and the end-of-session summary.
 *
 * Builds the current card for whichever mode is active. The matching itself
 * lives in grading.js and the exercise generation in blanks.js; this module
 * turns their output into the shapes and style strings the view renders. */

import { norm, firstLetters as firstLetterScaffold } from "../text.js";
import { keyBlankSet, chunksFor, BLANK_LEVELS, SCRAMBLE_LEVELS } from "../blanks.js";
import { gradeWritten, matchesWord, revealFirstLetters } from "../grading.js";
import { countByStatus, reviewPool } from "../progress.js";
import { reviewSettings } from "../profile.js";
import { LEARN, MODES, modeByKey, seededShuffle, scrambleScore } from "../review.js";
import { awardCeiling, COMMIT_SCORE, freshColor, PEEK_COST } from "../srs.js";
import { COLOR_ERROR, muted, WORD_RIGHT, WORD_WRONG, segButton } from "../ui/tokens.js";

/* Spreads consecutive passage ids across the shuffle's seed space, so verse 12
 * and verse 13 don't scramble into near-identical orders. */
const SEED_SPREAD = 13;

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
function stakeVals({ state, prog, cur, isLearn, isFlip, result, ceiling }) {
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
          ? state.peeks + (state.peeks === 1 ? " peek · −" : " peeks · −") + points(PEEK_COST * state.peeks) + "%"
          : "Each peek costs " + points(PEEK_COST) + "%",
      moveNote:
        "This passage has not been handed in, so it earns no freshness, its place in your queue does not change, " +
        "and what you have filled in here is lost.",
    };
  }

  return {
    isLearn: true,
    commitDone,
    commitNote: commitDone
      ? "Committed. You have written this one out in full from memory."
      : writing
        ? "Get " + bar + "% of the words right, without peeking, and this verse is committed."
        : "Write the passage in full to commit the verse into your memory bank.",
    // The banner above already states the stake, and it is not a number.
    stakeLabel: "",
    // Peeking is what separates reading a passage from recalling one, so in a
    // learn session the cost worth quoting is the commitment, not the freshness.
    peekNote:
      result || commitDone || !writing
        ? ""
        : state.peeks
          ? "Peeked — this attempt can no longer commit the verse."
          : "A peek means this attempt cannot commit the verse.",
    moveNote:
      "This passage has not been handed in, so nothing about it is recorded, its place in your queue does not " +
      "change, and what you have filled in here is lost.",
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

  const ceiling = awardCeiling({
    mode: state.mode,
    blankLevel: state.blankLevel,
    scrambleLevel: state.scrambleLevel,
    firstLetters: state.typeFirstLetter,
  });
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
    ...stakeVals({ state, prog, cur, isLearn, isFlip, result, ceiling }),

    sessionLabel: isLearn ? "Learn" : "Review",
    modeName: modeByKey(state.mode).name,
    posLabel: "Passage " + Math.min(state.qi + 1, state.queue.length) + " of " + state.queue.length,
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
    curMeta: cur ? (cur.testament === "OT" ? "Old Testament" : "New Testament") + " · " + words.length + " words" : "",

    // Peeking at the text is available in every mode except the flashcard,
    // which is already a reveal. It is allowed and counted either way; what it
    // is said to cost depends on the errand (see stakeVals).
    helpLabel: "Peek",
    peekOn: () => actions.setPeek(true),
    peekOff: () => actions.setPeek(false),
    showHelp: state.showHelp && !isFlip,
    peekSpent: state.peeks > 0,

    isFlip,
    flipShown: isFlip && state.revealed,
    // One button, one place: it reads Show or Hide and never moves.
    flipToggleLabel: state.revealed ? "Hide passage" : "Show passage",
    toggleFlip: () => actions.setRevealed(!state.revealed),
    flipLettersLabel: state.flipLetters ? "Hide first letters" : "Show first letters",
    flipLettersOn: state.flipLetters,
    flipFirstLetters: firstLetterScaffold(curText),
    toggleFlipLetters: actions.toggleFlipLetters,

    isBlanks: state.mode === "blanks",
    blankWords: blankCells,
    blanksResult: state.blanksChecked ? blanksRight + " of " + blanksTotal + " right" : blanksTotal + " blanks",
    blankLevels: levelButtons(BLANK_LEVELS, state.blankLevel, actions.setBlankLevel),
    blankLevelDesc: "Blanking " + (BLANK_LEVELS[state.blankLevel] || BLANK_LEVELS[1]).desc,
    blankHintOn: state.blankHint,
    toggleBlankHint: actions.toggleBlankHint,
    blankHintStyle: segButton(state.blankHint),

    isType: state.mode === "type",
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
    typePlaceholder: state.typeFirstLetter
      ? "Type just the first letter of each word — e.g. “f t h w”. Spacing and punctuation are ignored."
      : "Type the passage from memory. Punctuation and capitals are ignored.",

    isScramble: state.mode === "scramble",
    scrambleChunks: shuffled
      .filter((c) => !placed.includes(c.i))
      .map((c) => ({
        key: c.i,
        text: c.v,
        onClick: () => actions.placeChunk(c.i),
        style:
          "cursor:pointer;font-family:var(--font-body);font-size:15px;line-height:1.5;text-align:left;max-width:340px;padding:9px 13px;background:transparent;color:var(--color-text);border:1px solid " +
          (state.scrambleWrong === c.i ? COLOR_ERROR : "var(--color-divider)") +
          ";" +
          (state.scrambleWrong === c.i ? "animation:nudge .25s" : ""),
      })),
    scrambleBuilt: placed.map((i) => chunks[i]).join(" "),
    scrambleEmpty: placed.length === 0,
    scrambleResult: scrambleDone ? "Complete — in order." : placed.length + " of " + chunks.length + " placed",
    scrambleMissNote: state.scrambleMisses
      ? state.scrambleMisses + (state.scrambleMisses === 1 ? " wrong try" : " wrong tries")
      : "",
    resetScramble: actions.resetScramble,
    scrambleLevels: levelButtons(SCRAMBLE_LEVELS, state.scrambleLevel, actions.setScrambleLevel),
    scrambleLevelDesc: "Cutting into " + (SCRAMBLE_LEVELS[state.scrambleLevel] || SCRAMBLE_LEVELS[1]).desc,

    // ── handing the card in, and walking the queue ──────────────────────────
    // The flashcard has nothing to mark, so it has no Submit: it is recorded on
    // the way out. Every other mode is submitted, once, by the member.
    canSubmit: !isFlip,
    submitDone: !!result,
    submitLabel: result ? "Submitted" : "Submit",
    submit: () => actions.submitCard(score),
    goPrev: actions.prevCard,
    goNext: actions.nextCard,
    canGoBack: state.qi > 0,
    nextLabel: lastCard ? "Finish session" : "Next passage",

    // What the submission was worth. A review card reports it as freshness —
    // the mark, the value before and after, and the two bars the view animates
    // between them. A learn card reports whether it committed the verse, which
    // is the only outcome that sitting is playing for.
    resultShown: !!result,
    resultKey: result ? result.id + ":" + result.after : "none",
    resultModeName: result ? modeByKey(result.mode).name : "",
    resultScoreLabel: result && result.score != null ? points(result.score) + "% right" : "Reviewed",
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
        ? "After " + result.peeks + (result.peeks === 1 ? " peek." : " peeks.") + " Freshness decays from here."
        : "Freshness decays from here."
      : "",

    // The learn card's verdict: did this attempt commit the verse, and if not,
    // what would have. Never a percentage of anything that decays.
    learnResultHeadline: !result
      ? ""
      : result.committed
        ? "Committed"
        : wasAlreadyCommitted
          ? "Still committed"
          : "Not committed yet",
    learnResultNote: !result
      ? ""
      : result.committed
        ? "You wrote the passage out in full from memory. It moves to your review list from here."
        : wasAlreadyCommitted
          ? "You already have this one. Keep it in your review list."
          : result.mode === "type"
            ? "A full write-out from memory is what commits it — " + points(COMMIT_SCORE) + "% of the words, unaided."
            : "Practice recorded. Writing the passage out in full is what commits it.",
    learnResultDone: !!(result && (result.committed || wasAlreadyCommitted)),

    // Leaving mid-session keeps what has been handed in; the rest of the queue
    // is simply dropped. Both of those are worth saying out loud.
    askLeaveReview: actions.askLeaveReview,
    reviewLeaveAsk: !!state.reviewLeaveAsk,
    reviewLeaveCancel: actions.cancelLeaveReview,
    reviewLeaveConfirm: actions.leaveReview,
    reviewLeaveNote: !submittedCount
      ? "Nothing has been submitted yet, so no passage will change."
      : isLearn
        ? committedHere +
          (committedHere === 1 ? " passage stays committed" : " passages stay committed") +
          " and everything you have submitted is kept. The rest of the queue is dropped."
        : submittedCount +
          (submittedCount === 1 ? " passage you have submitted keeps" : " passages you have submitted keep") +
          " the freshness it earned. The rest of the queue is dropped.",

    // Walking off a card that was never handed in — forwards or back — throws
    // the attempt away, so either direction asks first.
    reviewMoveAsk: !!state.reviewMoveAsk,
    reviewMoveTitle: state.reviewMoveAsk === "prev" ? "Go back without submitting?" : "Move on without submitting?",
    reviewMoveConfirmLabel: state.reviewMoveAsk === "prev" ? "Go back" : "Move on",
    reviewMoveCancel: actions.cancelMoveCard,
    reviewMoveConfirm: actions.confirmMoveCard,

    doneHeadline: isLearn
      ? committedHere + (committedHere === 1 ? " passage committed" : " passages committed")
      : state.sessionCount + (state.sessionCount === 1 ? " passage refreshed" : " passages refreshed"),
    doneBody:
      (isLearn
        ? committedHere
          ? "Written out in full from memory — that is what commits a passage. "
          : "Nothing was committed this time. A passage is committed by writing it out in full, so keep at " +
            "these until you can. "
        : "Every passage you reviewed is fresh again. ") +
      totals.memorized +
      " of " +
      totals.goal +
      " are committed, with " +
      totals.daysLeft +
      " days to go.",
    // The obvious next sitting is another of the same; the other one is offered
    // beside it rather than buried back on the board.
    doneAgainLabel: isLearn ? "Learn more" : "Review more",
    doneAgain: () => actions.goto(isLearn ? "learn-setup" : "review-setup"),
    doneOtherLabel: isLearn ? "Review instead" : "Learn instead",
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
export function reviewSetupVals({ state, actions }) {
  const setup = state.reviewSetup || {};
  const manualSize = setup.manualSize !== undefined ? setup.manualSize : 10;
  const manualFreshness = setup.manualFreshness !== undefined ? setup.manualFreshness : 90;
  const { dueTopX, dueFreshness } = reviewSettings(state.profile);

  const dueNow = reviewPool(state.passages, state.progress, dueFreshness).slice(0, dueTopX);
  const hasDue = dueNow.length > 0;

  // Committed verses at or below the chosen ceiling; size 0 = "All".
  const manualPool = reviewPool(state.passages, state.progress, manualFreshness);
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
      label: n === 0 ? "All" : String(n),
      onClick: () => actions.setReviewSetup({ manualSize: n }),
      style: segButton(manualSize === n),
    })),
    reviewSetupFreshness: manualFreshness,
    onReviewSetupFreshness: (e) => actions.setReviewSetup({ manualFreshness: Number(e.target.value) }),

    reviewSetupCanStart: poolSize > 0,
    reviewSetupTarget: hasDue
      ? "Reviewing the committed verses that have faded to " + dueFreshness + "% or below."
      : committed
        ? "You're all caught up — nothing you have committed has faded that far. Set up some extra review below."
        : "You have not committed a verse yet, so there is nothing to review. Start with a learn session instead.",
    reviewSetupNote: hasDue
      ? dueNow.length + (dueNow.length === 1 ? " verse is due right now." : " verses are due right now.")
      : poolSize
        ? poolSize +
          (poolSize === 1 ? " committed verse matches these settings." : " committed verses match these settings.")
        : "No committed verses match these settings.",

    startReviewSession: () => actions.startReviewSession(versesToReview.map((v) => v.id)),
    cancelReviewSession: () => actions.goto("board"),
    reviewSetupGoLearn: () => actions.goto("learn-setup"),
  };
}
