/* Review mode, before the session begins: which committed verses to keep fresh.
 *
 * Uncommitted verses are not on offer here, learning those is a learn session's
 * job (see views/learn-setup.js). */

import { copy } from "../copy.js";
import { html, sx, corners } from "../dom.js";
import { LABEL_SECTION, muted } from "../ui/tokens.js";
import { commitCard, freshnessCard } from "./explainer.js";

const FIELD = "display:flex;flex-direction:column;gap:9px";

const RANGE_PROPS = { type: "range", min: 0, max: 100 };

export function reviewSetupView(v) {
  return html`<div
    className="screen"
    style=${sx("max-width:900px;margin:0 auto;padding:40px 36px 80px;display:flex;flex-direction:column;gap:22px")}
  >
    <div style=${sx("display:flex;flex-direction:column;gap:6px")}>
      <div style=${sx("font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--color-accent-700)")}>
        ${copy.reviewSetup.kicker}
      </div>
      <h1 style=${sx("margin:0")}>${copy.reviewSetup.title}</h1>
    </div>

    ${freshnessCard(v)} ${v.reviewNothingCommitted && commitCard(v)}

    <div className="blueprint" style=${sx("padding:30px 32px;display:flex;flex-direction:column;gap:26px")}>
      ${corners()}

      <div style=${sx(FIELD)}>
        <span style=${sx(LABEL_SECTION)}>${copy.category.label}</span>
        <div style=${sx("display:flex;gap:6px;flex-wrap:wrap")}>
          ${v.reviewSetupCategories.map((c) => html`<button key=${c.key} title=${c.title} onClick=${c.onClick} style=${sx(c.style)}>${c.label}</button>`)}
        </div>
        <span style=${sx(`font-size:12px;color:${muted(55)}`)}>${copy.category.note}</span>
      </div>

      <div style=${sx(FIELD)}>
        <span style=${sx(LABEL_SECTION)}>${copy.reviewSetup.target}</span>
        <span style=${sx(`font-size:14px;color:${muted(70)}`)}>${v.reviewSetupTarget}</span>
      </div>

      ${
        !v.reviewHasDue &&
        !v.reviewNothingCommitted &&
        html`<div
          style=${sx("display:flex;flex-direction:column;gap:26px;border-top:1px solid var(--color-divider);padding-top:20px")}
        >
          <div style=${sx(FIELD)}>
            <span style=${sx(LABEL_SECTION)}>${copy.reviewSetup.size}</span>
            <div style=${sx("display:flex;gap:6px;flex-wrap:wrap")}>
              ${v.reviewSetupSizes.map((s) => html`<button key=${s.key} onClick=${s.onClick} style=${sx(s.style)}>${s.label}</button>`)}
            </div>
          </div>

          <div style=${sx(FIELD)}>
            <span style=${sx(LABEL_SECTION)}>${copy.reviewSetup.freshness}</span>
            <div style=${sx("display:flex;align-items:center;gap:14px;max-width:520px")}>
              <input
                value=${v.reviewSetupFreshness}
                step="5"
                onChange=${v.onReviewSetupFreshness}
                style=${sx("flex:1;accent-color:var(--color-accent)")}
                ...${RANGE_PROPS}
              />
              <span
                style=${sx("font-family:var(--font-heading);font-weight:600;font-size:19px;width:52px;text-align:right")}
                >${v.reviewSetupFreshness}%</span
              >
            </div>
            <span style=${sx(`font-size:12px;color:${muted(55)}`)}>
              ${
                v.reviewSetupFreshness >= 100
                  ? copy.reviewSetup.freshnessDescAny
                  : copy.reviewSetup.freshnessDesc(v.reviewSetupFreshness)
              }
            </span>
          </div>
        </div>`
      }

      <div
        style=${sx("display:flex;gap:12px;align-items:center;border-top:1px solid var(--color-divider);padding-top:20px;flex-wrap:wrap")}
      >
        <button className="btn btn-primary" onClick=${v.startReviewSession} disabled=${!v.reviewSetupCanStart}>
          ${copy.reviewSetup.start}
        </button>
        <button className="btn btn-secondary" onClick=${v.reviewSetupGoLearn}>${copy.reviewSetup.goLearn}</button>
        <button className="btn btn-secondary" onClick=${v.cancelReviewSession}>${copy.common.backToBoard}</button>
        <div style=${sx(`margin-left:auto;font-size:13px;text-align:right;color:${muted(60)};max-width:44ch`)}>
          ${v.reviewSetupNote}
        </div>
      </div>
    </div>
  </div>`;
}
