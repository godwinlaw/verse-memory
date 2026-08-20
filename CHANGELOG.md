# Changelog

What changed in Verse Mastery, newest first. One entry per merged change,
written for someone reading the repo rather than for a release announcement:
what moved, and why it moved.

## Unreleased

- **Claude Code skills and workflows are no longer tracked.** `.claude/skills/`
  and `.claude/workflows/` are how one person happens to drive their editor, not
  part of the app, so they are gitignored and `.claude/skills/ship/SKILL.md` is
  untracked (the file stays on disk locally). `.claude/settings.json` is
  deliberately still trackable — project permissions are worth sharing. The
  GitHub Actions in `.github/workflows/` are untouched: `ci.yml` is main's
  required status check and `deploy.yml` is what ships `firestore:rules`
  alongside hosting, so neither is optional. ([#29](https://github.com/godwinlaw/verse-memory/issues/29))
