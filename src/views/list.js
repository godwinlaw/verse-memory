/* All passages — searchable, filterable table of the whole set. */

import { html, sx, corners } from "../dom.js";
import { muted } from "../ui/tokens.js";

/* One column track shared by the header and every row, so they stay aligned. */
const COLUMNS = "grid-template-columns:56px 190px 1fr 110px 130px 210px;gap:0";

export function listView(v) {
  return html`<div
    style=${sx("max-width:1280px;margin:0 auto;padding:40px 36px 80px;display:flex;flex-direction:column;gap:24px")}
  >
    <div style=${sx("display:flex;align-items:flex-end;gap:20px;flex-wrap:wrap")}>
      <div>
        <h2 style=${sx("margin:0")}>All passages</h2>
        <div style=${sx(`font-size:13px;color:${muted(55)}`)}>
          ${v.shownCount} shown · ${v.memorized} committed · ${v.remaining} untouched
        </div>
      </div>
      <div style=${sx("margin-left:auto;display:flex;gap:12px;align-items:center")}>
        <input
          className="input"
          placeholder="Search reference or text"
          value=${v.search}
          onChange=${v.onSearch}
          style=${sx("width:260px")}
        />
        <div className="seg">
          ${v.statusTabs.map((t) => html`<button key=${t.label} onClick=${t.onClick} style=${sx(t.style)}>${t.label}</button>`)}
        </div>
      </div>
    </div>

    <div className="blueprint" style=${sx("padding:0")}>
      ${corners()}
      <div
        style=${sx(`display:grid;${COLUMNS};padding:10px 18px;border-bottom:1px solid var(--color-divider);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:${muted(55)}`)}
      >
        <div>No.</div>
        <div>Reference</div>
        <div>Opening words</div>
        <div>Freshness</div>
        <div>Status</div>
        <div style=${sx("text-align:right")}>Action</div>
      </div>
      ${v.rows.map(
        (r, i) =>
          html` <div
            key=${r.id}
            style=${sx(
              `display:grid;${COLUMNS};align-items:center;padding:11px 18px` +
                (i ? `;border-top:1px solid ${muted(8)}` : ""),
            )}
          >
            <div style=${sx(`font-family:var(--font-heading);font-size:12px;letter-spacing:.08em;color:${muted(45)}`)}>
              ${r.num}
            </div>
            <div style=${sx("font-family:var(--font-heading);font-weight:600;font-size:17px")}>${r.ref}</div>
            <div
              style=${sx(`font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${muted(62)};padding-right:20px`)}
            >
              ${r.snippet}
            </div>
            <div style=${sx("padding-right:20px;display:flex;flex-direction:column;gap:4px")}>
              <span style=${sx("font-family:var(--font-heading);font-size:12px;font-weight:600;color:" + r.freshColor)}
                >${r.freshLabel}</span
              >
              <div style=${sx(r.freshBarStyle)}></div>
            </div>
            <div style=${sx("display:flex;align-items:center;gap:6px")}>
              <span style=${sx(r.tagStyle)}>${r.statusLabel}</span>
              ${r.fading ? html`<span style=${sx(r.fadingStyle)}>Fading</span>` : null}
            </div>
            <div style=${sx("display:flex;gap:8px;justify-content:flex-end")}>
              <button
                className="btn btn-secondary"
                onClick=${r.onReview}
                style=${sx("font-size:12px;padding:4px 10px")}
              >
                Review
              </button>
              <button
                className="btn btn-secondary"
                onClick=${r.onToggle}
                style=${sx("font-size:12px;padding:4px 10px")}
              >
                ${r.toggleLabel}
              </button>
            </div>
          </div>`,
      )}
    </div>
  </div>`;
}
