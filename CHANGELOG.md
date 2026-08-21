# Changelog

What changed in Verse Mastery, newest first. One entry per merged change,
written for someone reading the repo rather than for a release announcement:
what moved, and why it moved.

## Unreleased

- **The leaderboard no longer downloads everybody's record to build itself.**
  It used to read the whole `users` collection — every verse of every member's
  progress map and every day of their log — and throw nearly all of it away to
  arrive at three numbers each. That is the one read whose cost grows with the
  size of the group, and every member paid it on every visit to the board. Each
  push now also writes **`standings/{uid}`**: the display name, the three
  profile fields the board filters and groups by, a flat `fresh` array of
  `last, stability` pairs for the committed verses only, and the streak with
  the day it was true of (`standings.summarize`). `fetchRoster()` scans that
  instead. **Freshness is still computed when the board asks** rather than
  stored, since a stored score is a claim about the moment it was written — a
  member who stops opening the app still sinks down the board over the
  following fortnight. Which verses somebody holds is deliberately not in
  there, and neither is their email. The summary is written inside the same
  transaction as the record and from the merged result, so a device that has
  not caught up cannot publish a row missing another device's commits.
  **`deploy/firestore.rules` gains a `standings/{uid}` block and must be
  redeployed**, or every push fails on a refused write. The old full scan
  remains as the fallback while `standings` is empty, which covers the day this
  ships; each member's summary appears on their first save. `App.loadRoster()`
  also holds a fetched roster for a minute, since the board is one press away in
  the header. Closes #31.
- **A word the speech engine spelled wrong is corrected against the passage.**
  Reciting Galatians gave "sews" for _sow_ and "Jews" for _Jew_, and then the
  card failed — or the member stopped to repair the box by hand, which is the
  thing reciting was meant to save them. Those are transcription errors, not
  recall errors, so `voice.js` now matches a heard word to the passage's within
  one edit, ignoring a plural ending on either side and never on a word under
  three letters, and `fitToPassage` writes the passage's own spelling in. It is
  the only loose comparison in the app and lives only there: `grading.js` stays
  exact, so nothing a member **types** is forgiven. The trade — a recited word
  genuinely misremembered as a near neighbour is now given — is deliberate, and
  `MAX_EDITS` / `MIN_FUZZY_LEN` are where it is tuned. Closes #60.
- **Peek moved to the foot of the card, and can be latched on.** It sat in the
  card's header, which put it at the top of the screen while the passage it
  reveals opened at the bottom — so looking something up scrolled the answer
  out of view. It is now directly above what it reveals. And beside the button
  there is a **Keep shown** switch: holding the button down is still a glance,
  but a member checking themselves line by line was pressing it once a line.
  Both cost the card the same single peek, a peek at a passage already on
  screen costs nothing further, and the latch belongs to the card, so the next
  verse is never revealed for free. Closes #63.
- **The passage table's head stays on screen.** The column labels and — the
  half that matters — the selection bar above them, which holds the Review and
  Learn buttons that ticking a run of verses was for, and which used to scroll
  out of sight long before a member had finished choosing. One sticky box
  stopping below the app header, whose height is measured and published as
  `--app-header-h` (`App.watchHeaderHeight`) because it wraps in a narrow window
  and settles when the web font arrives. Closes #58.
- **The blanks stop autocompleting the answer.** The browser was offering words
  typed into earlier blanks as suggestions on later ones, which handed the
  member the answer; the reporter confirmed no browser setting reliably stops
  it. `autocomplete="off"` (with `autocorrect`, `autocapitalize` and
  `spellcheck`) on the blank inputs in both the review card and Test mode.
  Closes #62.
- **Light, dark, or follow the system — a switch under Settings.** The reader's
  operating system is still the default and still answers for most members;
  what is new is that a member who wants the other ground on one screen can say
  so. It is **device-local and never synced** (`storage.saveTheme`, beside the
  exercise preferences): a screen read under office lights and one read at
  night are two different questions, so a choice made on the laptop has no
  business travelling to the desktop. It is not a profile field either, which
  is why it does not wait for Save and is not undone by Cancel — pressing it
  turns the page over there and then, which is the only demonstration the
  setting needs. **The choosing moved into JS** (`src/theme.js`, pure and unit
  tested beside `device.js`): a stylesheet cannot say "dark unless the member
  asked for light" without writing the whole palette out a second time under
  another selector, so `prefers-color-scheme` is now read in one place and the
  settled answer — `data-theme="light"` or `"dark"`, never `"system"` — is
  stamped on the root element, which is all the dark block in `styles.css` now
  reads. index.html stamps it in the line before the first paint, so the page
  never opens on one ground and turns over onto the other; that is asserted
  with the app's own module blocked, on a page the app never runs on. The
  favicon keeps following the system, because a browser fetches it outside the
  page and there is no version of it that could read the choice.
- **The stats board can rank the groups themselves.** It could always _filter_
  by ministry group, gender and graduating class; now it can rank by them —
  ministries, male vs female, or classes, against each other. The two compose
  rather than replacing one another, so ranking the ministries within the class
  of 2027 answers both questions at once. Every figure is **per member**
  (`src/standings.js`), because a total would rank by attendance: the largest
  ministry would win every week and the smallest could never place. A member
  with nothing committed yet is left out of their group's average, so a ministry
  that recruits well is not scored down for it, and a member who has not said
  which group they are in joins none rather than a fictional "Unknown" team.
  ([#30](https://github.com/godwinlaw/verse-memory/issues/30))
- **Fixed: the leaderboard printed "NaN%" for every peer.** The roster fixture
  had no `freshnessScore`, so the average-freshness column rendered `NaN` on
  every row and nothing caught it — a NaN renders as text, not as a warning.
  The fixture now carries the field real peers always have, and every scenario
  is scanned for `NaN`, `undefined%` and `Infinity`, since a figure the member
  cannot read is a bug wherever it turns up.

- **The app follows the reader into dark.** `prefers-color-scheme` and nothing
  else: no switch anywhere, nothing persisted, because a member who wants dark
  has already said so once to their operating system. It is one block of token
  overrides in `styles.css` and no rules of its own — the whole app turns over
  together. Two ideas carry it. The neutral and accent **ramps invert**, because
  their steps mean distance from the page's ground rather than lightness, so
  "the strongest state" is the darkest step on paper and the lightest on ink and
  the board's map needs no change. The **reversed plate does not invert**, which
  is why it gained its own `--color-reverse-bg` / `--color-reverse-text` pair:
  it is a plate printed the other way round from the page, so on a dark ground
  it lifts off rather than sinking in. `--color-error` and the freshness
  gradient's lightness (`--fresh-l`, which `srs.freshColor` now defers to) are
  tokens for the same reason — both were mixed for paper. The favicon carries
  its own media query, so the browser tab turns over too. The light theme is
  **pixel-identical**: verified by diffing full-page screenshots of the board,
  the guide and a review card against `main`.
  ([#13](https://github.com/godwinlaw/verse-memory/issues/13))

- **The app's mark now stands beside its name.** The "marked passage" ribbon —
  already the favicon, `src/icon.svg` — is drawn inline on the sign-in gate and
  in the header, so the app looks like itself in a browser tab, on the way in,
  and at the top of every screen. `dom.appMark()` sits beside `corners()`, since
  it is a piece of the drawing system rather than of either screen that uses it.
  It carries the design's own concession to size: three rules where it is shown
  large on the gate, two in the header, because the third closes up into grey
  below about 40px. A favicon has to be a standalone file a browser can fetch,
  so the geometry is copied rather than imported — and `test/views.test.mjs`
  reads `icon.svg` and checks the inline mark against it, because an app with
  two marks has no mark. ([#38](https://github.com/godwinlaw/verse-memory/issues/38))

- **Signing up asks who you are, and nothing else.** The four review settings —
  how many verses a sitting holds, how far a verse may fade before it comes
  back, the commit threshold, the default difficulty — are no longer on the
  form standing between a new member and the app. They are questions nobody can
  answer before they have used it, and a gate is a bad place to ask them.
  Nothing is lost by waiting: `submitProfile` writes the same defaults either
  way, so the questions were skipped rather than the answers, and Settings
  carries all four unchanged. The setup form says where they went.
  ([#43](https://github.com/godwinlaw/verse-memory/issues/43))

- **Reciting a passage now produces the passage.** Four changes to voice mode,
  all of them about the gap between what a speech engine can hand back — a flat
  lowercase stream with no punctuation — and what the verse actually reads
  like. A word recited correctly is shown **as the passage writes it**
  (`LORD`, `God's`); the punctuation between two words appears once **both** are
  right, so a full stop arrives with the next word rather than being guessed at;
  and the words go in **where the cursor is**, so a member who puts the caret
  back into the middle of the transcript has the next phrase land there instead
  of at the end. A word got wrong is left exactly as it was heard, and the words
  after it still line up.
- **An apostrophe is punctuation like any other.** `text.norm` now keeps only
  letters and digits, so "eagles", "eagles'" and "eagle's" grade as one word —
  nobody pronounces an apostrophe, and a member typing from the sound of a verse
  cannot tell where it belongs. It also closes a straight-vs-curly trap: ESV text
  carries `’` where a keyboard produces `'`, and the old rule kept one and
  stripped the other, so the two graded as different words.
  ([#11](https://github.com/godwinlaw/verse-memory/issues/11))

- **Fill the blanks has an alternating level.** A fourth setting beside Light,
  Medium and Full that ignores which words matter and blanks every other one,
  function words included — and a switch, offered only there, for which half of
  the passage goes. The keyword levels always leave the little words standing,
  so a member can run along the shape of the sentence; every other word gone
  means the passage has to be produced rather than recognised, which is why it
  pays the blanks ceiling in full (`LEVEL_AWARD` gains a fourth entry, written
  down rather than left to a fallback). Working a verse one way round and then
  turning it over asks for exactly the words that were just being read. The
  choice is remembered per device, like every other exercise setting.
  ([#14](https://github.com/godwinlaw/verse-memory/issues/14))

- **The first-letter drill no longer lets a mistake be taken back.** The reveal
  is live, so a member who could backspace was being shown the answer to the
  question they were being asked — type a letter, watch the word fail to
  appear, correct it, and reach 100% on a passage they could not produce. A
  wrong initial now gives up the word itself, marked wrong, with the letter
  that was typed struck through beneath it (the shape the marked paper already
  used), and the drill moves on. `grading.lockedInput` refuses any edit to the
  box that is not an append, which covers backspace, select-all-and-retype and
  a cursor dropped into the middle without naming any of them. Starting over is
  still offered, just not silently: Try again and the scaffold switch both
  clear the box outright. Free recall is untouched — it reveals nothing until
  it is handed in, so there is nothing there to cheat.
  ([#28](https://github.com/godwinlaw/verse-memory/issues/28))

- **The guide no longer tells anyone to recite into their phone.** The app
  refuses to run on a device you hold (`src/device.js`), so "Say it out loud
  into your phone" described a screen the member will never be shown. It now
  reads "Say it out loud, or type it", which is the recall card's own wording
  and names no hardware. `test/views.test.mjs` scans every guide screen for
  phone/tablet/mobile wording so it cannot creep back, in the same spirit as
  the scan that keeps freshness off the learn screens.
  ([#39](https://github.com/godwinlaw/verse-memory/issues/39))

- **Claude Code skills and workflows are no longer tracked.** `.claude/skills/`
  and `.claude/workflows/` are how one person happens to drive their editor, not
  part of the app, so they are gitignored and `.claude/skills/ship/SKILL.md` is
  untracked (the file stays on disk locally). `.claude/settings.json` is
  deliberately still trackable — project permissions are worth sharing. The
  GitHub Actions in `.github/workflows/` are untouched: `ci.yml` is main's
  required status check and `deploy.yml` is what ships `firestore:rules`
  alongside hosting, so neither is optional. ([#29](https://github.com/godwinlaw/verse-memory/issues/29))
