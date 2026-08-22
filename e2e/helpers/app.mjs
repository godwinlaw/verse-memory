/* The app, booted in a browser and ready to be pressed.
 *
 * One object holds the three things every spec needs and no spec should have to
 * repeat: the state the browser starts with, the two seams the page reaches out
 * to (the CDN scripts and Firebase), and the handful of locators that are
 * structural rather than wording — the splash, the header, the board's figures.
 * Everything else a spec finds the way a member would, by role and by the words
 * on the screen, so the copy stays the single definition of what the app says.
 *
 * Two rules keep it honest. The app under test is the shipped tree, served as
 * `npm run dev` serves it — nothing is stubbed that the member would not also
 * be missing. And nothing here reaches past the front door: seeding is
 * localStorage and a deploy-time config.js, which are the app's own documented
 * ways in (see src/storage.js and config.example.js). */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { installFirebaseStub, STUB_CONFIG } from "./firebase-stub.mjs";
import { PROFILE } from "./seed.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/* index.html loads React, ReactDOM and htm from unpkg as classic scripts. They
 * are fulfilled from the dev-only npm copies of the same versions — the same
 * substitution test/helpers/dom-env.mjs makes for the render suite — so the
 * suite is neither slowed nor grounded by the network. E2E_LIVE_CDN=1 puts the
 * real CDN back, which is worth a run before a deploy. */
const CDN = "https://unpkg.com/**";

export class AppHarness {
  constructor(page) {
    this.page = page;
    this.consoleErrors = [];
    this.allowed = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") this.consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => this.consoleErrors.push(String(err)));
  }

  /* Errors this test means to provoke — a blocked CDN is a network error the
   * browser logs whatever the app then does about it. Everything else still
   * fails the test (see fixtures.mjs). */
  allowConsoleErrors(...patterns) {
    this.allowed.push(...patterns);
  }

  get unexpectedConsoleErrors() {
    return this.consoleErrors.filter((line) => !this.allowed.some((re) => re.test(line)));
  }

  /* ── booting ──────────────────────────────────────────────────────────────── */

  /* Start the app with a given past. Everything is optional:
   *
   *   progress / log / profile  what storage.js will find (profile: null leaves
   *                             the member at the profile form);
   *   local                     any other localStorage key, written raw;
   *   firebase                  false for cloud sync off — the default, and what
   *                             most specs want — or a scenario for the stub
   *                             (see firebase-stub.mjs);
   *   splashMinMs               the splash's floor, normally 0 so it is out of
   *                             the way; boot.spec.mjs is what raises it;
   *   voice                     "unsupported" for a browser with no
   *                             SpeechRecognition, as Firefox has none;
   *                             "stub" for one the test can speak into,
   *                             through window.__E2E_SAY__(text, settled);
   *   reducedMotion             "reduce" by default, so screens are settled the
   *                             moment they arrive — the app drops every
   *                             animation under that query. motion.spec.mjs is
   *                             what passes "no-preference". */
  async boot({
    progress = {},
    log = {},
    profile = PROFILE,
    local = {},
    firebase = false,
    splashMinMs = 0,
    deadline,
    groupName,
    voice,
    reducedMotion = "reduce",
    waitForApp = true,
  } = {}) {
    // Emulated here rather than declared in the config: the context-level
    // option does not reach the page in this Chromium build.
    await this.page.emulateMedia({ reducedMotion });

    const scenario = firebase === true ? {} : firebase || null;
    if (scenario) await installFirebaseStub(this.page, scenario);

    await this.vendorCdn();
    await this.serveConfig({ splashMinMs, deadline, groupName, firebase: scenario ? STUB_CONFIG : null });

    const seeded = {
      "mv.progress": JSON.stringify(progress),
      "mv.log": JSON.stringify(log),
      ...(profile ? { "mv.profile": JSON.stringify(profile) } : {}),
      ...local,
    };

    await this.page.addInitScript(
      ({ seeded, scenario, voice }) => {
        try {
          // Seeded once per tab, not once per navigation: what the app saved has
          // to still be there on the second visit, which is the whole point of
          // storage.js. sessionStorage is the marker because it survives a
          // reload and dies with the context.
          if (!sessionStorage.getItem("e2e:seeded")) {
            localStorage.clear();
            for (const [key, value] of Object.entries(seeded)) localStorage.setItem(key, value);
            sessionStorage.setItem("e2e:seeded", "1");
          }
        } catch {
          /* a browser with storage disabled is the app's own fallback, not ours */
        }
        window.__E2E_FIREBASE__ = scenario || {};
        window.__E2E_WRITES__ = [];
        if (voice === "unsupported") {
          delete window.SpeechRecognition;
          delete window.webkitSpeechRecognition;
        }
        if (voice === "stub") {
          // A microphone the test can speak into. Chrome will not grant one in
          // CI, and recognition is the browser's own anyway (src/recognizer.js
          // is the seam, exactly as src/firebase.js is) — so this stands in for
          // the engine and nothing else. `window.__E2E_SAY__(text, settled)`
          // delivers a phrase the way onresult does: the running guess first,
          // then the settled version.
          class StubRecognition {
            start() {
              window.__E2E_ENGINE__ = this;
              setTimeout(() => this.onstart && this.onstart(), 0);
            }
            abort() {
              window.__E2E_ENGINE__ = null;
            }
            stop() {
              this.abort();
            }
          }
          window.SpeechRecognition = StubRecognition;
          window.__E2E_SAY__ = (text, settled) => {
            const engine = window.__E2E_ENGINE__;
            if (!engine || !engine.onresult) return false;
            const results = [{ 0: { transcript: text }, isFinal: !!settled }];
            results.length = 1;
            engine.onresult({ resultIndex: 0, results });
            return true;
          };
        }
      },
      { seeded, scenario, voice },
    );

    await this.page.goto("/");
    if (waitForApp) await this.splash.waitFor({ state: "detached", timeout: 20_000 });
    return this;
  }

  /* A second visit on the same device: whatever the app saved is still there. */
  async revisit() {
    await this.page.reload();
    await this.splash.waitFor({ state: "detached", timeout: 20_000 });
  }

  async vendorCdn() {
    if (process.env.E2E_LIVE_CDN) return;
    await this.page.route(CDN, async (route) => {
      // "/react@18.3.1/umd/react.production.min.js" → node_modules/react/umd/…
      const [spec, ...rest] = new URL(route.request().url()).pathname.replace(/^\//, "").split("/");
      const pkg = spec.split("@")[0];
      try {
        const body = await readFile(`${ROOT}node_modules/${pkg}/${rest.join("/")}`);
        await route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body });
      } catch {
        await route.continue();
      }
    });
  }

  /* The deploy-time override index.html loads before the app (config.example.js).
   * Serving it rather than injecting the globals keeps the test on the same seam
   * a real deploy uses — and stops a stray local config.js from deciding what
   * the suite sees. */
  async serveConfig({ splashMinMs, deadline, groupName, firebase }) {
    const appConfig = {
      ...(groupName ? { groupName } : {}),
      ...(deadline ? { deadline } : {}),
      splashMinMs,
    };
    const body =
      `window.__APP_CONFIG__ = ${JSON.stringify(appConfig)};\n` +
      `window.__FIREBASE_CONFIG__ = ${JSON.stringify(firebase)};\n`;
    await this.page.route(
      (url) => url.pathname === "/config.js",
      (route) => route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body }),
    );
  }

  /* ── the screens, where they are structure rather than wording ────────────── */

  get splash() {
    return this.page.locator(".splash-field");
  }
  get header() {
    return this.page.locator(".app-header");
  }
  get board() {
    return this.page.locator(".board-page");
  }
  get dialog() {
    return this.page.locator(".dialog");
  }

  /* Header destinations and the three sittings are all buttons on the bar. */
  nav(label) {
    return this.header.getByRole("button", { name: label, exact: true });
  }

  /* The queue card under a board heading ("Review today" / "Learn today"). */
  queue(title) {
    return this.board
      .locator("div")
      .filter({ has: this.page.getByRole("heading", { name: title, exact: true }) })
      .locator(".blueprint")
      .first();
  }

  /* The board's five hero figures are drawn by CSS from a registered --count
   * (styles.css, .count-up), so they are not text nodes — the number is read off
   * the custom property the view set, exactly as test/views.test.mjs reads it. */
  get committedFigure() {
    return this.board.locator(".board-hero .count-up").first();
  }

  heroStat(label) {
    return this.board.locator(".board-hero-stats > div").filter({ hasText: label }).locator(".count-up");
  }

  async figure(locator) {
    return Number(await locator.evaluate((el) => el.style.getPropertyValue("--count")));
  }

  /* ── what the app saved ───────────────────────────────────────────────────── */

  async stored(key) {
    const raw = await this.page.evaluate((k) => localStorage.getItem(k), key);
    return raw == null ? null : JSON.parse(raw);
  }

  /* The one preference that is not stored as JSON: the theme is a bare word,
   * because index.html reads it in the line before the first paint and that
   * line has to stay the smallest thing that can be said (see src/theme.js). */
  async storedText(key) {
    return this.page.evaluate((k) => localStorage.getItem(k), key);
  }

  /* Documents the app pushed to Firestore this session (see firebase-stub.mjs). */
  async writes() {
    return this.page.evaluate(() => window.__E2E_WRITES__ || []);
  }

  /* The member's document as it now stands in the cloud — what another device
   * signing in would read. The stub keys its documents by collection, since a
   * push writes the record and the leaderboard summary beside it; this is the
   * record, which is what a spec means by "the cloud". */
  async cloudDoc() {
    return this.page.evaluate(() => (JSON.parse(sessionStorage.getItem("e2e:doc") || "null") || {}).users || null);
  }

  /* The leaderboard summary the same push wrote (see src/standings.js). */
  async cloudSummary() {
    return this.page.evaluate(() => (JSON.parse(sessionStorage.getItem("e2e:doc") || "null") || {}).standings || null);
  }

  /* Another device, writing while this one is open. The patch is folded into
   * the stored document the way a push folds into it, so a spec can say "verse
   * 9 was committed elsewhere" without a second browser. */
  async cloudWrite(patch) {
    await this.page.evaluate((p) => {
      const isMap = (v) => v != null && typeof v === "object" && !Array.isArray(v);
      const merge = (target, payload) => {
        const out = { ...(target || {}) };
        for (const key of Object.keys(payload)) {
          out[key] = isMap(payload[key]) ? merge(isMap(out[key]) ? out[key] : {}, payload[key]) : payload[key];
        }
        return out;
      };
      const stored = JSON.parse(sessionStorage.getItem("e2e:doc") || "null") || {};
      sessionStorage.setItem("e2e:doc", JSON.stringify({ ...stored, users: merge(stored.users || {}, p) }));
    }, patch);
  }
}
