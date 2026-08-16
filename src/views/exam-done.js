/* End of a test: the mark, what each verse's freshness did, and the paper back
 * with the answers on it. */

import { html, sx, corners } from "../dom.js";
import { LABEL_META, LABEL_SECTION, muted } from "../ui/tokens.js";

export function examDoneView(v) {
  return html`<div
    style=${sx("max-width:900px;margin:0 auto;padding:40px 36px 80px;display:flex;flex-direction:column;gap:30px")}
  >
    <div style=${sx("display:flex;flex-direction:column;gap:8px")}>
      <div style=${sx("font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--color-accent-700)")}>
        Test complete
      </div>
      <div style=${sx("display:flex;align-items:flex-end;gap:16px")}>
        <div
          style=${sx("font-family:var(--font-heading);font-weight:600;font-size:88px;line-height:.85;letter-spacing:-.02em")}
        >
          ${v.examScoreLabel}
        </div>
        <div style=${sx("display:flex;flex-direction:column;gap:3px;padding-bottom:8px")}>
          <div style=${sx("font-family:var(--font-heading);font-weight:600;font-size:24px;line-height:1")}>
            ${v.examHeadline}
          </div>
          <div style=${sx(LABEL_META)}>${v.examScoreNote}</div>
        </div>
      </div>
      <p style=${sx(`margin:6px 0 0;font-size:14px;line-height:1.7;color:${muted(65)};max-width:60ch`)}>
        ${v.examBody}
      </p>
      <div style=${sx("display:flex;gap:10px;margin-top:10px")}>
        <button className="btn btn-primary" onClick=${v.examAgain}>Another test</button>
        <button className="btn btn-secondary" onClick=${v.goBoard}>Back to the board</button>
      </div>
    </div>

    <div style=${sx("display:flex;flex-direction:column;gap:14px")}>
      <div style=${sx("display:flex;align-items:baseline;gap:12px")}>
        <h4 style=${sx("margin:0;letter-spacing:.02em")}>Where each verse landed</h4>
        <div style=${sx(LABEL_META)}>freshness before and after</div>
      </div>
      <div className="blueprint" style=${sx("display:flex;flex-direction:column")}>
        ${corners()}
        ${v.examVerseRows.map(
          (row, i) =>
            html` <div
              key=${row.id}
              style=${sx(
                "display:flex;align-items:center;gap:14px;padding:12px 18px" +
                  (i ? ";border-top:1px solid var(--color-divider)" : ""),
              )}
            >
              <span style=${sx("font-family:var(--font-heading);font-weight:600;font-size:16px;width:190px;flex:none")}
                >${row.ref}</span
              >
              <span style=${sx(row.scoreStyle)}>${row.scoreLabel}</span>
              <span style=${sx("margin-left:auto;display:flex;align-items:baseline;gap:8px")}>
                <span style=${sx(row.beforeStyle)}>${row.beforeLabel}</span>
                <span style=${sx(`font-size:12px;color:${muted(40)}`)}>→</span>
                <span style=${sx(row.afterStyle)}>${row.afterLabel}</span>
              </span>
              <span style=${sx(row.driftStyle + ";width:52px;text-align:right")}>${row.driftLabel}</span>
            </div>`,
        )}
      </div>
    </div>

    <div style=${sx("display:flex;flex-direction:column;gap:14px")}>
      <h4 style=${sx("margin:0;letter-spacing:.02em")}>The paper</h4>
      <div className="blueprint" style=${sx("display:flex;flex-direction:column")}>
        ${corners()}
        ${v.examAnswerRows.map(
          (row) =>
            html` <div key=${row.key} style=${sx(row.style)}>
              <span style=${sx(row.markStyle)}>${row.markLabel}</span>
              <div style=${sx("display:flex;flex-direction:column;gap:5px;flex:1;min-width:0")}>
                <div style=${sx("display:flex;align-items:baseline;gap:10px")}>
                  <span style=${sx("font-family:var(--font-heading);font-weight:600;font-size:15px")}>${row.ref}</span>
                  <span style=${sx(LABEL_META)}>${row.activity}</span>
                  <span style=${sx(`margin-left:auto;font-size:12px;color:${muted(55)}`)}>${row.scoreLabel}</span>
                </div>
                ${row.prompt && html`<div style=${sx(`font-size:13px;line-height:1.6;color:${muted(60)}`)}>“${row.prompt}”</div>`}
                <div style=${sx("display:flex;flex-wrap:wrap;gap:4px 18px;font-size:13px")}>
                  <span><span style=${sx(LABEL_SECTION)}>You </span>${row.given}</span>
                  ${row.expected && html`<span><span style=${sx(LABEL_SECTION)}>Answer </span>${row.expected}</span>`}
                </div>
              </div>
            </div>`,
        )}
      </div>
    </div>
  </div>`;
}
