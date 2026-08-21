/* App footer — a persistent feedback prompt linking to the bug / feature-request
 * form, and the ESV copyright notice. Rendered below the current view on every
 * signed-in screen.
 *
 * The notice is not decoration: Crossway's API terms require it wherever their
 * text is shown, and the footer is the one place in the app that is under every
 * screen without being a card a member is working. */

import { copy } from "../copy.js";
import { html, sx } from "../dom.js";
import { muted } from "../ui/tokens.js";

export function footerView() {
  return html`<div
    style=${sx(`max-width:1280px;margin:0 auto;padding:0 36px 48px;font-size:13px;line-height:1.6;color:${muted(55)}`)}
  >
    ${copy.footer.prompt}${" "}
    <a
      href=${copy.footer.url}
      target="_blank"
      rel="noopener noreferrer"
      style=${sx("color:var(--color-accent);text-decoration:underline")}
      >${copy.footer.link}</a
    >
    <div
      style=${sx(`margin-top:14px;padding-top:12px;border-top:1px solid var(--color-divider);font-size:11px;color:${muted(42)};max-width:80ch`)}
    >
      ${copy.footer.esv}
    </div>
  </div>`;
}
