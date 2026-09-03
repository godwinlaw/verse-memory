/* Shown once, right after a member finishes the sign-up profile form, a nudge
 * toward the guide before they are turned loose on the board, with a way to
 * skip straight to learning for anyone who would rather start memorizing. */

import { copy } from "../copy.js";
import { html, sx, corners } from "../dom.js";
import { SCREEN_BODY, SCREEN_CENTERED, SCREEN_SUBTITLE, SCREEN_TITLE } from "../ui/tokens.js";

export function welcomeView(v) {
  return html`<div style=${sx(SCREEN_CENTERED)}>
    <div
      className="blueprint shell-settle"
      style=${sx("max-width:460px;width:100%;padding:40px 40px 36px;display:flex;flex-direction:column;gap:18px")}
    >
      ${corners()}
      <div style=${sx("display:flex;flex-direction:column;gap:2px")}>
        <div style=${sx(SCREEN_TITLE)}>${copy.welcome.title}</div>
        <div style=${sx(SCREEN_SUBTITLE)}>${v.groupName}</div>
      </div>
      <p style=${sx(SCREEN_BODY)}>${copy.welcome.lead}</p>
      <div style=${sx("display:flex;flex-direction:column;gap:10px")}>
        <button
          className="btn btn-primary"
          onClick=${v.onGuide}
          style=${sx("align-self:flex-start;letter-spacing:.04em")}
        >
          ${copy.welcome.guideCta}
        </button>
        <button
          className="btn btn-secondary"
          onClick=${v.onLearn}
          style=${sx("align-self:flex-start;letter-spacing:.04em")}
        >
          ${copy.welcome.learnCta}
        </button>
      </div>
    </div>
  </div>`;
}
