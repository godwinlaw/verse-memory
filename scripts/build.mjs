/* Assemble the deployable static site into ./dist.
 *
 * The app has no bundler — this just copies the web-served files (index.html,
 * src/, data/, and a runtime config.js) into a clean directory so hosts like
 * Cloudflare Workers static assets serve only those, not the whole repo
 * (node_modules/, design/, docs/, tools/, tests, etc.). */

import { rmSync, mkdirSync, cpSync, copyFileSync, existsSync, readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const OUT = "dist";

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

copyFileSync("index.html", `${OUT}/index.html`);
cpSync("src", `${OUT}/src`, { recursive: true });
cpSync("data", `${OUT}/data`, { recursive: true });

// Runtime config: prefer a real local config.js if present, else the template.
const configSource = existsSync("config.js") ? "config.js" : "config.example.js";

/* A local config.js is normally a convenience — a shorter splash, or a staging
 * Firebase project. But one of the things it can say is
 * `window.__FIREBASE_CONFIG__ = null`, which turns cloud sync off entirely, and
 * that is a perfectly reasonable thing to want while poking at the app in a
 * browser without signing in. Shipping it is not: the site comes up with no
 * sign-in and no sync, every device keeps its own private record, and nothing
 * on the screen says so. It is a one-word difference between a dev override and
 * a deploy that silently loses everyone's progress, so the build refuses rather
 * than guesses. Set ALLOW_LOCAL_ONLY_BUILD=1 to mean it. */
const configured = (() => {
  const window = {};
  try {
    runInNewContext(readFileSync(configSource, "utf8"), { window });
  } catch {
    return undefined; // not our business to validate — the browser will complain
  }
  return window.__FIREBASE_CONFIG__;
})();

if (configured === null && process.env.ALLOW_LOCAL_ONLY_BUILD !== "1") {
  console.error(
    `\nRefusing to build: ${configSource} sets window.__FIREBASE_CONFIG__ = null, which disables cloud sync.\n` +
      `A site built from it has no sign-in and no cross-device progress, and says nothing about it.\n\n` +
      `  • To deploy for real: remove that line from ${configSource} (or comment it out).\n` +
      `  • To build a local-only site on purpose: ALLOW_LOCAL_ONLY_BUILD=1 npm run build\n`,
  );
  process.exit(1);
}

copyFileSync(configSource, `${OUT}/config.js`);

console.log(`Built ${OUT}/ (index.html, src/, data/, config.js from ${configSource})`);
