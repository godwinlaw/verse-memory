/* Rendering primitives.
 *
 * React, ReactDOM, and htm are loaded from CDN as classic <script> tags in
 * index.html, so their globals are guaranteed to exist before this ES module
 * runs. We re-export them here so the rest of the app imports them from one
 * place instead of reaching for `window` all over. */
const React = window.React;
const ReactDOM = window.ReactDOM;
const html = window.htm.bind(React.createElement);

/* React inline styles must be objects, but the design writes them as CSS
 * strings (many built dynamically). Parse a CSS string into a React style
 * object at the boundary so the design's style strings can be used verbatim.
 * Values here never contain ';' and their first ':' is always the prop/value
 * separator, so a simple split is safe. */
function sx(str) {
  if (str == null) return undefined;
  if (typeof str === "object") return str;
  const out = {};
  for (const decl of String(str).split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    let prop = decl.slice(0, i).trim();
    const val = decl.slice(i + 1).trim();
    if (!prop) continue;
    if (!prop.startsWith("--")) prop = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    out[prop] = val;
  }
  return out;
}

/* The four corner ticks drawn on every "blueprint" card. */
const corners = () => [
  html`<i key="tl" className="corner tl"></i>`,
  html`<i key="tr" className="corner tr"></i>`,
  html`<i key="bl" className="corner bl"></i>`,
  html`<i key="br" className="corner br"></i>`,
];

/* The app's mark: the "marked passage", the ribbon marker cut from paper on a
 * steel field, rules standing in for the passage it holds. Square-cornered and
 * edge to edge like every other object in the blueprint system.
 *
 * This is the same drawing as src/icon.svg, the favicon, and that is the whole
 * point of it being here: an app with one identity, whether it is being looked
 * at in a browser tab, on the way in, or at the top of every screen. The
 * geometry is copied from that file rather than imported, because a favicon has
 * to be a standalone file a browser can fetch, but the two must not drift, so
 * test/views.test.mjs reads icon.svg and checks this against it.
 *
 * The one thing it does that the file cannot is read the palette: a standalone
 * SVG has no :root, so icon.svg writes #1d2d3d and #f2f2f3 out longhand where
 * this names the reversed-plate tokens, which is also what keeps the mark
 * visible on a dark page, where a steel square would sink into the ground.
 *
 * `rules` is the design's own concession to size. The drawing carries three
 * rules when it is shown large and two when it is small, because the third
 * closes up into grey below about 40px, icon.svg ships the 48px cut for the
 * same reason.
 *
 * `aria-hidden`: the wordmark is beside it in both places it is used, so a
 * screen reader reaching this as well would only say the name of the app
 * twice. */
const MARK_STEEL = "var(--color-reverse-bg)";
const MARK_PAPER = "var(--color-reverse-text)";
const appMark = (size = 24, rules = 2) =>
  html`<svg
    width=${size}
    height=${size}
    viewBox="0 0 64 64"
    aria-hidden="true"
    focusable="false"
    style=${{ flex: "none", display: "block" }}
  >
    <rect width="64" height="64" fill=${MARK_STEEL} />
    <polygon points="19,8 45,8 45,56 32,46 19,56" fill=${MARK_PAPER} />
    <g stroke=${MARK_STEEL} strokeWidth="3.2">
      <path d="M24 21H40" />
      <path d="M24 31H36" />
      ${rules > 2 && html`<path d="M24 41H38" />`}
    </g>
  </svg>`;

export { React, ReactDOM, html, sx, corners, appMark };
