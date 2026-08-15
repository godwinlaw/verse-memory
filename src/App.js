/* The Memory Board — root component.
 *
 * This is the only stateful module in the app. It owns the member's progress and
 * the running review session, exposes an `actions` table for the UI to call, and
 * dispatches to a view. It deliberately holds no rendering or derivation logic:
 *
 *   viewmodel/  turns (state, actions) into one plain object of strings and
 *               callbacks — all the derivation lives there
 *   views/      turn that object into markup — no state, no imports from here
 *   srs, blanks, grading, progress, text — the pure domain, unit-tested in Node
 *
 * So a change to how something looks belongs in views/, a change to what is
 * shown in viewmodel/, and a change to how memory is modelled in srs.js. */

import { React, html, sx } from "./dom.js";
import { dayKey } from "./text.js";
import { migrate, nextStability, SEED_STABILITY } from "./srs.js";
import { BLANK_LEVELS, SCRAMBLE_LEVELS } from "./blanks.js";
import { storage, mergeProgress, mergeLog } from "./storage.js";
import { committedCount, dueOrder, streakOf, REVIEWS_TO_COMMIT } from "./progress.js";
import { DEFAULT_MODE, SESSION_SIZE } from "./review.js";
import { isProfileComplete, mergeProfile } from "./profile.js";
import { appConfig } from "./config.js";
import { initAuth, signIn, signOutUser, fetchRoster } from "./firebase.js";
import { passages } from "../data/passages.js";
import { buildViewModel, authGateVals, profileFormVals } from "./viewmodel/index.js";
import { muted } from "./ui/tokens.js";
import { headerView } from "./views/header.js";
import { boardView } from "./views/board.js";
import { listView } from "./views/list.js";
import { reviewView } from "./views/review.js";
import { doneView } from "./views/done.js";
import { leaderboardView } from "./views/leaderboard.js";
import { authGateView } from "./views/auth-gate.js";
import { profileFormView } from "./views/profile-form.js";

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
    view: "board", // board | list | review | done | leaderboard
    progress: {}, // { [passageId]: { hits, status, last, stability } }
    log: {}, // { [YYYY-MM-DD]: reviews that day }

    // running review session
    mode: null,
    queue: [],
    qi: 0,
    sessionCount: 0,
    showHelp: false,
    revealed: false,
    flipLetters: false,
    answers: {},
    blanksChecked: false,
    blankLevel: 1,
    blankHint: true,
    typed: "",
    typeGraded: false,
    typeFirstLetter: false,
    lastTypeScore: undefined,
    scrambleOrder: [],
    scrambleWrong: -1,
    scrambleLevel: 1,

    // passage list
    search: "",
    filter: "All",

    // account, profile, leaderboard
    auth: { status: "loading" }, // loading | signing-in | signed-out | denied | signed-in | disabled
    profile: {}, // { name, ministryGroup, gender, gradClass, updatedAt }
    profileDraft: null, // in-progress edits for the profile form
    editingProfile: false, // reopen the form for an already-complete profile
    ministryOpen: false, // ministry-group combobox dropdown visibility
    peers: null, // leaderboard roster, minus self
    leaderFilter: { group: "All", gender: "All", gradClass: "All" },
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
          streak: streakOf(r.log),
          ministryGroup: r.profile.ministryGroup,
          gender: r.profile.gender,
          gradClass: r.profile.gradClass,
        })),
    });
  }

  /* ── progress ───────────────────────────────────────────────────────────── */

  /* Toggle a passage's committed flag by hand, outside the review flow. */
  setStatus(id, status) {
    const progress = { ...this.state.progress };
    const cur = progress[id] || { hits: 0 };
    // A passage committed by hand has no review history, so seed it rather than
    // let it read as 0% fresh straight away.
    const seed = status === "memorized" && !cur.last ? { last: Date.now(), stability: SEED_STABILITY } : {};
    progress[id] = {
      ...cur,
      ...seed,
      status,
      hits: status === "memorized" ? Math.max(REVIEWS_TO_COMMIT, cur.hits || 0) : cur.hits || 0,
    };
    this.save(progress, this.state.log);
  }

  /* Record a completed review. Freshness is driven by the act of reviewing
   * alone — there is no self-report. The activity and its measured performance
   * decide how much stability the passage gains (see srs.nextStability). */
  record(id) {
    const progress = { ...this.state.progress };
    const cur = progress[id] || { hits: 0, status: "new" };
    const hits = (cur.hits || 0) + 1;
    progress[id] = {
      ...cur,
      hits,
      last: Date.now(),
      stability: nextStability(migrate(this.state.progress[id]), {
        mode: this.state.mode,
        blankLevel: this.state.blankLevel,
        score: this.state.lastTypeScore,
      }),
      status: hits >= REVIEWS_TO_COMMIT ? "memorized" : "learning",
    };
    const log = { ...this.state.log };
    const today = dayKey(new Date());
    log[today] = (log[today] || 0) + 1;
    this.save(progress, log);
  }

  /* ── review session ─────────────────────────────────────────────────────── */

  goto(view) {
    this.setState({ view });
    if (view === "leaderboard") this.loadRoster();
  }

  /* Start a session over `ids`, or over the stalest SESSION_SIZE passages. */
  startSession(mode, ids) {
    const queue =
      ids && ids.length
        ? ids
        : dueOrder(this.state.passages, this.state.progress)
            .slice(0, SESSION_SIZE)
            .map((p) => p.id);
    this.setState({
      view: "review",
      mode: mode || this.state.mode || DEFAULT_MODE,
      queue,
      qi: 0,
      sessionCount: 0,
    });
    this.resetCard();
  }

  /* Clear everything that belongs to the card being left. */
  resetCard() {
    this.setState({
      revealed: false,
      flipLetters: false,
      showHelp: false,
      answers: {},
      blanksChecked: false,
      typed: "",
      typeGraded: false,
      scrambleOrder: [],
      scrambleWrong: -1,
    });
  }

  /* Record the current card and move on, ending the session at the queue's end. */
  next() {
    const id = this.state.queue[this.state.qi];
    if (id != null) this.record(id);
    const qi = this.state.qi + 1;
    this.setState((s) => ({
      qi,
      sessionCount: s.sessionCount + 1,
      view: qi >= s.queue.length ? "done" : "review",
    }));
    this.resetCard();
  }

  /* The first-letter drill has no "Grade it" step, so it hands its live score in
   * here — it has to land in state before next() reads it. */
  advance(liveScore) {
    if (liveScore == null) return this.next();
    this.setState({ lastTypeScore: liveScore }, () => this.next());
  }

  placeChunk(index) {
    const placed = this.state.scrambleOrder;
    if (index === placed.length) this.setState({ scrambleOrder: [...placed, index], scrambleWrong: -1 });
    else this.setState({ scrambleWrong: index });
  }

  /* ── the action table handed to the view-model ──────────────────────────── */

  buildActions() {
    const set = (patch) => this.setState(patch);
    return {
      // navigation
      goto: (view) => this.goto(view),
      startSession: (mode, ids) => this.startSession(mode, ids),

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
      setStatus: (id, status) => this.setStatus(id, status),

      // review — shared
      setMode: (mode) => {
        set({ mode });
        this.resetCard();
      },
      setPeek: (showHelp) => set({ showHelp }),
      advance: (liveScore) => this.advance(liveScore),

      // review — flashcard
      setRevealed: (revealed) => set({ revealed }),
      toggleFlipLetters: () => this.setState((s) => ({ flipLetters: !s.flipLetters })),

      // review — fill the blanks
      setAnswer: (index, value, focusIndex) =>
        this.setState(
          (s) => ({ answers: { ...s.answers, [index]: value } }),
          () => focusBlank(focusIndex),
        ),
      focusBlank,
      checkBlanks: () => set({ blanksChecked: true }),
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
      setTyped: (typed) => set({ typed }),
      gradeTyped: (score) =>
        this.setState((s) => ({
          typeGraded: !s.typeGraded,
          typed: s.typeGraded ? "" : s.typed,
          lastTypeScore: score,
        })),
      toggleTypeFirstLetter: () => {
        // Switching this changes how the input is graded, so drop any in-progress
        // answer and fall back to the ungraded state.
        const on = !this.state.typeFirstLetter;
        storage.saveTypeFirstLetter(on);
        set({ typeFirstLetter: on, typed: "", typeGraded: false });
      },

      // review — order the phrases
      placeChunk: (index) => this.placeChunk(index),
      resetScramble: () => set({ scrambleOrder: [], scrambleWrong: -1 }),
      setScrambleLevel: (level) => {
        storage.saveScrambleLevel(level);
        set({ scrambleLevel: level, scrambleOrder: [], scrambleWrong: -1 });
      },

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
      return authGateView(authGateVals({ auth, groupName: this.groupName(), actions: this.actions }));
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
      deadline: this.deadline(),
      actions: this.actions,
    });
    return html` <div
      style=${sx("min-height:100vh;background:var(--color-bg);color:var(--color-text);font-family:var(--font-body)")}
    >
      ${headerView(v)} ${v.isBoard && boardView(v)} ${v.isList && listView(v)} ${v.isReview && reviewView(v)}
      ${v.isDone && doneView(v)} ${v.isLeader && leaderboardView(v)}
    </div>`;
  }
}
