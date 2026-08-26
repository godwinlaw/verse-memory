# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Verse Mastery** — a spaced-repetition Bible-verse memorization app for Acts 2 Network - Berkeley. It is a **static, no-build, client-side app**: React, ReactDOM, and [htm](https://github.com/developit/htm) load from a CDN as classic `<script>` tags, and the app source is native ES modules with no bundler or transpile step.

## Commands

```bash
npm run dev            # serve at http://localhost:8080 (must be over HTTP — see below)
npm test               # run the node:test suite (test/**/*.test.mjs — one file per module)
node --test test/grading.test.mjs                       # run one test file
node --test --test-name-pattern="emailAllowed"         # run tests matching a name
npm run test:e2e       # Playwright, the app driven in a browser (e2e/*.spec.mjs)
npm run test:e2e -- e2e/learn.spec.mjs                  # one browser spec
npx playwright install chromium                         # once per machine, before the above
npm run test:all       # both suites
npm run lint           # ESLint (flat config)
npm run format         # Prettier write   (format:check for CI-style check)
npm run build          # assemble ./dist (scripts/build.mjs) — the deployable static tree
npm run keywords       # regenerate data/keywords.js via spaCy (needs: pip install spacy + en_core_web_sm)
ESV_API_KEY=… node tools/fetch_passages.mjs             # add passages listed in tools/new-passages.json (authoring only)
npm run deploy         # build + wrangler deploy (Cloudflare Workers static assets)
firebase deploy --only firestore:rules                 # deploy deploy/firestore.rules
```

Because the app uses ES modules, **it must be served over HTTP** — opening `index.html` from the filesystem will not work. `npm run dev`, Docker, or any static server is fine.

## Architecture

### No-build ES modules + CDN globals

`index.html` loads React/ReactDOM/htm from unpkg as classic scripts (so their globals exist), then loads `src/main.js` as `type="module"`. **`src/dom.js` re-exports those globals** (`React`, `ReactDOM`, `html`) plus `sx()` and `corners()`. Any module that renders must import `{ html, React }` from `./dom.js` — never add a bare `import ... from "react"`, since there is no bundler to resolve it.

`html` is htm bound to `React.createElement`, so views are written as tagged-template "JSX". Inline styles are **CSS strings parsed to React style objects by `sx()`** at the boundary (`style=${sx("...")}`) — that is why the design's style strings can be pasted verbatim.

### State shell + view-model + views

`src/App.js` is a single class `App extends React.Component` (class component, not hooks), but it is a thin **stateful shell**: it owns `state`, builds one `actions` table of callbacks in `buildActions()` (every `setState`, `localStorage` write, or `document.getElementById` for blank focus lives behind it), and dispatches to a view per top-level screen (board / list / review-setup / learn-setup / review / done / leaderboard / test-setup / test / test-done / guide / splash / auth-gate / profile-form / welcome). It does not render markup itself beyond that dispatch.

Between state and markup sit two directories, and the rule for where a change belongs is which of these it changes:

- **`src/copy.js`** — every word the app says, in one object, one block per screen. Change **the wording** here and nowhere else: views and view-models import `copy` rather than writing text inline. Text that never changes is a plain string; text with a computed value in it is a function (`peekCost: (pct) => …`) that formats values the caller worked out. A copy function must not import from `srs`, `progress`, or any other model — the numbers are computed where the rule lives and passed in, so `copy.js` cannot become a second place the model is described. The `name`/`short`/`desc` on `MODES`, `ACTIVITIES`, and the two difficulty tables stay put, because they sit beside `key` fields that are part of the persisted data model; `STATUS_LABEL` is the exception and lives in `copy.status`, re-exported by `progress.js`.
- **`src/viewmodel/*.js`** — `state + actions` → one flat object of strings and callbacks, no markup, no DOM. `index.js` assembles the object a view consumes from `totals.js`, `chrome.js` (nav + identity), and one file per screen (`board.js`, `list.js`, `review.js`, `learn.js`, `exam.js`, `leaderboard.js`, `gate.js`, `guide.js`), plus `explainer.js` for the two explanations the setup screens share. Change **what is shown** here.
- **`src/views/*.js`** — view-model → markup. Pure functions of `v` with no imports from `App.js` and no state. One file per screen, mirroring `viewmodel/`. Change **how something looks** here.
- **`src/ui/tokens.js`** — style strings used in more than one place (`muted()`, `segButton()`, `LABEL_SECTION`, `SCREEN_*`, `statusTag()`, …). A style string that appears once stays inline in its view; hoisting it would trade the design's readability for indirection.
- **`src/styles.css`, the motion block** — everything that moves. Change **how something moves** here. The rule the splash and the guide already followed now covers the whole app: **the keyframe lives in `styles.css` and the view only names a class** — never an `animation:` in a view or a view-model. The block is `.screen` (every top-level view), `.stack-in` / `.item-in` (things arriving), `.meter-fill` / `.meter-rise` / `.meter-step` (a bar reaching a figure), `.count-up` (a figure reaching itself), `.card-swap` (a sitting dealing its next card), `.mic-dot` (a microphone that is really listening), and the per-control transitions (`.btn`, `.seg-btn`, `.option`, `.chunk`, `.tick`, `.queue-row`, `.nav-btn`, `.blank-input`). Three conventions keep it from growing a rule per screen: a meter declares only a `from`, so the `to` stays whatever the view-model computed; anything arriving in a series is staggered off `--stagger-i`, set inline as the item's index, with the delay capped so a hundred passages still finish in about half a second; and the board's five hero figures count up in pure CSS — `--count` is registered as an `<integer>` so it can be interpolated, the element sets its target inline, and a counter renders it through `::after`. That last one is what keeps views pure functions with nothing to mount, and it means **those figures are not text nodes** — assert on `--count`, not on the digits (see `test/views.test.mjs`, "board shows the committed count"). `backwards` rather than `both`/`forwards` is deliberate — a lingering `forwards` transform would make a screen the containing block for the fixed dialogs inside it. Every animation is dropped under `prefers-reduced-motion` at the foot of the block, as the splash's and the guide's are.

Real logic — the part worth unit-testing — lives below `viewmodel/`, in pure modules of `(state, now)` or `(input)`:

- `src/srs.js` — the spaced-repetition model, plus `commitsVerse()` (see What commits a verse). A progress record is `{ hits, status, last, step, stability, updatedAt }` (see Learn vs. Review vs. Test mode for why a graded record needs `updatedAt`). Freshness = retrievability `R = e^(−t/S)` (Ebbinghaus), and `reviewAward()` is the one figure a card is worth — the activity's ceiling, its difficulty setting and the mark, less `PEEK_COST` a peek — which does both jobs: it is the freshness `backdatedLast()` (exported as both `reviewedLast` and `testedLast`) dates the verse to, and the evidence `nextStep()` moves it on. See The interval ladder for what `step` is; `migrate()` places a legacy record on it.
- `src/progress.js` — reading a progress map: `progressReader()` binds per-passage questions (status, freshness, due), plus `dueOrder()`, `committedCount()`, `streakOf()`, and the two pools the sittings draw from — `reviewPool()` and `learnPool()`, plus `selectionPools()` for a hand-picked one (see What commits a verse).
- `src/grading.js` — grading an attempt against a passage (`gradeWritten`), the first-letter live-reveal drill (`revealFirstLetters`), and a typed scripture reference (`parseReference`, `gradeReference`). This is the app's trickiest logic and previously lived inline in a render method with no tests.
- `src/voice.js` — where a recited passage goes (see Reciting aloud): `transcribe()`, which folds a phrase from the browser into the transcript, replacing an unsettled guess in place and capitalising the first word.
- `src/review.js` — the `MODES`, the two session kinds (`REVIEW` / `LEARN`), session sizing constants, `scrambleScore()` (how much of an ordering was rebuilt, less what the wrong tries cost), `seededShuffle` (Fisher–Yates over a mulberry32 PRNG, seeded by passage id), and `mulberry32` itself.
- `src/exam.js` — Test mode: setup options, which verses a setup admits, seeded question generation for the four activities, marking, and folding a marked paper back into the progress map.
- `src/blanks.js` — "Fill the blanks" word selection and "Order the phrases" chunking.
- `src/text.js` — `norm`, `firstLetters`, `sentences`, `dayKey` (local-day, not UTC — see `progress.streakOf`, which depends on that). `norm` keeps **only letters and digits**: an apostrophe is punctuation like any other, so "eagles", "eagles'" and "eagle's" are one word. Nobody pronounces one, and a member typing from the sound of a verse cannot tell where it belongs — it also closes a straight-vs-curly trap, since ESV text carries `’` where a keyboard produces `'`.

`test/views.test.mjs` renders every screen (via `test/helpers/scenarios.mjs` fixtures, `new App(props)` + assign `state` + `.render()`, no mount) to static markup and asserts zero React console warnings — this is what keeps a view template honest without a browser. `test/app.test.mjs` covers the flows a single render cannot: it drives review and learn sessions card by card — including what does and does not commit a verse — and a whole test session through the `actions` table, giving the unmounted instance a synchronous stand-in for React's update queue.

### The browser suite

`e2e/*.spec.mjs` (Playwright, `npm run test:e2e`) is the complement of the above, and the split is worth keeping: **`test/` asserts a rule, a mark, or a screen's markup; `e2e/` asserts the pressing.** A new test belongs in `test/` whenever it can be written against a view-model or a static render — that suite is a hundred times faster — and in `e2e/` when the thing under test only exists once the app is running: state that survives a reload, a verse committed by typing a passage into the box, a run of rows ticked by shift-click, the CSS the views only name (the count-up figures, the two-sided card, the reduced-motion block), the Firebase seam answering over the wire.

It runs against the shipped tree over `npm run dev`, and takes over exactly two seams, both of them the app's own doors: the CDN scripts `index.html` loads (fulfilled from the dev-only npm copies, as `test/helpers/dom-env.mjs` does) and the Firebase SDK `src/firebase.js` imports from gstatic (answered by `e2e/helpers/firebase-stub.mjs`, so a session, a refused domain, a cloud document and an unreachable network are scenarios). State goes in through `localStorage` and configuration through `config.js`, seeded once per tab so a reload is a real second visit. Records are built by `e2e/helpers/seed.mjs` calling `srs.js` itself, so `committed(0.4)` stays true if the model is retuned. Specs find things by the words in `copy.js` rather than by markup. See `e2e/README.md`.

### What commits a verse

The set is divided in two by one rule, and most of the app's shape follows from it: **a passage is committed when the member gives the whole thing back from memory, and by nothing else.** `srs.commitsVerse(ctx)` is the only definition — mode `type`, zero peeks, and a mark of at least `COMMIT_SCORE` (0.95, so one dropped article does not deny a passage the member plainly knows). Giving it back means typing it _or_ reciting it aloud (see Reciting aloud) — `commitsVerse` reads the attempt, never how the words arrived, so there is nothing in the rule to keep in step. The first-letter scaffold is the one exception carved out of it, and only inside Learn (`ctx.sessionKind === "learn"`): Learn's whole errand is turning an uncommitted verse into a committed one, so a clean scaffolded write-out counts there. The same scaffold never commits in Review, though the case is unreachable rather than special-cased — Review never offers an uncommitted verse (see below), so `App.record()`'s `prev.status === "memorized"` short-circuit decides it before `commitsVerse` is ever asked.

`App.record()` is the only caller, so a session is the only place status can change. In particular there is **no manual commit button** (removed along with `App.setStatus`), repetition does not promote anything (`REVIEWS_TO_COMMIT` is gone — `hits` still counts clean reviews but no longer means anything), and **Test mode never commits**: `applyExam()` moves freshness and the verse's rung but leaves status alone. Nothing demotes either — a verse already committed keeps its status through any bad morning.

That rule splits the set into the two pools in `progress.js`, which are the single definition of what each sitting draws from: `reviewPool()` (committed and faded to the threshold or below) and `learnPool()` (everything not committed, verses already started first). The board's two sections and both setup screens read these, so they cannot disagree.

The passage list is the one screen that does not deal from a pool: rows can be ticked and taken as a sitting directly. That is a choice of _which_ verses, not of the rule — `selectionPools()` divides the ticked ids the same way (committed → review, the rest → learn), so a hand-picked sitting is still two sittings when the picks straddle both halves, and a review session still cannot reach an uncommitted verse. The one thing it relaxes is freshness: a verse picked by hand is taken however fresh it reads, where `reviewPool()` would leave it alone. The ticks live in `state.selection` (device-local, never persisted) and survive a sitting, so the member clears them, not the app. A run of rows is ticked at once by shift-clicking: `state.selectAnchor` holds the last row ticked on its own, and a shift-click applies _that row's_ state to everything between it and the row clicked — ticked anchor ticks the run, a just-cleared anchor clears it. The run is cut from the rows currently on screen, so a search or filter bounds it; `viewmodel/list.js` works out which ids that is (as it does for the header tick box) and `App.selectRange` only adds or removes them.

### The three shelves

The set is divided into three categories — the core **Verses Every Self
Respecting Christian Should Know** (the original 167), **Psalms**, and **DT
Passages** — and `src/categories.js` is the only definition of them. Names sit
beside keys there rather than in `copy.js`, for the same reason `MODES` and
`ACTIVITIES` keep theirs: the key is written into every passage record and into
the saved setup forms, so it is data.

**A category is a shelf, not a rule.** It says nothing about what commits a
verse, what a sitting draws from, or how anything is scheduled — `reviewPool()`,
`learnPool()` and `eligiblePassages()` remain the single definition of each, and
a category only narrows the passage list handed to them. Every screen that
offers one also offers "All" and opens on it, so with nothing chosen the app
behaves exactly as it did when there was one flat set — which is also what keeps
the setup screens and the board from disagreeing. `inCategory(list, null)`
returns the list untouched, and that is what lets callers apply it
unconditionally instead of branching round it. `categoryOf()` reads a missing
category as `core`, because every record predates the field and all of them were
the goal. The review setup narrows **both** its due queue and its manual
controls, so the picker means the same thing to a member who is behind and one
who is caught up. The test setup narrows what is _examined_ but deliberately not
the `passages` `buildExam()` hands to `pickRefQuestion`/`matchQuestion`: a wrong
reference is only worth reasoning about if it could have come from anywhere.

**The goal is one category, not the set** (`viewmodel/totals.js`). The deadline
was set against the core verses, so `goal`, `pct`, `perWeek`, `memorized`,
`learning` and `remaining` are all measured over `inCategory(passages,
GOAL_CATEGORY)` — adding two shelves must not drop a member's percentage without
anyone forgetting a word. Two figures span everything instead: `committedAll`,
which the leaderboard's "You" row uses so it matches the peer rows (those come
from `committedCount(r.progress)` in `App.loadRoster`, which knows nothing about
categories), and `totalCount`, the size of the list. Reading the board's figure
off `committedAll` would let a member show "174 of 171".

**A long chapter ships as sections.** Hebrews 11 is six passage records and 2
Corinthians 4 is three, each sharing a `group`. Each section is an ordinary
passage that commits on its own, so nothing in `srs`, `progress` or `exam`
needed to learn what a chapter is; the `group` only gathers them under one
heading on the list, and `viewmodel/list.js` puts that heading on the first row
of a run **as currently shown**, so a search that breaks the run still labels
what is left. Sections are also what keep a record inside the ESV licence and
inside what a member can give back in one sitting.

**A long passage carries its verses.** Records fetched by
`tools/fetch_passages.mjs` have a `verses` array with `text` as the flat join,
so grading, blanks, keywords and the exam never learn about it. The one reader
is `chunksFor(t, level, verses)`: with three or more verses it cuts on verse
boundaries at `verseGroup` per chunk (fine 1, medium 2, coarse 3) and then falls
through the same `maxChunks` fold as before, so a forty-verse chapter still
cannot deal forty tiles. Cutting a chapter on punctuation gave dozens of
look-alike fragments — a jigsaw rather than a recall — where a verse is the unit
a member actually holds one of. Passages without `verses` are byte-identical to
before.

**The ESV text is fetched once, at authoring time.** `tools/fetch_passages.mjs`
reads `tools/new-passages.json` and `ESV_API_KEY` from the environment; the app
never calls an API and there is no key in the build. `data/passages.js` must
stay a **single JSON array literal** — `tools/gen_keywords.py` slices it between
the first `[` and the last `]` and hands that to `json.loads`, so a second
`export const` in that file would break the generator, which is why the category
table lives in `src/`. Crossway's storage limits (half a book, 500 consecutive
verses) are asserted over the shipped set by `test/passages.test.mjs`, and their
required notice is rendered in `views/footer.js` — the terms ask for it wherever
the text appears, not only in the README.

### Reciting aloud

The commit activity — mode key `type`, shown as **"From memory"** — takes the passage two ways: typed, or **recited into the same box**. The key stays `type` because it is in every progress record and read by `srs.reviewAward`; only the display `name`/`short` changed, and they sit beside the key in `review.js` like every other mode's.

The whole design turns on one decision: **speaking fills `state.typed` and nothing else.** No second grade, no second award, no second surface — `grading.js` and `srs.js` never learn how the words arrived, which is why reciting commits a verse with no rule anywhere agreeing that it should. That decision is also what keeps the interface to **one switch**: the box is an ordinary textarea the whole time, so correcting a misheard word needs no controls of its own. Backspace is backspace.

Two small modules, split by what each needs to run:

- **`src/voice.js`** — pure, and the only part with logic worth testing. The browser reports a phrase twice: first as a guess it keeps revising while you speak, then once it settles. `tail` is where that unsettled guess begins in the transcript, so each version **replaces the last in place** rather than piling up after it. `transcribe(typed, tail, text, settled, passage, rest)` is the whole model — a settled point, a provisional tail after it, and two things the engine cannot know that the passage can. Keeping the guess in `typed` rather than in a buffer beside it is the point: what the member sees is what the grader marks, so there is no second thing to keep in step.

  **The words are fitted back onto the passage.** An engine hands back a flat lowercase stream with no punctuation at all, so a member reciting perfectly watched their verse come out looking nothing like the verse. A word that matches is therefore shown **as the passage writes it** (`LORD` for lord, `God's` for gods), and the punctuation between two words is only printed once **both** are right — a full stop after "one" is a claim about where the sentence ended, and until the next word is in there is nothing to make that claim about, so the stop arrives one word late, which is also when a reader would want it. The alignment is **positional** (the Nth word said is the Nth word of the passage, the same assumption the first-letter drill makes); a word got wrong is left exactly as it was heard and the words after it still line up. **A word the engine merely spelled wrong is corrected** on the way in — the match is within one edit, ignoring a plural ending on either side and never on a word under three letters, so "sews" for _sow_ and "Jews" for _Jew_ come out as the passage writes them. It is the one loose comparison in the app and it lives only here: `grading.js` stays exact, so nothing a member **types** is forgiven, and the trade — a recited word genuinely misremembered as a near neighbour is now given — is made deliberately against the alternative, which failed a member who said the verse right. `MAX_EDITS` and `MIN_FUZZY_LEN` in `voice.js` are where it is tuned. `passage` is optional, and without it the words go in as they were heard — which is what the box did before it was ever handed the verse. Capitalising the **first word of the box** survives as the fallback for a word that matched nothing.

  **The words go in where the cursor is.** `rest` is how many characters at the end of the box sit _after_ the insertion point — nothing at all in the ordinary case, where the member is reciting onto the end. Put the caret back into the middle and everything from there on is held aside, the phrase goes in at the caret, and the held part is put back after it. It is counted **from the end** rather than held as an index because the phrase in the middle is still being revised and every revision changes its length. `App.setCaret` tracks it from the textarea's `onSelect`, and only while the microphone is open — nothing else reads it, and a member who is only typing should not pay a `setState` per keystroke.

- **`src/recognizer.js`** — the browser seam, written like `firebase.js`: an optional overlay, and `voiceSupported()` returning false just means the activity is a box you type in (Firefox has no `SpeechRecognition`, and nothing here works around that). `createRecognizer(handlers)` drives `onStatus` / `onText(text, settled)` / `onError`. The one non-obvious bit is `wanted`: Chrome ends a continuous session of its own accord after a pause, so an unasked-for `onend` is simply started again — that is what separates "the engine stopped" from "the member stopped".

Three rules hold the rest of it. The microphone belongs to **the card, not the session**: `resetCard()`, `submitCard()`, `leaveReview()` and the first-letter toggle all tear the recognizer down, and `hearRecitation()` re-checks the mode, the scaffold and the submitted flag, because a phrase can arrive after the member has moved on. A **hand edit settles the box up to the caret** (`setTyped` takes the cursor position alongside the value), so the next phrase heard goes in where the member left off rather than past the end of what they wrote; with no caret given it settles to the end, as it always did. And the recognizer is **never started by anything but the member**.

`state.voice` is `{ supported, status, error, tail, rest }` — nothing persisted, since a microphone preference is worth nothing on the next card. In the UI it is one segmented On/Off in the same row as the first-letter scaffold's, and `.mic-dot` is rendered only once the engine is really listening (the switch being on is not the same thing — there is a permission prompt in between).

### The interval ladder

**How long a verse is left alone is a rung, not a product.** `srs.INTERVALS` is a fixed list of gaps — `[1, 2, 3, 4, 5, 6, 7, 14, 21, 30, 60, … 365]` days, which is the schedule Scripture Typer offers — and a progress record carries the rung it has reached as `step`. `stabilityFor(step)` turns that into the `S` the forgetting curve runs on, picked so the verse reads at exactly `DUE_R` (0.75, `profile.DEFAULT_DUE_FRESHNESS` as a ratio) when the interval runs out: rung 0 is a day, so a verse committed today is at 75% tomorrow and back in the review pool; rung 6 is a week, reading 96% the next day and 75% on the seventh. **`stability` is therefore derived and `step` is the fact** — every reader below (`retrievability`, the pools, the Fading tag, the guide's curve, `backdatedLast`) is unchanged by this, because the curve is still the curve.

This replaced a multiplicative (FSRS-shaped) model where `S` was a running product, and the reason is worth keeping: it compounded about 3.9× a review, so a member reviewing exactly on time went 1.6 → 9.3 → 36 → 143 → 561 days. Three good reviews put a verse out of sight for a month and five put it away for a year and a half, which meant the app never asked for the next-day review that is what actually makes a verse stick. `GROWTH_BASE`, `S0`, `SPACING_MAX`, `ACTIVITY_MULT`, `BLANK_MULT` and `SCRAMBLE_MULT` all went with it — the testing-effect hierarchy they encoded is already in `MODE_AWARD`/`LEVEL_AWARD`, and keeping both was two places to describe one idea. The one real loss is the **spacing effect** (a bigger gain for reviewing a verse when it is nearly forgotten), which a fixed ladder has no equivalent for by construction.

`nextStep(prev, award, mode)` is the only thing that moves a verse, and it reads **the award the card was already worth** — no second table beside `reviewAward()`. Four bands: at or above `ADVANCE_R` (0.9) up a rung, at or above `HOLD_R` (0.6) the same rung again, at or above `LAPSE_R` (0.3) down one, and below that back to the first. The hierarchy falls out rather than being written twice: a perfect write-out advances and still advances through two peeks but not three (so **peeking buys freshness and costs the rung**), blanks at medium (0.95 × 0.96) advances, and order-the-phrases at its coarsest (0.9 × 0.92) can hold a rung but never lengthen one. A verse with no `last` starts at rung 0 whatever it scored, because there is no interval yet to win or lose.

**The flashcard holds its rung** (`UNMARKED_MODES`), and this is the one place the ladder needs to know a mode. `MODE_AWARD.flip` is 1.0 because turning a card over is a real review in freshness terms — but nothing measures it, so it can never be the evidence for a longer interval; without the exception a member could click a verse onto a two-month rung. It is the same argument that already gives the flashcard no Submit button.

`applyExam()` moves a paper along the same ladder through the same `nextStep`, passing the mark itself (every question on a paper is marked, so there is no unmarked mode to excuse) — one scheduler where there used to be two, and `TEST_PASS` is now literally `HOLD_R` so "passed" and "kept the interval" cannot drift apart.

`migrate()` places a legacy record on the ladder, at the nearer of two readings: where its own `stability` puts it (`stepNear`) and `hits - 1`. The second is the cap that matters, because the old model let stability run away — a verse reviewed three times could be carrying a hundred-day interval it never earned. That is a deliberate **one-time correction rather than a preservation**: a member with verses parked on long intervals sees a batch of them come due, which is the point. A record that already has a `step` is left completely alone, which is also why every fixture in `test/helpers/` and `e2e/helpers/seed.mjs` carries one — a fixture without it is exercising the migration instead of the model.

Sync needs nothing new: `storage.reconcile()` takes the winning record wholesale, so `step` rides along with `stability`.

### Learn vs. Review vs. Test mode

Three ways through the set. Learn and review run the _same_ card UI, the same four activities, and the same `state.results` bookkeeping — `state.sessionKind` (`REVIEW` / `LEARN` in `review.js`) is all that separates them, and it changes only which pool filled the queue and how the session frames itself. Note that it deliberately does **not** gate committing: `commitsVerse()` reads the attempt, not the menu the member came from, so a full recall commits a verse wherever it happens. (A review session cannot reach an uncommitted verse anyway, so the case is unreachable rather than special-cased.)

- **Learn** (`viewmodel/learn.js`, `views/learn-setup.js`) — works the uncommitted verses and tries to commit them. The session names the bar on the card itself (`stakeVals` in `viewmodel/review.js`), because that is what the sitting is for.

  **A learn screen never mentions freshness**, and this is deliberate rather than an oversight: a member committing a passage for the first time cannot act on how much of it has decayed, and quoting a percentage invites them to optimise it instead of writing the passage out. So learn-setup omits the freshness explainer, the learn card shows no stake and no before/after meters (it reports whether the attempt committed the verse), the peek note names the commitment it costs rather than the freshness, and the board's Learn queue drops the freshness column. The scheduling still runs underneath — every learn card earns stability and a peek still costs freshness — it is only never what the screen is about. `stakeVals()` is where the two voices are chosen, and `test/views.test.mjs` scans every learn screen for `/fresh/i` so the split cannot quietly erode.

- **Review** (`viewmodel/review.js`, `views/review-setup.js`) — upkeep on committed verses that have faded to the member's threshold (`profile.DEFAULT_DUE_FRESHNESS`, 75%, tunable per member). It never offers an uncommitted verse, at any ceiling. Submitting marks a card: `App.submitCard(score)` takes the mark the view-model already computed for display, and `record()` turns it into one award (`reviewAward`), which both moves the verse along the ladder (`nextStep`) and is the freshness it is left at. Each activity pays a ceiling — from memory 100%, fill the blanks 95%, order the phrases 90% — scaled by the difficulty setting and the mark, less `PEEK_COST` per press of Peek. A verse is marked at most once a session, and walking off an unsubmitted card — forwards or back — is confirmed first, because it records nothing. The one relaxation is a card whose mark left the verse uncommitted: what a learn sitting is for is still open, so the card can be handed in again — by "Try again" (`App.retryCard`) or by simply switching exercise, which is the same reopening. Switching exercise on a card whose mark stands does **not** clear it: the answers sit in a slot per activity, so the marked paper is still there to come back to, and the exercise switched to takes answers because the mark is not its (`App.activityMarked`, which is why the input guards ask that rather than `cardSubmitted`) — it just cannot be handed in. The flashcard is the exception: nothing measures it, so it has no Submit and is recorded on the way out at the full award. It is a genuinely two-sided card — reference on the front, passage on the back, turned by clicking it or by the button below — and the first-letter scaffold shares the _back_ with the passage, in its place: the back of the card is the answer, at whichever strength was asked for. So the two buttons below it each turn the card to their own side of that pair (`App.revealFlipSide`), each reads Show or Hide by **what is actually on screen** rather than by the stored switch, and pressing one again returns to the reference rather than handing over the other half — hiding the scaffold must never be the press that reveals the passage. Clicking the card itself is only the turn; which strength the back shows is the buttons’ business.
- **Test mode** (`exam.js`, `viewmodel/exam.js`, `views/exam-setup.js` + `exam.js` + `exam-done.js`) — a marked paper. The member picks a size, whether only committed verses count, a freshness ceiling, and which activities to face; `buildExam()` deals activities round-robin over the chosen verses and returns a paper that is a pure function of its seed. Nothing is revealed until the summary.

All three are graded, so all three can send a verse **backwards** — a card submitted badly, or peeked at repeatedly, can leave less freshness than it found, and costs a rung of the ladder besides (see The interval ladder; `TEST_PASS` is `HOLD_R`, so "passed" and "kept the interval" are one bar). Either way `srs.backdatedLast()` **backdates `last`** so the verse reads at the freshness the member actually demonstrated (55% → 55% fresh) rather than the 100% a bare timestamp would imply. Because `last` is then not the moment of writing, a graded record also carries **`updatedAt`**, and `storage.mergeProgress` reconciles on `max(updatedAt, last)` — changing either half without the other will silently lose results across devices.

### The guide

`viewmodel/guide.js` + `views/guide.js` are the long-form explainer, reached from the header's **Guide** entry and from "How this works" on the board's pace check. It is the one screen that draws the app rather than describing it, and it is built out of five things that move:

- a **map of the header** — every destination in the app is in the sticky header, so the map _is_ the header. Each stop carries a `slot` (where its cell sits on the bar, in the header's own left-to-right order) alongside its position in the tour's narrative order; the three sittings are joined to their outcome by animated connectors.
- a passage **crossing from Learn to Review**, which is the commit rule (see What commits a verse) shown happening.
- the **real forgetting curve** under a day slider, drawn by calling `srs.retrievability()` rather than re-implementing `e^(−t/S)`, so a retune of the model redraws the picture. Two curves at two **rungs of the real ladder** — the first (a day) and the fortnight, picked because it crosses the due mark inside the thirty days the plot spans, so dragging the slider actually flips the verdict under it — because the point is the gap between them.
- the **interval ladder itself** (`.guide-ladder`), `srs.INTERVALS` drawn bottom-up as one rung per gap with a marker climbing it, beside the four bands of `nextStep` in the member's words. The rungs are the model's own list mapped through `copy.guide.rungLabel`, and the band figures are `ADVANCE_R`/`HOLD_R`/`LAPSE_R`, so retuning either redraws this without anyone editing the guide (`test/views.test.mjs` asserts one rung per interval).
- one **looping demonstration per activity**, keyed by the same mode keys `MODES` uses. The flashcard one is not a drawing: it is the **real two-sided card** (`.flip-card` / `.flip-card-face` / `.flip-card-back` in `styles.css`, shared with `views/review.js`), turned by a keyframe instead of by the member. Only the turn is set per use, so the guide cannot come to show something the activity does not do.

Two rules hold it together. The numbers are read off the model, never written out: the commit bar is `srs.COMMIT_SCORE`, the due mark is the member's own `dueFreshness`, and the per-activity ceilings come from `modeCeiling()` — **exported from `viewmodel/explainer.js` and shared with the setup screens**, so the short and long explanations cannot quote different figures. And everything that moves is a `@keyframes` in the guide block of `styles.css` (the view only names classes), with the whole set disabled under `prefers-reduced-motion`.

The wording is `copy.guide` (including the diagram labels and the sample passage they are drawn from), so the split runs three ways: the view owns geometry, `copy.js` owns words, `viewmodel/guide.js` owns the numbers that go into them. That copy is deliberately written at about a middle-school reading level — short sentences, plain words, one idea at a time — because it is the screen a member reads when they do not yet know how any of this works. "Committed" and "freshness" are the two exceptions: they are printed on every other screen, so the guide teaches them rather than inventing easier synonyms that would match nothing the member sees elsewhere.

`state.guideStop` / `state.guideDays` are deliberately **not** persisted — unlike the setup forms, a tour position is worth nothing on the next visit.

### Data + the keyword generator

`data/passages.js` and `data/keywords.js` are ES modules exporting the verse set and per-passage keyword indices. **Both are generated — do not hand-edit either.** Passages come from `tools/fetch_passages.mjs` (see The three shelves); `data/keywords.js` comes from spaCy. `tools/gen_keywords.py` runs each passage through spaCy and writes indices that are **aligned to `text.split(" ")`**. Consequently, if you change a passage's text you must re-run `npm run keywords`, or the blanks will misalign. `blanks.js` prefers these precomputed indices and falls back to a lexical heuristic only for passages without data.

### Persistence, then optional cloud overlay

`src/storage.js` is the single source of truth via `localStorage`; the component never touches storage APIs directly. Firebase is an **optional overlay, not a dependency**: `storage.registerRemoteSync()` is a seam that `firebase.js` fills in, and `mergeProgress`/`mergeLog` reconcile local vs. remote on startup (per-verse last-write-wins by `max(updatedAt, last)` — see Learn vs. Review vs. Test mode for why a record needs both; per-day max for the log). **Committing survives the merge**: since nothing demotes a verse (see What commits a verse), a newer record saying `learning` is never a demotion that happened — it is a device that had not yet heard about the commit. `reconcile()` therefore carries `status: "memorized"` forward from whichever side has it while the newer record still wins every other field, so a verse committed on one device cannot go back to uncommitted when another syncs. If Firebase is unreachable/misconfigured the app runs local-only. Exercise preferences and the three setup forms (`mv.examSetup`, `mv.reviewSetup`, `mv.learnSetup`) are device-local and never synced.

**"Disabled" carries a reason**, because two opposite situations used to share the word. `initAuth` reports `reason: "unconfigured"` when there is no Firebase in this build (a local copy, `window.__FIREBASE_CONFIG__ = null`) — there is no account to reach, so the app runs local-only and says nothing, as it always has. It reports `reason: "unreachable"` when the gstatic SDK import fails: a blocked network, an extension, a dropped connection. That one matters because `App.render()` lets `disabled` **skip the sign-in gate by design**, so an unreachable SDK used to drop a member with a full record onto the sign-up form and a private device-local copy, silently. `App.startAuth()` is therefore separated from `componentDidMount` so the member can retry it, and `firebase.js` guards `observing` so a retry that gets through cannot leave a second auth observer behind the first.

**A record that could not be read is not an empty record**, and keeping those two apart is what `state.sync` is for. `initAuth`'s second channel, `onSyncChange({ status, code })`, reports `pulling` → `synced` | `error`; `onPushError` reports a failed write the same way. `firebase.js` splits the two halves accordingly: `registerPush()` wires the storage seam and never throws, `pullRemote()` reads the document and does, and `retrySync()` runs the read again without a fresh sign-in. The reason this matters is entirely about the screen behind it — the sign-up profile form. A member whose pull failed has an incomplete profile _on this device_, which is indistinguishable from being new, so the app used to hand them the form; the profile they then filled in carried a fresh `updatedAt`, won `mergeProfile`, and **replaced the real one**. So `views/sync-gate.js` stands in front of the form whenever the record is unknown (`recordUnknown` in `App.render()` — the read in flight, the read failed, or no SDK to read with), offering only the two safe moves — try again, or sign out. It gates the _form only_: a member whose profile is already complete on this device goes straight through to a `syncBannerView` strip saying their work is staying local. `test/views.test.mjs` asserts both, including that the gate never claims the member has no progress.

`hydrateRemote()` merges against **`storage.load*()`, not `this.state`** — the pull can land before `componentDidMount`'s `setState` has flushed, and merging against the empty initial maps would drop this device's records before the queued update overwrote the merge with the local copy alone.

**The initial pull reads the server**, via `getDocFromServer` rather than `getDoc`. `getDoc` answers from Firestore's local view when it can, and that view includes this client's own pending writes — so on a cold client the read came back as a document holding nothing but `{ name, email }` from the identity write, which is indistinguishable from a member who has never used the app. A brand-new browser was therefore shown the sign-up form while the server held the whole record, and then saved that emptiness over its local copy; an established browser has the real document cached, so only a cold one showed it. For the same reason `writeIdentity()` now runs **after** the pull, and there is deliberately no cache fallback: if the server cannot be reached the record is genuinely unknown, which is what the sync gate is for.

**A push reads before it writes.** The same field mask that makes an empty map dangerous makes a _stale_ one dangerous: `merge: true` leaves alone the keys the payload does not mention, but every key it does mention it overwrites, however old this device's copy of it is. A push used to be `setDoc(…, { merge: true })` of whatever this device held, so a device still holding a verse as `learning` wrote that straight over the commit another device had just made. It settled into a standoff rather than a race — the device that committed the verse went on saying committed, because `reconcile()` carries `memorized` forward on the way _in_, while every other device pulled the rollback and pushed it back up — so a verse committed on one device simply never reached the others. `mergeIntoRemote()` in `firebase.js` now folds the record into the stored one inside a `runTransaction`, through the _same_ `mergeProgress`/`mergeLog`/`mergeProfile` the pull uses, so the two directions cannot settle a record differently and two devices saving at once cannot lose each other's work. The one cost is that a transaction needs the network where a plain `setDoc` would queue offline, so a failed push is retried (`PUSH_RETRIES`) before the member is told sync is not working; the local save stands regardless, and the next visit's pull folds it up anyway. The `replace` path stays a plain full write.

**An empty slice is never pushed.** `merge: true` does not mean "leave everything else alone" — it writes the fields in the payload. For a map with contents the mask reaches the leaves, so keys not mentioned survive; an **empty** map has no leaves, so the mask names the field itself and the stored map is replaced by nothing. Empty is exactly what a device holds before its first pull lands, so one browser signing in could erase the profile every other device was reading — and then they all pulled the erasure, which is what asks a member to set up a profile they already have. `mergeable()` in `firebase.js` drops `progress`, `log` or `profile` from an ordinary push when they are empty; a slice with nothing in it has nothing to say. The `replace` path below is deliberately exempt, since emptying the record is its whole purpose.

**The leaderboard reads a summary, not everybody's record.** It used to call `getDocs(collection("users"))` and pull every member's whole progress map and entire daily log — every verse of every member, on every visit to the board — in order to arrive at three numbers each. That is the one read whose cost grows with the size of the group, and it grows for everybody at once. So each member's push also writes **`standings/{uid}`**, built by `standings.summarize()`: the display name and the three profile fields the board filters and groups by, plus a flat `fresh` array of `last, stability` pairs for the **committed verses only**, and `streak` alongside the `streakDay` it was true of. `fetchRoster()` scans that collection instead and hands back rows through `rowFromSummary()`.

Two things are deliberately _not_ stored in it. **The freshness score**, because it decays: a stored score is a claim about the moment it was written, so the summary keeps what the curve runs on and `rowFromSummary()` runs the curve when the board asks — a member who stops opening the app still sinks down the board over the following fortnight, exactly as before. And **which verses**: the board asks how many and how fresh, never which, so the ids would be a third of the payload spent on something nobody reads (and would tell every member which verses every other member holds). The email is gone from the read for the same reason. `fresh` is flat rather than a list of pairs because Firestore refuses an array inside an array.

The summary is written inside the same transaction as the record and **from the merged result, not this device's payload** — otherwise a device that had not caught up would publish a board row missing verses another device committed — and it is written whole rather than merged, since folding an old `fresh` into a new one would leave verses on the board that are no longer committed. `standings/{uid}` needs its own block in `deploy/firestore.rules` (same access as `users/{uid}`), which must be **redeployed** or every push fails on a refused write. `fetchRoster()` falls back to the old full scan while the `standings` collection is empty, which covers the day the change ships; each member's summary appears on their first save, and a sign-in that pulls saves what it merged. `App.loadRoster()` also holds a fetched roster for `ROSTER_TTL_MS`, since the board is one press away in the header and its figures move at the speed of somebody sitting down to review.

**Wiping the record** is the one push that is not a merge. "Reset all progress" on the settings form (`App.resetProgress`, behind the warning dialog in `views/profile-form.js`) empties progress and the log — and only those; the profile, the settings beside it, and the device-local preferences are not the record. `storage.clearProgressAndLog()` flags the push `replace`, and `firebase.js` then writes the whole document (identity included) rather than `setDoc(…, { merge: true })`, because merging an empty map deletes nothing and the next sign-in would fold every wiped verse straight back in. The flag is sticky across the push debounce (`pendingReplace`), since an ordinary save landing inside the same window would otherwise be the write that goes up.

### Which way round the page is printed

Light, dark, or the reader's own system — the default, and what the app did before there was a switch. The palette is one block of token overrides in `src/styles.css` and no rules of its own, keyed on **`data-theme` on the root element**, which is always already settled to `light` or `dark` — never `system`.

**The choosing is in JS, not in the stylesheet**, and that is the whole reason `src/theme.js` exists: CSS cannot say "dark unless the member asked for light" without writing the palette out a second time under a second selector, and one palette written twice is a palette that drifts. So `prefers-color-scheme` is read in exactly one place. `normalizeTheme` / `resolveTheme` are pure and unit-tested (`test/theme.test.mjs`); `prefersDark`, `applyTheme` and `watchSystemTheme` are the window seam, written like `device.js` and `recognizer.js`.

Two consequences worth knowing. **`index.html` stamps the ground before the first paint** — four lines repeated from `theme.js` because a module would arrive a paint late and the member would watch the page turn over; `e2e/theme.spec.mjs` asserts it with `src/main.js` blocked, on a page the app never runs on. And the choice is **device-local, never synced** (`storage.saveTheme`, `mv.theme`, stored as a bare word rather than JSON so that pre-paint line stays small): it is about the screen in front of the member, not about them. It is not a profile field either, so the switch on the settings form does not wait for Save and is not undone by Cancel — `actions.setTheme` saves, stamps and re-renders on the press. `src/icon.svg` is the one thing the choice cannot reach, since a browser fetches the favicon outside the page; it keeps its own media query and follows the system.

### Not on a phone

The app is **not offered on a mobile device**, and the refusal is the first thing `App.render()` dispatches — before the splash, before sign-in — so a member who is not getting in is not made to watch the boot first. `views/mobile-gate.js` is a dead end: one sentence (`copy.mobileGate.message`), two drawn marks beside it (the handset ruled through, the screen to open it on) which are `aria-hidden` because the sentence already says it, and **no controls at all**, so there is nothing to dismiss.

`src/device.js` is the only definition of what counts. `isMobileDevice({ userAgent, platform, maxTouchPoints })` is pure and unit-tested; `detectMobile()` is the one-line seam that asks the window, written like `recognizer.js`. Two things about the rule are deliberate: **it asks about the device, not the window** — a narrow browser window on a laptop is still a laptop, and the breakpoints in `styles.css` are what serve it, so nothing here reads a width — and a **tablet counts**, since an iPad is a device you hold. iPadOS 13+ reports itself as a desktop Mac, so a Mac-shaped platform with `maxTouchPoints > 1` is caught by touch rather than by string.

The answer is settled once, into `state.isMobile` in `initialState()`, because it cannot change under a member mid-session. `test/device.test.mjs` asserts the rule against real user agents and `e2e/mobile.spec.mjs` (the `mobile` Playwright project, a browser really claiming to be a Pixel) asserts that nothing behind the gate is reachable around it.

### Landing: the splash decides where the member goes

`App.render()` opens on the splash (`views/splash.js`, `splashVals` in `viewmodel/gate.js`) and stays there until it knows which screen the member is owed: local data loaded **and** Firebase has said whether there is a session to restore. Only then does it dispatch — a restored session goes straight to the board, no session to the sign-in gate. Deciding behind the splash is the whole point: `auth.status` starts at `"loading"`, so without it a returning member would be shown a sign-in prompt for the moment the check takes, and then have it yanked away.

Two figures bound the wait, and they are deliberately kept apart. `appConfig.splashMinMs` (in `src/config.js`, overridable per deploy via `window.__APP_CONFIG__`) is the least the splash stays up, so the mark is a screen rather than a flicker — it is a matter of taste, so it sits with the other tunables. `SPLASH_MAX_MS` in `App.js` is the most the app waits on Firebase before falling through to the sign-in gate, so a blocked CDN cannot strand the member on it (a late answer still lands — the auth observer keeps running); it is a failsafe, not a preference. `splashMinMs()` clamps the floor under that ceiling, since a floor above it would hold the member on the splash past the point the app had given up waiting. The splash's own animation is the `.splash-*` block in `styles.css`, dropped under `prefers-reduced-motion` like the guide's — and `--splash-turn` there is **the floor written a second time**, since the bar's eight steps and all three load steps are timed to fit inside one turn so that even the fastest boot sees the whole set name itself. Shorten `splashMinMs` without shortening `--splash-turn` and the last line never gets its turn.

The screen itself is **the registration mark**: the app printed in reverse — a steel field (`--color-accent-900`) with the type reversed to paper — and everything on it is the system's own corner mark at three sizes, hung in the frame's corners, drawn large and turning at the centre, and laid flat as the ruler under the wordmark. It is deliberately not the sign-in gate's shell, so the boot reads as the press warming up rather than as a page of the app that happens to be empty; `.shell-settle` fades the gate in over it. **Nothing on it is a measurement** — the mark turns at its own pace, the bar advances in eight fixed steps, and the three load steps cycle on a CSS timer — because a boot has no figure the member could act on. That is also why the cycling stack is `aria-hidden` and `copy.splash.note` rides beside it in a `role="status"`: announcing the cycle would report a state the app is not actually in. The one thing drawn from data is the size of the set, and it comes from the passage module rather than `state.passages`, which is not filled until `loaded` — one of the things being waited for.

### Auth gating (two enforcement layers)

The app is gated behind Google sign-in restricted to the Acts 2 Network Workspace domains. `App.render()` shows `authGate()` — after the splash above — until auth status is `signed-in` or `disabled`. Enforcement is **dual and the client half is not security**:

1. Client: `emailAllowed()` in `src/firebase.js` checks the address against `ALLOWED_DOMAINS`.
2. Authoritative: `deploy/firestore.rules` allows access only to verified identities in those domains.

**To add/remove an allowed domain you must edit BOTH** `ALLOWED_DOMAINS` in `src/firebase.js` **and** the regex in `deploy/firestore.rules`, then redeploy the rules. Changing only the client is insufficient (and insecure). The Firebase modular SDK is dynamically imported from the gstatic CDN (`SDK_VERSION` in `firebase.js`).

The two halves drifting apart is not a hypothetical: a client that admits a domain the deployed rules do not means every read and write is refused for those members, which the app cannot tell from having no record — so they are asked to set up a profile on each device and nothing syncs. **`.github/workflows/deploy.yml` therefore deploys `firestore:rules` alongside hosting on every push to `main`**, so the client half can never ship without the rules half. Deploying by hand (`firebase deploy --only firestore:rules`) still works and is what to reach for when the rules alone are behind.

### What the app is currently offering

Several pieces of the app are **switched off rather than taken out**, and
`features` in `src/config.js` is the only definition of which: `leaderboard`
(the Stats board and its header entry), `guide` (the long-form explainer, its
entry, and the board's link to it), `profileSetup` (the sign-up form, plus the
four identity fields it shares with Settings), `welcome` (the one-time nudge
that followed that form), and `boardEpigraph` (the verse across the top of the
board). All five are `false` today. A deploy overrides them through
`window.__APP_CONFIG__.features`, which is **merged** over the defaults rather
than replacing them, so naming one flag does not silently take the others with
it.

**A flag is read where it is used, not captured at import.** `viewmodel/`
decides what is shown (the nav filters `NAV`, `boardVals` hands the view an
`epigraph` or an empty string, `profileFormVals` sets `showIdentity`), views
branch on a `v.` boolean the way they already do for `showReviewSettings`, and
`App.render()` reads the two that decide a whole screen. Nothing in `srs`,
`progress`, `exam` or `grading` knows a flag exists — a flag is about what is on
screen and never about what a verse is worth.

Two consequences of `profileSetup` are worth knowing, because they are the
places the flag reaches past its own screen. The **sync gate goes with the form
it guards**: it exists to stop a member whose cloud record could not be read
being sent through sign-up and stamping a fresh profile over the real one, and
with no form to keep off the screen there is nothing for it to stand in front
of. And the **identity fields leave Settings too** — they are there to slice the
leaderboard — which means `profileFormVals.complete` can no longer hold Save
against them and `App.submitProfile` drops the matching `isProfileComplete`
check; otherwise every setting underneath them would be unreachable for
everybody. A profile already filled in is left alone, written straight back from
the draft, and still synced.

**Hidden is a claim the tests have to keep.** Every one of those screens is
still rendered by `test/views.test.mjs`: `featuresFor(name)` in
`test/helpers/scenarios.mjs` maps a scenario's name prefix to the flags its
screen is offered under, and `withFeatures` (`test/helpers/features.mjs`) turns
them on around the render. `asShipped(name)` is the same render with nothing
turned on, and is what asserts the pieces are actually off. The browser suite
does the same through the app's own door — `app.boot({ features })` writes them
into the served `config.js` — so `e2e/guide.spec.mjs`, `standings.spec.mjs`,
`profile.spec.mjs` and `sync.spec.mjs` go on pressing screens a member cannot
currently reach.

### Configuration (config from environment)

Defaults (church name, deadline, splash floor, the feature flags above, Firebase config) live in `src/config.js`. Deploy-time overrides are injected as `window.__APP_CONFIG__` / `window.__FIREBASE_CONFIG__` by an optional root `config.js` (gitignored; template is `config.example.js`), loaded before the app. The Firebase web config is public by design (access is governed by Firestore rules), so it ships as the default in `src/config.js`.

One override is sharp enough to have its own guard: `window.__FIREBASE_CONFIG__ = null` disables cloud sync entirely, which is a reasonable thing to want while looking at the app locally without signing in — but `scripts/build.mjs` prefers the local `config.js` over the template, so a build made with that line live ships a **site with no sign-in and no cross-device progress, saying nothing about it**. The build now evaluates the config it is about to ship and **refuses** when it reads `null`, unless `ALLOW_LOCAL_ONLY_BUILD=1` says it was meant.

## Deployment

Two independent paths:

- **Cloudflare Workers static assets** (`wrangler.jsonc`): `npm run deploy` builds `dist/` and `wrangler deploy` serves it. `scripts/build.mjs` copies only `index.html`, `src/`, `data/`, and a runtime `config.js` into `dist/` — never point a host at the repo root (it would serve `node_modules/`, `design/`, etc.).
- **Container → ECS via Drone** (A2N standard): `Dockerfile` (nginx, `deploy/nginx.conf`) and `.drone.yml` (lint/format/test, publish image to ECR on `main`).

## Conventions

- 2-space indent; Prettier `printWidth` 120, double quotes, trailing commas (`.prettierrc.json`). Run `npm run format` before committing.
- Tests use `node:test` + `node:assert`, one file per module (`test/<module>.test.mjs`), matched by `test/*.test.mjs` — a plain shell glob rather than a `**` one passed to node, because node's own glob expansion in `--test` only arrives in Node 21 and CI runs on older images (a quoted `**` pattern there fails with "Could not find"). Test files are flat in `test/` for the same reason. Pure modules (`srs`, `blanks`, `grading`, `progress`, `review`, `storage` merges, `emailAllowed`) are asserted directly; `test/views.test.mjs` renders every view-layer screen to static markup via `test/helpers/dom-env.mjs` (React/ReactDOM/htm installed from dev-only npm copies — the shipped app still loads them from CDN) and asserts it throws nothing and logs no React warnings.
- Scripture text is ESV © Crossway — the MIT LICENSE covers code only.
