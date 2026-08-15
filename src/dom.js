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

export { React, ReactDOM, html, sx, corners };
