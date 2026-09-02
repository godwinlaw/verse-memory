#!/usr/bin/env node
/* Prose guard: fails when tracked text carries the marks of machine-written
 * copy. Two kinds of mark are checked, on every file git tracks:
 *
 *   1. The em-dash (U+2014). Plain punctuation says the same thing: a comma,
 *      a colon, a semicolon, parentheses, or a new sentence.
 *   2. A short list of filler phrases that a person writing about this app
 *      would not reach for. The list lives in PHRASES; keep it to phrases
 *      that are wrong in every context here, so a hit is never a judgment
 *      call.
 *
 * Files in EXCLUDE are skipped on purpose. Scripture is quoted as the
 * translation prints it, and a lockfile is not prose. Add to the list rather
 * than editing a quotation to satisfy the check.
 *
 * Run: node scripts/check-prose.mjs   (exit 1 on any hit)
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const EXCLUDE = new Set([
  "package-lock.json",
  "data/passages.js",
  "design/keyword-review.md",
  "scripts/check-prose.mjs",
]);

const PHRASES = [
  "delve",
  "tapestry",
  "a testament to",
  "it's worth noting",
  "it is worth noting",
  "in today's fast-paced",
  "game-changer",
  "game changer",
  "let's dive in",
  "dive into",
  "in conclusion",
  "unlock the power",
  "elevate your",
  "seamlessly integrate",
  "revolutionize",
  "cutting-edge",
  "in the ever-evolving",
];
const phraseRe = new RegExp(
  `\\b(?:${PHRASES.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/'/g, "['\u2019]")).join("|")})\\b`,
  "i",
);

const BINARY = /\.(png|jpg|jpeg|gif|ico|webp|woff2?|ttf|otf|pdf|zip|mp3|wav|m4a)$/i;

const files = execSync("git ls-files -z", { encoding: "utf8" }).split("\0").filter(Boolean);
const hits = [];
for (const file of files) {
  if (EXCLUDE.has(file) || BINARY.test(file)) continue;
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (text.includes("\0")) continue;
  text.split("\n").forEach((line, i) => {
    if (line.includes("\u2014")) hits.push(`${file}:${i + 1}: em-dash: ${line.trim().slice(0, 100)}`);
    const m = phraseRe.exec(line);
    if (m) hits.push(`${file}:${i + 1}: phrase "${m[0]}": ${line.trim().slice(0, 100)}`);
  });
}

if (hits.length) {
  console.error(`${hits.length} prose problem(s):`);
  for (const h of hits) console.error("  " + h);
  console.error(
    "\nUse a comma, colon, semicolon, parentheses or a new sentence in place of an em-dash;\nsay the plain thing in place of a filler phrase. See scripts/check-prose.mjs for the exclusions.",
  );
  process.exit(1);
}
console.log(`prose: ok (${files.length} files)`);
