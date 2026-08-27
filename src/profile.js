/* Member profile.
 *
 * Each signed-in member fills in a small profile — ministry group, gender, and
 * graduating class — that is stored alongside their progress (see storage.js /
 * firebase.js) and used to slice the leaderboard stats. This module holds the
 * option lists and the pure helpers; all functions are pure so they can be unit
 * tested in Node without a browser. */

/* Acts 2 Network ministry groups. This is the authoritative option list for the
 * profile's autocomplete picklist. Keep it in canonical/ministry order, with the
 * "Other" catch-all pinned last (not alphabetized) for members whose group isn't
 * listed. */
export const MINISTRY_GROUPS = [
  "A2F",
  "Kairos",
  "USF",
  "SFSU",
  "BAC",
  "Womens",
  "DVC",
  "Acts2 Next",
  "A2K",
  "AYM IH",
  "AYM Oak",
  "AVL",
  "F2W",
  "Element HS",
  "Element MS",
  "Impact Elem",
  "Impact Youth",
  "Doulos",
  "IGSM",
  "ISMP UCB 1",
  "ISMP UCB 2",
  "ISMP NE",
  "ISMP BCC",
  "Aletheia",
  "VSM",
  "ECM",
  "Other",
];

export const GENDERS = ["Male", "Female"];

/* The review settings a member can tune on their profile: how many verses a
 * review session takes, and how far a committed verse may fade before it comes
 * back round. The threshold sits well above the point where a verse is properly
 * at risk — a passage is easiest to hold when it is topped up before it slips,
 * and reviewing at 75% costs a fraction of what relearning at 20% does. */
export const DEFAULT_DUE_TOP_X = 10;
export const DEFAULT_DUE_FRESHNESS = 75;

/* How many of the words a write-out has to get right to commit a verse (see
 * srs.commitsVerse). 95% by default, matching srs.COMMIT_SCORE, so one dropped
 * article does not deny a passage the member plainly knows — a member who
 * wants a stricter or more forgiving bar can move it, down to MIN_COMMIT_THRESHOLD
 * so the bar still means recalling the passage rather than approximating it. */
export const DEFAULT_COMMIT_THRESHOLD = 95;
export const MIN_COMMIT_THRESHOLD = 90;
export const MAX_COMMIT_THRESHOLD = 100;
const clampCommitThreshold = (n) => Math.max(MIN_COMMIT_THRESHOLD, Math.min(MAX_COMMIT_THRESHOLD, n));

/* Whether the member's own row appears on the leaderboard, and the answer for
 * anyone who has never been asked.
 *
 * **The default is hidden, and that is the point.** A member is put on a board
 * their whole ministry can read only because they said so, never because they
 * signed in — so the absence of an answer reads as "no" rather than as "not
 * yet decided". `shareRanking === true` is therefore the only value that shows
 * a member, and every other value — false, undefined, a profile that predates
 * the field entirely — hides them.
 *
 * What it hides is the member, not their work: a hidden member still counts
 * toward their ministry's average (see standings.standingsBy), because a group
 * figure is about the group and nobody should be able to drag theirs down, or
 * prop it up, by changing a switch about themselves. What leaves is the named
 * row — and the name itself, which standings.summarize stops publishing, so
 * hiding is a fact about the wire and not just about the screen. */
export const DEFAULT_SHARE_RANKING = false;
export const sharesRanking = (p) => (p || {}).shareRanking === true;

/* Default exercise difficulty: 0 = Coarse (fewest blanks / longest phrases),
 * 1 = Medium, 2 = Fine (every key word / shortest phrases). Sets the starting
 * level for both Fill the Blanks and Order the Phrases when no per-device
 * override is saved. */
export const DEFAULT_DIFFICULTY = 1;

/* Those settings as the app reads them, filled in from the defaults for a member
 * who has never touched them. */
export function reviewSettings(profile) {
  const p = profile || {};
  return {
    dueTopX: p.dueTopX !== undefined ? Number(p.dueTopX) : DEFAULT_DUE_TOP_X,
    dueFreshness: p.dueFreshness !== undefined ? Number(p.dueFreshness) : DEFAULT_DUE_FRESHNESS,
    defaultDifficulty: p.defaultDifficulty !== undefined ? Number(p.defaultDifficulty) : DEFAULT_DIFFICULTY,
    commitThreshold: clampCommitThreshold(
      p.commitThreshold !== undefined ? Number(p.commitThreshold) : DEFAULT_COMMIT_THRESHOLD,
    ),
  };
}

/* Google Workspace appends a campus tag like "(Berk)" to some members' display
 * names. Strip a trailing "(Berk)" (any spacing/case) so names read cleanly on
 * the leaderboard and in the pre-filled profile form. Safe on null/empty. */
export function cleanDisplayName(name) {
  return String(name || "")
    .replace(/\s*\(Berk\)\s*$/i, "")
    .trim();
}

/* A profile is complete once name, ministry group, gender, and class are all
 * set. The gate (App.js) uses this to decide whether to prompt the member before
 * showing the app. Name is normally pre-filled from the Google account, but is
 * required here so a member whose account has no display name still gives one. */
export function isProfileComplete(p) {
  return !!(p && p.name && p.ministryGroup && p.gender && p.gradClass);
}

/* Is there anything here at all? `{}` is what an unsigned device and a document
 * with no profile field both look like, and it is truthy — which is exactly how
 * an empty object used to win a merge against a real profile. */
const hasProfile = (p) => !!p && Object.keys(p).length > 0;

/* Reconcile a local and a remote profile, in three steps, each of which exists
 * to stop a real profile being lost to a lesser one:
 *
 *   1. If only one side has anything, that side — an empty object is not a
 *      profile that beat the other, it is the absence of one. (`{}` vs a real
 *      profile carrying no `updatedAt` used to tie at 0 and hand back the
 *      empty side, which reads to the member as "set up your profile" on a
 *      device where the cloud plainly had one.)
 *   2. A complete profile beats an incomplete one regardless of timestamp,
 *      since a half-filled form is never the answer a member wants back.
 *   3. Otherwise last write wins by `updatedAt`; no timestamp counts as oldest.
 *
 * Returns {} when neither side has data. */
export function mergeProfile(local, remote) {
  const a = hasProfile(local) ? local : null;
  const b = hasProfile(remote) ? remote : null;
  if (!a) return b || {};
  if (!b) return a;
  if (isProfileComplete(a) !== isProfileComplete(b)) return isProfileComplete(a) ? a : b;
  return (b.updatedAt || 0) > (a.updatedAt || 0) ? b : a;
}
