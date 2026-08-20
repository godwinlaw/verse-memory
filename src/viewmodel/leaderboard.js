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

/* The filters offered above the board. `field` is the profile attribute each one
 * narrows by, which is also what makes the option lists self-building: every
 * distinct value present in the roster becomes a choice. */
const FILTERS = [
  { key: "group", field: "ministryGroup", label: copy.leaderboard.filterGroup },
  { key: "gender", field: "gender", label: copy.leaderboard.filterGender },
  { key: "gradClass", field: "gradClass", label: copy.leaderboard.filterClass },
];

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
      count: totals.memorized,
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

  return {
    daysLeftLabel: copy.leaderboard.daysLeft(totals.daysLeft),

    leaderFilters: FILTERS.map((f) => ({
      key: f.key,
      label: f.label,
      value: selected[f.key],
      onChange: (e) => actions.setLeaderFilter(f.key, e.target.value),
      opts: [ANY, ...distinctValues(roster, f.field)],
      fmt: (o) => (f.key === "gradClass" && o !== ANY ? copy.leaderboard.filterClassOf(o) : o),
    })),

    leaderCount: ranked.length,
    leaderEmpty: ranked.length === 0,

    podium: ranked.slice(0, PLACES.length).map((p, i) => ({
      place: PLACES[i],
      name: p.name,
      count: p.count,
      avgFresh: avgFreshPct(p.freshnessScore, p.count) + "%",
      cardStyle:
        "padding:20px 22px;display:flex;flex-direction:column;gap:8px;" +
        (p.me
          ? "background:var(--color-reverse-bg);color:var(--color-reverse-text);border-color:var(--color-reverse-bg)"
          : ""),
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
