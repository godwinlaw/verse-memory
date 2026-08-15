/* View-model for the passage list: search, status filter, and one row per
 * matching passage. */

import { FADING_R, freshBar, freshColor } from "../srs.js";
import { STATUS_LABEL } from "../progress.js";
import { filterTab, muted, statusTag } from "../ui/tokens.js";

/* Filter tabs, in display order. `status` null means "no status filter"; the
 * rest reuse the member-facing status wording so the tabs and the row pills
 * always read the same. */
const FILTERS = [
  { label: "All", status: null },
  { label: STATUS_LABEL.new, status: "new" },
  { label: STATUS_LABEL.learning, status: "learning" },
  { label: STATUS_LABEL.memorized, status: "memorized" },
];

/* The empty freshness meter shown for a passage that has never been reviewed. */
const EMPTY_METER = "height:6px;border-radius:3px;background:var(--color-fresh-track)";

/* Style of the "Fading" flag. Fixed at the midpoint of the freshness scale
 * rather than the passage's own value, so it reads as a warning badge and not as
 * another freshness readout. */
const FADING_TAG =
  `font-size:9px;letter-spacing:.1em;text-transform:uppercase;padding:2px 6px;color:${freshColor(50)};` +
  `border:1px solid ${freshColor(50)}`;

function matches(passage, status, query) {
  if (status && status !== passage.status) return false;
  if (!query) return true;
  return passage.ref.toLowerCase().includes(query) || passage.text.toLowerCase().includes(query);
}

export function listVals({ state, prog, actions }) {
  const active = FILTERS.find((f) => f.label === state.filter) || FILTERS[0];
  const query = state.search.trim().toLowerCase();
  const rows = state.passages
    .map((p) => ({ ...p, status: prog.statusOf(p.id) }))
    .filter((p) => matches(p, active.status, query));

  return {
    shownCount: rows.length,
    search: state.search,
    onSearch: (e) => actions.setSearch(e.target.value),

    statusTabs: FILTERS.map((f) => ({
      label: f.label,
      onClick: () => actions.setFilter(f.label),
      style: filterTab(state.filter === f.label),
    })),

    rows: rows.map((p) => {
      const reviewed = prog.isReviewed(p.id);
      const fresh = prog.freshness(p.id);
      return {
        id: p.id,
        num: String(p.id).padStart(3, "0"),
        ref: p.ref,
        snippet: p.text.slice(0, 120),
        statusLabel: STATUS_LABEL[p.status],
        tagStyle: statusTag(p.status),
        // Committed passages that have decayed past the fading threshold get an
        // extra nudge — they are the ones most at risk of being lost.
        fading: p.status === "memorized" && reviewed && fresh < FADING_R * 100,
        fadingStyle: FADING_TAG,
        freshLabel: reviewed ? fresh + "%" : "—",
        freshColor: reviewed ? freshColor(fresh) : muted(45),
        freshBarStyle: reviewed ? freshBar(fresh) : EMPTY_METER,
        toggleLabel: p.status === "memorized" ? "Un-commit" : "Mark committed",
        onToggle: () => actions.setStatus(p.id, p.status === "memorized" ? "learning" : "memorized"),
        onReview: () => actions.startSession(undefined, [p.id]),
      };
    }),
  };
}
