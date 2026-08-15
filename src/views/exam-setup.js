/* Test mode, before the first question: how much to be tested on, which verses
 * count, and which activities to face. */

import { html, sx, corners } from "../dom.js";
import { LABEL_SECTION, muted } from "../ui/tokens.js";

const FIELD = "display:flex;flex-direction:column;gap:9px";

/* Prettier lowercases attribute names inside these templates, and React wants
 * the camelCase DOM props, so the range input's are spread in. */
const RANGE_PROPS = { type: "range", min: 0, max: 100 };

export function examSetupView(v) {
  return html`<div
    style=${sx("max-width:900px;margin:0 auto;padding:40px 36px 80px;display:flex;flex-direction:column;gap:22px")}
  >
    <div style=${sx("display:flex;flex-direction:column;gap:6px")}>
      <div style=${sx("font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--color-accent-700)")}>
        Test mode
      </div>
      <h1 style=${sx("margin:0")}>Set the test</h1>
    </div>

    <div className="blueprint" style=${sx("padding:30px 32px;display:flex;flex-direction:column;gap:26px")}>
      ${corners()}

      <div style=${sx(FIELD)}>
        <span style=${sx(LABEL_SECTION)}>How many verses</span>
        <div style=${sx("display:flex;gap:6px;flex-wrap:wrap")}>
          ${v.setupSizes.map((s) => html`<button key=${s.key} onClick=${s.onClick} style=${sx(s.style)}>${s.label}</button>`)}
        </div>
      </div>

      <div style=${sx(FIELD)}>
        <span style=${sx(LABEL_SECTION)}>Committed verses only</span>
        <div style=${sx("display:flex;align-items:center;gap:10px")}>
          <button onClick=${v.toggleSetupCommitted} style=${sx(v.setupCommittedStyle)}>${v.setupCommittedLabel}</button>
        </div>
      </div>

      <div style=${sx(FIELD)}>
        <span style=${sx(LABEL_SECTION)}>Freshness ceiling</span>
        <div style=${sx("display:flex;align-items:center;gap:14px;max-width:520px")}>
          <input
            value=${v.setupFreshness}
            step=${v.setupFreshnessStep}
            onChange=${v.onSetupFreshness}
            style=${sx("flex:1;accent-color:var(--color-accent)")}
            ...${RANGE_PROPS}
          />
          <span
            style=${sx("font-family:var(--font-heading);font-weight:600;font-size:19px;width:52px;text-align:right")}
            >${v.setupFreshnessLabel}</span
          >
        </div>
        <span style=${sx(`font-size:12px;color:${muted(55)}`)}>${v.setupFreshnessDesc}</span>
      </div>

      <div style=${sx(FIELD)}>
        <span style=${sx(LABEL_SECTION)}>Activities</span>
        <div style=${sx("display:grid;grid-template-columns:1fr 1fr;gap:12px")}>
          ${v.setupActivities.map(
            (a) =>
              html` <button key=${a.key} onClick=${a.onClick} style=${sx(a.style)}>
                <div style=${sx("display:flex;align-items:baseline;gap:10px")}>
                  <span style=${sx("font-family:var(--font-heading);font-weight:600;font-size:18px;line-height:1.1")}
                    >${a.name}</span
                  >
                  <span style=${sx("margin-left:auto;" + a.stateStyle)}>${a.state}</span>
                </div>
                <div style=${sx(`font-size:12px;line-height:1.5;color:${muted(58)}`)}>${a.desc}</div>
              </button>`,
          )}
        </div>
      </div>

      <div
        style=${sx("display:flex;gap:12px;align-items:center;border-top:1px solid var(--color-divider);padding-top:20px")}
      >
        <button className="btn btn-primary" onClick=${v.startExam} disabled=${!v.setupCanStart}>Start the test</button>
        <button className="btn btn-secondary" onClick=${v.cancelExam}>Back to the board</button>
        <div style=${sx(`margin-left:auto;font-size:13px;text-align:right;color:${muted(60)};max-width:44ch`)}>
          ${v.setupPoolNote}
        </div>
      </div>
    </div>
  </div>`;
}
