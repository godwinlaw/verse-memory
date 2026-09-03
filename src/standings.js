/* The board's own record of a member, and ranking groups instead of people.
 *
 * The leaderboard has always been able to *filter* by the three things a member
 * puts in their profile, ministry group, gender, graduating class. This is the
 * other half: the groups themselves ranked against each other, so a ministry can
 * see where it stands rather than only who inside it is doing well.
 *
 * Everything here is pure and takes the same roster rows viewmodel/leaderboard.js
 * has already assembled and filtered, `{ count, freshnessScore, streak, me }`
 * plus the profile fields, so grouping composes with filtering rather than
 * replacing it: rank the ministries within the class of 2027 and both questions
 * are answered at once.
 *
 * The measure is PER MEMBER, and that is the whole design. Ranking by a total
 * would rank by attendance: the largest ministry wins every week, the smallest
 * can never place, and the board stops telling anyone anything they can act on.
 * An average asks the only question a group can actually answer, how are we
 * doing, each of us, so a group of five holding their verses well outranks
 * forty who are not. */

/* The three things a member can be grouped by. `field` is the profile attribute;
 * `key` is what the segmented control and state carry. "people" is the absence
 * of grouping and deliberately lives in the same list, so the control is one
 * row of choices rather than a mode switch beside a mode switch. */
export const RANK_BY = [
  { key: "group", field: "ministryGroup" },
  { key: "gradClass", field: "gradClass" },
  { key: "gender", field: "gender" },
  { key: "people", field: null },
];

export const rankFieldFor = (key) =>
  (RANK_BY.find((r) => r.key === key) || RANK_BY.find((r) => r.key === "people")).field;

/* Is there enough of a profile here for the board to place this member?
 *
 * The three grouping fields and deliberately **not** the name, which is what
 * separates this from profile.isProfileComplete. A member who has hidden
 * themselves has no name in their summary at all (see summarize below), but
 * their figures still belong to their ministry's average, so a filter that
 * asked for a name would drop them from the group they are actually in. The
 * name only decides whether a row can be *shown*, and a hidden row never is. */
export const rankable = (row) => !!(row && row.ministryGroup && row.gender && row.gradClass);

/* A member with nothing to their name yet does not drag their group down.
 *
 * This is the one judgement in here that could reasonably go the other way, so
 * it is worth saying why: the individual board already leaves out anyone with
 * nothing committed, on the grounds that there is nothing to rank. Counting
 * them in a group average would quietly re-admit them, and it would mean a
 * ministry that recruits well scores worse for it, which is precisely backwards
 * from what the board is for. A group's figure is therefore the average across
 * the members who have started, and `members` says how many that is. */
const started = (row) => row.count > 0;

/* Roster rows grouped by one profile attribute, ranked best average first.
 *
 * Rows with no value for the attribute are dropped rather than pooled into an
 * "Unknown" group: a member who has not said which ministry they are in has not
 * joined a group that could be ranked, and inventing one to hold them would put
 * a fictional team on the board.
 *
 * Ties break on the number of members, so the larger group is listed first,
 * the same average is a bigger thing to have achieved across more people. */
export function standingsBy(rows, field) {
  if (!field) return [];
  const groups = new Map();
  for (const row of rows) {
    if (!started(row)) continue;
    const value = row[field];
    if (value == null || value === "") continue;
    const name = String(value);
    const g = groups.get(name) || { name, members: 0, count: 0, freshnessScore: 0, mine: false };
    g.members += 1;
    g.count += row.count;
    g.freshnessScore += row.freshnessScore;
    // The group the member is standing in, so the board can point it out.
    if (row.me) g.mine = true;
    groups.set(name, g);
  }
  return [...groups.values()]
    .map((g) => ({
      ...g,
      avgScore: g.freshnessScore / g.members,
      avgCount: g.count / g.members,
    }))
    .sort((a, b) => b.avgScore - a.avgScore || b.members - a.members || a.name.localeCompare(b.name));
}

/* ── what the board reads ─────────────────────────────────────────────────── */

/* The leaderboard used to be built by downloading every member's whole record,
 * their progress map for all 183 verses and their entire daily log, and then
 * throwing nearly all of it away to arrive at three numbers each. That is fine
 * for a dozen members and is not fine for a few hundred: it is the one read in
 * the app whose cost grows with the size of the group, and it grows in the
 * worst way, since every member pays it every time they open the board.
 *
 * So each member also keeps a summary of themselves, `standings/{uid}` in
 * Firestore (see firebase.js), and the board reads those instead. It is the
 * same three numbers, written by the one device that already has the record in
 * hand, rather than recomputed by every other device from the raw material.
 *
 * The one thing a summary cannot be is those three numbers. **Freshness
 * decays**: a score is a claim about a moment, and a stored one is wrong by the
 * time it is read. So the summary keeps the two figures the curve actually runs
 * on, when the verse was last reviewed and how stable it is, for the
 * committed verses only, and the reader runs the curve at the moment it asks.
 * That is a pair of numbers per committed verse instead of a record per verse
 * in the set, plus a log that grows for as long as the member uses the app.
 *
 * `fresh` holds those pairs flat, last, stability, last, stability, rather
 * than as a list of pairs, because Firestore will not store an array inside an
 * array. Which verse is which is deliberately not in there: the board asks how
 * many and how fresh, never which, so the ids would be a third of the payload
 * spent saying something nobody reads (and telling every member which verses
 * every other member has).
 *
 * The streak is the same problem in miniature and gets the same treatment: it
 * is stored with the day it was true of, and reads as nothing once that day is
 * older than yesterday. And the email is simply not here, the board never
 * needed it, and not sending it is one less thing every member holds about
 * every other. */

import { migrate, retrievability } from "./srs.js";
import { sharesRanking } from "./profile.js";
import { streakOf } from "./progress.js";
import { dayKey } from "./text.js";

/* Bumped if the shape below changes in a way a reader cannot infer. Written on
 * every summary so an old document can be recognised rather than guessed at. */
export const SUMMARY_VERSION = 1;

/* How many numbers `fresh` spends on one verse. */
const PAIR = 2;

/* The most recent day the member reviewed anything, or "" for a member who
 * never has. What `streak` is a claim about. */
const lastLoggedDay = (log) =>
  Object.keys(log || {})
    .sort()
    .pop() || "";

/* One member's record, reduced to what the board asks of it. `name` is the
 * fallback for a member whose profile has none, their Google account's, which
 * firebase.js already holds. */
export function summarize({ name = "", profile, progress, log, now = Date.now() } = {}) {
  const p = profile || {};
  /* A member who has taken themselves off the board is not named on the wire.
   *
   * The row itself still goes up, because their figures still belong to their
   * ministry's average (standingsBy), but the one field that says who those
   * figures are is left out, so hiding is not a thing the reading client is
   * trusted to honour. `standings` is readable by every signed-in member, so a
   * name withheld only in the view-model would not be withheld at all. */
  const shares = sharesRanking(p);
  return {
    v: SUMMARY_VERSION,
    shareRanking: shares,
    name: shares ? p.name || name || "" : "",
    ministryGroup: p.ministryGroup || "",
    gender: p.gender || "",
    gradClass: p.gradClass || "",
    // Committed verses only: an uncommitted one is not on the board's books.
    fresh: Object.values(progress || {})
      .map(migrate)
      .filter((r) => r.status === "memorized" && r.last && r.stability)
      .flatMap((r) => [r.last, r.stability]),
    streak: streakOf(log, new Date(now)),
    streakDay: lastLoggedDay(log),
    updatedAt: now,
  };
}

/* Yesterday's key, for the one question asked of `streakDay`. */
function yesterdayKey(now) {
  const d = new Date(now);
  d.setDate(d.getDate() - 1);
  return dayKey(d);
}

/* A summary read back as the row viewmodel/leaderboard.js ranks, the same
 * shape App.loadRoster used to build out of a whole record.
 *
 * The freshness is computed here rather than stored, which is the point of the
 * shape: a member who has not opened the app for a fortnight sinks down the
 * board over that fortnight, exactly as they did when the board held their
 * whole record. A streak, being a run of days rather than a curve, cannot be
 * carried forward the same way, so it stands only while the day it was true
 * of is today or yesterday, and is nothing after that. */
export function rowFromSummary(summary, now = Date.now()) {
  const s = summary || {};
  const fresh = Array.isArray(s.fresh) ? s.fresh : [];
  const day = s.streakDay || "";
  let freshnessScore = 0;
  for (let i = 0; i + 1 < fresh.length; i += PAIR) {
    freshnessScore += retrievability({ last: fresh[i], stability: fresh[i + 1] }, now);
  }
  return {
    name: s.name || "",
    /* Absent on every summary written before the switch existed, and none of
     * those members asked to be taken off, so anything but an explicit false
     * reads as shown, exactly as profile.sharesRanking does. */
    shareRanking: s.shareRanking !== false,
    count: Math.floor(fresh.length / PAIR),
    freshnessScore,
    streak: day === dayKey(new Date(now)) || day === yesterdayKey(now) ? s.streak || 0 : 0,
    ministryGroup: s.ministryGroup,
    gender: s.gender,
    gradClass: s.gradClass,
  };
}
