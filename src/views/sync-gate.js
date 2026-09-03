/* The gate between signing in and the app, for the moment the member's cloud
 * record is being read, and for when it cannot be read at all.
 *
 * It exists because the screen behind it is the sign-up profile form. A member
 * whose record could not be fetched looks exactly like a member who has none,
 * and sending them through sign-up does not merely inconvenience them: the
 * profile they fill in is stamped with a fresh `updatedAt`, so it wins the
 * next merge (profile.mergeProfile) and replaces the real one. So the app
 * waits here instead, with the only two moves that are safe, try again, or
 * sign out. */

import { copy } from "../copy.js";
import { html, sx, corners } from "../dom.js";
import { CALLOUT_ERROR, SCREEN_BODY, SCREEN_CENTERED, SCREEN_SUBTITLE, SCREEN_TITLE } from "../ui/tokens.js";

export function syncGateView(v) {
  return html`<div style=${sx(SCREEN_CENTERED)}>
    <div
      className="blueprint shell-settle"
      style=${sx("max-width:460px;width:100%;padding:40px 40px 36px;display:flex;flex-direction:column;gap:18px")}
    >
      ${corners()}
      <div style=${sx("display:flex;flex-direction:column;gap:2px")}>
        <div style=${sx(SCREEN_TITLE)}>${v.title}</div>
        <div style=${sx(SCREEN_SUBTITLE)}>${v.groupName}</div>
      </div>
      <p style=${sx(SCREEN_BODY)}>${v.message}</p>
      ${v.detail && html`<div style=${sx(CALLOUT_ERROR)}>${v.detail}</div>`}
      ${
        v.failed &&
        html`<div style=${sx("display:flex;gap:10px;align-items:center")}>
          <button
            className="btn btn-primary"
            onClick=${v.onRetry}
            disabled=${v.busy}
            style=${sx("letter-spacing:.04em" + (v.busy ? ";opacity:.6;cursor:default" : ""))}
          >
            ${v.retryLabel}
          </button>
          <button className="btn btn-secondary" onClick=${v.onSignOut} style=${sx("font-size:12px;padding:6px 12px")}>
            ${copy.syncGate.signOut}
          </button>
        </div>`
      }
    </div>
  </div>`;
}

/* The same trouble, once the member is past the gate: they have a usable
 * profile on this device, so the app is theirs to use, but nothing they do is
 * leaving it, and a sitting spent believing otherwise is the thing to prevent.
 * A strip under the header rather than a dialog: it must not stop the work. */
export function syncBannerView(v) {
  return html`<div
    role="status"
    style=${sx(
      "display:flex;align-items:center;gap:12px;padding:8px 24px;border-bottom:1px solid var(--color-divider);" +
        "background:var(--color-accent-100);font-size:13px;line-height:1.5",
    )}
  >
    <span style=${sx("flex:1")}>${copy.syncBanner.message}</span>
    <button
      className="btn btn-secondary"
      onClick=${v.onSyncRetry}
      disabled=${v.syncRetrying}
      style=${sx("font-size:12px;padding:4px 10px" + (v.syncRetrying ? ";opacity:.6;cursor:default" : ""))}
    >
      ${v.syncRetrying ? copy.syncGate.retrying : copy.syncBanner.retry}
    </button>
  </div>`;
}
