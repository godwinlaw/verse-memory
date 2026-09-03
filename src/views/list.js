/* All passages, searchable, filterable table of the whole set, and the one
 * screen where a sitting can be hand-picked: tick the rows you want and take
 * them as a review or a learn session. */

import { copy } from "../copy.js";
import { html, sx, corners, React } from "../dom.js";
import { muted } from "../ui/tokens.js";

/* Shift-clicking ticks a run of rows (see viewmodel/list.js), and the browser's
 * own meaning for a shift-click, extend the text selection, would drag a blue
 * smear across the table on the way. Suppressed on mousedown, where that
 * selection is made; the click itself still fires. */
const noTextSelect = (e) => e.shiftKey && e.preventDefault();

/* One column track shared by the header and every row, so they stay aligned. */
const COLUMNS = "grid-template-columns:34px 56px 190px 1fr 110px 130px 110px;gap:0";

/* What the ticked rows can be taken as. Only shown once something is ticked,
 * an empty selection has nothing to say, and the row buttons already cover the
 * one-verse case. */
function selectionBar(v) {
  return html`<div
    className="selection-bar"
    style=${sx(
      "display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 18px;" +
        "border-bottom:1px solid var(--color-divider);background:var(--color-accent-100)",
    )}
  >
    <span style=${sx("font-family:var(--font-heading);font-weight:600;font-size:15px;color:var(--color-accent-800)")}>
      ${v.selectionLabel}
    </span>
    ${v.selectionActions.map(
      (a) =>
        html`<button key=${a.key} className="btn btn-primary" onClick=${a.onClick} style=${sx("font-size:13px")}>
          ${a.label}
        </button>`,
    )}
    <button className="btn btn-secondary" onClick=${v.onClearSelection} style=${sx("font-size:13px")}>
      ${copy.common.clear}
    </button>
    ${
      v.selectionNote &&
      html`<span style=${sx(`font-size:12px;color:${muted(60)};max-width:46ch`)}>${v.selectionNote}</span>`
    }
    ${
      v.selectionRangeHint &&
      html`<span style=${sx(`font-size:12px;color:${muted(60)};max-width:46ch`)}>${v.selectionRangeHint}</span>`
    }
  </div>`;
}

/* The table's head, the column labels, and above them the selection bar once
 * rows are ticked, is one sticky element rather than two stacked ones (see
 * styles.css, .list-head). Both halves are wanted on screen while a member
 * scrolls a long list, and the bar is the half that matters more: it holds what
 * ticking the rows was for, and it used to scroll away leaving a selection with
 * nothing to do about it. Stacking two sticky boxes would mean the lower one
 * knowing the height of the upper, which changes as the bar wraps. */
export function listView(v) {
  return html`<div
    className="screen"
    style=${sx("max-width:1280px;margin:0 auto;padding:40px 36px 80px;display:flex;flex-direction:column;gap:24px")}
  >
    <div style=${sx("display:flex;align-items:flex-end;gap:20px;flex-wrap:wrap")}>
      <div>
        <h2 style=${sx("margin:0")}>${copy.list.title}</h2>
        <div style=${sx(`font-size:13px;color:${muted(55)}`)}>
          ${copy.list.summary(v.shownCount, v.listCommitted, v.listUntouched)}
        </div>
      </div>
      <div style=${sx("margin-left:auto;display:flex;gap:12px;align-items:center")}>
        <input
          className="input"
          placeholder=${copy.list.searchPlaceholder}
          value=${v.search}
          onChange=${v.onSearch}
          style=${sx("width:260px")}
        />
        <div className="seg">
          ${v.categoryTabs.map((t) => html`<button key=${t.key} className="seg-btn" title=${t.title} onClick=${t.onClick} style=${sx(t.style)}>${t.label}</button>`)}
        </div>
        <div className="seg">
          ${v.statusTabs.map((t) => html`<button key=${t.label} className="seg-btn" onClick=${t.onClick} style=${sx(t.style)}>${t.label}</button>`)}
        </div>
      </div>
    </div>

    <div className="blueprint" style=${sx("padding:0")}>
      ${corners()}
      <div className="list-head">
        ${v.selectionCount > 0 && selectionBar(v)}
        <div
          style=${sx(`display:grid;${COLUMNS};padding:10px 18px;border-bottom:1px solid var(--color-divider);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:${muted(55)}`)}
        >
          <div>
            <button
              className="tick"
              onClick=${v.onSelectAll}
              title=${v.selectAllTitle}
              aria-label=${v.selectAllTitle}
              aria-pressed=${v.selectAllOn}
              style=${sx(v.selectAllStyle)}
            >
              ${v.selectAllMark}
            </button>
          </div>
          <div>${copy.list.colNum}</div>
          <div>${copy.list.colRef}</div>
          <div>${copy.list.colSnippet}</div>
          <div>${copy.list.colFreshness}</div>
          <div>${copy.list.colStatus}</div>
          <div style=${sx("text-align:right")}>${copy.list.colAction}</div>
        </div>
      </div>
      ${v.rows.map(
        (r, i) =>
          html`<${React.Fragment} key=${r.id}>
            ${
              r.groupLabel &&
              html`<div
                style=${sx(
                  "padding:14px 18px 6px;font-family:var(--font-heading);font-weight:600;font-size:12px;" +
                    `letter-spacing:.12em;text-transform:uppercase;color:${muted(50)};` +
                    (i ? "border-top:1px solid var(--color-divider)" : ""),
                )}
              >
                ${r.groupLabel}
              </div>`
            }
            <div
              className="item-in"
              style=${sx(
                `display:grid;${COLUMNS};align-items:center;padding:11px 18px;--stagger-i:${i}` +
                  (i ? `;border-top:1px solid ${muted(8)}` : ""),
              )}
            >
              <div>
                <button
                  className="tick"
                  onClick=${r.onSelect}
                  onMouseDown=${noTextSelect}
                  title=${r.selectTitle}
                  aria-label=${r.selectTitle}
                  aria-pressed=${r.selected}
                  style=${sx(r.selectStyle)}
                >
                  ${r.selectMark}
                </button>
              </div>
              <div
                style=${sx(`font-family:var(--font-heading);font-size:12px;letter-spacing:.08em;color:${muted(45)}`)}
              >
                ${r.num}
              </div>
              <div style=${sx("font-family:var(--font-heading);font-weight:600;font-size:17px")}>${r.ref}</div>
              <div
                style=${sx(`font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${muted(62)};padding-right:20px`)}
              >
                ${r.snippet}
              </div>
              <div style=${sx("padding-right:20px;display:flex;flex-direction:column;gap:4px")}>
                <span
                  style=${sx("font-family:var(--font-heading);font-size:12px;font-weight:600;color:" + r.freshColor)}
                  >${r.freshLabel}</span
                >
                <div style=${sx(r.freshBarStyle)}></div>
              </div>
              <div style=${sx("display:flex;align-items:center;gap:6px")}>
                <span style=${sx(r.tagStyle)}>${r.statusLabel}</span>
                ${r.fading ? html`<span style=${sx(r.fadingStyle)}>${copy.list.fading}</span>` : null}
              </div>
              <div style=${sx("display:flex;gap:8px;justify-content:flex-end")}>
                <button
                  className="btn btn-secondary"
                  onClick=${r.onAction}
                  style=${sx("font-size:12px;padding:4px 10px")}
                >
                  ${r.actionLabel}
                </button>
              </div>
            </div>
          <//>`,
      )}
    </div>
  </div>`;
}
