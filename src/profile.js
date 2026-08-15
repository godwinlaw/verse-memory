/* Member profile.
 *
 * Each signed-in member fills in a small profile — ministry group, gender, and
 * graduating class — that is stored alongside their progress (see storage.js /
 * firebase.js) and used to slice the leaderboard stats. This module holds the
 * option lists and the pure helpers; all functions are pure so they can be unit
 * tested in Node without a browser. */

/* Acts 2 Network ministry groups. This is the authoritative option list for the
 * profile's autocomplete picklist. Keep it in canonical/ministry order. */
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
];

export const GENDERS = ["Male", "Female"];

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

/* Reconcile a local and a remote profile: last write wins by `updatedAt`, so
 * the most recently edited profile survives a cross-device merge. A profile with
 * no timestamp is treated as oldest. Returns {} when neither side has data. */
export function mergeProfile(local, remote) {
  const a = local || null;
  const b = remote || null;
  if (!a) return b || {};
  if (!b) return a || {};
  return (b.updatedAt || 0) > (a.updatedAt || 0) ? b : a;
}
