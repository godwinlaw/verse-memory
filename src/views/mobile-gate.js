/* The warning a member on a phone or a tablet meets before the app.
 *
 * It stands in front of everything — before the splash, before sign-in — and
 * it is an interstitial rather than a refusal: the app works on a phone, but
 * it was designed for a desk sitting, and there is a safety line worth saying
 * before every visit (copy.mobileGate). Continue is the one thing to press,
 * and pressing it lets the member through for this visit only — the
 * acknowledgement is never saved, so the warning is heard again next time.
 *
 * The two marks are drawn here rather than named as classes because they are
 * geometry, not motion — nothing on this screen moves except its arrival. They
 * are `aria-hidden`: the sentences under them already say it, and a reader
 * announcing "phone, monitor" would only say it again. */

import { copy } from "../copy.js";
import { html, sx, corners } from "../dom.js";
import { CALLOUT_ERROR, muted, SCREEN_BODY, SCREEN_CENTERED, SCREEN_SUBTITLE, SCREEN_TITLE } from "../ui/tokens.js";

/* Both marks are struck in the same weight as the app's rules, so they sit as
 * drawings on the blueprint rather than as icons dropped onto it. */
const STROKE = { fill: "none", strokeWidth: "1.4", strokeLinecap: "square", strokeLinejoin: "miter" };

/* The device in hand: a handset, no longer ruled through — it works here, it
 * is just not where the app is at its best. */
const phoneMark = () =>
  html`<svg
    xmlns="http://www.w3.org/2000/svg"
    width="40"
    height="40"
    viewBox="0 0 24 24"
    stroke="currentColor"
    ...${STROKE}
  >
    <rect x="7" y="2.5" width="10" height="19" />
    <line x1="10.4" y1="18.6" x2="13.6" y2="18.6" />
  </svg>`;

/* Where the app is at its best: a screen on a stand. */
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
 * is the only part of the drawing that is neither the device nor the answer. */
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
      style=${sx("max-width:420px;width:100%;padding:40px 32px 36px;display:flex;flex-direction:column;gap:18px")}
    >
      ${corners()}
      <div style=${sx("display:flex;flex-direction:column;gap:2px")}>
        <div style=${sx(SCREEN_TITLE)}>${copy.app.wordmark}</div>
        <div style=${sx(SCREEN_SUBTITLE)}>${v.groupName}</div>
      </div>
      <div
        aria-hidden="true"
        style=${sx("display:flex;align-items:center;justify-content:center;gap:14px;padding:14px 0 0;color:" + muted(45))}
      >
        ${phoneMark()} ${arrowMark()} ${desktopMark()}
      </div>
      <p style=${sx(SCREEN_BODY)}>${copy.mobileGate.lead} ${copy.mobileGate.caveat}</p>
      <div style=${sx(CALLOUT_ERROR)}>${copy.mobileGate.safety}</div>
      <button
        className="btn btn-primary"
        onClick=${v.onContinue}
        style=${sx("align-self:flex-start;letter-spacing:.04em")}
      >
        ${copy.mobileGate.continueCta}
      </button>
    </div>
  </div>`;
}
