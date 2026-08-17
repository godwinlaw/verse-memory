/* Learn mode, before the session begins: how much new ground to take on.
 *
 * The counterpart to review-setup. Where that screen asks which committed
 * verses to keep fresh, this one asks how many uncommitted verses to work at —
 * and says plainly what it takes to commit one. */

import { copy } from "../copy.js";
import { html, sx, corners } from "../dom.js";
import { LABEL_SECTION, muted } from "../ui/tokens.js";
import { commitCard } from "./explainer.js";

const FIELD = "display:flex;flex-direction:column;gap:9px";

/* The verses the session will open with, so the size picker is not a blind
 * choice. Truncated by the view-model, with the remainder counted. */
function preview(v) {
  return html`<div style=${sx(FIELD)}>
    <span style=${sx(LABEL_SECTION)}>${copy.learnSetup.previewTitle}</span>
    <div style=${sx("display:flex;flex-direction:column;border:1px solid var(--color-divider)")}>
      ${v.learnQueuePreview.map(
        (p, i) =>
          html` <div
            key=${p.id}
            style=${sx(
              "display:flex;align-items:center;gap:14px;padding:10px 14px" +
                (i ? ";border-top:1px solid var(--color-divider)" : ""),
            )}
          >
            <span style=${sx("font-family:var(--font-heading);font-weight:600;font-size:15px;width:170px;flex:none")}
              >${p.ref}</span
            >
            <span
              style=${sx(`font-size:13px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${muted(60)}`)}
              >${p.snippet}</span
            >
            <span style=${sx(`font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${muted(50)}`)}
              >${p.statusLabel}</span
            >
          </div>`,
      )}
    </div>
    ${v.learnPreviewMore && html`<span style=${sx(`font-size:12px;color:${muted(50)}`)}>${v.learnPreviewMore}</span>`}
  </div>`;
}

export function learnSetupView(v) {
  return html`<div
    className="screen"
    style=${sx("max-width:900px;margin:0 auto;padding:40px 36px 80px;display:flex;flex-direction:column;gap:22px")}
  >
    <div style=${sx("display:flex;flex-direction:column;gap:6px")}>
      <div style=${sx("font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--color-accent-700)")}>
        ${copy.learnSetup.kicker}
      </div>
      <h1 style=${sx("margin:0")}>${copy.learnSetup.title}</h1>
    </div>

    ${commitCard(v)}

    <div className="blueprint" style=${sx("padding:30px 32px;display:flex;flex-direction:column;gap:26px")}>
      ${corners()}

      <div style=${sx(FIELD)}>
        <span style=${sx(LABEL_SECTION)}>${copy.learnSetup.size}</span>
        <div style=${sx("display:flex;gap:6px;flex-wrap:wrap")}>
          ${v.learnSetupSizes.map((s) => html`<button key=${s.key} onClick=${s.onClick} style=${sx(s.style)}>${s.label}</button>`)}
        </div>
        <span style=${sx(`font-size:12px;color:${muted(55)}`)}>${copy.learnSetup.sizeNote}</span>
      </div>

      ${v.learnSetupCanStart && preview(v)}

      <div
        style=${sx("display:flex;gap:12px;align-items:center;border-top:1px solid var(--color-divider);padding-top:20px;flex-wrap:wrap")}
      >
        <button className="btn btn-primary" onClick=${v.startLearnSession} disabled=${!v.learnSetupCanStart}>
          ${copy.learnSetup.start}
        </button>
        <button className="btn btn-secondary" onClick=${v.learnSetupGoReview}>${copy.learnSetup.goReview}</button>
        <button className="btn btn-secondary" onClick=${v.cancelLearnSession}>${copy.common.backToBoard}</button>
        <div style=${sx(`margin-left:auto;font-size:13px;text-align:right;color:${muted(60)};max-width:44ch`)}>
          ${v.learnSetupNote}
        </div>
      </div>
    </div>
  </div>`;
}
