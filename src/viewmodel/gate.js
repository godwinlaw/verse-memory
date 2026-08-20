/* View-models for the full-screen gates that stand in front of the app, in the
 * order a member meets them: the refusal on a phone, the opening splash, the
 * Google sign-in prompt, the member profile form, and — once, for a member who
 * just finished that form for the first time — a nudge toward the guide. */

import { copy } from "../copy.js";
import {
  DEFAULT_COMMIT_THRESHOLD,
  DEFAULT_DUE_FRESHNESS,
  DEFAULT_DUE_TOP_X,
  DEFAULT_DIFFICULTY,
  GENDERS,
  MINISTRY_GROUPS,
  MAX_COMMIT_THRESHOLD,
  MIN_COMMIT_THRESHOLD,
  isProfileComplete,
} from "../profile.js";
import { SCRAMBLE_LEVELS } from "../blanks.js";
import { THEMES } from "../theme.js";
import { committedCount, countByStatus, streakOf } from "../progress.js";
import { segButton } from "../ui/tokens.js";
import { PRIMARY_DOMAIN } from "../firebase.js";

/* The mobile gate is a dead end: nothing to press, nothing to wait for, and the
 * sentence on it is the same every time (copy.mobileGate). All it takes is who
 * the app belongs to, so it can still name itself while declining. */
export function mobileGateVals({ groupName }) {
  return { groupName };
}

/* The splash carries nothing but the app's identity and the shape of the wait:
 * it is up before there is any progress, profile, or account to show. The three
 * steps are the only thing on it drawn from data, and only just — `count` is
 * the size of the set, which is known from the passage module at import time
 * rather than from anything still loading. */
export function splashVals({ groupName, passageCount }) {
  return {
    groupName,
    steps: [copy.splash.steps.indexing(passageCount), copy.splash.steps.restoring, copy.splash.steps.queueing],
    note: copy.splash.note,
  };
}

export function authGateVals({ auth, groupName, motto, actions }) {
  return {
    groupName,
    motto,
    // Only the member's own press: the wait for Firebase to answer at startup
    // happens behind the splash, so this screen is never reached mid-check.
    busy: auth.status === "signing-in",
    denied: auth.status === "denied",
    failed: auth.status === "signed-out" && auth.error === "sign-in-failed",
    // Every domain in ALLOWED_DOMAINS can sign in; the prompt names one so the
    // instruction stays short.
    domainLabel: "@" + PRIMARY_DOMAIN,
    onSignIn: actions.signIn,
  };
}

/* The wait between signing in and knowing what the member already has, and the
 * dead end when that cannot be established. `code` comes straight from the
 * Firestore error so the sentence can name the likely cause without the view
 * knowing anything about Firebase. */
export function syncGateVals({ sync, auth, groupName, busy, actions }) {
  /* The SDK never loaded, so there was no sign-in and no read to fail — a
   * different sentence from a read that was refused, and a different thing to
   * go and check. */
  const unreachable = (auth || {}).status === "disabled" && auth.reason === "unreachable";
  const failed = unreachable || sync.status === "error";
  const detail = unreachable
    ? copy.syncGate.unreachableDetail
    : sync.code === "permission-denied"
      ? copy.syncGate.denied
      : failed
        ? copy.syncGate.offline
        : "";
  return {
    groupName,
    failed,
    busy,
    title: unreachable
      ? copy.syncGate.titleUnreachable
      : failed
        ? copy.syncGate.titleError
        : copy.syncGate.titlePulling,
    message: unreachable ? copy.syncGate.unreachable : failed ? copy.syncGate.error : copy.syncGate.pulling,
    detail,
    retryLabel: busy ? copy.syncGate.retrying : copy.syncGate.retry,
    onRetry: actions.retrySync,
    onSignOut: actions.signOut,
  };
}

const ministryOptionStyle = (selected) =>
  "display:block;width:100%;text-align:left;padding:8px 12px;border:none;border-bottom:1px solid var(--color-divider);" +
  "cursor:pointer;font-family:var(--font-body);font-size:14px;color:var(--color-text);background:" +
  (selected ? "var(--color-accent-100)" : "transparent");

const genderButtonStyle = (selected) =>
  "flex:1;padding:9px 12px;font-family:var(--font-heading);font-weight:600;letter-spacing:.04em;cursor:pointer;" +
  "border:1px solid var(--color-divider);background:" +
  (selected ? "var(--color-accent)" : "transparent") +
  ";color:" +
  (selected ? "var(--color-bg)" : "var(--color-text)");

export function profileFormVals({ state, groupName, isSetup, actions }) {
  const draft = state.profileDraft || state.profile || {};
  // What a reset would cost, counted the same way the board counts it. A member
  // still filling the form in for the first time has no record to wipe, so the
  // section is not offered there at all.
  const hasRecord = Object.keys(state.progress || {}).length > 0;
  const committed = committedCount(state.progress);
  const inProgress = countByStatus(state.passages, state.progress, "learning");
  const streak = streakOf(state.log);
  // Pre-fill the name from the Google account until the member edits it, so
  // there is usually nothing to type.
  const googleName = (state.auth.user && state.auth.user.name) || "";
  const name = draft.name != null ? draft.name : googleName;
  const query = (draft.ministryGroup || "").trim().toLowerCase();

  return {
    isSetup,
    groupName,
    title: isSetup ? copy.profileForm.titleSetup : copy.profileForm.titleEdit,
    submitLabel: isSetup ? copy.profileForm.submitSetup : copy.profileForm.submitEdit,
    complete: isProfileComplete({ ...draft, name }),

    name,
    onName: (e) => actions.setProfileField("name", e.target.value),

    ministryGroup: draft.ministryGroup || "",
    ministryOpen: state.ministryOpen,
    onMinistryInput: (e) => {
      actions.setProfileField("ministryGroup", e.target.value);
      actions.setMinistryOpen(true);
    },
    onMinistryFocus: () => actions.setMinistryOpen(true),
    onMinistryBlur: () => actions.closeMinistryList(),
    ministryMatches: MINISTRY_GROUPS.filter((g) => g.toLowerCase().includes(query)).map((g) => ({
      label: g,
      style: ministryOptionStyle(draft.ministryGroup === g),
      // mousedown, not click: the input's blur would close the list first.
      onSelect: (e) => {
        e.preventDefault();
        actions.setMinistryOpen(false);
        actions.setProfileField("ministryGroup", g);
      },
    })),

    genders: GENDERS.map((g) => ({
      label: g,
      style: genderButtonStyle(draft.gender === g),
      onClick: () => actions.setProfileField("gender", g),
    })),

    gradClass: draft.gradClass == null ? "" : draft.gradClass,
    onGradClass: (e) => actions.setProfileField("gradClass", e.target.value),

    dueTopX: draft.dueTopX !== undefined ? draft.dueTopX : DEFAULT_DUE_TOP_X,
    onDueTopX: (e) => actions.setProfileField("dueTopX", e.target.value),
    dueFreshness: draft.dueFreshness !== undefined ? draft.dueFreshness : DEFAULT_DUE_FRESHNESS,
    onDueFreshness: (e) => actions.setProfileField("dueFreshness", e.target.value),
    commitThreshold: draft.commitThreshold !== undefined ? draft.commitThreshold : DEFAULT_COMMIT_THRESHOLD,
    onCommitThreshold: (e) => actions.setProfileField("commitThreshold", e.target.value),
    commitThresholdMin: MIN_COMMIT_THRESHOLD,
    commitThresholdMax: MAX_COMMIT_THRESHOLD,
    defaultDifficulty: draft.defaultDifficulty !== undefined ? Number(draft.defaultDifficulty) : DEFAULT_DIFFICULTY,
    defaultDifficultyLevels: copy.profileForm.difficultyLevels.map((label, i) => {
      const active =
        i === (draft.defaultDifficulty !== undefined ? Number(draft.defaultDifficulty) : DEFAULT_DIFFICULTY);
      return {
        key: SCRAMBLE_LEVELS[i].key,
        label,
        style: segButton(active),
        onClick: () => actions.setProfileField("defaultDifficulty", i),
      };
    }),

    /* Appearance, which behaves unlike everything above it and is meant to.
     * The theme is device-local (storage.saveTheme), so it is not in the draft,
     * not waiting on Save, and not cancelled by Cancel: pressing one of these
     * turns the page over there and then, which is also the only demonstration
     * the setting needs. Offered on the settings form for the same reason as
     * the review settings below — the system already answers for a member who
     * has never thought about it. */
    showAppearance: !isSetup,
    theme: state.theme,
    themeOptions: THEMES.map((key) => ({
      key,
      label: copy.profileForm.themeLabels[key],
      style: segButton(state.theme === key),
      onClick: () => actions.setTheme(key),
    })),
    themeNote: copy.profileForm.themeNote,

    // How reviews behave is not asked for at sign-up. A member meeting the app
    // for the first time has no way to judge how many verses a sitting should
    // hold or how far one may fade before it comes back — the questions only
    // mean something once they have used it. Nothing is lost by leaving them:
    // submitProfile writes the same defaults either way, and Settings is where
    // they are changed afterwards.
    showReviewSettings: !isSetup,

    // Resetting the record. Offered only to a member who already has a profile
    // — the setup form is a gate, and there is nothing behind it yet to clear.
    showReset: !isSetup,
    // Anything at all recorded is something to reset — a passage can carry
    // freshness and a stability without having reached either count — so both
    // the button and the line above it read the record itself, not the counts.
    canReset: hasRecord,
    resetStanding: hasRecord
      ? copy.profileForm.reset.standing(committed, inProgress)
      : copy.profileForm.reset.standingEmpty,
    resetAsking: state.resetAsk,
    resetWarning: copy.profileForm.reset.warning(committed, inProgress, streak),
    onResetAsk: actions.askResetProgress,
    onResetCancel: actions.cancelResetProgress,
    onResetConfirm: actions.resetProgress,

    onSubmit: actions.submitProfile,
    onCancel: actions.cancelEditProfile,
  };
}

/* Shown once, right after a member finishes the profile form for the first
 * time — before they are turned loose on the board. A nudge toward the guide,
 * with a way out for anyone who would rather start memorizing right away. */
export function welcomeVals({ groupName, actions }) {
  return {
    groupName,
    onGuide: () => actions.dismissWelcome("guide"),
    onLearn: () => actions.dismissWelcome("learn-setup"),
  };
}
