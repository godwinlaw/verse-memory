# The Memory Board

A spaced-repetition Bible-verse memorization app for **Acts 2 Network - Berkeley**.
Members work through a set of passages, review them in several modes, and watch a
"freshness" score decay and recover along the Ebbinghaus forgetting curve so they
know what to revisit and when.

It is a **static, no-build, client-side app**: React and [htm](https://github.com/developit/htm)
are loaded from a CDN, and the source ships as native ES modules — there is no
bundler or transpile step. Progress is stored in the browser (`localStorage`),
with an optional Firebase seam for cloud sync.

## Features

- **Four review modes** — Flashcard, Fill the blanks, Write it out, Order the phrases.
- **Spaced repetition** — each verse's stability grows with successful reviews;
  free recall builds more durable memory than cued recall than recognition.
- **Intelligent blanks** — key words are chosen by an offline spaCy pass
  (`tools/gen_keywords.py`), not by naive position.
- **Progress board, passage list, and leaderboard** views.

## Quick start

```bash
npm install       # dev tooling only (eslint, prettier, serve)
npm run dev       # serve at http://localhost:8080
```

Any static file server works too (e.g. `python3 -m http.server 8080`) — the app
has no server-side component. Because it uses ES modules, it must be served over
HTTP; opening `index.html` from the filesystem will not work.

## Project structure

```
.
├── index.html            # entry document: loads CDN libs, config.js, src/main.js
├── config.example.js     # deploy-time config template (copy to config.js)
├── src/                   # application source (ES modules)
│   ├── main.js            #   entry point — mounts <App/>, activates optional sync
│   ├── App.js             #   root React component + all views
│   ├── dom.js             #   React/htm globals, sx() style parser, corners()
│   ├── config.js          #   app config + defaults (reads deploy overrides)
│   ├── storage.js         #   localStorage persistence + cloud-sync seam
│   ├── firebase.js        #   optional Firebase cloud-sync seam
│   ├── srs.js             #   spaced-repetition / forgetting-curve math (pure)
│   ├── blanks.js          #   blank selection + phrase chunking (pure)
│   ├── text.js            #   small text/date helpers (pure)
│   └── styles.css         #   design system + component styles
├── data/                  # generated/authored content
│   ├── passages.js        #   the passage set (ESV)
│   └── keywords.js        #   per-passage keyword indices (generated)
├── tools/
│   └── gen_keywords.py    # spaCy keyword generator -> data/keywords.js
├── deploy/
│   ├── nginx.conf         # static-serving config for the container
│   └── firestore.rules    # Firestore security rules (cloud sync)
├── design/                # provenance: source docs + original design export
├── docs/                  # standards & reference (A2N dev best practices)
├── Dockerfile             # nginx image (container-based deploy, per A2N)
└── .drone.yml             # CI/CD pipeline (Drone)
```

## Configuration

Defaults live in `src/config.js`. To override per deployment (church name, goal
deadline, Firebase), copy the template and edit it:

```bash
cp config.example.js config.js
```

`config.js` is gitignored and loaded by `index.html` before the app. If it is
absent, the app runs on the built-in defaults.

## Regenerating keywords

`data/keywords.js` is generated offline from `data/passages.js`:

```bash
pip install spacy && python3 -m spacy download en_core_web_sm
npm run keywords   # == python3 tools/gen_keywords.py
```

Do not edit `data/keywords.js` by hand — re-run the generator.

## Authentication & cloud sync (Firebase)

Access is restricted to Google accounts in the Acts 2 Network Workspace domains,
**gpmail.org** and **acts2.network**. Members sign in with Google; each member's
progress then syncs across devices via Firebase (project `verse-memory`):

- **Google sign-in**, gated to `@gpmail.org` / `@acts2.network`. The client
  rejects and signs out any account outside those domains, and —
  authoritatively — **Firestore rules only allow verified identities in those
  domains** (`deploy/firestore.rules`). Never trust the client alone; the rules
  are the real enforcement. The allowed set is `ALLOWED_DOMAINS` in
  `src/firebase.js`.
- **Firestore** stores one doc per user at `users/{uid}` = `{ progress, log }`.
  On sign-in the remote doc is pulled and reconciled with local state
  (`mergeProgress` keeps the most recently reviewed record per verse); each local
  save is debounced and pushed back up.

The Firebase modular SDK (v11.6.1) is imported from the gstatic CDN, preserving
the no-build setup. If Firebase is unreachable/misconfigured the app degrades to
local-only (`auth.status === "disabled"`) rather than locking members out. The
default project config lives in `src/config.js`; override per deployment via
`window.__FIREBASE_CONFIG__`, or set it to `null` to disable.

**One-time Firebase / Google Cloud console setup:**

1. **Authentication → Sign-in method → enable "Google".**
2. **Firestore Database → create**, then deploy the rules from the repo root
   (project + rules path are configured in `.firebaserc` / `firebase.json`):
   ```bash
   npm i -g firebase-tools     # if needed
   firebase login              # once
   firebase deploy --only firestore:rules   # uses deploy/firestore.rules
   ```
3. Add the app's domain under **Authentication → Settings → Authorized domains**.

Note: because sign-in spans two Workspace domains (gpmail.org, acts2.network),
the Google `hd` hint isn't used and the OAuth consent screen can't be locked to a
single Workspace. Domain membership is enforced by `emailAllowed()` and the
Firestore rules instead.

Implementation: `src/firebase.js` (SDK load, Google auth + domain gate, Firestore
read/write) and `src/storage.js` (`registerRemoteSync`, `mergeProgress`,
`mergeLog`). The allowed domain is `ALLOWED_DOMAIN` in `src/firebase.js`.

## Deployment

Per the [A2N dev standards](docs/a2n-dev-best-practices.md), this deploys as a
stateless container to Amazon ECS via Drone CI:

```bash
docker build -t memory-board .
docker run --rm -p 8080:80 memory-board   # http://localhost:8080
```

`.drone.yml` lints on every push/PR and, on `main`, builds and pushes the image
to Amazon ECR (us-east-1). Set the `aws_access_key_id` / `aws_secret_access_key`
secrets and the ECR registry in the Drone repo settings.

## Development

```bash
npm run lint          # ESLint
npm run format        # Prettier (write)
npm run format:check  # Prettier (check, as CI runs it)
```

## Scripture text

Passage text is the **English Standard Version (ESV)**, © Crossway. Use is
subject to Crossway's [copyright and permissions](https://www.crossway.org/permissions/).
The MIT license below covers the application code, not the scripture text.
