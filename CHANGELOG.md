# Changelog

What changed in Verse Mastery, newest first. One entry per merged change,
written for someone reading the repo rather than for a release announcement:
what moved, and why it moved.

## Unreleased

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
