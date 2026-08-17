/* The opening splash — "Registration mark".
 *
 * Stands in front of the whole app while local data loads and Firebase says
 * whether there is a session to restore — after which the member lands on their
 * board, or on the sign-in gate (see App.render).
 *
 * It is the one screen in the app printed the other way round: a steel field
 * with the type reversed to paper, so the boot reads as the press warming up
 * rather than as a page of the app that happens to be empty. The frame is the
 * viewport, and the system's own corner marks sit inside its edges; at the
 * centre is that same mark drawn large, turning on a drafting scale while the
 * load steps name themselves underneath.
 *
 * Everything that moves is a keyframe in the splash block of styles.css; this
 * view only names the classes. The cycle is on a CSS timer rather than on the
 * boot's real state, so it is `aria-hidden` and the one truthful line — `note`
 * — is carried beside it, read aloud but not drawn. */

import { copy } from "../copy.js";
import { html, sx, corners } from "../dom.js";

/* Steel, edge to edge. The padding is what the corner marks hang in: .blueprint
 * draws them 6px outside its own box, so the frame has to stand off the
 * viewport for them to land on screen. */
const FIELD_SCREEN =
  "min-height:100vh;background:var(--color-accent-900);color:#f2f2f3;font-family:var(--font-body);" +
  "display:flex;padding:36px";

export function splashView(v) {
  return html`<div style=${sx(FIELD_SCREEN)}>
    <div className="blueprint splash-field">
      ${corners()}
      <div className="splash-mark">
        <i className="splash-mark-ring"></i>
        <i className="splash-mark-pulse"></i>
        <i className="splash-mark-v"></i>
        <i className="splash-mark-h"></i>
        <i className="splash-mark-dot"></i>
      </div>
      <div className="splash-plate">
        <div className="splash-wordmark">${copy.app.wordmark}</div>
        <div className="splash-group">${v.groupName}</div>
        <div className="splash-scale">
          <div className="splash-ticks"></div>
          <div className="splash-track"><i className="splash-fill"></i></div>
        </div>
        <div className="splash-cycle" aria-hidden="true">
          ${v.steps.map((step, i) => html`<div key=${i}>${step}</div>`)}
        </div>
        <div
          role="status"
          aria-live="polite"
          style=${sx("position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap")}
        >
          ${v.note}
        </div>
      </div>
    </div>
  </div>`;
}
