/* The explainer both setup screens carry.
 *
 * Freshness and the commit rule are the two ideas the whole app turns on, and a
 * member meets one of these screens before their first sitting either way — so
 * the explanation lives here and is rendered by both rather than written twice
 * and allowed to drift. */

import { html, sx, corners } from "../dom.js";
import { muted } from "../ui/tokens.js";

/* What freshness is, what each activity pays for it, and what a peek costs. */
export function freshnessCard(v) {
  return html`<div className="blueprint" style=${sx("padding:26px 32px;display:flex;flex-direction:column;gap:18px")}>
    ${corners()}
    <div style=${sx("display:flex;flex-direction:column;gap:8px")}>
      <h4 style=${sx("margin:0")}>${v.freshnessTitle}</h4>
      <p style=${sx(`margin:0;font-size:14px;line-height:1.7;color:${muted(70)};max-width:68ch`)}>${v.freshnessBody}</p>
    </div>

    <div style=${sx("display:flex;flex-direction:column;gap:9px")}>
      ${v.freshnessRules.map(
        (r) =>
          html` <div key=${r.key} style=${sx("display:flex;align-items:center;gap:14px;flex-wrap:wrap")}>
            <span style=${sx("font-family:var(--font-heading);font-weight:600;font-size:15px;width:150px;flex:none")}
              >${r.name}</span
            >
            <div style=${sx(r.meterStyle)}><div style=${sx(r.barStyle)}></div></div>
            <span style=${sx(`font-size:13px;color:${muted(60)}`)}>${r.note}</span>
          </div>`,
      )}
    </div>

    <ul style=${sx(`margin:0;padding-left:18px;font-size:13px;line-height:1.8;color:${muted(65)};max-width:68ch`)}>
      ${v.freshnessNotes.map((note, i) => html`<li key=${i}>${note}</li>`)}
    </ul>
  </div>`;
}

/* The one rule that moves a passage from the learn half of the set to the
 * review half. Given its own card, because it is the thing members most often
 * expect to be a button. */
export function commitCard(v) {
  return html`<div
    className="blueprint"
    style=${sx("padding:24px 32px;display:flex;flex-direction:column;gap:10px;border-left:3px solid var(--color-accent)")}
  >
    ${corners()}
    <h4 style=${sx("margin:0")}>${v.commitTitle}</h4>
    <p style=${sx(`margin:0;font-size:14px;line-height:1.7;color:${muted(70)};max-width:68ch`)}>${v.commitBody}</p>
  </div>`;
}
