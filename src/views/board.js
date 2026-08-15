/* The board — the app's home view.
 *
 * Top to bottom: the progress hero, today's queue beside the four review modes,
 * a cell-per-passage map of the whole set, and the last fortnight's activity
 * next to a pace check. */

import { html, sx, corners } from "../dom.js";
import { LABEL_META, muted } from "../ui/tokens.js";

export function boardView(v) {
  return html`<div
    style=${sx("max-width:1280px;margin:0 auto;padding:40px 36px 80px;display:flex;flex-direction:column;gap:40px")}
  >
    <div
      className="blueprint"
      style=${sx("display:grid;grid-template-columns:1.3fr 1fr;background:var(--color-accent-900);color:#f2f2f3;border-color:var(--color-accent-900)")}
    >
      ${corners()}
      <div style=${sx("padding:36px 40px 32px;display:flex;flex-direction:column;gap:22px")}>
        <div style=${sx("font-size:11px;letter-spacing:.16em;text-transform:uppercase;opacity:.72")}>
          Progress to ${v.deadlineLabel}
        </div>
        <div style=${sx("display:flex;align-items:flex-end;gap:16px")}>
          <div
            style=${sx("font-family:var(--font-heading);font-weight:600;font-size:112px;line-height:.82;letter-spacing:-.02em")}
          >
            ${v.memorized}
          </div>
          <div style=${sx("display:flex;flex-direction:column;gap:2px;padding-bottom:8px")}>
            <div style=${sx("font-family:var(--font-heading);font-size:26px;line-height:1;opacity:.7")}>
              / ${v.goal}
            </div>
            <div style=${sx("font-size:12px;letter-spacing:.1em;text-transform:uppercase;opacity:.6")}>
              passages committed
            </div>
          </div>
        </div>
        <div style=${sx("height:10px;border:1px solid rgba(242,242,243,.4);position:relative")}>
          <div style=${sx(v.barStyle)}></div>
        </div>
        <div style=${sx("display:flex;gap:28px;font-size:12px;opacity:.75")}>
          <div>${v.learning} in progress</div>
          <div>${v.remaining} not started</div>
          <div>${v.pctLabel} of the goal</div>
        </div>
      </div>
      <div style=${sx("display:grid;grid-template-columns:1fr 1fr;border-left:1px solid rgba(242,242,243,.25)")}>
        ${v.heroStats.map(
          (st) =>
            html` <div key=${st.label} style=${sx(st.style)}>
              <div style=${sx("font-size:10px;letter-spacing:.14em;text-transform:uppercase;opacity:.6")}>
                ${st.label}
              </div>
              <div style=${sx("font-family:var(--font-heading);font-weight:600;font-size:40px;line-height:1")}>
                ${st.value}
              </div>
              <div style=${sx("font-size:11px;opacity:.6")}>${st.note}</div>
            </div>`,
        )}
      </div>
    </div>

    <div style=${sx("display:grid;grid-template-columns:1.15fr 1fr;gap:32px;align-items:start")}>
      <div style=${sx("display:flex;flex-direction:column;gap:14px")}>
        <div style=${sx("display:flex;align-items:baseline;gap:12px")}>
          <h4 style=${sx("margin:0;letter-spacing:.02em")}>Due today</h4>
          <div style=${sx(LABEL_META)}>${v.dueCount} passages</div>
        </div>
        <div className="blueprint" style=${sx("display:flex;flex-direction:column")}>
          ${corners()}
          ${v.queue.map(
            (q) =>
              html` <button key=${q.id} onClick=${q.onClick} style=${sx(q.style)}>
                <span
                  style=${sx("font-family:var(--font-heading);font-size:11px;letter-spacing:.1em;width:34px;flex:none;opacity:.5;text-align:left")}
                  >${q.num}</span
                >
                <span
                  style=${sx("font-family:var(--font-heading);font-weight:600;font-size:16px;width:170px;flex:none;text-align:left")}
                  >${q.ref}</span
                >
                <span
                  style=${sx(`font-size:13px;flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${muted(60)}`)}
                  >${q.snippet}</span
                >
                <span style=${sx(q.freshStyle)}>${q.freshLabel}</span>
                <span style=${sx(q.tagStyle)}>${q.statusLabel}</span>
              </button>`,
          )}
        </div>
      </div>

      <div style=${sx("display:flex;flex-direction:column;gap:14px")}>
        <h4 style=${sx("margin:0;letter-spacing:.02em")}>Ways to review</h4>
        <div style=${sx("display:grid;grid-template-columns:1fr 1fr;gap:14px")}>
          ${v.modes.map(
            (m) =>
              html` <button
                key=${m.key}
                className="blueprint"
                onClick=${m.onClick}
                style=${sx("background:transparent;cursor:pointer;padding:18px 16px;display:flex;flex-direction:column;gap:6px;text-align:left;font-family:var(--font-body);color:var(--color-text)")}
              >
                ${corners()}
                <div
                  style=${sx("font-family:var(--font-heading);font-size:11px;letter-spacing:.14em;color:var(--color-accent-700)")}
                >
                  ${m.index}
                </div>
                <div style=${sx("font-family:var(--font-heading);font-weight:600;font-size:19px;line-height:1.1")}>
                  ${m.name}
                </div>
                <div style=${sx(`font-size:12px;line-height:1.45;color:${muted(58)}`)}>${m.desc}</div>
              </button>`,
          )}
        </div>
      </div>
    </div>

    <div style=${sx("display:flex;flex-direction:column;gap:16px")}>
      <div style=${sx("display:flex;align-items:baseline;gap:12px")}>
        <h4 style=${sx("margin:0;letter-spacing:.02em")}>The whole set</h4>
        <div style=${sx(LABEL_META)}>one cell per passage, in canonical order</div>
        <div
          style=${sx(`margin-left:auto;display:flex;gap:18px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${muted(55)}`)}
        >
          <span style=${sx("display:flex;align-items:center;gap:6px")}
            ><i style=${sx("width:10px;height:10px;background:var(--color-accent-900);display:block")}></i
            >committed</span
          >
          <span style=${sx("display:flex;align-items:center;gap:6px")}
            ><i style=${sx("width:10px;height:10px;background:var(--color-accent-300);display:block")}></i>in
            progress</span
          >
          <span style=${sx("display:flex;align-items:center;gap:6px")}
            ><i style=${sx("width:10px;height:10px;border:1px solid var(--color-divider);display:block")}></i>not
            started</span
          >
        </div>
      </div>
      <div className="blueprint" style=${sx("padding:22px")}>
        ${corners()}
        <div style=${sx("display:grid;grid-template-columns:repeat(28,1fr);gap:5px")}>
          ${v.mapCells.map((c) => html`<button key=${c.id} title=${c.title} onClick=${c.onClick} style=${sx(c.style)}></button>`)}
        </div>
      </div>
    </div>

    <div style=${sx("display:grid;grid-template-columns:1fr 1fr;gap:32px;align-items:start")}>
      <div style=${sx("display:flex;flex-direction:column;gap:14px")}>
        <h4 style=${sx("margin:0;letter-spacing:.02em")}>Last ${v.activityDays} days</h4>
        <div className="blueprint" style=${sx("padding:20px 22px 16px;display:flex;flex-direction:column;gap:10px")}>
          ${corners()}
          <div style=${sx("display:flex;align-items:flex-end;gap:6px;height:110px")}>
            ${v.dayBars.map((d) => html`<div key=${d.key} title=${d.title} style=${sx(d.style)}></div>`)}
          </div>
          <div
            style=${sx(`display:flex;justify-content:space-between;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:${muted(45)}`)}
          >
            <span>${v.barsFrom}</span><span>reviews per day</span><span>today</span>
          </div>
        </div>
      </div>
      <div style=${sx("display:flex;flex-direction:column;gap:14px")}>
        <h4 style=${sx("margin:0;letter-spacing:.02em")}>Pace check</h4>
        <div className="blueprint" style=${sx("padding:22px 24px;display:flex;flex-direction:column;gap:14px")}>
          ${corners()}
          <div style=${sx("font-family:var(--font-heading);font-weight:600;font-size:28px;line-height:1.15")}>
            ${v.paceHeadline}
          </div>
          <p style=${sx(`margin:0;font-size:13px;line-height:1.6;color:${muted(65)}`)}>${v.paceBody}</p>
          <div style=${sx("display:flex;gap:10px;margin-top:2px")}>
            <button className="btn btn-primary" onClick=${v.startDue}>Start a session</button>
            <button className="btn btn-secondary" onClick=${v.goList}>Browse all ${v.goal}</button>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}
