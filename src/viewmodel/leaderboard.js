/* View-model for the leaderboard.
 *
 * The roster fetched from Firestore has self removed (see App.loadRoster); this
 * module adds "You" back from local state, so your own row always reflects the
 * newest progress even before it has synced.
 *
 * Ranking is by freshness score = Σ retrievability across committed verses,
 * so a member with fewer but well-maintained verses can rank above one who has
 * committed many but let them all fade. */

import { copy } from "../copy.js";
import { freshnessSum } from "../progress.js";
import { RANK_BY, rankFieldFor, standingsBy } from "../standings.js";
import { segButton } from "../ui/tokens.js";

/* The filters offered above the board. `field` is the profile attribute each one
 * narrows by, which is also what makes the option lists self-building: every
 * distinct value present in the roster becomes a choice. */
const FILTERS = [
  { key: "group", field: "ministryGroup", label: copy.leaderboard.filterGroup },
  { key: "gender", field: "gender", label: copy.leaderboard.filterGender },
  { key: "gradClass", field: "gradClass", label: copy.leaderboard.filterClass },
];

/* The stored value for a filter/group, as it should read on screen. Only
 * gender and graduating class need a translation — ministry group is already
 * shown verbatim. */
const displayValue = (key, value) =>
  key === "gender" ? copy.gender[value] || value : key === "gradClass" ? copy.leaderboard.filterClassOf(value) : value;

const ANY = copy.common.all;
const PLACES = copy.leaderboard.places;

/* Distinct non-empty values of one attribute across the roster. Numbers sort
 * descending (newest class first); everything else alphabetically. */
function distinctValues(rows, field) {
  const values = rows.map((r) => r[field]).filter((x) => x != null && x !== "");
  return [...new Set(values)].sort((a, b) => (typeof a === "number" ? b - a : String(a).localeCompare(String(b))));
}

/* Average freshness % across committed verses, or 0 if none committed. */
function avgFreshPct(freshnessScore, count) {
  return count > 0 ? Math.round((freshnessScore / count) * 100) : 0;
}

export function leaderboardVals({ state, totals, myStreak, actions, now = Date.now() }) {
  const me = state.profile || {};
  const myFreshnessScore = freshnessSum(state.progress, now);
  const roster = (state.peers || []).concat([
    {
      name: copy.leaderboard.you,
      // Every category, matching the peer rows above — a peer's count is the
      // committed verses in their summary (standings.summarize), which knows
      // nothing about the goal category. totals.memorized is the goal's own
      // count and would have quietly under-reported you against everybody else.
      count: totals.committedAll,
      freshnessScore: myFreshnessScore,
      streak: myStreak,
      me: true,
      ministryGroup: me.ministryGroup,
      gender: me.gender,
      gradClass: me.gradClass,
    },
  ]);

  const selected = state.leaderFilter;
  // Compare as strings: a <select> hands back its value as text, so a numeric
  // graduating class would never match a strict ===.
  const passes = (row) =>
    FILTERS.every((f) => selected[f.key] === ANY || String(row[f.field]) === String(selected[f.key]));

  // A member with nothing committed yet has no row on the board at all — there
  // is nothing meaningful to rank or display for them.
  const ranked = roster
    .filter(passes)
    .filter((p) => p.count > 0)
    .sort((a, b) => b.freshnessScore - a.freshnessScore || b.count - a.count);
  const top = Math.max(1, ranked[0] ? ranked[0].freshnessScore : 1);

  // Ranking groups is the same board asked a different question, so it runs off
  // the same filtered rows: rank the ministries within the class of 2027 and
  // both are answered at once. The measure is per member throughout — see
  // standings.js for why a total would only rank attendance.
  const rankBy = state.leaderRankBy || "people";
  // A group's name is its raw field value (e.g. standingsBy names a ministry
  // grouping "Kairos" straight off the profile) — gender is the one grouping
  // whose stored value is not what a member should read on screen.
  const grouped = standingsBy(ranked, rankFieldFor(rankBy)).map((g) =>
    rankBy === "gender" ? { ...g, name: copy.gender[g.name] || g.name } : g,
  );
  const isGrouped = rankBy !== "people";
  const groupTop = Math.max(1e-9, grouped[0] ? grouped[0].avgScore : 1);
  const groupStyle = (g) =>
    g.mine
      ? "background:var(--color-reverse-bg);color:var(--color-reverse-text);border-color:var(--color-reverse-bg)"
      : "";

  return {
    daysLeftLabel: copy.leaderboard.daysLeft(totals.daysLeft),

    rankByLabel: copy.leaderboard.rankByLabel,
    rankByOptions: RANK_BY.map((r) => ({
      key: r.key,
      label: copy.leaderboard.rankBy[r.key],
      style: segButton(r.key === rankBy),
      onClick: () => actions.setLeaderRankBy(r.key),
    })),
    isGrouped,
    // The blurb explains the measure, and which measure it is depends on what
    // is being ranked — so the two sit together rather than the view choosing.
    blurb: isGrouped ? copy.leaderboard.groupBlurb : copy.leaderboard.blurb,

    leaderFilters: FILTERS.map((f) => ({
      key: f.key,
      label: f.label,
      value: selected[f.key],
      onChange: (e) => actions.setLeaderFilter(f.key, e.target.value),
      opts: [ANY, ...distinctValues(roster, f.field)],
      fmt: (o) => displayValue(f.key, o),
    })),

    // Counts whatever the table below holds, which is not always people.
    leaderCount: isGrouped ? copy.leaderboard.countGroups(grouped.length) : copy.leaderboard.count(ranked.length),
    leaderEmpty: isGrouped ? grouped.length === 0 : ranked.length === 0,
    emptyNote: isGrouped ? copy.leaderboard.groupEmpty : copy.leaderboard.empty,

    podium: (isGrouped ? grouped : ranked).slice(0, PLACES.length).map((p, i) => ({
      place: PLACES[i],
      name: p.name,
      // A group's headline figure is what one of its members holds, not what
      // all of them hold between them. One decimal, because whole numbers
      // would make a group of seven look like a group of one.
      count: isGrouped ? p.avgCount.toFixed(1) : p.count,
      // "of 183" is a claim about one person's set, so a group says what the
      // figure is instead of what it is out of. Out of the whole set rather
      // than the goal category, because `count` above spans every category —
      // against the goal's 167 a member could read "170 of 167".
      caption: isGrouped ? copy.leaderboard.podiumEach : copy.leaderboard.podiumOf(totals.totalCount),
      avgFresh: avgFreshPct(p.freshnessScore, p.count) + "%",
      cardStyle:
        "padding:20px 22px;display:flex;flex-direction:column;gap:8px;" +
        (isGrouped
          ? groupStyle(p)
          : p.me
            ? "background:var(--color-reverse-bg);color:var(--color-reverse-text);border-color:var(--color-reverse-bg)"
            : ""),
    })),

    standings: grouped.map((g, i) => ({
      rank: i + 1,
      name: g.name,
      members: copy.leaderboard.groupMembers(g.members),
      avgCount: g.avgCount.toFixed(1),
      avgFresh: avgFreshPct(g.freshnessScore, g.count) + "%",
      mine: g.mine,
      rowStyle: g.mine ? "background:var(--color-accent-100)" : "",
      barStyle:
        "height:100%;background:" +
        (g.mine ? "var(--color-accent-900)" : "var(--color-accent)") +
        ";width:" +
        Math.round((g.avgScore / groupTop) * 100) +
        "%",
    })),

    board: ranked.map((p, i) => ({
      rank: i + 1,
      name: p.name,
      count: p.count,
      avgFresh: avgFreshPct(p.freshnessScore, p.count) + "%",
      streak: copy.leaderboard.streakDays(p.streak),
      rowStyle: p.me ? "background:var(--color-accent-100)" : "",
      barStyle:
        "height:100%;background:" +
        (p.me ? "var(--color-accent-900)" : "var(--color-accent)") +
        ";width:" +
        Math.round((p.freshnessScore / top) * 100) +
        "%",
    })),
  };
}
