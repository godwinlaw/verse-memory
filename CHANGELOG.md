# Changelog

What changed in Verse Mastery, newest first. One entry per merged change,
written for someone reading the repo rather than for a release announcement:
what moved, and why it moved.

## Unreleased

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
