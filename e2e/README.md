# Browser tests

Playwright, driving the real app in a real browser. This suite is the complement
of `npm test`, not a second copy of it: the node:test suite asserts the pure
modules and renders every screen to static markup, so what lives here is
everything that only exists once the app is running.

```bash
npx playwright install chromium   # once per machine
npm run test:e2e                  # the whole suite (starts the dev server itself)
npm run test:e2e -- e2e/learn.spec.mjs          # one file
npm run test:e2e -- --project=mobile            # phone width only
npm run test:e2e -- --headed --debug            # watch it, step through it
npm run test:e2e:ui                             # the interactive runner
npm run test:e2e:report                         # the last HTML report
```

The server is the one `npm run dev` runs (`serve` over the repo root, port 8080,
overridable with `E2E_PORT`); Playwright starts it and reuses one already
running.

## What is here

| File               | What it covers                                                        |
| ------------------ | --------------------------------------------------------------------- |
| `boot.spec.mjs`    | the splash's floor and ceiling, and where it hands the member         |
| `auth.spec.mjs`    | the sign-in gate, a refused domain, remote merge, sync, local-only    |
| `profile.spec.mjs` | the setup form, and the threshold the rest of the app reads           |
| `board.spec.mjs`   | the hero figures, the two queues, the map, and where its buttons go   |
| `list.spec.mjs`    | search, filters, ticking rows, shift-click runs, hand-picked sittings |
| `learn.spec.mjs`   | committing a verse — and the three ways an attempt does not           |
| `review.spec.mjs`  | a card turned, blanks filled, a peek held, a paper handed in          |
| `exam.spec.mjs`    | a test dealt, sat, and marked — and that it never commits             |
| `guide.spec.mjs`   | the figures it quotes, and the forgetting curve under its slider      |
| `motion.spec.mjs`  | the motion block, and the same screens under prefers-reduced-motion   |
| `mobile.spec.mjs`  | phone width (its own project; one known layout finding is a `fixme`)  |

## How a spec is written

Every spec starts by booting the app with a past — `app.boot({ progress, log,
profile, firebase })` — and then presses buttons the way a member would. Two
conventions matter:

- **Find things by their words, not by their markup.** `src/copy.js` is the one
  place the app's wording lives, so a spec quoting a sentence is quoting the
  same definition the view is. Structural locators (`.board-page`,
  `.result-strip`, `.flip-card`) are on the harness where the class _is_ the
  contract — usually because CSS is what draws the thing.
- **Seed records, do not earn them.** `helpers/seed.mjs` builds progress records
  through `src/srs.js` itself, so `committed(0.4)` means "a verse the app will
  read as 40% fresh" and stays true if the model is retuned.

## The two seams the harness takes over

Both are the app's own doors, not test hooks bolted on:

- **The CDN scripts.** `index.html` loads React, ReactDOM and htm from unpkg;
  the harness fulfills those requests from the dev-only npm copies, so the suite
  neither needs the network nor pins itself to unpkg's uptime. `E2E_LIVE_CDN=1`
  puts the real CDN back, which is worth a run before a deploy.
- **Firebase.** `src/firebase.js` imports the SDK from gstatic at runtime;
  `helpers/firebase-stub.mjs` answers that import with three small modules, so a
  session, a refused account, a cloud document and a failed network are all
  scenarios rather than fixtures. The app's own code path runs unchanged.
  Everything else boots with `window.__FIREBASE_CONFIG__ = null` — cloud sync
  off, local-only — which is the app's documented way of running without it.

Configuration goes in through `config.js`, the deploy-time override
`index.html` already loads (see `config.example.js`), and state goes in through
`localStorage`, which is what `src/storage.js` reads. Seeding happens once per
tab, so a reload is a real second visit.

## Two things to know before adding a spec

**Reduced motion is the default.** Every screen arrives with an animation and
the app drops all of them under `prefers-reduced-motion` (`src/styles.css`), so
the harness emulates that per page: screens are settled the moment they arrive.
`motion.spec.mjs` passes `reducedMotion: "no-preference"` to check the block
itself. (The context-level Playwright option is a no-op in this Chromium build,
which is why it is emulated in `boot()` rather than declared in the config.)

**The board's figures are not text.** The five hero numbers are drawn by CSS
from a registered `--count` (`styles.css`, `.count-up`), so the element carries
no text node. Read them with `app.figure(app.committedFigure)`, as
`test/views.test.mjs` does — never by matching digits.

A page that logs a console error fails the test it logged in (see
`fixtures.mjs`) — the browser's version of the zero-React-warnings rule the
render suite enforces. A spec that means to provoke one says so with
`app.allowConsoleErrors(/…/)`.
