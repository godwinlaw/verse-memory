# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**The Memory Board** — a spaced-repetition Bible-verse memorization app for Acts 2 Network - Berkeley. It is a **static, no-build, client-side app**: React, ReactDOM, and [htm](https://github.com/developit/htm) load from a CDN as classic `<script>` tags, and the app source is native ES modules with no bundler or transpile step.

## Commands

```bash
npm run dev            # serve at http://localhost:8080 (must be over HTTP — see below)
npm test               # run the node:test suite (test/**/*.test.mjs — one file per module)
node --test test/grading.test.mjs                       # run one test file
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

### State shell + view-model + views

`src/App.js` is a single class `App extends React.Component` (class component, not hooks), but it is a thin **stateful shell**: it owns `state`, builds one `actions` table of callbacks in `buildActions()` (every `setState`, `localStorage` write, or `document.getElementById` for blank focus lives behind it), and dispatches to a view per top-level screen (board / list / review-setup / learn-setup / review / done / leaderboard / test-setup / test / test-done / auth-gate / profile-form). It does not render markup itself beyond that dispatch.

Between state and markup sit two directories, and the rule for where a change belongs is which of these it changes:

- **`src/viewmodel/*.js`** — `state + actions` → one flat object of strings and callbacks, no markup, no DOM. `index.js` assembles the object a view consumes from `totals.js`, `chrome.js` (nav + identity), and one file per screen (`board.js`, `list.js`, `review.js`, `learn.js`, `exam.js`, `leaderboard.js`, `gate.js`), plus `explainer.js` for the two explanations the setup screens share. Change **what is shown** here.
- **`src/views/*.js`** — view-model → markup. Pure functions of `v` with no imports from `App.js` and no state. One file per screen, mirroring `viewmodel/`. Change **how something looks** here.
- **`src/ui/tokens.js`** — style strings used in more than one place (`muted()`, `segButton()`, `LABEL_SECTION`, `SCREEN_*`, `statusTag()`, …). A style string that appears once stays inline in its view; hoisting it would trade the design's readability for indirection.

Real logic — the part worth unit-testing — lives below `viewmodel/`, in pure modules of `(state, now)` or `(input)`:

- `src/srs.js` — the spaced-repetition model, plus `commitsVerse()` (see What commits a verse). A progress record is `{ hits, status, last, stability, updatedAt }` (see Learn vs. Review vs. Test mode for why a graded record needs `updatedAt`). Freshness = retrievability `R = e^(−t/S)` (Ebbinghaus). `migrate()` back-fills `stability` for legacy records; `nextStability()` rewards free recall > cued recall > recognition, and the harder setting of an activity over the easier one; `reviewAward()`/`testStability()` decide where a finished card or a marked paper lands, and `backdatedLast()` (exported as both `reviewedLast` and `testedLast`) dates the verse to it.
- `src/progress.js` — reading a progress map: `progressReader()` binds per-passage questions (status, freshness, due), plus `dueOrder()`, `committedCount()`, `streakOf()`, and the two pools the sittings draw from — `reviewPool()` and `learnPool()`, plus `selectionPools()` for a hand-picked one (see What commits a verse).
- `src/grading.js` — grading a typed attempt against a passage (`gradeWritten`), the first-letter live-reveal drill (`revealFirstLetters`), and a typed scripture reference (`parseReference`, `gradeReference`). This is the app's trickiest logic and previously lived inline in a render method with no tests.
- `src/review.js` — the `MODES`, the two session kinds (`REVIEW` / `LEARN`), session sizing constants, `scrambleScore()` (how much of an ordering was rebuilt, less what the wrong tries cost), `seededShuffle` (Fisher–Yates over a mulberry32 PRNG, seeded by passage id), and `mulberry32` itself.
- `src/exam.js` — Test mode: setup options, which verses a setup admits, seeded question generation for the four activities, marking, and folding a marked paper back into the progress map.
- `src/blanks.js` — "Fill the blanks" word selection and "Order the phrases" chunking.
- `src/text.js` — `norm`, `firstLetters`, `sentences`, `dayKey` (local-day, not UTC — see `progress.streakOf`, which depends on that).

`test/views.test.mjs` renders every screen (via `test/helpers/scenarios.mjs` fixtures, `new App(props)` + assign `state` + `.render()`, no mount) to static markup and asserts zero React console warnings — this is what keeps a view template honest without a browser. `test/app.test.mjs` covers the flows a single render cannot: it drives review and learn sessions card by card — including what does and does not commit a verse — and a whole test session through the `actions` table, giving the unmounted instance a synchronous stand-in for React's update queue.

### What commits a verse

The set is divided in two by one rule, and most of the app's shape follows from it: **a passage is committed when the member writes the whole thing out from memory, and by nothing else.** `srs.commitsVerse(ctx)` is the only definition — mode `type`, first-letter scaffold off, zero peeks, and a mark of at least `COMMIT_SCORE` (0.95, so one dropped article does not deny a passage the member plainly knows).

`App.record()` is the only caller, so a session is the only place status can change. In particular there is **no manual commit button** (removed along with `App.setStatus`), repetition does not promote anything (`REVIEWS_TO_COMMIT` is gone — `hits` still counts clean reviews but no longer means anything), and **Test mode never commits**: `applyExam()` moves freshness and stability but leaves status alone. Nothing demotes either — a verse already committed keeps its status through any bad morning.

That rule splits the set into the two pools in `progress.js`, which are the single definition of what each sitting draws from: `reviewPool()` (committed and faded to the threshold or below) and `learnPool()` (everything not committed, verses already started first). The board's two sections and both setup screens read these, so they cannot disagree.

The passage list is the one screen that does not deal from a pool: rows can be ticked and taken as a sitting directly. That is a choice of _which_ verses, not of the rule — `selectionPools()` divides the ticked ids the same way (committed → review, the rest → learn), so a hand-picked sitting is still two sittings when the picks straddle both halves, and a review session still cannot reach an uncommitted verse. The one thing it relaxes is freshness: a verse picked by hand is taken however fresh it reads, where `reviewPool()` would leave it alone. The ticks live in `state.selection` (device-local, never persisted) and survive a sitting, so the member clears them, not the app.

### Learn vs. Review vs. Test mode

Three ways through the set. Learn and review run the _same_ card UI, the same four activities, and the same `state.results` bookkeeping — `state.sessionKind` (`REVIEW` / `LEARN` in `review.js`) is all that separates them, and it changes only which pool filled the queue and how the session frames itself. Note that it deliberately does **not** gate committing: `commitsVerse()` reads the attempt, not the menu the member came from, so a full write-out commits a verse wherever it happens. (A review session cannot reach an uncommitted verse anyway, so the case is unreachable rather than special-cased.)

- **Learn** (`viewmodel/learn.js`, `views/learn-setup.js`) — works the uncommitted verses and tries to commit them. The session names the bar on the card itself (`stakeVals` in `viewmodel/review.js`), because that is what the sitting is for.

  **A learn screen never mentions freshness**, and this is deliberate rather than an oversight: a member committing a passage for the first time cannot act on how much of it has decayed, and quoting a percentage invites them to optimise it instead of writing the passage out. So learn-setup omits the freshness explainer, the learn card shows no stake and no before/after meters (it reports whether the attempt committed the verse), the peek note names the commitment it costs rather than the freshness, and the board's Learn queue drops the freshness column. The scheduling still runs underneath — every learn card earns stability and a peek still costs freshness — it is only never what the screen is about. `stakeVals()` is where the two voices are chosen, and `test/views.test.mjs` scans every learn screen for `/fresh/i` so the split cannot quietly erode.

- **Review** (`viewmodel/review.js`, `views/review-setup.js`) — upkeep on committed verses that have faded to the member's threshold (`profile.DEFAULT_DUE_FRESHNESS`, 75%, tunable per member). It never offers an uncommitted verse, at any ceiling. Submitting marks a card: `App.submitCard(score)` takes the mark the view-model already computed for display, and `record()` turns it into stability (`nextStability`) and a freshness award (`reviewAward`). Each activity pays a ceiling — write it out 100%, fill the blanks 95%, order the phrases 90% — scaled by the difficulty setting and the mark, less `PEEK_COST` per press of Peek. A verse is marked at most once a session, and walking off an unsubmitted card — forwards or back — is confirmed first, because it records nothing. The flashcard is the exception: nothing measures it, so it has no Submit and is recorded on the way out at the full award.
- **Test mode** (`exam.js`, `viewmodel/exam.js`, `views/exam-setup.js` + `exam.js` + `exam-done.js`) — a marked paper. The member picks a size, whether only committed verses count, a freshness ceiling, and which activities to face; `buildExam()` deals activities round-robin over the chosen verses and returns a paper that is a pure function of its seed. Nothing is revealed until the summary.

All three are graded, so all three can send a verse **backwards** — a card submitted badly, or peeked at repeatedly, can leave less freshness than it found. Test mode is the harshest: `srs.testStability()` shrinks stability below `TEST_PASS` and grows it above, where a session only ever grows it. Either way `srs.backdatedLast()` **backdates `last`** so the verse reads at the freshness the member actually demonstrated (55% → 55% fresh) rather than the 100% a bare timestamp would imply. Because `last` is then not the moment of writing, a graded record also carries **`updatedAt`**, and `storage.mergeProgress` reconciles on `max(updatedAt, last)` — changing either half without the other will silently lose results across devices.

### Data + the keyword generator

`data/passages.js` and `data/keywords.js` are ES modules exporting the verse set and per-passage keyword indices. **`data/keywords.js` is generated — do not hand-edit it.** `tools/gen_keywords.py` runs each passage through spaCy and writes indices that are **aligned to `text.split(" ")`**. Consequently, if you change a passage's text you must re-run `npm run keywords`, or the blanks will misalign. `blanks.js` prefers these precomputed indices and falls back to a lexical heuristic only for passages without data.

### Persistence, then optional cloud overlay

`src/storage.js` is the single source of truth via `localStorage`; the component never touches storage APIs directly. Firebase is an **optional overlay, not a dependency**: `storage.registerRemoteSync()` is a seam that `firebase.js` fills in, and `mergeProgress`/`mergeLog` reconcile local vs. remote on startup (per-verse last-write-wins by `max(updatedAt, last)` — see Learn vs. Review vs. Test mode for why a record needs both; per-day max for the log). If Firebase is unreachable/misconfigured the app runs local-only. Exercise preferences and the three setup forms (`mv.examSetup`, `mv.reviewSetup`, `mv.learnSetup`) are device-local and never synced.

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
- Tests use `node:test` + `node:assert`, one file per module (`test/<module>.test.mjs`), matched by `test/**/*.test.mjs`. Pure modules (`srs`, `blanks`, `grading`, `progress`, `review`, `storage` merges, `emailAllowed`) are asserted directly; `test/views.test.mjs` renders every view-layer screen to static markup via `test/helpers/dom-env.mjs` (React/ReactDOM/htm installed from dev-only npm copies — the shipped app still loads them from CDN) and asserts it throws nothing and logs no React warnings.
- Scripture text is ESV © Crossway — the MIT LICENSE covers code only.
