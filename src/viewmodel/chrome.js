/* App chrome: the header's identity block, the primary nav, and the flags that
 * decide which view the shell renders. */

import { copy } from "../copy.js";
import { isProfileComplete } from "../profile.js";
import { muted } from "../ui/tokens.js";

/* `also` lists the views that belong to a nav item without being it — the
 * screens either side of a session, which should keep their entry underlined. */
const NAV = [
  { key: "board", label: copy.nav.board, also: ["done"] },
  { key: "list", label: copy.nav.list },
  { key: "leaderboard", label: copy.nav.leaderboard },
  { key: "guide", label: copy.nav.guide },
  { key: "drive", label: copy.drive.nav },
  { key: "run", label: copy.nav.run },
];

const navStyle = (active, underlined) =>
  "background:none;border:none;cursor:pointer;font-family:var(--font-heading);font-weight:600;font-size:15px;" +
  "letter-spacing:.06em;padding:4px 2px;border-bottom:2px solid " +
  (underlined ? "var(--color-accent)" : "transparent") +
  ";color:" +
  (active ? "var(--color-text)" : muted(55));

export function chromeVals({ state, groupName, motto, actions }) {
  const profile = state.profile || {};
  const user = state.auth.user || null;
  return {
    groupName,
    motto,
    user,
    userName: profile.name || (user && user.name) || (user && user.email) || "",
    signOut: actions.signOut,
    editProfile: actions.editProfile,
    profileSummary: isProfileComplete(profile) ? profile.name : copy.header.setUpProfile,

    /* Sync trouble, shown as a strip under the header. Only for a member who
     * got past the sync gate — that is, one whose profile is complete on this
     * device — so it says "your work is staying here", not "we don't know who
     * you are". A member who is signed out or running an unconfigured build has
     * nothing to sync and is told nothing. */
    syncWarning:
      (state.auth.status === "signed-in" && (state.sync || {}).status === "error") ||
      (state.auth.status === "disabled" && state.auth.reason === "unreachable"),
    syncRetrying: !!state.syncRetrying,
    onSyncRetry: actions.retrySync,

    nav: NAV.map((n) => ({
      key: n.key,
      label: n.label,
      onClick: () => actions.goto(n.key),
      style: navStyle(state.view === n.key, state.view === n.key || (n.also || []).includes(state.view)),
    })),

    isBoard: state.view === "board",
    isList: state.view === "list",
    isReview: state.view === "review",
    isLeader: state.view === "leaderboard",
    isGuide: state.view === "guide",
    isRun: state.view === "run",
    isDone: state.view === "done",
    isReviewSetup: state.view === "review-setup",
    isLearnSetup: state.view === "learn-setup",
    isExamSetup: state.view === "test-setup",
    isExam: state.view === "test",
    isExamDone: state.view === "test-done",

    goBoard: () => actions.goto("board"),
    goList: () => actions.goto("list"),
    goReviewSetup: () => actions.goto("review-setup"),
    goLearnSetup: () => actions.goto("learn-setup"),
    goGuide: () => actions.goto("guide"),
  };
}
