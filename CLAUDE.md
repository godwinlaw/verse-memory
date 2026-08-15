# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**The Memory Board** — a spaced-repetition Bible-verse memorization app for Acts 2 Network - Berkeley. It is a **static, no-build, client-side app**: React, ReactDOM, and [htm](https://github.com/developit/htm) load from a CDN as classic `<script>` tags, and the app source is native ES modules with no bundler or transpile step.

## Commands

```bash
npm run dev            # serve at http://localhost:8080 (must be over HTTP — see below)
npm test               # run the node:test suite in test/
node --test test/smoke.test.mjs                        # run one test file
node --test --test-name-pattern="emailAllowed"         # run tests matching a name
npm run lint           # ESLint (flat config)
npm run format         # Prettier write   (format:check for CI-style check)
npm run build          # assemble ./dist (scripts/build.mjs) — the deployable static tree
npm run keywords       # regenerate data/keywords.js via spaCy (needs: pip install spacy + en_core_web_sm)
npm run deploy         # build + wrangler deploy (Cloudflare Workers static assets)
firebase deploy --only firestore:rules                 # deploy deploy/firestore.rules
```

Because the app uses ES modules, **it must be served over HTTP** — opening `index.html` from the filesystem will not work. `npm run dev`, Docker, or any static server is fine.

## Architecture

### No-build ES modules + CDN globals

`index.html` loads React/ReactDOM/htm from unpkg as classic scripts (so their globals exist), then loads `src/main.js` as `type="module"`. **`src/dom.js` re-exports those globals** (`React`, `ReactDOM`, `html`) plus `sx()` and `corners()`. Any module that renders must import `{ html, React }` from `./dom.js` — never add a bare `import ... from "react"`, since there is no bundler to resolve it.

`html` is htm bound to `React.createElement`, so views are written as tagged-template "JSX". Inline styles are **CSS strings parsed to React style objects by `sx()`** at the boundary (`style=${sx("...")}`) — that is why the design's style strings can be pasted verbatim.

### One component, pure logic extracted

`src/App.js` is a single class `App extends React.Component` (class component, not hooks) that owns all state and drives every view (board / list / review / done / leaderboard). Its `renderVals()` builds one large plain view-model object; the `header/boardView/listView/reviewView/...` methods are near-verbatim transcriptions of the design markup that consume it. Keep rendering logic thin — real logic lives in these pure modules:

- `src/srs.js` — the spaced-repetition model. A progress record is `{ hits, status, last, stability }`. Freshness = retrievability `R = e^(−t/S)` (Ebbinghaus). `migrate()` back-fills `stability` for legacy records; `nextStability()` rewards free recall > cued recall > recognition. All pure functions of `(record, now)`.
- `src/blanks.js` — "Fill the blanks" word selection and "Order the phrases" chunking.
- `src/text.js` — `norm`, `firstLetters`, `dayKey`.

### Data + the keyword generator

`data/passages.js` and `data/keywords.js` are ES modules exporting the verse set and per-passage keyword indices. **`data/keywords.js` is generated — do not hand-edit it.** `tools/gen_keywords.py` runs each passage through spaCy and writes indices that are **aligned to `text.split(" ")`**. Consequently, if you change a passage's text you must re-run `npm run keywords`, or the blanks will misalign. `blanks.js` prefers these precomputed indices and falls back to a lexical heuristic only for passages without data.

### Persistence, then optional cloud overlay

`src/storage.js` is the single source of truth via `localStorage`; the component never touches storage APIs directly. Firebase is an **optional overlay, not a dependency**: `storage.registerRemoteSync()` is a seam that `firebase.js` fills in, and `mergeProgress`/`mergeLog` reconcile local vs. remote on startup (per-verse last-write-wins by `last` timestamp; per-day max for the log). If Firebase is unreachable/misconfigured the app runs local-only.

### Auth gating (two enforcement layers)

The app is gated behind Google sign-in restricted to the Acts 2 Network Workspace domains. `App.render()` shows `authGate()` until auth status is `signed-in` or `disabled`. Enforcement is **dual and the client half is not security**:

1. Client: `emailAllowed()` in `src/firebase.js` checks the address against `ALLOWED_DOMAINS`.
2. Authoritative: `deploy/firestore.rules` allows access only to verified identities in those domains.

**To add/remove an allowed domain you must edit BOTH** `ALLOWED_DOMAINS` in `src/firebase.js` **and** the regex in `deploy/firestore.rules`, then redeploy the rules. Changing only the client is insufficient (and insecure). The Firebase modular SDK is dynamically imported from the gstatic CDN (`SDK_VERSION` in `firebase.js`).

### Configuration (config from environment)

Defaults (church name, deadline, Firebase config) live in `src/config.js`. Deploy-time overrides are injected as `window.__APP_CONFIG__` / `window.__FIREBASE_CONFIG__` by an optional root `config.js` (gitignored; template is `config.example.js`), loaded before the app. The Firebase web config is public by design (access is governed by Firestore rules), so it ships as the default in `src/config.js`.

## Deployment

Two independent paths:

- **Cloudflare Workers static assets** (`wrangler.jsonc`): `npm run deploy` builds `dist/` and `wrangler deploy` serves it. `scripts/build.mjs` copies only `index.html`, `src/`, `data/`, and a runtime `config.js` into `dist/` — never point a host at the repo root (it would serve `node_modules/`, `design/`, etc.).
- **Container → ECS via Drone** (A2N standard): `Dockerfile` (nginx, `deploy/nginx.conf`) and `.drone.yml` (lint/format/test, publish image to ECR on `main`).

## Conventions

- 2-space indent; Prettier `printWidth` 120, double quotes, trailing commas (`.prettierrc.json`). Run `npm run format` before committing.
- Tests use `node:test` + `node:assert` and target the pure modules (`srs`, `blanks`, `storage` merges, `emailAllowed`); rendering/browser code is not unit-tested.
- Scripture text is ESV © Crossway — the MIT LICENSE covers code only.
