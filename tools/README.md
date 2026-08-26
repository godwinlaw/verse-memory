# tools/

Authoring and development helpers. **Nothing in this directory ships.**
`scripts/build.mjs` copies exactly `index.html`, `src/`, `data/` and a runtime
`config.js` into `dist/`, so `tools/` is invisible to every deploy path by
construction rather than by an ignore rule someone has to remember.

| File                 | What it is                                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| `fetch_passages.mjs` | Fetches ESV text for the references in `new-passages.json` (`ESV_API_KEY=… node tools/fetch_passages.mjs`) |
| `new-passages.json`  | The input to the above — references to add to `data/passages.js`                                           |
| `gen_keywords.py`    | Regenerates `data/keywords.js` via spaCy (`npm run keywords`)                                              |
| `gen_icons.sh`       | Regenerates the app icons                                                                                  |
| `seed.html`          | Seeds local test data in the browser — see below                                                           |

## Seeding local test data

Drive mode and Run mode both deal from what the member has actually committed, so
on a fresh browser there is nothing for either of them to queue: Drive reports
"2 passages in the queue" and Run's `calloutQueue()` falls back to the whole set.
Earning a realistic record by hand means driving a few hundred cards, so seed one
instead.

With the dev server running (`npm run dev`, which serves the repo root), open:

    http://localhost:8080/tools/seed.html

(`serve` strips the extension and redirects to `/tools/seed`; both URLs work, and
the relative imports resolve the same either way.)

| Button                            | What it writes                                                                                                                                                                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Everything at once**            | The other three seeds in order — the main button                                                                                                                                                                                                                         |
| **Seed a profile**                | `mv.profile` with all four fields `profile.isProfileComplete()` asks for, so the app skips the sign-up form                                                                                                                                                              |
| **Seed ~25 committed verses**     | 25 records at `status: "memorized"` — 9 still fresh (88–99%) and 16 faded (28–72%), so `reviewPool()` returns a real "Due for review" queue and Run's `calloutQueue()` has committed verses to call out. Also writes six days into `mv.log` so the board shows a streak. |
| **Seed a few in-progress verses** | 6 records at `status: "learning"`, so Drive's **whole set** source differs from **committed** and a Learn sitting has something to draw                                                                                                                                  |
| **Clear all local progress**      | `storage.clearProgressAndLog()` — empties `mv.progress` and `mv.log` **only**. The profile is left in place, exactly as the app's own "Reset all progress" does.                                                                                                         |

Eight of the 25 committed verses are multi-verse passages carrying a `verses`
array (Psalm 1, Psalm 8, Psalm 23, Psalm 37:1-9, 2 Corinthians 4:1-6 and 4:7-12,
Hebrews 11:1-7 and 11:8-16), and **four of those are seeded faded** on purpose:
Drive's verse-by-verse feedback only says anything on a passage with more than
one verse, and the source switch opens on **Due**, so a verse-bearing passage
that is still fresh never surfaces there.

Two things about how it is built are worth keeping:

- **The records are built by calling `src/srs.js`**, the way `e2e/helpers/seed.mjs`
  does, rather than by writing out record literals. So `committed(0.4)` means "a
  verse the app reads as 40% fresh", and retuning the interval ladder moves these
  fixtures with it instead of stranding them. Every record carries a `step` — a
  record without one exercises `srs.migrate()` instead of the model.
- **The writes go through `src/storage.js`** and the summary figures are read back
  through `src/progress.js` and `src/profile.js` — the due count is computed with
  exactly the expression `viewmodel/drive.js` uses for its queue label, so the
  page cannot report a number the app disagrees with.

The page writes to **this browser's `localStorage` for this origin** and talks to
nothing else: no network, no cloud sync, no other device. Reload the app after
seeding so it reads the new record.

Seeding does not sign you in, and it does not need to: the way to look at the app
locally without an account is `window.__FIREBASE_CONFIG__ = null` in the root
`config.js`, which runs the app local-only — and which `scripts/build.mjs`
refuses to build from unless `ALLOW_LOCAL_ONLY_BUILD=1`. With a real Firebase
config in place you will meet the sign-in gate first; the seeded record is still
there behind it, and the first pull folds it into whatever the cloud holds.
