/* View-model for the passage list: search, status filter, one row per matching
 * passage, and the rows the member has ticked.
 *
 * Ticking is the one place in the app where a sitting is hand-picked rather
 * than drawn from a pool — the board and the two setup screens all deal from
 * progress.reviewPool()/learnPool(), which decide for the member. A selection
 * is still divided by the same rule (progress.selectionPools), so it can offer
 * a review sitting and a learn sitting but never mix them. */

import { FADING_R, freshBar, freshColor } from "../srs.js";
import { selectionPools, STATUS_LABEL } from "../progress.js";
import { LEARN, REVIEW } from "../review.js";
import { checkBox, filterTab, muted, statusTag } from "../ui/tokens.js";

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

/* One ticked half of the selection, as the button that would start it. Absent
 * when that half is empty, so the bar only ever offers a sitting there is
 * something to fill. */
function sitting(kind, label, verses, actions) {
  if (!verses.length) return null;
  return {
    key: kind,
    label: label + " " + verses.length,
    onClick: () =>
      actions.startSession(
        undefined,
        verses.map((p) => p.id),
        kind,
      ),
  };
}

export function listVals({ state, prog, actions }) {
  const active = FILTERS.find((f) => f.label === state.filter) || FILTERS[0];
  const query = state.search.trim().toLowerCase();
  const rows = state.passages
    .map((p) => ({ ...p, status: prog.statusOf(p.id) }))
    .filter((p) => matches(p, active.status, query));

  const selection = state.selection || [];
  const picked = new Set(selection);
  // The ticked verses, split into the sitting each half belongs to. Counted
  // from this rather than from the raw id list, so an id no longer in the set
  // cannot inflate the tally.
  const { review, learn } = selectionPools(state.passages, state.progress, selection);
  const count = review.length + learn.length;

  // The header tick box acts on the rows in front of the member — which is what
  // makes searching or filtering the way a large selection is made. Clearing it
  // releases only those rows; a verse ticked under some other filter is left
  // where it is, and counted below as one the member cannot currently see.
  const shown = rows.map((p) => p.id);
  const shownPicked = shown.filter((id) => picked.has(id));
  const allShown = shown.length > 0 && shownPicked.length === shown.length;
  const hidden = count - shownPicked.length;

  return {
    shownCount: rows.length,
    search: state.search,
    onSearch: (e) => actions.setSearch(e.target.value),

    statusTabs: FILTERS.map((f) => ({
      label: f.label,
      onClick: () => actions.setFilter(f.label),
      style: filterTab(state.filter === f.label),
    })),

    // ── the selection ─────────────────────────────────────────────────────
    selectionCount: count,
    selectionLabel:
      count + (count === 1 ? " verse selected" : " verses selected") + (hidden ? " · " + hidden + " not shown" : ""),
    // Said only when the picks straddle both halves, since that is the only
    // time the two buttons need explaining. The ticks survive a sitting, so
    // taking one half and then the other is a round trip, not a re-selection.
    selectionNote:
      review.length && learn.length
        ? "Committed verses are reviewed and the rest are learned, so this is two sittings. Your ticks keep."
        : "",
    selectionActions: [sitting(REVIEW, "Review", review, actions), sitting(LEARN, "Learn", learn, actions)].filter(
      Boolean,
    ),
    onClearSelection: () => actions.setSelection([]),

    selectAllOn: allShown,
    selectAllMark: allShown ? "✓" : "",
    selectAllStyle: checkBox(allShown),
    selectAllTitle: allShown ? "Clear the rows shown" : "Select the rows shown",
    onSelectAll: () =>
      actions.setSelection(
        allShown
          ? selection.filter((id) => !shown.includes(id))
          : [...selection, ...shown.filter((id) => !picked.has(id))],
      ),

    rows: rows.map((p) => {
      const reviewed = prog.isReviewed(p.id);
      const fresh = prog.freshness(p.id);
      const selected = picked.has(p.id);
      return {
        id: p.id,
        selected,
        selectMark: selected ? "✓" : "",
        selectStyle: checkBox(selected),
        selectTitle: (selected ? "Deselect " : "Select ") + p.ref,
        onSelect: () => actions.toggleSelect(p.id),
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
        // There is no button that commits a passage — only writing it out does
        // that (srs.commitsVerse). So the row offers the sitting that suits its
        // half of the set: review what is committed, learn what is not.
        actionLabel: p.status === "memorized" ? "Review" : "Learn",
        onAction: () => actions.startSession(undefined, [p.id], p.status === "memorized" ? REVIEW : LEARN),
      };
    }),
  };
}
