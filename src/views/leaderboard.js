/* Leaderboard — the roster ranked by passages committed, sliceable by the
 * profile attributes members set (ministry group, gender, graduating class). */

import { html, sx, corners } from "../dom.js";
import { LABEL_META, muted } from "../ui/tokens.js";

export function leaderboardView(v) {
  return html`<div
    style=${sx("max-width:1080px;margin:0 auto;padding:40px 36px 80px;display:flex;flex-direction:column;gap:26px")}
  >
    <div style=${sx("display:flex;align-items:flex-end;gap:20px")}>
      <div>
        <h2 style=${sx("margin:0")}>Leaderboard</h2>
        <div style=${sx(`font-size:13px;color:${muted(55)}`)}>Ranked by passages committed · ${v.groupName}</div>
      </div>
      <div style=${sx("margin-left:auto;" + LABEL_META)}>${v.daysLeftLabel}</div>
    </div>

    <div
      className="blueprint"
      style=${sx("padding:16px 20px;display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end")}
    >
      ${corners()}
      ${v.leaderFilters.map(
        (f) =>
          html` <label key=${f.key} style=${sx("display:flex;flex-direction:column;gap:6px")}>
            <span style=${sx(`font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:${muted(55)}`)}
              >${f.label}</span
            >
            <select
              className="input"
              value=${f.value}
              onChange=${f.onChange}
              style=${sx("min-width:170px;padding-top:7px;padding-bottom:7px")}
            >
              ${f.opts.map((o) => html`<option key=${o} value=${o}>${o === "All" ? "Everyone" : f.fmt(o)}</option>`)}
            </select>
          </label>`,
      )}
      <div
        style=${sx(`margin-left:auto;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:${muted(55)}`)}
      >
        ${v.leaderCount} ${v.leaderCount === 1 ? "person" : "people"}
      </div>
    </div>

    ${
      v.leaderEmpty &&
      html`<div style=${sx(`font-size:14px;line-height:1.6;color:${muted(60)}`)}>
        No one matches these filters yet.
      </div>`
    }

    <div style=${sx("display:grid;grid-template-columns:repeat(3,1fr);gap:18px")}>
      ${v.podium.map(
        (p) =>
          html` <div key=${p.place} className="blueprint" style=${sx(p.cardStyle)}>
            ${corners()}
            <div style=${sx("font-family:var(--font-heading);font-size:11px;letter-spacing:.16em;opacity:.6")}>
              ${p.place}
            </div>
            <div style=${sx("font-family:var(--font-heading);font-weight:600;font-size:24px;line-height:1.1")}>
              ${p.name}
            </div>
            <div style=${sx("display:flex;align-items:baseline;gap:8px")}>
              <div style=${sx("font-family:var(--font-heading);font-weight:600;font-size:44px;line-height:1")}>
                ${p.count}
              </div>
              <div style=${sx("font-size:11px;letter-spacing:.1em;text-transform:uppercase;opacity:.6")}>
                of ${v.goal}
              </div>
            </div>
          </div>`,
      )}
    </div>

    <div className="blueprint" style=${sx("padding:0 20px 10px")}>
      ${corners()}
      <table className="table">
        <thead>
          <tr>
            <th style=${sx("width:60px")}>#</th>
            <th>Name</th>
            <th style=${sx("width:120px")}>Committed</th>
            <th style=${sx("width:300px")}>Progress</th>
            <th style=${sx("width:110px")}>Streak</th>
          </tr>
        </thead>
        <tbody>
          ${v.board.map(
            (b) =>
              html` <tr key=${b.rank} style=${sx(b.rowStyle)}>
                <td style=${sx(`font-family:var(--font-heading);color:${muted(45)}`)}>${b.rank}</td>
                <td style=${sx("font-family:var(--font-heading);font-weight:600;font-size:16px")}>${b.name}</td>
                <td style=${sx("font-family:var(--font-heading);font-size:17px")}>${b.count}</td>
                <td>
                  <div style=${sx("height:8px;background:var(--color-neutral-200)")}>
                    <div style=${sx(b.barStyle)}></div>
                  </div>
                </td>
                <td style=${sx(`font-size:13px;color:${muted(60)}`)}>${b.streak}</td>
              </tr>`,
          )}
        </tbody>
      </table>
    </div>
  </div>`;
}
