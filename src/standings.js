/* Ranking groups instead of people.
 *
 * The leaderboard has always been able to *filter* by the three things a member
 * puts in their profile — ministry group, gender, graduating class. This is the
 * other half: the groups themselves ranked against each other, so a ministry can
 * see where it stands rather than only who inside it is doing well.
 *
 * Everything here is pure and takes the same roster rows viewmodel/leaderboard.js
 * has already assembled and filtered — `{ count, freshnessScore, streak, me }`
 * plus the profile fields — so grouping composes with filtering rather than
 * replacing it: rank the ministries within the class of 2027 and both questions
 * are answered at once.
 *
 * The measure is PER MEMBER, and that is the whole design. Ranking by a total
 * would rank by attendance: the largest ministry wins every week, the smallest
 * can never place, and the board stops telling anyone anything they can act on.
 * An average asks the only question a group can actually answer — how are we
 * doing, each of us — so a group of five holding their verses well outranks
 * forty who are not. */

/* The three things a member can be grouped by. `field` is the profile attribute;
 * `key` is what the segmented control and state carry. "people" is the absence
 * of grouping and deliberately lives in the same list, so the control is one
 * row of choices rather than a mode switch beside a mode switch. */
export const RANK_BY = [
  { key: "people", field: null },
  { key: "group", field: "ministryGroup" },
  { key: "gender", field: "gender" },
  { key: "gradClass", field: "gradClass" },
];

export const rankFieldFor = (key) => (RANK_BY.find((r) => r.key === key) || RANK_BY[0]).field;

/* A member with nothing to their name yet does not drag their group down.
 *
 * This is the one judgement in here that could reasonably go the other way, so
 * it is worth saying why: the individual board already leaves out anyone with
 * nothing committed, on the grounds that there is nothing to rank. Counting
 * them in a group average would quietly re-admit them — and it would mean a
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
 * Ties break on the number of members, so the larger group is listed first —
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
