/* The opening splash.
 *
 * Stands in front of the whole app while local data loads and Firebase says
 * whether there is a session to restore — after which the member lands on their
 * board, or on the sign-in gate (see App.render).
 *
 * It is deliberately the sign-in gate's shell — same frame, same wordmark, same
 * place on the screen — so whichever way the boot resolves, the next screen
 * reads as this one settling rather than a different one arriving. Everything
 * that moves is a keyframe in the splash block of styles.css; this view only
 * names the classes.
 *
 * The bar is an indeterminate run of the freshness meter — the app's one moving
 * part, borrowed for the one wait it cannot put a figure on. */

import { copy } from "../copy.js";
import { html, sx, corners } from "../dom.js";
import { SCREEN_CENTERED, SCREEN_SUBTITLE, SCREEN_TITLE, muted } from "../ui/tokens.js";

export function splashView(v) {
  return html`<div style=${sx(SCREEN_CENTERED)}>
    <div
      className="blueprint splash-card"
      style=${sx("max-width:460px;width:100%;padding:40px;display:flex;flex-direction:column;gap:6px")}
    >
      ${corners()}
      <div style=${sx(SCREEN_TITLE)}>${copy.app.wordmark}</div>
      <div style=${sx(SCREEN_SUBTITLE)}>${v.groupName}</div>
      ${
        v.motto &&
        html`<div
          style=${sx("font-family:var(--font-heading);font-weight:600;font-size:13px;letter-spacing:.03em;color:var(--color-accent);margin-top:6px")}
        >
          ${v.motto}
        </div>`
      }
      <div className="splash-meter" style=${sx("margin-top:18px")}><i></i></div>
      <div role="status" aria-live="polite" style=${sx(`font-size:12px;margin-top:2px;color:${muted(55)}`)}>
        ${copy.splash.note}
      </div>
    </div>
  </div>`;
}
