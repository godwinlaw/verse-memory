/* Verse Mastery — root component.
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

import { copy } from "./copy.js";
import { React, html, sx } from "./dom.js";
import { dayKey } from "./text.js";
import { commitsVerse, freshness, migrate, nextStep, reviewAward, reviewedLast, stabilityFor } from "./srs.js";
import { BLANK_LEVELS, SCRAMBLE_LEVELS } from "./blanks.js";
import { transcribe } from "./voice.js";
import { createRecognizer, voiceSupported } from "./recognizer.js";
import { storage, mergeProgress, mergeLog } from "./storage.js";
import { committedCount, dueOrder, freshnessSum, streakOf } from "./progress.js";
import { DEFAULT_MODE, LEARN, LEARN_SIZE, REVIEW, SESSION_SIZE } from "./review.js";
import { applyExam, buildExam, DEFAULT_SETUP, normalizeSetup, scoreExam } from "./exam.js";
import {
  DEFAULT_COMMIT_THRESHOLD,
  DEFAULT_DUE_FRESHNESS,
  DEFAULT_DUE_TOP_X,
  DEFAULT_DIFFICULTY,
  isProfileComplete,
  mergeProfile,
  reviewSettings,
} from "./profile.js";
import { appConfig } from "./config.js";
import { detectMobile } from "./device.js";
import { initAuth, signIn, signOutUser, fetchRoster, retrySync, onPushError } from "./firebase.js";
import { passages } from "../data/passages.js";
import {
  buildViewModel,
  authGateVals,
  mobileGateVals,
  profileFormVals,
  splashVals,
  syncGateVals,
  welcomeVals,
} from "./viewmodel/index.js";
import { RECALL_INPUT_ID } from "./viewmodel/review.js";
import { mobileGateView } from "./views/mobile-gate.js";
import { splashView } from "./views/splash.js";
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
import { guideView } from "./views/guide.js";
import { authGateView } from "./views/auth-gate.js";
import { profileFormView } from "./views/profile-form.js";
import { syncBannerView, syncGateView } from "./views/sync-gate.js";
import { welcomeView } from "./views/welcome.js";
import { footerView } from "./views/footer.js";

/* Grace period between the ministry-group input losing focus and its dropdown
 * closing, so a mousedown on an option still registers. */
const MINISTRY_CLOSE_MS = 120;

/* How long to wait for Firebase before sending the member to the sign-in screen
 * anyway. Auth normally answers in a moment; if the SDK never loads (offline, a
 * blocked CDN) nothing else would ever arrive to move the splash on. A late
 * answer still lands — the observer in componentDidMount keeps running. */
const SPLASH_MAX_MS = 8000;

/* The shortest time the opening splash stays up. Local data loads in a blink and
 * a restored Firebase session usually answers in well under a second, so without
 * a floor the mark would be a flicker rather than a screen. The figure is
 * `appConfig.splashMinMs` — retune it there, or per deploy in config.js — and is
 * clamped under SPLASH_MAX_MS, since a floor above the ceiling would hold the
 * member on the splash past the point the app had given up waiting. */
const splashMinMs = () => {
  const configured = Number(appConfig.splashMinMs);
  return Number.isFinite(configured) ? Math.min(Math.max(configured, 0), SPLASH_MAX_MS) : 0;
};

/* Move the caret to another blank. Lives here rather than in the view-model
 * because it reaches for the DOM. A null index means "nowhere to go". */
function focusBlank(index) {
  if (index == null) return;
  const el = document.getElementById("blank-" + index);
  if (el) el.focus();
}

/* Follow the transcript down as recitation adds to it. Reaches for the DOM, so
 * it lives beside focusBlank rather than in a view-model. */
function scrollRecallToEnd() {
  const el = document.getElementById(RECALL_INPUT_ID);
  if (el) el.scrollTop = el.scrollHeight;
}

/* A session opens at the top of the page, so the mode switch — all four
 * activities — is on screen from the first card rather than scrolled past
 * from wherever the board or setup screen left off. */
function scrollToTop() {
  if (typeof window.scrollTo === "function") window.scrollTo(0, 0);
}

/* Send focus back to the recall box after a control beside it is pressed. The
 * voice switch and the first-letter toggle are both buttons, so clicking
 * either steals focus from the box the member was just writing or reciting
 * into — and the point of a box that stays live across both is that they
 * should not have to click back into it themselves. */
function focusRecall() {
  const el = document.getElementById(RECALL_INPUT_ID);
  if (el) el.focus();
}

/* The microphone at rest. Reset between cards, since an attempt's transcript
 * belongs to that attempt. `tail` is where the phrase currently being heard
 * begins in `typed` (see voice.js); at rest there is no such phrase. */
const quietVoice = () => ({ status: "off", error: null, tail: 0 });

function initialState() {
  return {
    // Settled once, at startup: what the app is being read on. A phone or a
    // tablet is turned away before anything else happens (see device.js), and
    // the answer cannot change under a member mid-session, so nothing ever
    // asks again.
    isMobile: detectMobile(),
    loaded: false,
    // The splash stands in front of everything until local data has loaded and
    // Firebase has said whether there is a session to restore — only then does
    // the app know whether the member is going to their board or to sign-in.
    // `splashHold` is the minimum it stays up (SPLASH_MIN_MS), so the boot reads
    // as a screen rather than a flash.
    splashHold: true,
    passages: [],
    // board | list | review-setup | learn-setup | review | done | leaderboard
    // | test-setup | test | test-done | guide
    view: "board",
    progress: {}, // { [passageId]: { hits, status, last, step, stability } }
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
    // Reciting the passage aloud into that same box. `supported` is settled
    // once at startup, so no view-model ever has to ask the window a question;
    // the rest is the running microphone. See voice.js for where the words go.
    voice: { supported: false, ...quietVoice() },
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
    // Passage ids ticked on the list, so a sitting can be hand-picked rather
    // than drawn from a pool. Kept as an array, in the order they were ticked;
    // the view-model is what asks whether a given row is in it.
    selection: [],
    // The row a shift-click measures its range from: the last row ticked on its
    // own. Null when there is nothing to extend from, so a shift-click is then
    // just a tick (see viewmodel/list.js).
    selectAnchor: null,

    // account, profile, leaderboard
    auth: { status: "loading" }, // loading | signing-in | signed-out | denied | signed-in | disabled
    /* How the member's cloud record is doing, kept apart from `auth` because
     * being signed in and having your record in hand are different things — and
     * conflating them is what asked a returning member to sign up again on every
     * device. idle (nothing to sync) | pulling | synced | error. */
    sync: { status: "idle" },
    syncRetrying: false, // the retry button's own busy state
    profile: {}, // { name, ministryGroup, gender, gradClass, dueTopX, dueFreshness, commitThreshold, updatedAt }
    profileDraft: null, // in-progress edits for the profile form
    editingProfile: false, // reopen the form for an already-complete profile
    resetAsk: false, // "reset all progress?" confirmation is open on that form
    welcomePrompt: false, // shown once, right after the sign-up profile form completes
    ministryOpen: false, // ministry-group combobox dropdown visibility
    peers: null, // leaderboard roster, minus self
    leaderFilter: { group: "All", gender: "All", gradClass: "All" },

    // the two setup screens, as last left (device-local, like the exercise
    // levels): extra review once caught up, and how much to take on learning
    reviewSetup: { manualSize: 10, manualFreshness: 90 },
    learnSetup: { size: LEARN_SIZE },
    // "How it works", on those same two screens: hidden by default, collapsible
    // once opened (device-local, like the setups above).
    explainerOpen: false,

    // the guide: where the freshness demonstration's slider sits. Not
    // persisted — a slider position is worth nothing on the next visit,
    // unlike the setups above.
    guideDays: 6,
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
    const profile = storage.loadProfile();
    const defaultDiff = profile.defaultDifficulty != null ? Number(profile.defaultDifficulty) : DEFAULT_DIFFICULTY;
    this.setState({
      passages,
      progress: storage.loadProgress(),
      log: storage.loadLog(),
      profile,
      blankLevel: storage.loadBlankLevel(defaultDiff, BLANK_LEVELS.length),
      blankHint: storage.loadBlankHint(this.state.blankHint),
      typeFirstLetter: storage.loadTypeFirstLetter(this.state.typeFirstLetter),
      // Asked once, here, because it is a question about the browser.
      voice: { ...this.state.voice, supported: voiceSupported() },
      scrambleLevel: storage.loadScrambleLevel(defaultDiff, SCRAMBLE_LEVELS.length),
      examSetup: normalizeSetup(storage.loadExamSetup()),
      reviewSetup: storage.loadReviewSetup(this.state.reviewSetup),
      learnSetup: storage.loadLearnSetup(this.state.learnSetup),
      explainerOpen: storage.loadExplainerOpen(this.state.explainerOpen),
      loaded: true,
    });
    // The two ends of the splash: the least it stays up for, and the most it
    // will wait on Firebase before sending the member to sign in anyway. Set
    // before initAuth, since an unconfigured Firebase answers immediately.
    this.splashTimer = setTimeout(() => this.setState({ splashHold: false }), splashMinMs());
    this.authWaitTimer = setTimeout(
      () => this.setState((s) => (s.auth.status === "loading" ? { auth: { status: "signed-out" } } : null)),
      SPLASH_MAX_MS,
    );
    // Auth + cloud sync. Access is gated to Acts 2 Network Google accounts; on a
    // valid sign-in, remote progress is pulled and reconciled with local, and the
    // leaderboard roster is loaded. If Firebase is unreachable the status becomes
    // "disabled" and the app runs local-only rather than locking members out.
    this.startAuth();
    // A write the member cannot see fail is a write they will assume happened.
    onPushError((sync) => this.setState({ sync }));
  }

  /* Begin (or begin again) the account half of the boot. Separated from
   * componentDidMount because it is retryable: an SDK that could not be fetched
   * from the CDN is a network problem, not a verdict on the member, and the one
   * thing they can usefully do about it is ask the app to try again.
   * firebase.js only registers its observer once, however often this runs. */
  startAuth() {
    return initAuth({
      onChange: (auth) => {
        // Whatever it says, Firebase has answered — the splash can stop waiting.
        clearTimeout(this.authWaitTimer);
        this.setState({ auth });
        if (auth.status === "signed-in") this.loadRoster();
      },
      onRemoteData: (remote) => this.hydrateRemote(remote),
      onSyncChange: (sync) => this.setState({ sync }),
    });
  }

  componentWillUnmount() {
    clearTimeout(this.ministryTimer);
    clearTimeout(this.splashTimer);
    clearTimeout(this.authWaitTimer);
    this.stopListening();
  }

  /* ── reciting aloud ─────────────────────────────────────────────────────── */

  /* Recitation is a second way to fill the recall box, not a second exercise:
   * what a member says lands in `state.typed`, where grading.js finds it and
   * srs.js marks it exactly as it marks something typed. So the only state
   * unique to it is the microphone's — whether it is on, why it stopped, and
   * where the phrase still being heard begins (see voice.js).
   *
   * The recognizer itself is not state. It is a live object holding a
   * microphone, so it hangs off the instance and is torn down rather than
   * re-rendered — and it is never started by anything but the member. */

  setVoice(patch) {
    this.setState((s) => ({ voice: { ...s.voice, ...patch } }));
  }

  /* Let the microphone go, without touching state — so the callers that are
   * already writing a state patch of their own can do both in one pass. */
  stopListening() {
    if (this.recognizer) this.recognizer.stop();
    this.recognizer = null;
  }

  startVoice() {
    this.stopListening();
    const recognizer = createRecognizer({
      onStatus: (status) => this.setVoice({ status }),
      onText: (text, settled) => this.hearRecitation(text, settled),
      onError: (error) => {
        this.stopListening();
        this.setVoice({ status: "off", error });
      },
    });
    if (!recognizer) return this.setVoice({ status: "off", error: "failed" });
    this.recognizer = recognizer;
    this.setVoice({ status: "starting", error: null });
    recognizer.start();
  }

  stopVoice() {
    this.stopListening();
    // Whatever was still provisional when they stopped is theirs to keep — it
    // is the last thing they said, and it is already in the box.
    this.setState((s) => ({ voice: { ...s.voice, status: "off", tail: s.typed.length } }));
  }

  toggleVoice() {
    if (this.state.voice.status === "off") this.startVoice();
    else this.stopVoice();
    // The box itself never unmounts across this switch, so focus can return
    // to it right away rather than waiting on a render that isn't coming.
    focusRecall();
  }

  /* A phrase from the engine, settled or still being revised (see voice.js —
   * an unsettled one replaces the last version rather than piling up after it).
   *
   * Guarded rather than trusted: a phrase can arrive after the member has moved
   * on, submitted, or switched the first-letter scaffold on, and none of those
   * should take dictation. */
  hearRecitation(text, settled) {
    if (this.state.mode !== "type" || this.state.typeFirstLetter || this.cardSubmitted()) return;
    this.setState(
      (s) => {
        const next = transcribe(s.typed, s.voice.tail, text, settled);
        return { typed: next.typed, voice: { ...s.voice, tail: next.tail } };
      },
      () => scrollRecallToEnd(),
    );
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
   * then persist the result (which pushes the merge back to the cloud).
   *
   * The local side is read from storage rather than from `this.state`, because
   * the pull can land before componentDidMount's setState has flushed — and
   * state, at that moment, is still the empty initial map. Merging against it
   * would drop this device's records, and the queued setState would then
   * overwrite the merge with the local copy alone. Storage is the source of
   * truth (see storage.js), so asking it is both correct and race-free. */
  hydrateRemote(remote) {
    this.save(mergeProgress(storage.loadProgress(), remote.progress), mergeLog(storage.loadLog(), remote.log));
    this.saveProfile(mergeProfile(storage.loadProfile(), remote.profile));
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
   * cross-device merge keeps the most recent edit (see profile.mergeProfile).
   * A member completing the form for the first time (the profile was
   * incomplete going in) is shown the welcome prompt on the way out; reopening
   * an already-complete profile to edit it never triggers it again. */
  submitProfile() {
    const isSignUp = !isProfileComplete(this.state.profile);
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
      defaultDifficulty: draft.defaultDifficulty !== undefined ? Number(draft.defaultDifficulty) : DEFAULT_DIFFICULTY,
      commitThreshold: draft.commitThreshold !== undefined ? Number(draft.commitThreshold) : DEFAULT_COMMIT_THRESHOLD,
      updatedAt: Date.now(),
    };
    if (!isProfileComplete(next)) return;
    this.saveProfile(next);
    this.setState({ editingProfile: false, profileDraft: null, welcomePrompt: isSignUp });
  }

  /* Start the set over: every passage back to Not started.
   *
   * What goes is the record of what has been memorized — the progress map and
   * the daily log — and nothing else. The profile, the settings sitting on the
   * same screen, and the device-local exercise preferences are not that record,
   * so they stay. The wipe goes to the cloud copy as a replacement rather than
   * a merge (storage.clearProgressAndLog), because a wipe that only reached
   * this device would be undone by the next sign-in's merge.
   *
   * Only reachable from the settings form, so no session is running. The ticks
   * on the passage list go too: they were picked against a record that no
   * longer exists. */
  resetProgress() {
    storage.clearProgressAndLog();
    this.setState({ progress: {}, log: {}, selection: [], selectAnchor: null, resetAsk: false });
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
          name: r.profile.name || r.name || r.email || copy.app.anonymousMember,
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
      sessionKind: this.state.sessionKind,
      score,
      peeks: this.state.peeks,
    };
  }

  /* Record a completed card. There is still no self-report: the activity, the
   * mark the attempt earned, and the peeks it took decide one figure
   * (srs.reviewAward), and that figure does both jobs — it moves the verse
   * along the interval ladder (srs.nextStep) and it is the freshness the verse
   * is dated to. The result is kept for the session so the card can show what it
   * was worth, and so a verse walked back to is not marked twice.
   *
   * This is also the one place a verse becomes committed, and only by the one
   * thing that commits it: writing the passage out in full from memory
   * (srs.commitsVerse). Nothing demotes a verse — a bad morning costs freshness
   * and a rung, never the status the member has already earned. */
  record(id, score) {
    const now = Date.now();
    const prev = migrate(this.state.progress[id]);
    const ctx = this.reviewContext(score);
    const award = reviewAward(ctx);
    const step = nextStep(prev, award, ctx.mode);
    const stability = stabilityFor(step);
    const progress = { ...this.state.progress };
    const cur = progress[id] || { hits: 0, status: "new" };
    const { commitThreshold } = reviewSettings(this.state.profile);
    const committed = prev.status === "memorized" || commitsVerse(ctx, commitThreshold / 100);
    progress[id] = {
      ...cur,
      hits: (cur.hits || 0) + 1,
      // `last` is the point on the new curve the attempt earned, so it is not
      // the moment of writing — hence updatedAt (see storage.mergeProgress).
      last: reviewedLast(stability, award, now),
      updatedAt: now,
      step,
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
    scrollToTop();
  }

  /* Clear everything that belongs to the card being left — including what it
   * cost, since peeks and wrong tries are per attempt. What a submitted card
   * was worth lives in `results`, keyed by passage, and survives. */
  resetCard() {
    // The microphone belongs to the attempt, not to the session: leaving it hot
    // across a card change would have the next passage recorded against the one
    // the member has walked away from.
    this.stopListening();
    this.setState((s) => ({
      revealed: false,
      flipLetters: false,
      showHelp: false,
      peeks: 0,
      answers: {},
      blanksChecked: false,
      typed: "",
      typeGraded: false,
      voice: { ...s.voice, ...quietVoice() },
      scrambleOrder: [],
      scrambleWrong: -1,
      scrambleMisses: 0,
      reviewMoveAsk: null,
    }));
  }

  /* Hand the card in. The view-model grades the attempt for display, so it is
   * what hands the mark in here. A verse is only marked once a session. */
  submitCard(score) {
    const id = this.state.queue[this.state.qi];
    if (id == null || this.state.results[id]) return;
    this.record(id, score);
    // The paper is in, so nothing more can be said into it.
    this.stopListening();
    // Both panels show their marked state once the paper is in.
    this.setState((s) => ({
      blanksChecked: true,
      typeGraded: true,
      voice: { ...s.voice, status: "off" },
    }));
  }

  /* Try the same card again after a learn attempt did not commit the verse.
   * Clears the mark so Submit is live again, and gives the card the same clean
   * slate resetCard gives a fresh one — without moving off it, so the second
   * attempt is still this passage. record() reads whatever progress the first
   * attempt already left, so nothing about it is undone; a second clean recall
   * can still commit the verse. */
  retryCard() {
    const id = this.state.queue[this.state.qi];
    if (id == null) return;
    this.setState((s) => {
      const results = { ...s.results };
      delete results[id];
      return { results };
    });
    this.resetCard();
  }

  /* Whether the card in front of us has already been handed in — after which it
   * cannot be marked again this session. */
  cardSubmitted() {
    const id = this.state.queue[this.state.qi];
    return id != null && !!this.state.results[id];
  }

  /* Whether the mark on this card was earned in the exercise now on screen — in
   * which case that exercise is showing its marked paper, and must stop taking
   * answers so the paper cannot change under the mark.
   *
   * This is deliberately narrower than cardSubmitted(): the answers live in a
   * slot per activity, so switching exercise on a handed-in card puts an empty,
   * unmarked exercise in front of the member. Refusing that one's answers too is
   * what left the card dead to every click. */
  activityMarked() {
    const id = this.state.queue[this.state.qi];
    const result = id != null ? this.state.results[id] : null;
    return !!result && result.mode === this.state.mode;
  }

  /* Whether this card can still be handed in again: the mark it got left the
   * verse uncommitted, so what the sitting is for is still open. A review
   * session only ever deals committed verses, so this is only ever a learn card
   * that fell short — the same case "Try again" is offered for (see
   * viewmodel/review.js, learnRetryShown). */
  cardOpenAgain() {
    const id = this.state.queue[this.state.qi];
    if (id == null || !this.state.results[id]) return false;
    return (this.state.progress[id] || {}).status !== "memorized";
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
    this.stopListening();
    this.setState((s) => ({
      view: "board",
      reviewLeaveAsk: false,
      reviewMoveAsk: null,
      voice: { ...s.voice, ...quietVoice() },
    }));
  }

  placeChunk(index) {
    if (this.activityMarked()) return;
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
      /* Try the cloud again, for a member sitting behind the sync gate or under
       * its banner. Which half to retry depends on how far the boot got: a
       * member who is signed in has a document to re-read, while one whose SDK
       * never arrived has to start the whole account half over.
       * `syncRetrying` is only the button's own busy state. */
      retrySync: async () => {
        if (this.state.syncRetrying) return;
        this.setState({ syncRetrying: true });
        if (this.state.auth.status === "signed-in") {
          const sync = await retrySync();
          this.setState({ sync, syncRetrying: false });
          if (sync.status === "synced") this.loadRoster();
          return;
        }
        await this.startAuth();
        this.setState({ syncRetrying: false });
      },
      editProfile: () => set({ editingProfile: true, profileDraft: { ...this.state.profile }, resetAsk: false }),
      cancelEditProfile: () => set({ editingProfile: false, profileDraft: null, resetAsk: false }),
      submitProfile: () => this.submitProfile(),
      dismissWelcome: (view) => {
        set({ welcomePrompt: false });
        this.goto(view);
      },
      setProfileField: (key, value) => this.setProfileField(key, value),
      // Wiping the record is asked about first, and the dialog is the only way
      // to reach resetProgress — the button on the form only opens it.
      askResetProgress: () => set({ resetAsk: true }),
      cancelResetProgress: () => set({ resetAsk: false }),
      resetProgress: () => this.resetProgress(),
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
      // A row ticked on its own also becomes the anchor a later shift-click
      // measures its range from — including a row just unticked, since that is
      // the end a shift-click would clear a run from.
      toggleSelect: (id) =>
        this.setState((s) => ({
          selection: s.selection.includes(id) ? s.selection.filter((x) => x !== id) : [...s.selection, id],
          selectAnchor: id,
        })),
      // A shift-clicked run of rows, ticked or cleared together. Which ids that
      // is comes from the view-model, since it is what knows the order the rows
      // are in on screen; the anchor stays put, so the run can be re-drawn from
      // the same end.
      selectRange: (ids, on) =>
        this.setState((s) => {
          const inRange = new Set(ids);
          if (!on) return { selection: s.selection.filter((id) => !inRange.has(id)) };
          const held = new Set(s.selection);
          return { selection: [...s.selection, ...ids.filter((id) => !held.has(id))] };
        }),
      // Ticking every shown row, and clearing, are both a whole new selection —
      // the view-model works out which ids that is, since it is what knows
      // which rows the search and filter have left on screen. Neither leaves an
      // end to extend from, so both drop the anchor.
      setSelection: (selection) => set({ selection, selectAnchor: null }),

      // review — shared
      setMode: (mode) => {
        set({ mode });
        // A card not yet handed in starts the new exercise clean. One already
        // handed in is not cleared: the answers sit in a slot per activity, so
        // the marked paper stays there to come back to and the exercise switched
        // to is live because the mark is not its (see activityMarked). The
        // exception is a mark that left the verse uncommitted — what the sitting
        // is for is still open, so the switch reopens the card exactly as "Try
        // again" does, and the new exercise can be handed in.
        if (!this.cardSubmitted()) this.resetCard();
        else if (this.cardOpenAgain()) this.retryCard();
      },
      // Peeking is counted, not prevented: each press costs the card freshness
      // (see srs.reviewAward), so only the press is worth counting.
      setPeek: (showHelp) => this.setState((s) => ({ showHelp, peeks: showHelp ? s.peeks + 1 : s.peeks })),
      submitCard: (score) => this.submitCard(score),
      retryCard: () => this.retryCard(),
      nextCard: () => this.moveCard(1),
      prevCard: () => this.moveCard(-1),
      cancelMoveCard: () => set({ reviewMoveAsk: null }),
      confirmMoveCard: () => this.moveCard(this.state.reviewMoveAsk === "prev" ? -1 : 1, { confirmed: true }),
      askLeaveReview: () => set({ reviewLeaveAsk: true }),
      cancelLeaveReview: () => set({ reviewLeaveAsk: false }),
      leaveReview: () => this.leaveReview(),

      // review — flashcard
      setRevealed: (revealed) => set({ revealed }),
      // Both the passage and the first-letter scaffold are on the back, so each
      // of the two buttons below the card turns it over to its own side of the
      // pair, and pressing one again puts the card back to the reference. That
      // last part is the point: hiding the scaffold must not be the press that
      // hands over the passage, and a press must always change what is on
      // screen rather than a flag on the face nobody is looking at.
      revealFlipSide: (letters) =>
        this.setState((s) =>
          s.revealed && s.flipLetters === letters ? { revealed: false } : { revealed: true, flipLetters: letters },
        ),

      // review — fill the blanks
      setAnswer: (index, value, focusIndex) => {
        if (this.activityMarked()) return;
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

      // review — from memory (typed, or recited aloud)
      // A hand edit settles everything in the box: the member has taken the
      // transcript over, so the next phrase heard starts after what they left
      // rather than overwriting it.
      setTyped: (typed) => {
        if (this.activityMarked()) return;
        this.setState((s) => ({ typed, voice: { ...s.voice, tail: typed.length } }));
      },
      toggleTypeFirstLetter: () => {
        // Switching this changes how the input is graded, so drop any in-progress
        // answer and fall back to the ungraded state. There is no reciting a
        // first-letter scaffold, so the microphone goes off with it.
        const on = !this.state.typeFirstLetter;
        storage.saveTypeFirstLetter(on);
        this.stopListening();
        // This switch swaps in a different box (the live reveal has no voice
        // row of its own), so focus has to wait for that render to land.
        this.setState(
          (s) => ({
            typeFirstLetter: on,
            typed: "",
            typeGraded: false,
            voice: { ...s.voice, ...quietVoice() },
          }),
          focusRecall,
        );
      },

      // review — reciting aloud. One switch, and nothing else: correcting a
      // misheard word is what the textarea is already for.
      toggleVoice: () => this.toggleVoice(),

      // review — order the phrases
      placeChunk: (index) => this.placeChunk(index),
      // Starting over is the ordering attempted again from scratch, so the board
      // and the wrong tries both go: a tally carried over from an attempt the
      // member has thrown away would mark this one for mistakes it never made.
      resetScramble: () => {
        if (!this.activityMarked()) set({ scrambleOrder: [], scrambleWrong: -1, scrambleMisses: 0 });
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
      toggleExplainer: () => {
        const open = !this.state.explainerOpen;
        storage.saveExplainerOpen(open);
        set({ explainerOpen: open });
      },

      // guide
      setGuideDays: (guideDays) => set({ guideDays }),

      // leaderboard
      setLeaderFilter: (key, value) => this.setState((s) => ({ leaderFilter: { ...s.leaderFilter, [key]: value } })),
    };
  }

  render() {
    const { isMobile, loaded, splashHold, auth, sync, profile, editingProfile, welcomePrompt } = this.state;

    // Nothing is offered on a phone or a tablet — and the refusal comes before
    // the splash, since a member who is not getting in should not be made to
    // watch the boot first. It is a dead end, so no other screen follows it.
    if (isMobile) return mobileGateView(mobileGateVals({ groupName: this.groupName() }));

    // The splash is up until the app knows where the member is going: their
    // board if Firebase restores a session, the sign-in screen if it does not.
    // Deciding behind the splash is the point — otherwise a returning member
    // would be shown a sign-in prompt for the moment the check takes.
    if (!loaded || auth.status === "loading" || splashHold) {
      // The set's size comes from the module rather than from state: state.passages
      // is not filled until `loaded`, which is one of the things being waited for.
      return splashView(splashVals({ groupName: this.groupName(), passageCount: passages.length }));
    }

    // Sign-in is required before the app. "disabled" means Firebase is
    // unreachable — fall through to local-only rather than lock members out.
    if (auth.status !== "signed-in" && auth.status !== "disabled") {
      return authGateView(
        authGateVals({ auth, groupName: this.groupName(), motto: this.motto(), actions: this.actions }),
      );
    }

    /* Members give a name, ministry group, gender, and class before the app, so
     * their stats can be grouped. The same form reopens for later edits.
     *
     * But an incomplete profile only means "new member" once the cloud record
     * has actually been read. While the read is in flight, or after it has
     * failed, the app does not know what this member has — and sending them
     * through sign-up would stamp a fresh profile that then wins the merge and
     * replaces the real one. So the sync gate stands in front of the form (and
     * only of the form: a member whose profile is already complete on this
     * device goes straight through, with the banner below telling them their
     * work is staying local). */
    const needsProfile = !isProfileComplete(profile);
    const syncStatus = (sync || {}).status;
    /* Three ways the app can fail to know what this member has, and all three
     * must keep the sign-up form off the screen: the read is still in flight,
     * the read failed, or the SDK never loaded at all so there was no read.
     * Only a build with no Firebase configured is genuinely account-less, and
     * that one says nothing and runs local-only as it always has. */
    const recordUnknown =
      (auth.status === "signed-in" && (syncStatus === "pulling" || syncStatus === "error")) ||
      (auth.status === "disabled" && auth.reason === "unreachable");
    if (needsProfile && !editingProfile && recordUnknown) {
      return syncGateView(
        syncGateVals({
          sync: sync || {},
          auth,
          groupName: this.groupName(),
          busy: this.state.syncRetrying,
          actions: this.actions,
        }),
      );
    }
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

    // A one-time nudge toward the guide, shown between finishing sign-up and
    // landing on the board — see submitProfile.
    if (welcomePrompt) {
      return welcomeView(welcomeVals({ groupName: this.groupName(), actions: this.actions }));
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
      ${headerView(v)} ${v.syncWarning && syncBannerView(v)} ${v.isBoard && boardView(v)} ${v.isList && listView(v)}
      ${v.isReviewSetup && reviewSetupView(v)} ${v.isLearnSetup && learnSetupView(v)} ${v.isReview && reviewView(v)}
      ${v.isDone && doneView(v)} ${v.isLeader && leaderboardView(v)} ${v.isExamSetup && examSetupView(v)}
      ${v.isExam && examView(v)} ${v.isExamDone && examDoneView(v)} ${v.isGuide && guideView(v)} ${footerView(v)}
    </div>`;
  }
}
