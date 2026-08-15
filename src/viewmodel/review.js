/* View-model for the review session and the end-of-session summary.
 *
 * Builds the current card for whichever mode is active. The matching itself
 * lives in grading.js and the exercise generation in blanks.js; this module
 * turns their output into the shapes and style strings the view renders. */

import { norm, firstLetters as firstLetterScaffold } from "../text.js";
import { keyBlankSet, chunksFor, BLANK_LEVELS, SCRAMBLE_LEVELS } from "../blanks.js";
import { gradeWritten, matchesWord, revealFirstLetters } from "../grading.js";
import { REVIEWS_TO_COMMIT } from "../progress.js";
import { MODES, modeByKey, seededShuffle } from "../review.js";
import { COLOR_ERROR, WORD_RIGHT, WORD_WRONG, segButton } from "../ui/tokens.js";

/* Spreads consecutive passage ids across the shuffle's seed space, so verse 12
 * and verse 13 don't scramble into near-identical orders. */
const SEED_SPREAD = 13;

/* Width of a blank input, in px per character, with a floor so one- and
 * two-letter words still present a usable target. */
const BLANK_PX_PER_CHAR = 13;
const BLANK_MIN_WIDTH = 64;

const percent = (score, total) => (total ? Math.round(score * 100) + "%" : "—");

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

export function reviewVals({ state, prog, totals, actions }) {
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

  return {
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
    curProgressNote: "",

    // Peeking at the text is available in every mode except the flashcard,
    // which is already a reveal.
    helpLabel: "Peek",
    peekOn: () => actions.setPeek(true),
    peekOff: () => actions.setPeek(false),
    showHelp: state.showHelp && state.mode !== "flip",

    isFlip: state.mode === "flip",
    flipHidden: state.mode === "flip" && !state.revealed,
    flipShown: state.mode === "flip" && state.revealed,
    reveal: () => actions.setRevealed(true),
    hide: () => actions.setRevealed(false),
    flipLettersOn: state.flipLetters,
    flipFirstLetters: firstLetterScaffold(curText),
    toggleFlipLetters: actions.toggleFlipLetters,

    isBlanks: state.mode === "blanks",
    blankWords: blankCells,
    checkBlanks: actions.checkBlanks,
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
    typeButtonLabel: state.typeGraded ? "Try again" : "Grade it",
    checkTyped: () => actions.gradeTyped(written.score),
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
    resetScramble: actions.resetScramble,
    scrambleLevels: levelButtons(SCRAMBLE_LEVELS, state.scrambleLevel, actions.setScrambleLevel),
    scrambleLevelDesc: "Cutting into " + (SCRAMBLE_LEVELS[state.scrambleLevel] || SCRAMBLE_LEVELS[1]).desc,

    // The live drill never runs "Grade it", so hand its score to the recorder on
    // the way out — otherwise the review would be scored as if nothing was typed.
    advance: () => actions.advance(state.mode === "type" && live ? live.score : undefined),
    endSession: () => actions.goto("board"),

    doneHeadline: state.sessionCount + (state.sessionCount === 1 ? " passage refreshed" : " passages refreshed"),
    doneBody:
      "Every passage you reviewed is fresh again. " +
      totals.memorized +
      " of " +
      totals.goal +
      " are committed, with " +
      totals.daysLeft +
      " days to go.",
  };
}

export function reviewSetupVals({ state, prog, actions }) {
  const setup = state.reviewSetup || { target: "due", manualSize: 10, manualFreshness: 50 };
  const isDue = setup.target === "due";
  
  const dueTopX = state.profile && state.profile.dueTopX !== undefined ? state.profile.dueTopX : 10;
  const dueFreshness = state.profile && state.profile.dueFreshness !== undefined ? state.profile.dueFreshness : 50;
  const dueRanked = state.passages.sort((a, b) => prog.retrievability(a.id) - prog.retrievability(b.id));
  const dueNow = dueRanked.filter((p) => prog.isDue(p.id) && prog.freshness(p.id) < dueFreshness).slice(0, dueTopX);

  const manualRanked = dueRanked.filter(p => prog.statusOf(p.id) !== "memorized" && prog.freshness(p.id) <= setup.manualFreshness);
  const manualVerses = manualRanked.slice(0, setup.manualSize);

  const poolSize = isDue ? dueNow.length : manualVerses.length;
  const versesToReview = isDue ? dueNow : manualVerses;

  return {
    reviewSetupTarget: setup.target,
    reviewSetupSizes: [5, 10, 20, 0].map(n => ({
      key: String(n),
      label: n === 0 ? "All" : String(n),
      onClick: () => actions.setReviewSetup({ manualSize: n }),
      style: segButton(setup.manualSize === n)
    })),
    reviewSetupFreshness: setup.manualFreshness,
    onReviewSetupFreshness: (e) => actions.setReviewSetup({ manualFreshness: Number(e.target.value) }),
    
    setReviewTargetDue: () => actions.setReviewSetup({ target: "due" }),
    setReviewTargetManual: () => actions.setReviewSetup({ target: "manual" }),
    
    reviewSetupDueStyle: segButton(isDue),
    reviewSetupManualStyle: segButton(!isDue),
    
    reviewSetupCanStart: poolSize > 0,
    reviewSetupNote: isDue 
      ? (poolSize ? poolSize + " verses are due right now." : "No verses are currently due.")
      : (poolSize ? poolSize + " uncommitted verses match these settings." : "No uncommitted verses match these settings."),
      
    startReviewSession: () => actions.startReviewSession(versesToReview.map(v => v.id)),
    cancelReviewSession: () => actions.goto("board"),
  };
}
