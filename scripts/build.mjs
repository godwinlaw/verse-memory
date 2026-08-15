/* Assemble the deployable static site into ./dist.
 *
 * The app has no bundler — this just copies the web-served files (index.html,
 * src/, data/, and a runtime config.js) into a clean directory so hosts like
 * Cloudflare Workers static assets serve only those, not the whole repo
 * (node_modules/, design/, docs/, tools/, tests, etc.). */

import { rmSync, mkdirSync, cpSync, copyFileSync, existsSync } from "node:fs";

const OUT = "dist";

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

copyFileSync("index.html", `${OUT}/index.html`);
cpSync("src", `${OUT}/src`, { recursive: true });
cpSync("data", `${OUT}/data`, { recursive: true });

// Runtime config: prefer a real local config.js if present, else the template.
const configSource = existsSync("config.js") ? "config.js" : "config.example.js";
copyFileSync(configSource, `${OUT}/config.js`);

console.log(`Built ${OUT}/ (index.html, src/, data/, config.js from ${configSource})`);
