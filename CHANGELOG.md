# Changelog

What changed in Verse Mastery, newest first. One entry per merged change,
written for someone reading the repo rather than for a release announcement:
what moved, and why it moved.

## Unreleased

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
