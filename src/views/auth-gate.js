/* Sign-in gate. Stands in front of the whole app until an approved Acts 2
 * Network member is signed in (or Firebase is unavailable and the app falls back
 * to local-only). */

import { html, sx, corners } from "../dom.js";
import { CALLOUT_ERROR, SCREEN_BODY, SCREEN_CENTERED, SCREEN_SUBTITLE, SCREEN_TITLE } from "../ui/tokens.js";

export function authGateView(v) {
  return html`<div style=${sx(SCREEN_CENTERED)}>
    <div
      className="blueprint"
      style=${sx("max-width:460px;width:100%;padding:40px 40px 36px;display:flex;flex-direction:column;gap:18px")}
    >
      ${corners()}
      <div style=${sx("display:flex;flex-direction:column;gap:2px")}>
        <div style=${sx(SCREEN_TITLE)}>THE MEMORY BOARD</div>
        <div style=${sx(SCREEN_SUBTITLE)}>${v.groupName}</div>
        ${
          v.motto &&
          html`<div
            style=${sx("font-family:var(--font-heading);font-weight:600;font-size:13px;letter-spacing:.03em;color:var(--color-accent);margin-top:6px")}
          >
            ${v.motto}
          </div>`
        }
        <div style=${sx("font-size:12px;line-height:1.6;color:var(--color-accent);margin-top:8px;font-style:italic")}>
          "Do your best to present yourself to God as one approved, a worker who has no need to be ashamed, rightly
          handling the word of truth." — 2 Tim 2:15
        </div>
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
        ${
          v.busy
            ? "Signing in…"
            : html`<span style=${sx("display:inline-flex;align-items:center;gap:8px")}>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 48 48">
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  />
                </svg>
                Sign in with Google
              </span>`
        }
      </button>
    </div>
  </div>`;
}
