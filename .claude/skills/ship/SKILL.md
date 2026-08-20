---
name: ship
description: Ships the current branch of Verse Mastery end-to-end — commit outstanding work, push, open and merge a GitHub PR into main, then deploy to Cloudflare Workers via wrangler. Use this whenever the user says things like "ship this", "let's deploy", "push this up and deploy", "merge and deploy", "get this live", or otherwise asks to take the current branch's work to production, even if they only name one step (e.g. just "deploy" or just "merge this") — deploying this app is only correct once the code is merged to main, so a bare "deploy" request should still go through the full commit → push → PR → merge → deploy sequence rather than running wrangler from a feature branch.
---

# Ship

## Why this exists

Deploying this app is two steps that are easy to get out of order: merging to `main` on GitHub (so the Drone CI and Claude PR review workflows in `.github/workflows/` actually run over the change), and then `npm run deploy`, which rebuilds `dist/` fresh and pushes it to Cloudflare Workers via wrangler. Running `npm run deploy` from a feature branch ships code that never went through review; running it before the merge lands ships stale state under a live URL. This skill keeps the order straight so "ship this" doesn't skip a step.

## Steps

1. **Check state.** `git status` and `git diff` on the current branch. If there are uncommitted changes the user hasn't already described, stop and confirm what should go in — never `git add -A` blindly. Watch for `config.js` at the repo root: it's gitignored on purpose (it's the deploy-time override for `window.__APP_CONFIG__`/`window.__FIREBASE_CONFIG__`) and must never be committed even if it shows up as untracked.
2. **Pre-flight.** Run `npm run lint`, `npm run format:check`, and `npm test`. If `format:check` fails, run `npm run format` and re-stage; if lint or tests fail, fix or surface the failure — don't push broken code through the rest of the flow.
3. **Commit.** Stage the relevant files by name (not a blanket `-A`) and commit, following the repo's normal commit-message conventions — why over what, `Co-Authored-By` trailer, no `--no-verify`.
4. **Push.** Push the current branch to `origin` (add `-u` if it has no upstream yet).
5. **Open a PR.** `gh pr create` with a concise title and a Summary/Test plan body, matching the style of prior PRs in this repo (`gh pr list --state merged` for reference if unsure).
6. **Merge.** If branch protection gates on the Drone/Claude review checks, give them a chance to land (`gh pr checks --watch`); if the user is in a hurry and a check is still pending or red, confirm before merging past it rather than forcing it. Merge with `gh pr merge --merge --delete-branch` — this repo's history uses ordinary merge commits (see PR #1), not squash or rebase, so stay consistent unless the user asks otherwise.
7. **Sync main locally.** `git checkout main && git pull`, so the tree about to be deployed is actually what's on `main`.
8. **Deploy.** From `main`, run `npm run deploy` (builds `dist/` via `scripts/build.mjs`, then `wrangler deploy`). This runs automatically right after the merge lands — no separate confirmation prompt for this step, since asking to "ship" already covers it.
9. **Firestore rules check.** `npm run deploy` does **not** touch Firestore. Diff `deploy/firestore.rules` in the merged change (e.g. `git diff HEAD~1 -- deploy/firestore.rules` after the merge, or the PR diff before it). If it changed, tell the user and offer to run `firebase deploy --only firestore:rules` — get an explicit go-ahead first, since this is a separate production change to who can authenticate, not a build artifact. While looking at that diff, also check `src/firebase.js` for a changed `ALLOWED_DOMAINS`: per CLAUDE.md, that constant and the domain regex in `deploy/firestore.rules` must move together, so flag it if one changed without the other.
10. **Report.** Summarize the outcome: PR URL, merge commit, and the deployed URL wrangler prints on success (plus whether the Firestore rules step ran).

## Guardrails

- Steps 6 and 8 push code and flip production traffic. If anything upstream looks wrong — failing tests, an unexpected diff, a merge conflict — stop and surface it instead of forcing through to keep the flow moving.
- Never force-push, never skip hooks, never skip the lint/format/test pre-flight to save time.
- The Firestore rules sub-step always needs an explicit go-ahead even though the rest of the flow deploys automatically — a mistake there changes who can get into member data, not just what a page looks like.
