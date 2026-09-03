# Contributing

## The one constraint that shapes everything else

This is a **static, no-build, client-side app**. React, ReactDOM, and
[htm](https://github.com/developit/htm) load from a CDN as classic `<script>`
tags in `index.html`; the app source is native ES modules with no bundler and
no transpile step. That means:

- **Never add a bare `import ... from "react"`** (or `react-dom`, or `htm`) in
  `src/`. There is no bundler to resolve it, the browser would 404. Any module
  that renders imports `{ html, React }` from `./dom.js`, which re-exports the
  CDN globals.
- The app **must be served over HTTP**, opening `index.html` from the
  filesystem will not work, since ES modules are same-origin restricted.
  `npm run dev` (or any static file server) is fine.
- `react`/`react-dom`/`htm` do appear in `package.json` as **devDependencies**,
  but only so `test/views.test.mjs` can render views to static markup under
  `node --test`. They are never bundled or shipped; the deployed app still
  loads them from unpkg/gstatic.

## Before committing

```bash
npm run format   # Prettier, required; CI runs format:check and will fail otherwise
npm run lint     # ESLint
npm test         # node:test, pure modules + view render smoke tests
npm run test:e2e # Playwright, the app driven in a browser (see e2e/README.md)
```

`npm run test:all` runs the last two together. The browser suite needs Chromium
once per machine: `npx playwright install chromium`.

## Where a change belongs

- **How something looks** → `src/views/*.js`. Pure functions of a view-model
  object `v`; no state, no imports from `App.js`.
- **What is shown** → `src/viewmodel/*.js`. `state + actions` → the flat `v`
  object a view consumes; no markup, no DOM.
- **How memory, grading, or scheduling work** → `src/srs.js`, `src/grading.js`,
  `src/progress.js`, `src/review.js`. Pure functions of `(record, now)` /
  `(state)`, this is the logic worth unit-testing, and it should have no React
  or DOM dependency at all.
- **State and side effects** → `src/App.js`. It owns `state` and one `actions`
  table (`buildActions()`); every `setState`, `localStorage` write, or DOM query
  lives behind that table, which is what keeps `viewmodel/` and `views/`
  testable without a browser.
- A style string used in **more than one place** goes in `src/ui/tokens.js`. A
  style used once stays inline in its view, hoisting it trades the design's
  readability for indirection with no reuse to justify it.

See the "Architecture" section of `CLAUDE.md` for the fuller tour.

## Changing a passage's text

`data/keywords.js` is **generated, not hand-authored**, `tools/gen_keywords.py`
runs each passage through spaCy and writes keyword indices aligned to
`text.split(" ")`. If you edit a passage in `data/passages.js`, you must
regenerate it or the "Fill the blanks" exercise will blank the wrong words:

```bash
pip install spacy && python3 -m spacy download en_core_web_sm
npm run keywords   # == python3 tools/gen_keywords.py
```

## Changing who can sign in

The allowed Google Workspace domains are enforced in **two places**, and both
must change together:

1. `ALLOWED_DOMAINS` in `src/firebase.js` (client-side gate, convenience only).
2. The domain regex in `deploy/firestore.rules` (the **authoritative** check),
   redeployed with `firebase deploy --only firestore:rules`.

Changing only the client is both insufficient and insecure, anyone can still
read/write Firestore directly if the rules allow it, regardless of what the
client checks.

## Tests

Two suites, split by what they can see.

**`npm test`, node:test, no browser.** One `test/<module>.test.mjs` per pure
module in `src/` (`node --test 'test/**/*.test.mjs'`). `test/views.test.mjs`
renders every screen in `test/helpers/scenarios.mjs` to static markup and
asserts it throws nothing and logs zero React warnings, add a new fixture there
when you add a new view state worth covering, rather than a one-off test file.
This is where a rule, a mark, or a screen's markup is asserted.

**`npm run test:e2e`, Playwright, a real browser.** `e2e/*.spec.mjs`, one file
per flow, driving the shipped tree over the dev server. This is where a
_behaviour_ is asserted: something that survives a reload, a card actually
committed by typing a passage out, a run of rows ticked by shift-click, the CSS
the views only name, the Firebase seam answering over the wire. See
`e2e/README.md` for the harness and the conventions.

The split is worth keeping: if a new test can be written against a view-model or
a static render, it belongs in `test/`, which is a hundred times faster. Reach
for `e2e/` when the thing under test is the pressing rather than the result.
