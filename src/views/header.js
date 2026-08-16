/* Sticky app header: wordmark, primary nav, review shortcut, profile + account. */

import { html, sx } from "../dom.js";
import { LABEL_META, muted } from "../ui/tokens.js";

export function headerView(v) {
  return html`<div className="app-header">
    <div style=${sx("display:flex;flex-direction:column;gap:1px;margin-right:auto")}>
      <div style=${sx("font-family:var(--font-heading);font-weight:600;font-size:19px;letter-spacing:.08em")}>
        THE MEMORY BOARD
      </div>
      <div style=${sx(LABEL_META)}>${v.groupName}</div>
    </div>
    ${v.nav.map((n) => html`<button key=${n.key} onClick=${n.onClick} style=${sx(n.style)}>${n.label}</button>`)}
    <button className="btn btn-primary-inverse" onClick=${v.goLearnSetup} style=${sx("letter-spacing:.06em")}>
      LEARN
    </button>
    <button className="btn btn-primary-inverse" onClick=${v.goReviewSetup} style=${sx("letter-spacing:.06em")}>
      REVIEW
    </button>
    <button className="btn btn-primary" onClick=${v.goTest} style=${sx("letter-spacing:.06em")}>TAKE A TEST</button>
    ${
      v.user &&
      html`<div
        style=${sx("display:flex;align-items:center;gap:10px;padding-left:16px;margin-left:4px;border-left:1px solid var(--color-divider)")}
      >
        <span
          title=${v.user.email}
          style=${sx(`font-family:var(--font-heading);font-weight:600;font-size:14px;color:var(--color-text);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap`)}
          >${v.userName}</span
        >
        <button
          className="btn btn-secondary"
          onClick=${v.editProfile}
          title="Settings"
          style=${sx("padding:4px 8px;line-height:1")}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
        <button className="btn btn-secondary" onClick=${v.signOut} style=${sx("font-size:12px;padding:4px 10px")}>
          Sign out
        </button>
      </div>`
    }
  </div>`;
}
