/* The passage list's view-model: searching, filtering, and the ticked rows.
 *
 * Ticking is the only place a sitting is hand-picked instead of dealt from a
 * pool, so what is asserted here is mostly the boundary that keeps that from
 * becoming a loophole: a selection is still divided into a review half and a
 * learn half (see test/progress.test.mjs for the split itself), and the two
 * halves are never offered as one session. */

import test from "node:test";
import assert from "node:assert/strict";

import { progressReader } from "../src/progress.js";
import { listVals } from "../src/viewmodel/list.js";
import { committed, learning, NOW, stateOf } from "./helpers/setup-fixtures.mjs";

/* Four passages: two committed, one in progress, one untouched. */
const PASSAGES = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
const PROGRESS = { 1: committed(30), 2: committed(0), 3: learning(2) };

function build(over = {}, progress = PROGRESS, passages = PASSAGES) {
  const capture = { started: [] };
  const actions = {
    startSession: (mode, ids, kind) => capture.started.push({ mode, ids, kind }),
    toggleSelect: (id) => (capture.toggled = id),
    selectRange: (ids, on) => (capture.range = { ids, on }),
    setSelection: (ids) => (capture.selection = ids),
    setSearch: () => {},
    setFilter: () => {},
    setListCategory: (key) => (capture.listCategory = key),
  };
  const state = stateOf(passages, progress, { search: "", filter: "All", selection: [], ...over });
  const prog = progressReader(state.progress, NOW);
  return { v: listVals({ state, prog, actions }), capture };
}

const rowFor = (v, id) => v.rows.find((r) => r.id === id);

test("nothing is ticked to begin with, so the bar has nothing to offer", () => {
  const { v } = build();
  assert.equal(v.selectionCount, 0);
  assert.deepEqual(v.selectionActions, []);
  assert.equal(
    v.rows.every((r) => !r.selected),
    true,
  );
});

test("a ticked row says so, and clicking it hands the id back", () => {
  const { v, capture } = build({ selection: [2] });
  assert.equal(rowFor(v, 2).selected, true);
  assert.equal(rowFor(v, 2).selectMark, "✓");
  assert.equal(rowFor(v, 1).selected, false);
  assert.equal(rowFor(v, 1).selectMark, "");

  rowFor(v, 1).onSelect();
  assert.equal(capture.toggled, 1, "the row toggles itself; the shell keeps the list");
});

test("a selection of committed verses offers a review, and no learn", () => {
  const { v, capture } = build({ selection: [1, 2] });
  assert.equal(v.selectionCount, 2);
  assert.match(v.selectionLabel, /^2 verses selected$/);
  assert.deepEqual(
    v.selectionActions.map((a) => a.label),
    ["Review 2"],
  );

  v.selectionActions[0].onClick();
  assert.deepEqual(capture.started, [{ mode: undefined, ids: [1, 2], kind: "review" }]);
});

test("a selection of uncommitted verses offers a learn, and no review", () => {
  const { v, capture } = build({ selection: [3, 4] });
  assert.deepEqual(
    v.selectionActions.map((a) => a.label),
    ["Learn 2"],
  );

  v.selectionActions[0].onClick();
  assert.deepEqual(capture.started, [{ mode: undefined, ids: [3, 4], kind: "learn" }]);
});

test("a selection straddling both halves is two sittings, never one", () => {
  const { v, capture } = build({ selection: [1, 3, 4] });
  assert.deepEqual(
    v.selectionActions.map((a) => a.label),
    ["Review 1", "Learn 2"],
  );
  assert.match(v.selectionNote, /Committed verses are reviewed and the rest are learned/);

  v.selectionActions.forEach((a) => a.onClick());
  assert.deepEqual(capture.started, [
    { mode: undefined, ids: [1], kind: "review" },
    { mode: undefined, ids: [3, 4], kind: "learn" },
  ]);
  assert.equal(capture.selection, undefined, "and taking one half does not clear the ticks");
});

test("one half only needs no explaining", () => {
  assert.equal(build({ selection: [1, 2] }).v.selectionNote, "");
  assert.equal(build({ selection: [3, 4] }).v.selectionNote, "");
});

test("the count is of verses still in the set, not of ids", () => {
  const { v } = build({ selection: [1, 99] });
  assert.equal(v.selectionCount, 1);
  assert.match(v.selectionLabel, /^1 verse selected$/);
});

/* ── the header tick box acts on what is on screen ────────────────────────── */

test("select-all takes the rows the filter has left, and nothing else", () => {
  const { v, capture } = build({ filter: "Committed" });
  assert.equal(v.selectAllOn, false);

  v.onSelectAll();
  assert.deepEqual(capture.selection, [1, 2], "the committed rows only");
});

test("select-all adds to a selection rather than replacing it", () => {
  const { v, capture } = build({ filter: "Committed", selection: [4] });
  v.onSelectAll();
  assert.deepEqual(capture.selection, [4, 1, 2]);
});

test("with every shown row ticked, the box clears just those rows", () => {
  const { v, capture } = build({ filter: "Committed", selection: [1, 2, 4] });
  assert.equal(v.selectAllOn, true, "every row on screen is ticked");

  v.onSelectAll();
  assert.deepEqual(capture.selection, [4], "the verse hidden by the filter keeps its tick");
});

test("a verse ticked out of sight is counted, and said so", () => {
  const { v } = build({ filter: "Committed", selection: [1, 4] });
  assert.equal(v.selectionCount, 2);
  assert.match(v.selectionLabel, /2 verses selected · 1 not shown/);
  assert.deepEqual(
    v.selectionActions.map((a) => a.label),
    ["Review 1", "Learn 1"],
    "and it is still in the sitting it belongs to",
  );
});

test("an empty result has no select-all to press", () => {
  const { v } = build({ search: "nothing matches this" });
  assert.equal(v.shownCount, 0);
  assert.equal(v.selectAllOn, false, "not 'all of nothing'");
});

test("clearing drops the whole selection", () => {
  const { v, capture } = build({ selection: [1, 3] });
  v.onClearSelection();
  assert.deepEqual(capture.selection, []);
});

/* ── shift-clicking takes the run between two rows ────────────────────────── */

/* A click on a tick box, with the shift key down. */
const shiftClick = (v, id) => rowFor(v, id).onSelect({ shiftKey: true });

test("a shift-click with nothing to extend from is an ordinary tick", () => {
  const { v, capture } = build();
  shiftClick(v, 3);
  assert.equal(capture.toggled, 3);
  assert.equal(capture.range, undefined);
});

test("a shift-click ticks every row between the anchor and the row clicked", () => {
  const { v, capture } = build({ selection: [1], selectAnchor: 1 });
  shiftClick(v, 4);
  assert.deepEqual(capture.range, { ids: [1, 2, 3, 4], on: true }, "both ends included");
  assert.equal(capture.toggled, undefined, "and it is not also a tick of the row clicked");
});

test("the run reads the same clicked upwards", () => {
  const { v, capture } = build({ selection: [4], selectAnchor: 4 });
  shiftClick(v, 2);
  assert.deepEqual(capture.range, { ids: [2, 3, 4], on: true }, "in the order the rows are on screen");
});

test("the run is bounded by what the search and filter have left on screen", () => {
  // Rows 1 and 2 are the committed ones, so row 3 is not on screen to be
  // swept up by a run drawn across it.
  const { v, capture } = build({ filter: "Committed", selection: [1], selectAnchor: 1 });
  shiftClick(v, 2);
  assert.deepEqual(capture.range, { ids: [1, 2], on: true });
});

test("a run drawn from a row just unticked clears the rows it covers", () => {
  // The anchor is the row last clicked on its own, here one that was clicked
  // off, so the run follows it off rather than back on.
  const { v, capture } = build({ selection: [2, 3], selectAnchor: 1 });
  shiftClick(v, 4);
  assert.deepEqual(capture.range, { ids: [1, 2, 3, 4], on: false });
});

test("an anchor the filter has hidden is nothing to extend from", () => {
  const { v, capture } = build({ filter: "Committed", selection: [3], selectAnchor: 3 });
  shiftClick(v, 1);
  assert.equal(capture.toggled, 1, "so the shift-click is just a tick");
  assert.equal(capture.range, undefined);
});

test("shift-clicking the anchor itself toggles it, rather than doing nothing", () => {
  const { v, capture } = build({ selection: [2], selectAnchor: 2 });
  shiftClick(v, 2);
  assert.equal(capture.toggled, 2);
  assert.equal(capture.range, undefined);
});

test("the run is offered only once there is an end to draw it from", () => {
  assert.equal(build({ selection: [2] }).v.selectionRangeHint, "", "no anchor yet");
  assert.match(build({ selection: [2], selectAnchor: 2 }).v.selectionRangeHint, /Shift-click/);
  assert.equal(
    build({ filter: "Committed", selection: [3], selectAnchor: 3 }).v.selectionRangeHint,
    "",
    "an anchor off screen is no end to draw from",
  );
});

/* ── the per-row shortcut, unchanged by any of this ───────────────────────── */

test("each row still offers the one sitting that suits it", () => {
  const { v, capture } = build();
  assert.equal(rowFor(v, 1).actionLabel, "Review");
  assert.equal(rowFor(v, 3).actionLabel, "Learn");
  assert.equal(rowFor(v, 4).actionLabel, "Learn");

  rowFor(v, 3).onAction();
  assert.deepEqual(capture.started, [{ mode: undefined, ids: [3], kind: "learn" }]);
});

test("state.selection missing entirely is an empty selection, not a crash", () => {
  const { v } = build({ selection: undefined });
  assert.equal(v.selectionCount, 0);
});

/* ── categories ───────────────────────────────────────────────────────────── */

/* Passages spread across the three shelves, with the two sections of one long
 * chapter next to each other so the heading has a run to sit on. */
const SHELVED = [
  { id: 1, category: "core" },
  { id: 2, category: "psalms" },
  { id: 3, category: "dt", group: "Hebrews 11" },
  { id: 4, category: "dt", group: "Hebrews 11" },
];

test("the category tabs offer All and every shelf, with All chosen to begin with", () => {
  const { v } = build({}, {}, SHELVED);
  assert.deepEqual(
    v.categoryTabs.map((t) => t.key),
    ["all", "core", "psalms", "dt"],
  );
  // "All" is the only one lit, which is what makes the list open on the whole
  // set exactly as it did before there were categories.
  assert.equal(v.categoryTabs.filter((t) => t.style.includes("var(--color-accent)")).length, 1);
  assert.equal(v.rows.length, 4);
});

test("choosing a category narrows the rows to that shelf", () => {
  const { v } = build({ listCategory: "dt" }, {}, SHELVED);
  assert.deepEqual(
    v.rows.map((r) => r.id),
    [3, 4],
  );
});

test("a passage with no category of its own counts as core", () => {
  const { v } = build({ listCategory: "core" }, {}, [{ id: 1 }, { id: 2, category: "psalms" }]);
  assert.deepEqual(
    v.rows.map((r) => r.id),
    [1],
  );
});

test("a category that no longer exists reads as All rather than as an empty shelf", () => {
  const { v } = build({ listCategory: "apocrypha" }, {}, SHELVED);
  assert.equal(v.rows.length, 4);
});

test("the first shown section of a chapter carries the heading and the rest do not", () => {
  const { v } = build({}, {}, SHELVED);
  assert.equal(rowFor(v, 3).groupLabel, "Hebrews 11");
  assert.equal(rowFor(v, 4).groupLabel, "");
  // A passage that is not part of a chapter has no heading at all.
  assert.equal(rowFor(v, 1).groupLabel, "");
});

test("a filter that hides the first section moves the heading to the one still shown", () => {
  // Only id 4 survives the search, so it becomes the first shown row of the run
  // and has to carry the heading itself, otherwise the section would appear
  // with nothing saying which chapter it is from.
  const { v } = build({ search: "verse 4" }, {}, SHELVED);
  assert.deepEqual(
    v.rows.map((r) => r.id),
    [4],
  );
  assert.equal(rowFor(v, 4).groupLabel, "Hebrews 11");
});

test("the summary counts the whole set, not just the goal category", () => {
  // This screen shows every shelf. Borrowing the board's goal-scoped figures
  // would leave the passages on the other shelves apparently unaccounted for.
  const { v } = build({}, { 1: committed(0), 2: committed(0) }, SHELVED);
  assert.equal(v.shownCount, 4);
  assert.equal(v.listCommitted, 2);
  assert.equal(v.listUntouched, 2);
});
