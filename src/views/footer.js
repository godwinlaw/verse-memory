/* App footer — a persistent feedback prompt linking to the bug / feature-request
 * form. Rendered below the current view on every signed-in screen. */

import { html, sx } from "../dom.js";
import { muted } from "../ui/tokens.js";

const FEEDBACK_URL = "https://forms.gle/H3YGDEJ4XXtN4Aoz5";

export function footerView() {
  return html`<div
    style=${sx(`max-width:1280px;margin:0 auto;padding:0 36px 48px;font-size:13px;line-height:1.6;color:${muted(55)}`)}
  >
    🐛 Spotted bugs or got a feature request?${" "}
    <a
      href=${FEEDBACK_URL}
      target="_blank"
      rel="noopener noreferrer"
      style=${sx("color:var(--color-accent);text-decoration:underline")}
      >Fill out this form.</a
    >
  </div>`;
}
