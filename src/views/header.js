/* Sticky app header: wordmark, primary nav, the three sittings, and the account
 * circle in the corner. */

import { copy } from "../copy.js";
import { html, sx, appMark } from "../dom.js";

/* The member, as one mark in the corner: their initials in a filled circle,
 * with Settings and Sign out under it.
 *
 * It replaced a name, a gear and a sign-out button laid out across the bar —
 * three things competing with the nav for the same row, none of them something
 * a member presses often. A menu costs one press to open and gives the bar back
 * to what the app is for.
 *
 * The sheet behind it is what closes it: a transparent fixed layer under the
 * menu and over everything else, so a press anywhere outside dismisses it
 * without the header having to listen to the document. The same pattern the
 * dialogs use, minus the wash of colour, since there is nothing to dim. */
function accountCorner(v) {
  return html`<div style=${sx("position:relative;display:flex;align-items:center;margin-left:4px")}>
    ${v.accountOpen && html`<div className="menu-sheet" onClick=${v.closeAccount}></div>`}
    <button
      className="avatar-btn"
      onClick=${v.toggleAccount}
      title=${v.userName}
      aria-label=${v.userName}
      aria-haspopup="menu"
      aria-expanded=${v.accountOpen}
    >
      ${v.userInitials}
    </button>
    ${
      v.accountOpen &&
      html`<div className="account-menu blueprint" role="menu">
        ${v.accountItems.map(
          (item) =>
            html`<button key=${item.key} role="menuitem" className="account-menu-item" onClick=${item.onClick}>
              ${item.label}
            </button>`,
        )}
      </div>`
    }
  </div>`;
}

export function headerView(v) {
  return html`<div className="app-header">
    <div style=${sx("display:flex;align-items:center;gap:11px;margin-right:auto")}>
      ${appMark(26)}
      <div style=${sx("font-family:var(--font-heading);font-weight:600;font-size:19px;letter-spacing:.08em")}>
        ${copy.app.wordmark}
      </div>
    </div>
    ${v.nav.map((n) => html`<button key=${n.key} className="nav-btn" onClick=${n.onClick} style=${sx(n.style)}>${n.label}</button>`)}
    <button className="btn btn-primary-inverse" onClick=${v.goLearnSetup} style=${sx("letter-spacing:.06em")}>
      ${copy.header.learn}
    </button>
    <button className="btn btn-primary-inverse" onClick=${v.goReviewSetup} style=${sx("letter-spacing:.06em")}>
      ${copy.header.review}
    </button>
    <button className="btn btn-primary" onClick=${v.goTest} style=${sx("letter-spacing:.06em")}>
      ${copy.header.test}
    </button>
    ${v.user && accountCorner(v)}
  </div>`;
}
