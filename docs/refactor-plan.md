# Refactor: status and remaining work

A structural refactor of the client app, done so the codebase is easier for new
contributors and coding agents to navigate. This document records **what landed**,
**how it was verified**, and **what is still outstanding**, with enough detail to
be picked up cold.

Written 2026-08-15, against branch `feat/member-profiles`.

---

## 1. Why

`src/App.js` was 1772 lines: one class holding all state, a ~500-line
`renderVals()` returning a ~100-key object, and six view methods of 100–400
lines each. Finding "where does the leaderboard filter come from" meant scrolling
the whole file. Style strings were duplicated (the segmented-button style five
times verbatim), and the app's trickiest logic, grading a typed passage, lived
inline in a render function with no test coverage.

Separately, **CI was failing on every push**: `npm run lint` exited with 53
errors, so the `test` step of `.drone.yml` could never go green.

---

## 2. What landed

### 2.1 Tooling (was broken)

`eslint.config.js`, rewritten.

- `dist/` was not in `ignores`, so ESLint linted the build output (a copy of
  `src/`) and double-reported everything in it.
- `scripts/build.mjs` matched no `files` block, so it had no Node globals and
  `console.log` was a `no-undef` error.
- Warnings were promoted to errors, and `eqeqeq` / `no-var` / `prefer-const`
  added. `caughtErrorsIgnorePattern` lets `catch {}` stand where the error is
  genuinely not needed.

`npm run lint` now exits 0.

### 2.2 New architecture

```
src/
  App.js              462  stateful shell: state, actions, view dispatch
  dom.js                   React/htm globals, sx(), corners()      (unchanged)
  config.js                app + Firebase config                   (unchanged)
  storage.js               localStorage + cloud-sync seam          (rewritten)
  firebase.js              auth + Firestore sync                   (touched)
  profile.js               member profile domain                   (unchanged)
  srs.js                   spaced repetition / forgetting curve    (unchanged)
  blanks.js                blank selection + phrase chunking       (unchanged)
  text.js                  text/date helpers                       (touched)

  progress.js          74  NEW, reading a progress map (status, freshness,
                           due order, streaks). Pure.
  grading.js           73  NEW, matching an attempt against the passage. Pure.
  review.js            82  NEW, review modes, session shape, seeded shuffle.
  ui/tokens.js         69  NEW, style strings used in more than one place.

  viewmodel/               state + actions -> one flat object of strings and
    index.js           44  callbacks. No markup, no DOM.
    totals.js          35
    chrome.js          52
    board.js          144
    list.js            75
    review.js         202
    leaderboard.js     87
    gate.js            81

  views/                   view-model -> markup. Pure functions of `v`.
    header.js          42  No state, no imports from App.js.
    board.js          180
    list.js            94
    review.js         217
    done.js            20
    leaderboard.js    108
    auth-gate.js       34
    profile-form.js    97
```

The rule a contributor needs: **a change to how something looks belongs in
`views/`, a change to what is shown in `viewmodel/`, a change to how memory is
modelled in `srs.js`.** `App.js` holds state and an `actions` table and nothing
else.

`App.buildActions()` returns the single table of callbacks the view-models call.
Every side effect (setState, localStorage, `document.getElementById` for blank
focus) is behind it, which is what makes `viewmodel/` and `views/` testable with
no DOM.

### 2.3 Behaviour changes (deliberate, 2 of them)

Both were latent bugs, not refactors. They are the only intended differences in
rendered output.

1. **`seededShuffle` in `src/review.js`.** The old shuffle called
   `Array.prototype.sort` with a comparator that ignored its arguments and
   returned a pseudo-random number. A comparator must be a consistent ordering;
   engines are free to produce anything when it isn't, so the "shuffle" was
   neither uniform nor reliable across engines. It also drove its LCG with
   `s * 1103515245`, which exceeds 2^53 and silently loses precision. Replaced
   with Fisher–Yates over mulberry32 (`Math.imul`, stays in 32 bits). Still
   seeded by passage id, so a given passage still scrambles the same way every
   time.

2. **`dayKey` in `src/text.js`.** Documented as "local-day key" but implemented
   as `toISOString().slice(0, 10)`, which is UTC. A member reviewing at 9pm in
   Berkeley was logged against tomorrow's date, splitting an evening across two
   buckets and breaking the streak they had just earned, while `streakOf()`
   walked _local_ dates, so the two disagreed. Now formats from
   `getFullYear/getMonth/getDate`.

   Note: existing `mv.log` entries were written with UTC keys. No migration is
   needed (the streak walk just reads whatever keys exist), but for members in
   the Americas a single historical day near a boundary may read one off. This
   was judged not worth a migration.

Also fixed, no behaviour change: `record()` had a dead `hits > 0 ? "learning" :
"new"` branch (`hits` is always ≥ 1 there); `reviewCtx(id)` took an `id` it never
used; `typeHits` was counted by string-matching the error colour out of a style
string rather than counting the boolean.

### 2.4 Deduplication

- `src/ui/tokens.js`, `muted(pct)` (49 call sites of the same `color-mix`
  expression), `segButton(active)` (5 verbatim copies), `filterTab`,
  `statusTag`, `LABEL_SECTION` / `LABEL_META`, `SCREEN_*`, `CALLOUT_ERROR`,
  `WORD_RIGHT` / `WORD_WRONG`, and `COLOR_ERROR` (`#a4553f` appeared 7 times as
  a raw hex, the one colour in the app outside the token system).
- `src/storage.js`, had three pairs of byte-identical functions
  (`loadBlankHint`/`loadTypeFirstLetter`, `saveBlankLevel`/`saveScrambleLevel`,
  `saveBlankHint`/`saveTypeFirstLetter`). Collapsed onto guarded
  `read`/`write`/`readBool`/`writeBool` primitives.
- `src/firebase.js`, added `PRIMARY_DOMAIN`, replacing a hard-coded
  `"@acts2.network"` in the sign-in view that duplicated `ALLOWED_DOMAINS`.

Style strings that appear **once** were deliberately left inline. Hoisting those
would trade the design's readability for indirection.

### 2.5 Magic numbers named

`REVIEWS_TO_COMMIT` (3, previously in three places including the prose "three
clean reviews"), `SESSION_SIZE` (8), `DUE_PREVIEW_ROWS` (6), `ACTIVITY_DAYS`
(14), `MIN_CHART_PEAK`, `SEED_SPREAD`, `MINISTRY_CLOSE_MS`, `LOOKAHEAD`,
`BLANK_MIN_WIDTH`. The `goal()` fallback `passages.length || 167` was dropped,
167 duplicated the real passage count, and the branch was dead (the loading
splash returns before it).

---

## 3. How this was verified

There are no UI tests, so the refactor was checked against a **golden master**:
every view rendered to static markup before the change and after, and compared.

Two committed helpers make this repeatable:

- `test/helpers/dom-env.mjs`, installs `window.React` / `ReactDOM` / `htm` from
  the dev-only npm copies (the shipped app still loads them from CDN and stays
  no-build), exposes `render()` and `freezeClock()`.
- `test/helpers/scenarios.mjs`, 32 `{ name, props, state }` fixtures covering
  every view, every review mode, and the auth/profile gates.

`react`, `react-dom`, and `htm` were added as **devDependencies** for this.

Driver (kept out of the repo; recreate in a scratch dir as `snapshot.mjs`):

```js
import { writeFileSync } from "node:fs";
import { render, freezeClock } from "<repo>/test/helpers/dom-env.mjs";
import { scenarios } from "<repo>/test/helpers/scenarios.mjs";

const restore = freezeClock();
const { App } = await import("<repo>/src/App.js");
const result = {};
for (const s of scenarios) {
  const app = new App(s.props);
  app.state = s.state; // render() is pure; componentDidMount never runs
  try {
    result[s.name] = render(app.render());
  } catch (e) {
    result[s.name] = `!!ERROR!! ${e.stack}`;
  }
}
restore();
writeFileSync(process.argv[2], JSON.stringify(result, null, 1));
```

To produce the "before" side, run it in a worktree of the pre-refactor commit:

```bash
git worktree add /tmp/vm-before <commit-before-refactor>
# npm install in that worktree, then run snapshot.mjs against it
```

Compare with whitespace normalised, htm preserves literal whitespace between
elements, so reformatting source shifts text nodes without changing anything the
browser renders:

```js
const norm = (s) => s.replace(/\s+/g, " ").replace(/> </g, "><").trim();
```

**Result: 28 of 32 scenarios byte-identical.** The 4 that differ are exactly the
intended changes, `review/scramble` (new shuffle) and the three `profile/*`
scenarios (`inputmode` → `inputMode`, see §4.1).

---

## 4. Remaining work

Ordered by dependency. Items 4.1–4.3 are small and should land together; 4.4 and
4.5 are the substantial ones.

### 4.1 Views return arrays, not elements, small, touches every view

**Problem.** Every view template is written `` return html` <div ... ` `` with a
leading space. htm reads that space as a text node, so the template has _two_
roots and the function returns `[" ", <div/>]` rather than an element. React then
warns on every render:

```
Warning: Each child in a list should have a unique "key" prop.
Check the top-level render call using <div>.
```

The array's element has no key (it is a root), hence the warning. It fires once
per session, React dedupes, which is why it looks like it comes from the board;
it is actually `headerView`. This predates the refactor.

It also means each view emits a stray leading space into the markup, and that a
caller cannot treat a view's return value as a single element.

**Fix.** Remove the space after the backtick so each template has one root.
13 sites:

```
src/App.js:455
src/views/header.js:7        src/views/board.js:11
src/views/list.js:10         src/views/done.js:7
src/views/leaderboard.js:8   src/views/auth-gate.js:9
src/views/profile-form.js:18
src/views/review.js:13, 48, 90, 147, 174
```

Do **not** blanket-replace every ``html` <`` in the file, the inner templates
inside `.map()` callbacks also have leading spaces, but those elements carry
`key=` and sit inside an array already, so a text node beside them is harmless.
Only the `return html\` <` sites matter. (If you do change the inner ones too,
that is fine and slightly cleaner; just re-run the snapshot.)

**Watch out:** Prettier will re-add the space if the template is long enough to
wrap. Verify with `npm run format:check` after, and re-run the snapshot, the
only expected diff is the loss of a leading space per view, which normalises away.

**Verify.** Snapshot comparison stays at "intended diffs only", and the
`warnings.mjs` probe (§4.4) reports zero warnings for all 32 scenarios.

### 4.2 `inputMode` vs Prettier, already worked around, confirm it holds

`src/views/profile-form.js` needs React's camelCase `inputMode` on the
graduating-class field (React warns on lowercase `inputmode`, though it does
render it). **Prettier lowercases attribute names inside htm templates**, so
writing it inline does not survive `npm run format`.

Current workaround: a module-level `const NUMERIC_KEYBOARD = { inputMode:
"numeric" }` spread in as `...${NUMERIC_KEYBOARD}`. Keep it, and keep the comment
explaining why, this will look like pointless indirection otherwise.

### 4.3 `index.html` inline styles → `src/styles.css`

`index.html` carries an inline `<style>` block holding `html/body` margins, link
colours, and `@keyframes nudge`. The `nudge` animation is referenced from
`src/viewmodel/review.js` (the wrong-chunk shake), so the rule that drives a
component's behaviour currently lives in a different file from every other style.

Move all of it into `src/styles.css` and delete the `<style>` block. Note
`styles.css` already sets `body { background; color; font-family }` and
`margin: 0`, so only `html { margin: 0 }`, the `a` colours, and `@keyframes
nudge` are actually new.

### 4.4 Test suite, the substantial one

**Scope `npm test`.** It is currently `node --test`, which matches Node's default
patterns including `**/test/**/*.mjs`, so `test/helpers/dom-env.mjs` and
`test/helpers/scenarios.mjs` are being _executed as test files_ (they show up as
two passing "tests" in the run: 18 reported, 16 real). Change to:

```json
"test": "node --test 'test/**/*.test.mjs'"
```

**Split `test/smoke.test.mjs`** (138 lines covering five modules) into one file
per module, so a contributor adding a function knows where its test goes:

```
test/text.test.mjs        norm, firstLetters, dayKey
test/srs.test.mjs         migrate, retrievability, freshness, isDue, nextStability
test/blanks.test.mjs      keyBlankSet, chunksFor
test/storage.test.mjs     mergeProgress, mergeLog
test/profile.test.mjs     isProfileComplete, cleanDisplayName, mergeProfile, option lists
test/firebase.test.mjs    emailAllowed, ALLOWED_DOMAINS, PRIMARY_DOMAIN
```

**Add tests for the new modules**, these carry the logic that was previously
untestable:

- `test/grading.test.mjs`
  - `gradeWritten` exact match scores 1.0; empty input scores 0.
  - A skipped word does not desynchronise the rest (that is what `LOOKAHEAD` is
    for), assert a transposition inside the window still matches and one
    outside it does not.
  - Punctuation and capitals are ignored (`norm`).
  - `firstLetters: true` grades `"f t h w"` and `"fthw"` identically.
  - `revealFirstLetters` is strictly positional: right / wrong / hidden states,
    and a wrong letter shows the typed letter rather than the word.
- `test/progress.test.mjs`
  - `streakOf`, counts back from today; an unreviewed today does **not** break
    the streak; a gap does. Pass an explicit `today` so it is not clock-dependent.
  - `dueOrder` puts never-reviewed passages first.
  - `committedCount` migrates legacy records (no `stability`).
- `test/review.test.mjs`
  - `seededShuffle` is a permutation (same multiset out), is deterministic for a
    given seed, and differs across seeds.
  - `modeByKey` falls back to `MODES[0]` for an unknown key.
- `test/text.test.mjs`
  - **`dayKey` returns the local day, not UTC**, construct a date late in the
    evening local time and assert the key is still that day. This is the
    regression guard for §2.3.2, and it is the one test that would have caught
    the original bug. It must not assume a particular `TZ`; derive the expected
    value from `getFullYear/getMonth/getDate`.

**Add `test/views.test.mjs`**, the render smoke tests that make the view layer
safe to change:

- Every scenario in `test/helpers/scenarios.mjs` renders without throwing.
- Every scenario renders with **zero React warnings** (assert on a captured
  `console.error`). This is what pins §4.1 shut.
- A handful of content assertions so the test says something about behaviour, not
  just "did not crash": the board shows the committed count, the empty
  leaderboard filter shows its empty message, `list/no-matches` renders no rows,
  `review/type-graded` shows a percentage.

Use `new App(props)` + assign `state` + call `render()`, as in §3, do not try to
mount, and keep `freezeClock()` around anything time-dependent.

### 4.5 Documentation

**`README.md` has stale facts.** Fix at minimum:

- "The allowed domain is `ALLOWED_DOMAIN` in `src/firebase.js`", wrong
  identifier (it is `ALLOWED_DOMAINS`), and it contradicts the correct passage
  earlier in the same section. Delete the duplicate sentence.
- "`users/{uid}` = `{ progress, log }`", the document is actually
  `{ name, email, progress, log, profile, updatedAt }`.
- The project-structure tree omits `src/profile.js`, `scripts/`, `test/`, and
  `wrangler.jsonc`, and predates every module added here.
- The Cloudflare Workers deploy path (`npm run build` → `wrangler deploy`,
  `wrangler.jsonc`, `scripts/build.mjs`) is **entirely absent** from the README
  though it is one of the two supported deploy paths and is documented in
  `CLAUDE.md`.
- "design/, provenance: source docs + original design export", `design/claude-design/`
  is gitignored, so a fresh clone does not have it.
- The Development section omits `npm test`.
- `src/main.js` is described as activating optional sync; `App.componentDidMount`
  does that.

**`CLAUDE.md`**, the "One component, pure logic extracted" section describes the
old shape (`App.js` owning `renderVals()` and the view methods). Rewrite it
around the `viewmodel/` + `views/` split and the "which directory does my change
belong in" rule from §2.2. Add `npm test` scoping and the render-test harness.

**Add `CONTRIBUTING.md`**, there is none. Cover: no-build constraint (never add
a bare `import ... from "react"`; there is no bundler), must be served over HTTP,
`npm run format` before committing, where a change belongs (§2.2), the
`data/keywords.js` regeneration rule (change a passage's text → re-run
`npm run keywords`, or the blanks misalign), and the **two-place** domain
allowlist rule (`src/firebase.js` _and_ `deploy/firestore.rules`, then redeploy
the rules, changing only the client is insecure and ineffective).

---

## 5. Not done, and why

- **No `dist/` in the repo.** It is gitignored; the ESLint `ignores` entry exists
  because it is present in a working tree after `npm run build`.
- **The golden-master fixtures were not committed.** 551 KB of markup that would
  break on every legitimate design tweak. The scenarios and the harness are
  committed; the baseline is reproducible from git history (§3).
- **`design/` untouched.** It is provenance, already excluded from lint,
  Prettier, and the build.
- **No framework migration** (hooks, a router, a bundler). The no-build CDN setup
  is a deliberate constraint of this project and nothing here needs to change it.
