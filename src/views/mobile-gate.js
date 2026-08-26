/* The gate a member on a phone or a tablet meets instead of the app.
 *
 * It stands in front of everything — before the splash, before sign-in — and
 * there is nothing on it to press, so it is the one screen in the app that is
 * only a statement. What it says is a single sentence (copy.mobileGate), and
 * the drawing beside it says the same thing twice over so the answer reads
 * before the sentence does: the device being held, struck through, and the
 * machine to open it on instead.
 *
 * The two marks are drawn here rather than named as classes because they are
 * geometry, not motion — nothing on this screen moves except its arrival. They
 * are `aria-hidden`: the sentence under them already says it, and a reader
 * announcing "phone, monitor" would only say it a third time. */

import { copy } from "../copy.js";
import { html, sx, corners } from "../dom.js";
import { COLOR_ERROR, muted, SCREEN_BODY, SCREEN_CENTERED, SCREEN_SUBTITLE, SCREEN_TITLE } from "../ui/tokens.js";

/* Both marks are struck in the same weight as the app's rules, so they sit as
 * drawings on the blueprint rather than as icons dropped onto it. */
const STROKE = { fill: "none", strokeWidth: "1.4", strokeLinecap: "square", strokeLinejoin: "miter" };

/* The device the app declines: a handset, ruled through corner to corner. */
const phoneMark = () =>
  html`<svg
    xmlns="http://www.w3.org/2000/svg"
    width="40"
    height="40"
    viewBox="0 0 24 24"
    stroke=${COLOR_ERROR}
    ...${STROKE}
  >
    <rect x="7" y="2.5" width="10" height="19" />
    <line x1="10.4" y1="18.6" x2="13.6" y2="18.6" />
    <line x1="3.5" y1="20.5" x2="20.5" y2="3.5" />
  </svg>`;

/* Where to go instead: a screen on a stand. */
const desktopMark = () =>
  html`<svg
    xmlns="http://www.w3.org/2000/svg"
    width="40"
    height="40"
    viewBox="0 0 24 24"
    stroke="var(--color-accent)"
    ...${STROKE}
  >
    <rect x="2.5" y="4" width="19" height="12.5" />
    <line x1="12" y1="16.5" x2="12" y2="20.5" />
    <line x1="8" y1="20.5" x2="16" y2="20.5" />
  </svg>`;

/* The move from one to the other, in the drafting hand the rest of the app is
 * drawn in: a rule with a head on it. It takes its colour from the row, which
 * is the only part of the drawing that is neither the refusal nor the answer. */
const arrowMark = () =>
  html`<svg
    xmlns="http://www.w3.org/2000/svg"
    width="34"
    height="24"
    viewBox="0 0 34 24"
    stroke="currentColor"
    ...${STROKE}
  >
    <line x1="2" y1="12" x2="30" y2="12" />
    <line x1="23" y1="6" x2="30" y2="12" />
    <line x1="23" y1="18" x2="30" y2="12" />
  </svg>`;

export function mobileGateView(v) {
  return html`<div style=${sx(SCREEN_CENTERED)}>
    <div
      className="blueprint screen"
      style=${sx("max-width:420px;width:100%;padding:40px 32px 36px;display:flex;flex-direction:column;gap:22px")}
    >
      ${corners()}
      <div style=${sx("display:flex;flex-direction:column;gap:2px")}>
        <div style=${sx(SCREEN_TITLE)}>${copy.app.wordmark}</div>
        <div style=${sx(SCREEN_SUBTITLE)}>${v.groupName}</div>
      </div>
      <div
        aria-hidden="true"
        style=${sx("display:flex;align-items:center;justify-content:center;gap:14px;padding:18px 0 4px;color:" + muted(45))}
      >
        ${phoneMark()} ${arrowMark()} ${desktopMark()}
      </div>
      <p style=${sx(SCREEN_BODY)}>${copy.mobileGate.message}</p>
    </div>
  </div>`;
}
