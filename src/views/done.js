/* End of a review session. */

import { html, sx } from "../dom.js";
import { muted } from "../ui/tokens.js";

export function doneView(v) {
  return html`<div
    style=${sx("max-width:700px;margin:0 auto;padding:90px 36px;display:flex;flex-direction:column;gap:20px;align-items:flex-start")}
  >
    <div style=${sx("font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--color-accent-700)")}>
      Session complete
    </div>
    <h1 style=${sx("margin:0")}>${v.doneHeadline}</h1>
    <p style=${sx(`margin:0;font-size:15px;line-height:1.7;color:${muted(65)};max-width:52ch`)}>${v.doneBody}</p>
    <div style=${sx("display:flex;gap:10px;margin-top:8px;flex-wrap:wrap")}>
      <button className="btn btn-primary" onClick=${v.doneAgain}>${v.doneAgainLabel}</button>
      <button className="btn btn-secondary" onClick=${v.doneOther}>${v.doneOtherLabel}</button>
      <button className="btn btn-secondary" onClick=${v.goBoard}>Back to the board</button>
    </div>
  </div>`;
}
