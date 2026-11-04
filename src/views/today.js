/* Today: the daily visit, on one column.
 *
 * The date, what is due, one button. It is laid out for a phone held in one
 * hand (the installed copy opens here, see manifest.webmanifest), so the button
 * is full width and the list under it is a list, not a table. The whole-set
 * map, the chart and the pace check stay on the board, where there is room. */

import { html, sx, corners } from "../dom.js";
import { LABEL_SECTION, muted } from "../ui/tokens.js";

export function todayView(v) {
  return html`<div className="today-page screen">
    <div style=${sx("display:flex;flex-direction:column;gap:6px")}>
      <div style=${sx("font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--color-accent-700)")}>
        ${v.todayDateLabel}
      </div>
      <h1 style=${sx("margin:0")}>${v.todayHeadline}</h1>
      <p style=${sx(`margin:0;font-size:15px;line-height:1.6;color:${muted(65)};max-width:52ch`)}>${v.todayBody}</p>
    </div>

    <div style=${sx("display:flex;flex-direction:column;gap:10px")}>
      <button className="btn btn-primary today-cta" onClick=${v.todayPrimary} disabled=${v.todayPrimaryDisabled}>
        ${v.todayPrimaryLabel}
      </button>
      ${
        v.todaySecondaryLabel &&
        html`<button className="btn btn-secondary today-cta" onClick=${v.todaySecondary}>
          ${v.todaySecondaryLabel}
        </button>`
      }
    </div>

    <div className="blueprint today-stats">
      ${corners()}
      ${v.todayStats.map(
        (s) =>
          html`<div key=${s.key} style=${sx("display:flex;flex-direction:column;gap:4px;padding:14px 16px")}>
            <span style=${sx(v.todayStatStyle)}>${s.label}</span>
            <span style=${sx("font-family:var(--font-heading);font-weight:600;font-size:24px;line-height:1")}
              >${s.value}</span
            >
          </div>`,
      )}
    </div>

    ${
      v.todayDue.length > 0 &&
      html`<div style=${sx("display:flex;flex-direction:column;gap:12px")}>
        <div style=${sx(LABEL_SECTION)}>${v.todayDueTitle}</div>
        <div className="blueprint" style=${sx("display:flex;flex-direction:column")}>
          ${corners()}
          ${v.todayDue.map(
            (q) =>
              html`<button key=${q.id} className="queue-row item-in" onClick=${q.onClick} style=${sx(q.style)}>
                <span style=${sx("display:flex;flex-direction:column;gap:3px;flex:1;min-width:0")}>
                  <span style=${sx("font-family:var(--font-heading);font-weight:600;font-size:15px")}>${q.ref}</span>
                  <span
                    style=${sx(`font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${muted(55)}`)}
                    >${q.snippet}</span
                  >
                </span>
                <span style=${sx(q.freshStyle)}>${q.freshLabel}</span>
              </button>`,
          )}
        </div>
      </div>`
    }

    <p style=${sx(`margin:0;font-size:12px;line-height:1.6;color:${muted(50)};max-width:52ch`)}>${v.todayNote}</p>
  </div>`;
}
