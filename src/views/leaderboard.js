/* Leaderboard — the roster ranked by passages committed, sliceable by the
 * profile attributes members set (ministry group, gender, graduating class),
 * and rankable BY those same attributes: the groups themselves against each
 * other, per member (see src/standings.js).
 *
 * The two compose rather than replacing one another, so the filters stay put
 * and only the table below the podium changes. */

import { copy } from "../copy.js";
import { html, sx, corners } from "../dom.js";
import { CONTROL_ROW, LABEL_META, muted } from "../ui/tokens.js";

export function leaderboardView(v) {
  return html`<div
    className="screen"
    style=${sx("max-width:1080px;margin:0 auto;padding:40px 36px 80px;display:flex;flex-direction:column;gap:26px")}
  >
    <div style=${sx("display:flex;align-items:flex-end;gap:20px")}>
      <div>
        <h2 style=${sx("margin:0")}>${copy.leaderboard.title}</h2>
        <div style=${sx(`font-size:13px;color:${muted(55)}`)}>${v.groupName}</div>
      </div>
      <div style=${sx("margin-left:auto;" + LABEL_META)}>${v.daysLeftLabel}</div>
    </div>
    <div style=${sx(`font-size:13px;color:${muted(55)}`)}>${v.blurb}</div>
    ${
      v.shareNote &&
      html`<div
        className="blueprint"
        style=${sx("padding:14px 18px;font-size:13px;line-height:1.55;display:flex;gap:10px;align-items:flex-start")}
      >
        ${corners()}
        <span aria-hidden="true" style=${sx("opacity:.55;flex:none")}>●</span>
        <span>${v.shareNote}</span>
      </div>`
    }

    <div style=${sx(CONTROL_ROW)}>
      <span style=${sx(`font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:${muted(55)}`)}
        >${v.rankByLabel}</span
      >
      <div style=${sx("display:flex;gap:6px;flex-wrap:wrap")}>
        ${v.rankByOptions.map(
          (o) =>
            html`<button key=${o.key} className="seg-btn" onClick=${o.onClick} style=${sx(o.style)}>
              ${o.label}
            </button>`,
        )}
      </div>
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
              ${f.opts.map(
                (o) =>
                  html`<option key=${o} value=${o}>
                    ${o === copy.common.all ? copy.leaderboard.filterEveryone : f.fmt(o)}
                  </option>`,
              )}
            </select>
          </label>`,
      )}
      <div
        style=${sx(`margin-left:auto;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:${muted(55)}`)}
      >
        ${v.leaderCount}
      </div>
    </div>

    ${v.leaderEmpty && html`<div style=${sx(`font-size:14px;line-height:1.6;color:${muted(60)}`)}>${v.emptyNote}</div>`}

    <div style=${sx("display:grid;grid-template-columns:repeat(3,1fr);gap:18px")}>
      ${v.podium.map(
        (p, i) =>
          html` <div key=${p.place} className="blueprint item-in" style=${sx(p.cardStyle + ";--stagger-i:" + i)}>
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
                ${p.caption}
              </div>
            </div>
            <div style=${sx("font-size:12px;opacity:.6")}>${p.avgFresh} ${copy.leaderboard.podiumAvg}</div>
          </div>`,
      )}
    </div>

    ${v.isGrouped ? standingsTable(v) : peopleTable(v)}
  </div>`;
}

/* The groups themselves, ranked. Every figure on this table is per member, and
 * the headings say so — a column called "Committed" beside a group's name would
 * read as a total, which is the one thing it must not be. */
function standingsTable(v) {
  return html`<div className="blueprint" style=${sx("padding:0 20px 10px")}>
    ${corners()}
    <table className="table">
      <thead>
        <tr>
          <th style=${sx("width:60px")}>${copy.leaderboard.colRank}</th>
          <th>${copy.leaderboard.colName}</th>
          <th style=${sx("width:120px")}>${copy.leaderboard.colGroupMembers}</th>
          <th style=${sx("width:140px")}>${copy.leaderboard.colGroupAvgCommitted}</th>
          <th style=${sx("width:100px")}>${copy.leaderboard.colAvgFresh}</th>
          <th style=${sx("width:260px")}>${copy.leaderboard.colFreshness}</th>
        </tr>
      </thead>
      <tbody>
        ${v.standings.map(
          (g, i) =>
            html` <tr key=${g.name} style=${sx(g.rowStyle + ";--stagger-i:" + i)}>
              <td style=${sx(`font-family:var(--font-heading);color:${muted(45)}`)}>${g.rank}</td>
              <td style=${sx("font-family:var(--font-heading);font-weight:600;font-size:16px")}>
                ${g.name}${
                  g.mine &&
                  html`<span
                    style=${sx(`margin-left:8px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:${muted(55)}`)}
                    >${copy.leaderboard.yourGroup}</span
                  >`
                }
              </td>
              <td style=${sx(`font-size:13px;color:${muted(60)}`)}>${g.members}</td>
              <td style=${sx("font-family:var(--font-heading);font-size:17px")}>${g.avgCount}</td>
              <td style=${sx(`font-size:13px;color:${muted(60)}`)}>${g.avgFresh}</td>
              <td>
                <div style=${sx("height:8px;background:var(--color-neutral-200)")}>
                  <div className="meter-fill" style=${sx(g.barStyle)}></div>
                </div>
              </td>
            </tr>`,
        )}
      </tbody>
    </table>
  </div>`;
}

/* The roster, one row per member — the board as it has always been. */
function peopleTable(v) {
  return html`<div className="blueprint" style=${sx("padding:0 20px 10px")}>
    ${corners()}
    <table className="table">
      <thead>
        <tr>
          <th style=${sx("width:60px")}>${copy.leaderboard.colRank}</th>
          <th>${copy.leaderboard.colName}</th>
          <th style=${sx("width:120px")}>${copy.leaderboard.colCommitted}</th>
          <th style=${sx("width:100px")}>${copy.leaderboard.colAvgFresh}</th>
          <th style=${sx("width:260px")}>${copy.leaderboard.colFreshness}</th>
          <th style=${sx("width:110px")}>${copy.leaderboard.colStreak}</th>
        </tr>
      </thead>
      <tbody>
        ${v.board.map(
          (b, i) =>
            html` <tr key=${b.rank} style=${sx(b.rowStyle + ";--stagger-i:" + i)}>
              <td style=${sx(`font-family:var(--font-heading);color:${muted(45)}`)}>${b.rank}</td>
              <td style=${sx("font-family:var(--font-heading);font-weight:600;font-size:16px")}>${b.name}</td>
              <td style=${sx("font-family:var(--font-heading);font-size:17px")}>${b.count}</td>
              <td style=${sx(`font-size:13px;color:${muted(60)}`)}>${b.avgFresh}</td>
              <td>
                <div style=${sx("height:8px;background:var(--color-neutral-200)")}>
                  <div className="meter-fill" style=${sx(b.barStyle)}></div>
                </div>
              </td>
              <td style=${sx(`font-size:13px;color:${muted(60)}`)}>${b.streak}</td>
            </tr>`,
        )}
      </tbody>
    </table>
  </div>`;
}
