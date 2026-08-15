/* App chrome: the header's identity block, the primary nav, and the flags that
 * decide which view the shell renders. */

import { isProfileComplete } from "../profile.js";
import { muted } from "../ui/tokens.js";

/* `also` lists the views that belong to a nav item without being it — the
 * screens either side of a session, which should keep their entry underlined. */
const NAV = [
  { key: "board", label: "Board", also: ["done"] },
  { key: "list", label: "Passages" },
  { key: "test-setup", label: "Test", also: ["test", "test-done"] },
  { key: "leaderboard", label: "Leaderboard" },
];

const navStyle = (active, underlined) =>
  "background:none;border:none;cursor:pointer;font-family:var(--font-heading);font-weight:600;font-size:15px;" +
  "letter-spacing:.06em;padding:4px 2px;border-bottom:2px solid " +
  (underlined ? "var(--color-accent)" : "transparent") +
  ";color:" +
  (active ? "var(--color-text)" : muted(55));

export function chromeVals({ state, groupName, actions }) {
  const profile = state.profile || {};
  const user = state.auth.user || null;
  return {
    groupName,
    user,
    userName: profile.name || (user && user.name) || (user && user.email) || "",
    signOut: actions.signOut,
    editProfile: actions.editProfile,
    profileSummary: isProfileComplete(profile)
      ? profile.ministryGroup + " · Class of " + profile.gradClass
      : "Set up your profile",

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
    isDone: state.view === "done",
    isReviewSetup: state.view === "review-setup",
    isExamSetup: state.view === "test-setup",
    isExam: state.view === "test",
    isExamDone: state.view === "test-done",

    goBoard: () => actions.goto("board"),
    goList: () => actions.goto("list"),
    goReviewSetup: () => actions.goto("review-setup"),
    startDue: () => actions.startSession(),
  };
}
