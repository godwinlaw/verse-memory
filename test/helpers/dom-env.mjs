/* Node test harness for the browser-only rendering layer.
 *
 * The app expects React, ReactDOM, and htm to already exist as globals (they are
 * loaded from a CDN as classic <script> tags in index.html, and src/dom.js just
 * re-exports them). This installs the same globals from the dev-only npm copies
 * so views can be rendered to static markup under `node --test`.
 *
 * Import this module for its side effect BEFORE importing anything that reaches
 * src/dom.js, then use `await import(...)` for the modules under test:
 *
 *   import "./helpers/dom-env.mjs";
 *   const { boardView } = await import("../src/views/board.js");
 */

import React from "react";
import ReactDOM from "react-dom";
import { renderToStaticMarkup } from "react-dom/server";
import htm from "htm";

// src/dom.js reads these off `window`; jsdom is not needed for static rendering.
globalThis.window = globalThis.window || {};
globalThis.window.React = React;
globalThis.window.ReactDOM = ReactDOM;
globalThis.window.htm = htm;

/* Render an element (or an array of them) to static HTML. */
export function render(element) {
  return renderToStaticMarkup(Array.isArray(element) ? React.createElement(React.Fragment, null, ...element) : element);
}

/* Freeze the clock so time-dependent views (days left, streaks, the 14-day
 * activity chart) render deterministically. Returns a restore function. */
export function freezeClock(iso = "2026-08-15T12:00:00.000Z") {
  const RealDate = globalThis.Date;
  const fixed = new RealDate(iso).getTime();
  class FrozenDate extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [fixed]));
    }
    static now() {
      return fixed;
    }
  }
  globalThis.Date = FrozenDate;
  return () => {
    globalThis.Date = RealDate;
  };
}

export { React };
