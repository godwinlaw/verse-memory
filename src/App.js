/* The Memory Board — root component.
 *
 * This is the only stateful module in the app. It owns the member's progress and
 * the running review session, exposes an `actions` table for the UI to call, and
 * dispatches to a view. It deliberately holds no rendering or derivation logic:
 *
 *   viewmodel/  turns (state, actions) into one plain object of strings and
 *               callbacks — all the derivation lives there
 *   views/      turn that object into markup — no state, no imports from here
 *   srs, blanks, grading, progress, exam, text — the pure domain, unit-tested
 *               in Node
 *
 * So a change to how something looks belongs in views/, a change to what is
 * shown in viewmodel/, and a change to how memory is modelled in srs.js. */

import { React, html, sx } from "./dom.js";
import { dayKey } from "./text.js";
import { commitsVerse, freshness, migrate, nextStability, reviewAward, reviewedLast } from "./srs.js";
import { BLANK_LEVELS, SCRAMBLE_LEVELS } from "./blanks.js";
import { storage, mergeProgress, mergeLog } from "./storage.js";
import { committedCount, dueOrder, freshnessSum, streakOf } from "./progress.js";
import { DEFAULT_MODE, LEARN, LEARN_SIZE, REVIEW, SESSION_SIZE } from "./review.js";
import { applyExam, buildExam, DEFAULT_SETUP, normalizeSetup, scoreExam } from "./exam.js";
import { DEFAULT_DUE_FRESHNESS, DEFAULT_DUE_TOP_X, isProfileComplete, mergeProfile } from "./profile.js";
import { appConfig } from "./config.js";
import { initAuth, signIn, signOutUser, fetchRoster } from "./firebase.js";
import { passages } from "../data/passages.js";
import { buildViewModel, authGateVals, profileFormVals } from "./viewmodel/index.js";
import { muted } from "./ui/tokens.js";
import { headerView } from "./views/header.js";
import { boardView } from "./views/board.js";
import { listView } from "./views/list.js";
import { reviewView } from "./views/review.js";
import { reviewSetupView } from "./views/review-setup.js";
import { learnSetupView } from "./views/learn-setup.js";
import { doneView } from "./views/done.js";
import { examSetupView } from "./views/exam-setup.js";
import { examView } from "./views/exam.js";
import { examDoneView } from "./views/exam-done.js";
import { leaderboardView } from "./views/leaderboard.js";
import { authGateView } from "./views/auth-gate.js";
import { profileFormView } from "./views/profile-form.js";
import { footerView } from "./views/footer.js";

/* Grace period between the ministry-group input losing focus and its dropdown
 * closing, so a mousedown on an option still registers. */
const MINISTRY_CLOSE_MS = 120;

/* Move the caret to another blank. Lives here rather than in the view-model
 * because it reaches for the DOM. A null index means "nowhere to go". */
function focusBlank(index) {
  if (index == null) return;
  const el = document.getElementById("blank-" + index);
  if (el) el.focus();
}

function initialState() {
  return {
    loaded: false,
    passages: [],
    // board | list | review-setup | learn-setup | review | done | leaderboard
    // | test-setup | test | test-done
    view: "board",
    progress: {}, // { [passageId]: { hits, status, last, stability } }
    log: {}, // { [YYYY-MM-DD]: reviews that day }

    // running session — review keeps committed verses fresh, learn commits new
    // ones. Same cards, same activities; see review.js for what separates them.
    sessionKind: REVIEW,
    mode: null,
    queue: [],
    qi: 0,
    sessionCount: 0,
    results: {}, // { [passageId]: what submitting that card was worth }
    reviewLeaveAsk: false, // "leave the session?" confirmation is open
    reviewMoveAsk: null, // walking off an unsubmitted card: null | "prev" | "next"
    showHelp: false,
    peeks: 0, // presses of "Peek" on the card in front of us
    revealed: false,
    flipLetters: false,
    answers: {},
    blanksChecked: false,
    blankLevel: 1,
    blankHint: true,
    typed: "",
    typeGraded: false,
    typeFirstLetter: false,
    scrambleOrder: [],
    scrambleWrong: -1,
    scrambleMisses: 0, // chunks tried in the wrong place on this card
    scrambleLevel: 1,

    // running test (Test mode — see exam.js)
    examSetup: DEFAULT_SETUP,
    exam: null, // { questions, ids }, built once when the test starts
    examIndex: 0,
    examAnswers: {}, // { [questionIndex]: answer }
    examPick: null, // verse awaiting a reference in a matching question
    examLeaveAsk: false, // "leave the test?" confirmation is open
    examResult: null, // the marked paper, kept for the summary screen

    // passage list
    search: "",
    filter: "All",

    // account, profile, leaderboard
    auth: { status: "loading" }, // loading | signing-in | signed-out | denied | signed-in | disabled
    profile: {}, // { name, ministryGroup, gender, gradClass, dueTopX, dueFreshness, updatedAt }
    profileDraft: null, // in-progress edits for the profile form
    editingProfile: false, // reopen the form for an already-complete profile
    ministryOpen: false, // ministry-group combobox dropdown visibility
    peers: null, // leaderboard roster, minus self
    leaderFilter: { group: "All", gender: "All", gradClass: "All" },

    // the two setup screens, as last left (device-local, like the exercise
    // levels): extra review once caught up, and how much to take on learning
    reviewSetup: { manualSize: 10, manualFreshness: 90 },
    learnSetup: { size: LEARN_SIZE },
  };
}

export class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = initialState();
    // Built once so callbacks keep a stable identity across renders.
    this.actions = this.buildActions();
  }

  componentDidMount() {
    this.setState({
      passages,
      progress: storage.loadProgress(),
      log: storage.loadLog(),
      profile: storage.loadProfile(),
      blankLevel: storage.loadBlankLevel(this.state.blankLevel, BLANK_LEVELS.length),
      blankHint: storage.loadBlankHint(this.state.blankHint),
      typeFirstLetter: storage.loadTypeFirstLetter(this.state.typeFirstLetter),
      scrambleLevel: storage.loadScrambleLevel(this.state.scrambleLevel, SCRAMBLE_LEVELS.length),
      examSetup: normalizeSetup(storage.loadExamSetup()),
      reviewSetup: storage.loadReviewSetup(this.state.reviewSetup),
      learnSetup: storage.loadLearnSetup(this.state.learnSetup),
      loaded: true,
    });
    // Auth + cloud sync. Access is gated to Acts 2 Network Google accounts; on a
    // valid sign-in, remote progress is pulled and reconciled with local, and the
    // leaderboard roster is loaded. If Firebase is unreachable the status becomes
    // "disabled" and the app runs local-only rather than locking members out.
    initAuth({
      onChange: (auth) => {
        this.setState({ auth });
        if (auth.status === "signed-in") this.loadRoster();
      },
      onRemoteData: (remote) => this.hydrateRemote(remote),
    });
  }

  componentWillUnmount() {
    clearTimeout(this.ministryTimer);
  }

  /* ── configuration ──────────────────────────────────────────────────────── */

  groupName() {
    return this.props.groupName ?? appConfig.groupName;
  }
  motto() {
    return this.props.motto ?? appConfig.motto;
  }
  deadline() {
    return this.props.deadline || appConfig.deadline;
  }

  /* ── persistence ────────────────────────────────────────────────────────── */

  save(progress, log) {
    this.setState({ progress, log });
    storage.saveProgressAndLog(progress, log);
  }

  saveProfile(profile) {
    this.setState({ profile });
    storage.saveProfile(profile);
  }

  /* Reconcile cloud state pulled at startup with whatever is on this device,
   * then persist the result (which pushes the merge back to the cloud). */
  hydrateRemote(remote) {
    this.save(mergeProgress(this.state.progress, remote.progress), mergeLog(this.state.log, remote.log));
    this.saveProfile(mergeProfile(this.state.profile, remote.profile));
  }

  /* ── account + profile ──────────────────────────────────────────────────── */

  signIn() {
    this.setState({ auth: { status: "signing-in" } });
    // On success the auth observer flips the status to "signed-in"; only failure
    // (popup closed or blocked, or an outside account) is handled here.
    signIn().catch((e) => {
      const denied = e && e.code === "not-allowed-domain";
      this.setState({ auth: { status: denied ? "denied" : "signed-out", error: denied ? null : "sign-in-failed" } });
    });
  }

  /* Set one field of the in-progress draft, seeding from the saved profile so
   * untouched fields carry over. */
  setProfileField(key, value) {
    this.setState((s) => ({ profileDraft: { ...(s.profileDraft || s.profile || {}), [key]: value } }));
  }

  /* Persist the draft and leave the form. Stamped with updatedAt so a
   * cross-device merge keeps the most recent edit (see profile.mergeProfile). */
  submitProfile() {
    const draft = this.state.profileDraft || this.state.profile || {};
    // Fall back to the Google account's display name if the member never touched
    // the pre-filled name field.
    const googleName = (this.state.auth.user && this.state.auth.user.name) || "";
    // Class is typed freely: keep a plain year as a number so members of the same
    // class group together, but preserve anything else as entered.
    const gradClass = String(draft.gradClass || "").trim();
    const next = {
      name: String(draft.name != null ? draft.name : googleName).trim(),
      ministryGroup: String(draft.ministryGroup || "").trim(),
      gender: draft.gender,
      gradClass: /^\d+$/.test(gradClass) ? Number(gradClass) : gradClass,
      dueTopX: draft.dueTopX !== undefined ? Number(draft.dueTopX) : DEFAULT_DUE_TOP_X,
      dueFreshness: draft.dueFreshness !== undefined ? Number(draft.dueFreshness) : DEFAULT_DUE_FRESHNESS,
      updatedAt: Date.now(),
    };
    if (!isProfileComplete(next)) return;
    this.saveProfile(next);
    this.setState({ editingProfile: false, profileDraft: null });
  }

  /* Pull every registered member and shape them into leaderboard rows. Self is
   * dropped here and re-added from local state by the view-model, so "You"
   * always reflects the newest, not-yet-synced progress. Members without a
   * finished profile are skipped. Resolves to an empty roster when Firebase is
   * unconfigured or unreachable, leaving the board as just "You". */
  async loadRoster() {
    let rows;
    try {
      rows = await fetchRoster();
    } catch {
      return;
    }
    const myUid = this.state.auth.user && this.state.auth.user.uid;
    this.setState({
      peers: rows
        .filter((r) => r.uid !== myUid && isProfileComplete(r.profile))
        .map((r) => ({
          name: r.profile.name || r.name || r.email || "Member",
          count: committedCount(r.progress),
          freshnessScore: freshnessSum(r.progress),
          streak: streakOf(r.log),
          ministryGroup: r.profile.ministryGroup,
          gender: r.profile.gender,
          gradClass: r.profile.gradClass,
        })),
    });
  }

  /* ── progress ───────────────────────────────────────────────────────────── */

  /* What the card in front of us is being marked on: the activity, how it is
   * set up, and how the member has treated it. `score` comes from the
   * view-model, which is where the attempt is graded for display. */
  reviewContext(score) {
    return {
      mode: this.state.mode,
      blankLevel: this.state.blankLevel,
      scrambleLevel: this.state.scrambleLevel,
      firstLetters: this.state.typeFirstLetter,
      score,
      peeks: this.state.peeks,
    };
  }

  /* Record a completed card. There is still no self-report: the activity, the
   * mark the attempt earned, and the peeks it took decide both the stability
   * gained (srs.nextStability) and the freshness the verse is left at
   * (srs.reviewAward). The result is kept for the session so the card can show
   * what it was worth, and so a verse walked back to is not marked twice.
   *
   * This is also the one place a verse becomes committed, and only by the one
   * thing that commits it: writing the passage out in full from memory
   * (srs.commitsVerse). Nothing demotes a verse — a bad morning costs freshness,
   * never the status the member has already earned. */
  record(id, score) {
    const now = Date.now();
    const prev = migrate(this.state.progress[id]);
    const ctx = this.reviewContext(score);
    const stability = nextStability(prev, ctx, now);
    const award = reviewAward(ctx);
    const progress = { ...this.state.progress };
    const cur = progress[id] || { hits: 0, status: "new" };
    const committed = prev.status === "memorized" || commitsVerse(ctx);
    progress[id] = {
      ...cur,
      hits: (cur.hits || 0) + 1,
      // `last` is the point on the new curve the attempt earned, so it is not
      // the moment of writing — hence updatedAt (see storage.mergeProgress).
      last: reviewedLast(stability, award, now),
      updatedAt: now,
      stability,
      status: committed ? "memorized" : "learning",
    };
    const log = { ...this.state.log };
    const today = dayKey(new Date());
    log[today] = (log[today] || 0) + 1;
    this.save(progress, log);
    this.setState((s) => ({
      sessionCount: s.sessionCount + 1,
      results: {
        ...s.results,
        [id]: {
          id,
          mode: s.mode,
          score,
          peeks: s.peeks,
          before: freshness(prev, now),
          after: freshness(progress[id], now),
          // Whether this card is what committed the verse — the moment a learn
          // session is working towards, so the summary can mark it.
          committed: prev.status !== "memorized" && committed,
        },
      },
    }));
  }

  /* ── review session ─────────────────────────────────────────────────────── */

  goto(view) {
    this.setState({ view });
    if (view === "leaderboard") this.loadRoster();
  }

  /* Start a session over `ids`, or over the stalest SESSION_SIZE passages.
   *
   * `kind` says which sitting this is (review or learn). It only changes how the
   * session frames itself and what finishing a card can earn — the cards, the
   * activities, and the walk through the queue are identical. */
  startSession(mode, ids, kind = REVIEW) {
    const queue =
      ids && ids.length
        ? ids
        : dueOrder(this.state.passages, this.state.progress)
            .slice(0, SESSION_SIZE)
            .map((p) => p.id);
    this.setState({
      view: "review",
      sessionKind: kind,
      mode: mode || this.state.mode || DEFAULT_MODE,
      queue,
      qi: 0,
      sessionCount: 0,
      results: {},
      reviewLeaveAsk: false,
    });
    this.resetCard();
  }

  /* Clear everything that belongs to the card being left — including what it
   * cost, since peeks and wrong tries are per attempt. What a submitted card
   * was worth lives in `results`, keyed by passage, and survives. */
  resetCard() {
    this.setState({
      revealed: false,
      flipLetters: false,
      showHelp: false,
      peeks: 0,
      answers: {},
      blanksChecked: false,
      typed: "",
      typeGraded: false,
      scrambleOrder: [],
      scrambleWrong: -1,
      scrambleMisses: 0,
      reviewMoveAsk: null,
    });
  }

  /* Hand the card in. The view-model grades the attempt for display, so it is
   * what hands the mark in here. A verse is only marked once a session. */
  submitCard(score) {
    const id = this.state.queue[this.state.qi];
    if (id == null || this.state.results[id]) return;
    this.record(id, score);
    // Both panels show their marked state once the paper is in.
    this.setState({ blanksChecked: true, typeGraded: true });
  }

  /* Whether the card in front of us has already been handed in — after which
   * the mark is final, so the exercise stops taking answers. */
  cardSubmitted() {
    const id = this.state.queue[this.state.qi];
    return id != null && !!this.state.results[id];
  }

  /* Walk one card forward or back, ending the session past the queue's end.
   *
   * A card that was never submitted records nothing and its answers are not
   * kept, so the member is asked first — in either direction, since leaving a
   * card unmarked costs the same whichever way they walk off it. The flashcard
   * is the exception: nothing marks it, so it is recorded on the way out (an
   * unmarked activity earns the plain "I reviewed it" award). */
  moveCard(step, { confirmed = false } = {}) {
    const qi = this.state.qi + step;
    if (qi < 0) return; // the first card is as far back as a session goes
    const id = this.state.queue[this.state.qi];
    const unmarked = id != null && !this.state.results[id];
    if (unmarked && this.state.mode === "flip") this.record(id);
    else if (unmarked && !confirmed) return this.setState({ reviewMoveAsk: step < 0 ? "prev" : "next" });
    this.goCard(qi);
  }

  /* Walk to a card in the queue, ending the session past its end. */
  goCard(qi) {
    this.setState((s) => ({ qi, view: qi >= s.queue.length ? "done" : "review" }));
    this.resetCard();
  }

  /* Leaving part-way through keeps every card already submitted — only the rest
   * of the queue is dropped — which is still worth confirming. */
  leaveReview() {
    this.setState({ view: "board", reviewLeaveAsk: false, reviewMoveAsk: null });
  }

  placeChunk(index) {
    if (this.cardSubmitted()) return;
    const placed = this.state.scrambleOrder;
    if (index === placed.length) this.setState({ scrambleOrder: [...placed, index], scrambleWrong: -1 });
    // A wrong chunk is refused rather than accepted, and counted: it is what
    // separates a recalled ordering from a guessed one (review.scrambleScore).
    else this.setState((s) => ({ scrambleWrong: index, scrambleMisses: s.scrambleMisses + 1 }));
  }

  /* ── test mode ──────────────────────────────────────────────────────────── */

  /* The setup survives the session, so a member who tests the same way each week
   * finds the form as they left it. Device-local, like the exercise levels. */
  setExamSetup(patch) {
    const examSetup = normalizeSetup({ ...this.state.examSetup, ...patch });
    storage.saveExamSetup(examSetup);
    this.setState({ examSetup });
  }

  toggleExamActivity(key) {
    const on = this.state.examSetup.activities.includes(key);
    const activities = on
      ? this.state.examSetup.activities.filter((k) => k !== key)
      : [...this.state.examSetup.activities, key];
    // Turning the last activity off would leave nothing to ask, so it stays on.
    if (!activities.length) return;
    this.setExamSetup({ activities });
  }

  /* ── review + learn setup ───────────────────────────────────────────────── */

  setReviewSetup(patch) {
    const reviewSetup = { ...this.state.reviewSetup, ...patch };
    storage.saveReviewSetup(reviewSetup);
    this.setState({ reviewSetup });
  }

  setLearnSetup(patch) {
    const learnSetup = { ...this.state.learnSetup, ...patch };
    storage.saveLearnSetup(learnSetup);
    this.setState({ learnSetup });
  }

  /* Build the paper once, here, and keep it in state: the generator is seeded,
   * so re-running it every render would be stable but pointless, and re-seeding
   * it would rewrite the question under the member. */
  startExam() {
    const exam = buildExam({
      passages: this.state.passages,
      progress: this.state.progress,
      setup: this.state.examSetup,
      seed: Date.now() >>> 0,
    });
    if (!exam.questions.length) return;
    this.setState({
      view: "test",
      exam,
      examIndex: 0,
      examAnswers: {},
      examPick: null,
      examLeaveAsk: false,
      examResult: null,
    });
  }

  answerExam(value) {
    this.setState((s) => ({ examAnswers: { ...s.examAnswers, [s.examIndex]: value } }));
  }

  /* Matching takes two clicks: a verse, then the reference to file it under.
   * Clicking a verse that is already filed takes the pairing back. */
  pickMatchVerse(verseKey) {
    const answer = this.state.examAnswers[this.state.examIndex] || {};
    if (answer[verseKey]) {
      const next = { ...answer };
      delete next[verseKey];
      this.answerExam(next);
      this.setState({ examPick: verseKey });
      return;
    }
    this.setState((s) => ({ examPick: s.examPick === verseKey ? null : verseKey }));
  }

  pickMatchRef(refKey) {
    const verseKey = this.state.examPick;
    if (!verseKey) return;
    const answer = { ...(this.state.examAnswers[this.state.examIndex] || {}) };
    // A reference belongs to one verse at a time, so filing it again moves it.
    for (const k of Object.keys(answer)) if (answer[k] === refKey) delete answer[k];
    answer[verseKey] = refKey;
    this.answerExam(answer);
    this.setState({ examPick: null });
  }

  /* Questions can be walked in both directions until the paper is handed in —
   * answers are held by question index, so going back shows what was left
   * there and lets it be changed. */
  nextQuestion() {
    const last = this.state.examIndex >= this.state.exam.questions.length - 1;
    if (last) return this.finishExam();
    this.setState((s) => ({ examIndex: s.examIndex + 1, examPick: null }));
  }

  prevQuestion() {
    this.setState((s) => ({ examIndex: Math.max(0, s.examIndex - 1), examPick: null }));
  }

  /* Mark the paper, fold the results into progress, and show the summary. This
   * is the only place a verse's freshness can go down: a poor score shortens
   * the interval and backdates the verse (see srs.testedLast). */
  finishExam() {
    const scored = scoreExam(this.state.exam.questions, this.state.examAnswers);
    const { progress, rows } = applyExam({ progress: this.state.progress, results: scored.results });
    const log = { ...this.state.log };
    const today = dayKey(new Date());
    log[today] = (log[today] || 0) + rows.length;
    this.save(progress, log);
    this.setState({ view: "test-done", examResult: { ...scored, rows } });
  }

  /* Leaving part-way through is a walk-out, not a fail: nothing is marked and
   * no verse moves — which is worth confirming, since a half-finished paper is
   * thrown away rather than kept. */
  leaveExam() {
    this.setState({ view: "board", exam: null, examPick: null, examLeaveAsk: false });
  }

  /* ── the action table handed to the view-model ──────────────────────────── */

  buildActions() {
    const set = (patch) => this.setState(patch);
    return {
      // navigation
      goto: (view) => this.goto(view),
      startSession: (mode, ids, kind) => this.startSession(mode, ids, kind),

      // account + profile
      signIn: () => this.signIn(),
      signOut: () => signOutUser().catch(() => {}),
      editProfile: () => set({ editingProfile: true, profileDraft: { ...this.state.profile } }),
      cancelEditProfile: () => set({ editingProfile: false, profileDraft: null }),
      submitProfile: () => this.submitProfile(),
      setProfileField: (key, value) => this.setProfileField(key, value),
      setMinistryOpen: (open) => {
        clearTimeout(this.ministryTimer);
        set({ ministryOpen: open });
      },
      closeMinistryList: () => {
        clearTimeout(this.ministryTimer);
        this.ministryTimer = setTimeout(() => set({ ministryOpen: false }), MINISTRY_CLOSE_MS);
      },

      // passage list
      setSearch: (search) => set({ search }),
      setFilter: (filter) => set({ filter }),

      // review — shared
      setMode: (mode) => {
        set({ mode });
        this.resetCard();
      },
      // Peeking is counted, not prevented: each press costs the card freshness
      // (see srs.reviewAward), so only the press is worth counting.
      setPeek: (showHelp) => this.setState((s) => ({ showHelp, peeks: showHelp ? s.peeks + 1 : s.peeks })),
      submitCard: (score) => this.submitCard(score),
      nextCard: () => this.moveCard(1),
      prevCard: () => this.moveCard(-1),
      cancelMoveCard: () => set({ reviewMoveAsk: null }),
      confirmMoveCard: () => this.moveCard(this.state.reviewMoveAsk === "prev" ? -1 : 1, { confirmed: true }),
      askLeaveReview: () => set({ reviewLeaveAsk: true }),
      cancelLeaveReview: () => set({ reviewLeaveAsk: false }),
      leaveReview: () => this.leaveReview(),

      // review — flashcard
      setRevealed: (revealed) => set({ revealed }),
      toggleFlipLetters: () => this.setState((s) => ({ flipLetters: !s.flipLetters })),

      // review — fill the blanks
      setAnswer: (index, value, focusIndex) => {
        if (this.cardSubmitted()) return;
        this.setState(
          (s) => ({ answers: { ...s.answers, [index]: value } }),
          () => focusBlank(focusIndex),
        );
      },
      focusBlank,
      setBlankLevel: (level) => {
        storage.saveBlankLevel(level);
        set({ blankLevel: level, answers: {}, blanksChecked: false });
      },
      toggleBlankHint: () => {
        const on = !this.state.blankHint;
        storage.saveBlankHint(on);
        set({ blankHint: on });
      },

      // review — write it out
      setTyped: (typed) => {
        if (!this.cardSubmitted()) set({ typed });
      },
      toggleTypeFirstLetter: () => {
        // Switching this changes how the input is graded, so drop any in-progress
        // answer and fall back to the ungraded state.
        const on = !this.state.typeFirstLetter;
        storage.saveTypeFirstLetter(on);
        set({ typeFirstLetter: on, typed: "", typeGraded: false });
      },

      // review — order the phrases
      placeChunk: (index) => this.placeChunk(index),
      // Starting over clears the board but not the wrong tries — they are what
      // the mark is for, and wiping them would make the penalty opt-out.
      resetScramble: () => {
        if (!this.cardSubmitted()) set({ scrambleOrder: [], scrambleWrong: -1 });
      },
      setScrambleLevel: (level) => {
        storage.saveScrambleLevel(level);
        set({ scrambleLevel: level, scrambleOrder: [], scrambleWrong: -1, scrambleMisses: 0 });
      },

      // test mode
      setExamSetup: (patch) => this.setExamSetup(patch),
      toggleExamActivity: (key) => this.toggleExamActivity(key),
      startExam: () => this.startExam(),
      answerExam: (value) => this.answerExam(value),
      pickMatchVerse: (key) => this.pickMatchVerse(key),
      pickMatchRef: (key) => this.pickMatchRef(key),
      nextQuestion: () => this.nextQuestion(),
      prevQuestion: () => this.prevQuestion(),
      askLeaveExam: () => set({ examLeaveAsk: true }),
      cancelLeaveExam: () => set({ examLeaveAsk: false }),
      leaveExam: () => this.leaveExam(),

      // review + learn setup
      setReviewSetup: (patch) => this.setReviewSetup(patch),
      startReviewSession: (ids) => this.startSession(null, ids, REVIEW),
      setLearnSetup: (patch) => this.setLearnSetup(patch),
      startLearnSession: (ids) => this.startSession(null, ids, LEARN),

      // leaderboard
      setLeaderFilter: (key, value) => this.setState((s) => ({ leaderFilter: { ...s.leaderFilter, [key]: value } })),
    };
  }

  render() {
    const { loaded, auth, profile, editingProfile } = this.state;
    if (!loaded) {
      return html`<div style=${sx(`padding:80px 36px;font-family:var(--font-body);color:${muted(55)}`)}>
        Loading the board…
      </div>`;
    }

    // Sign-in is required before the app. "disabled" means Firebase is
    // unreachable — fall through to local-only rather than lock members out.
    if (auth.status !== "signed-in" && auth.status !== "disabled") {
      return authGateView(
        authGateVals({ auth, groupName: this.groupName(), motto: this.motto(), actions: this.actions }),
      );
    }

    // Members give a name, ministry group, gender, and class before the app, so
    // their stats can be grouped. The same form reopens for later edits.
    const needsProfile = !isProfileComplete(profile);
    if (needsProfile || editingProfile) {
      return profileFormView(
        profileFormVals({
          state: this.state,
          groupName: this.groupName(),
          isSetup: needsProfile,
          actions: this.actions,
        }),
      );
    }

    const v = buildViewModel({
      state: this.state,
      groupName: this.groupName(),
      motto: this.motto(),
      deadline: this.deadline(),
      actions: this.actions,
    });
    return html`<div
      style=${sx("min-height:100vh;background:var(--color-bg);color:var(--color-text);font-family:var(--font-body)")}
    >
      ${headerView(v)} ${v.isBoard && boardView(v)} ${v.isList && listView(v)} ${v.isReviewSetup && reviewSetupView(v)}
      ${v.isLearnSetup && learnSetupView(v)} ${v.isReview && reviewView(v)} ${v.isDone && doneView(v)}
      ${v.isLeader && leaderboardView(v)} ${v.isExamSetup && examSetupView(v)} ${v.isExam && examView(v)}
      ${v.isExamDone && examDoneView(v)} ${footerView(v)}
    </div>`;
  }
}
