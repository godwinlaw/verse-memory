/* App chrome: the header's identity block, the primary nav, and the flags that
 * decide which view the shell renders. */

import { isProfileComplete } from "../profile.js";
import { muted } from "../ui/tokens.js";

const NAV = [
  { key: "board", label: "Board" },
  { key: "list", label: "Passages" },
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
      // The session-complete screen still belongs to the board, so keep Board
      // underlined there even though it isn't the active view.
      style: navStyle(state.view === n.key, state.view === n.key || (n.key === "board" && state.view === "done")),
    })),

    isBoard: state.view === "board",
    isList: state.view === "list",
    isReview: state.view === "review",
    isLeader: state.view === "leaderboard",
    isDone: state.view === "done",

    goBoard: () => actions.goto("board"),
    goList: () => actions.goto("list"),
    startDue: () => actions.startSession(),
  };
}
