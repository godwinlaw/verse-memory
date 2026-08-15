/* Sign-in gate. Stands in front of the whole app until an approved Acts 2
 * Network member is signed in (or Firebase is unavailable and the app falls back
 * to local-only). */

import { html, sx, corners } from "../dom.js";
import { CALLOUT_ERROR, SCREEN_BODY, SCREEN_CENTERED, SCREEN_SUBTITLE, SCREEN_TITLE } from "../ui/tokens.js";

export function authGateView(v) {
  return html` <div style=${sx(SCREEN_CENTERED)}>
    <div
      className="blueprint"
      style=${sx("max-width:460px;width:100%;padding:40px 40px 36px;display:flex;flex-direction:column;gap:18px")}
    >
      ${corners()}
      <div style=${sx("display:flex;flex-direction:column;gap:2px")}>
        <div style=${sx(SCREEN_TITLE)}>THE MEMORY BOARD</div>
        <div style=${sx(SCREEN_SUBTITLE)}>${v.groupName}</div>
      </div>
      <p style=${sx(SCREEN_BODY)}>
        Sign in with your <strong>${v.domainLabel}</strong> account to track your passages and sync across devices.
      </p>
      ${v.denied && html`<div style=${sx(CALLOUT_ERROR)}>That account isn't an Acts 2 Network account. Please sign in with your ${v.domainLabel} account.</div>`}
      ${v.failed && html`<div style=${sx(CALLOUT_ERROR)}>Sign-in didn't complete. Please try again.</div>`}
      <button
        className="btn btn-primary"
        onClick=${v.onSignIn}
        disabled=${v.busy}
        style=${sx("align-self:flex-start;letter-spacing:.04em" + (v.busy ? ";opacity:.6;cursor:default" : ""))}
      >
        ${v.busy ? "Connecting…" : "Sign in with Google"}
      </button>
    </div>
  </div>`;
}
