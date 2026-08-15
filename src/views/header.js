/* Sticky app header: wordmark, primary nav, review shortcut, profile + account. */

import { html, sx } from "../dom.js";
import { LABEL_META, muted } from "../ui/tokens.js";

export function headerView(v) {
  return html`<div
    style=${sx("display:flex;align-items:center;gap:32px;padding:16px 36px;border-bottom:1px solid var(--color-divider);position:sticky;top:0;background:var(--color-bg);z-index:20")}
  >
    <div style=${sx("display:flex;flex-direction:column;gap:1px;margin-right:auto")}>
      <div style=${sx("font-family:var(--font-heading);font-weight:600;font-size:19px;letter-spacing:.08em")}>
        THE MEMORY BOARD
      </div>
      <div style=${sx(LABEL_META)}>${v.groupName}</div>
    </div>
    ${v.nav.map((n) => html`<button key=${n.key} onClick=${n.onClick} style=${sx(n.style)}>${n.label}</button>`)}
    <button className="btn btn-primary" onClick=${v.startDue} style=${sx("letter-spacing:.06em")}>REVIEW NOW</button>
    <button
      className="btn btn-secondary"
      onClick=${v.editProfile}
      title="Edit your profile"
      style=${sx("font-size:12px;padding:4px 10px")}
    >
      ${v.profileSummary}
    </button>
    ${
      v.user &&
      html`<div
        style=${sx("display:flex;align-items:center;gap:10px;padding-left:16px;margin-left:4px;border-left:1px solid var(--color-divider)")}
      >
        <span
          title=${v.user.email}
          style=${sx(`font-size:12px;color:${muted(60)};max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap`)}
          >${v.userName}</span
        >
        <button className="btn btn-secondary" onClick=${v.signOut} style=${sx("font-size:12px;padding:4px 10px")}>
          Sign out
        </button>
      </div>`
    }
  </div>`;
}
