/* The board — the app's home view.
 *
 * Top to bottom: the progress hero, the two queues (what to review, what to
 * learn), a cell-per-passage map of the whole set, and the last fortnight's
 * activity next to a pace check. */

import { copy } from "../copy.js";
import { html, sx, corners } from "../dom.js";
import { LABEL_META, muted } from "../ui/tokens.js";

/* One of the board's two queues. Review and Learn are the same table of the
 * same passages at two stages, so they are one component read twice rather than
 * two that have to be kept looking alike. */
function queueCard({ title, count, note, rows, empty }) {
  return html`<div style=${sx("display:flex;flex-direction:column;gap:14px")}>
    <div style=${sx("display:flex;align-items:baseline;gap:12px;flex-wrap:wrap")}>
      <h4 style=${sx("margin:0;letter-spacing:.02em")}>${title}</h4>
      <div style=${sx(LABEL_META)}>${copy.board.queueCount(count)}</div>
      <div style=${sx(`font-size:12px;color:${muted(50)}`)}>${note}</div>
    </div>
    <div className="blueprint" style=${sx("display:flex;flex-direction:column")}>
      ${corners()}
      ${
        rows.length
          ? rows.map(
              (q) =>
                html` <button key=${q.id} className="queue-row item-in" onClick=${q.onClick} style=${sx(q.style)}>
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
                  ${q.freshLabel && html`<span style=${sx(q.freshStyle)}>${q.freshLabel}</span>`}
                  <span style=${sx(q.tagStyle)}>${q.statusLabel}</span>
                </button>`,
            )
          : html`<div style=${sx(`padding:22px 18px;font-size:13px;color:${muted(55)}`)}>${empty}</div>`
      }
    </div>
  </div>`;
}

export function boardView(v) {
  return html`<div className="board-page screen">
    <div
      className="blueprint board-hero"
      style=${sx("background:var(--color-reverse-bg);color:var(--color-reverse-text);border-color:var(--color-reverse-bg)")}
    >
      ${corners()}
      <div style=${sx("padding:36px 40px 32px;display:flex;flex-direction:column;gap:22px")}>
        ${
          v.motto &&
          html`<div
            style=${sx("font-family:var(--font-heading);font-weight:600;font-size:15px;letter-spacing:.03em;opacity:.9")}
          >
            ${v.motto}
          </div>`
        }
        <div style=${sx("font-size:12px;line-height:1.6;opacity:.75;font-style:italic;max-width:60ch")}>
          ${copy.app.epigraph}
        </div>
        <div style=${sx("font-size:11px;letter-spacing:.16em;text-transform:uppercase;opacity:.72")}>
          ${copy.board.progressTo(v.deadlineLabel)}
        </div>
        <div style=${sx("display:flex;align-items:flex-end;gap:16px")}>
          <div
            className="count-up"
            style=${sx(
              "font-family:var(--font-heading);font-weight:600;font-size:112px;line-height:.82;letter-spacing:-.02em;--count:" +
                v.memorized,
            )}
          ></div>
          <div style=${sx("display:flex;flex-direction:column;gap:2px;padding-bottom:8px")}>
            <div style=${sx("font-family:var(--font-heading);font-size:26px;line-height:1;opacity:.7")}>
              / ${v.goal}
            </div>
            <div style=${sx("font-size:12px;letter-spacing:.1em;text-transform:uppercase;opacity:.6")}>
              ${copy.board.goalUnit}
            </div>
          </div>
        </div>
        <div
          style=${sx("height:10px;border:1px solid color-mix(in srgb, var(--color-reverse-text) 40%, transparent);position:relative")}
        >
          <div className="meter-fill" style=${sx(v.barStyle)}></div>
        </div>
        <div style=${sx("display:flex;gap:28px;font-size:12px;opacity:.75")}>
          <div>${copy.board.inProgress(v.learning)}</div>
          <div>${copy.board.notStarted(v.remaining)}</div>
          <div>${copy.board.ofGoal(v.pctLabel)}</div>
        </div>
      </div>
      <div className="board-hero-stats">
        ${v.heroStats.map(
          (st) =>
            html` <div key=${st.label} style=${sx(st.style)}>
              <div style=${sx("font-size:10px;letter-spacing:.14em;text-transform:uppercase;opacity:.6")}>
                ${st.label}
              </div>
              <div
                className="count-up"
                style=${sx("font-family:var(--font-heading);font-weight:600;font-size:40px;line-height:1;--count:" + st.value)}
              ></div>
              <div style=${sx("font-size:11px;opacity:.6")}>${st.note}</div>
            </div>`,
        )}
      </div>
    </div>

    ${queueCard({
      title: copy.board.reviewTitle,
      count: v.reviewCount,
      note: v.reviewQueueNote,
      rows: v.reviewQueue,
      empty: v.reviewQueueEmpty,
    })}
    ${queueCard({
      title: copy.board.learnTitle,
      count: v.learnCount,
      note: v.learnQueueNote,
      rows: v.learnQueue,
      empty: v.learnQueueEmpty,
    })}

    <div style=${sx("display:flex;flex-direction:column;gap:16px")}>
      <div style=${sx("display:flex;align-items:baseline;gap:12px")}>
        <h4 style=${sx("margin:0;letter-spacing:.02em")}>${copy.board.mapTitle}</h4>
        <div style=${sx(LABEL_META)}>${copy.board.mapNote}</div>
        <div
          style=${sx(`margin-left:auto;display:flex;gap:18px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${muted(55)}`)}
        >
          <span style=${sx("display:flex;align-items:center;gap:6px")}
            ><i style=${sx("width:10px;height:10px;background:var(--color-accent-900);display:block")}></i
            >${copy.board.legendCommitted}</span
          >
          <span style=${sx("display:flex;align-items:center;gap:6px")}
            ><i style=${sx("width:10px;height:10px;background:var(--color-accent-300);display:block")}></i
            >${copy.board.legendLearning}</span
          >
          <span style=${sx("display:flex;align-items:center;gap:6px")}
            ><i style=${sx("width:10px;height:10px;border:1px solid var(--color-divider);display:block")}></i
            >${copy.board.legendNew}</span
          >
        </div>
      </div>
      <div className="blueprint" style=${sx("padding:22px")}>
        ${corners()}
        <div className="board-map-grid">
          ${v.mapCells.map((c) => html`<button key=${c.id} title=${c.title} onClick=${c.onClick} style=${sx(c.style)}></button>`)}
        </div>
      </div>
    </div>

    <div className="board-bottom">
      <div style=${sx("display:flex;flex-direction:column;gap:14px")}>
        <h4 style=${sx("margin:0;letter-spacing:.02em")}>${copy.board.activityTitle(v.activityDays)}</h4>
        <div className="blueprint" style=${sx("padding:20px 22px 16px;display:flex;flex-direction:column;gap:10px")}>
          ${corners()}
          <div style=${sx("display:flex;align-items:flex-end;gap:6px;height:110px")}>
            ${v.dayBars.map((d) => html`<div key=${d.key} className="meter-rise" title=${d.title} style=${sx(d.style)}></div>`)}
          </div>
          <div
            style=${sx(`display:flex;justify-content:space-between;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:${muted(45)}`)}
          >
            <span>${v.barsFrom}</span><span>${copy.board.activityAxis}</span><span>${copy.board.activityToday}</span>
          </div>
        </div>
      </div>
      <div style=${sx("display:flex;flex-direction:column;gap:14px")}>
        <h4 style=${sx("margin:0;letter-spacing:.02em")}>${copy.board.paceTitle}</h4>
        <div className="blueprint" style=${sx("padding:22px 24px;display:flex;flex-direction:column;gap:14px")}>
          ${corners()}
          <div style=${sx("font-family:var(--font-heading);font-weight:600;font-size:28px;line-height:1.15")}>
            ${v.paceHeadline}
          </div>
          <p style=${sx(`margin:0;font-size:13px;line-height:1.6;color:${muted(65)}`)}>${v.paceBody}</p>
          <div style=${sx("display:flex;gap:10px;margin-top:2px;flex-wrap:wrap")}>
            <button className="btn btn-primary" onClick=${v.goLearnSetup}>${copy.board.paceLearn}</button>
            <button className="btn btn-secondary" onClick=${v.goReviewSetup}>${copy.board.paceReview}</button>
            <button className="btn btn-secondary" onClick=${v.goTest}>${copy.board.paceTest}</button>
            <button className="btn btn-secondary" onClick=${v.goList}>${copy.board.paceBrowse(v.totalCount)}</button>
            <button className="btn btn-ghost" onClick=${v.goGuide}>${copy.board.paceGuide}</button>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}
