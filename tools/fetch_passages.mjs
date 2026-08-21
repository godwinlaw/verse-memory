/* Fetch ESV passage text from api.esv.org and fold it into data/passages.js.
 *
 * This runs ONCE, by hand, at authoring time -- it is an offline generator in
 * the same mould as tools/gen_keywords.py, not something the app ever calls.
 * The text it writes is committed and shipped as a static ES module, so a
 * member's browser never touches the API and there is no key in the build.
 *
 *   ESV_API_KEY=... node tools/fetch_passages.mjs [--dry-run]
 *
 * What to fetch is tools/new-passages.json. A ref already present in
 * data/passages.js is refreshed in place rather than added twice, so the script
 * is safe to re-run.
 *
 * ESV API v3 terms this script is written to keep (see README):
 *   - the key comes from the environment and is never written to the repo;
 *   - one request per ref, spaced by THROTTLE_MS, well inside 60/min;
 *   - each request is a handful of verses, nowhere near the 500-verse cap.
 * The storage limits -- half a book, 500 consecutive verses -- are asserted
 * over the whole shipped set by test/passages.test.mjs, which is the honest
 * place for them: they are a property of what we ship, not of one fetch.
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASSAGES_JS = join(ROOT, "data", "passages.js");
const MANIFEST = join(ROOT, "tools", "new-passages.json");

/* Spacing between requests. The published limit is 60 a minute; a second
 * apiece leaves the whole manifest comfortably inside it and finishes in
 * under a minute either way. */
const THROTTLE_MS = 1100;

/* Everything off except the verse numbers, which are the only thing in the
 * response we actually read -- they are what cuts the passage into verses. */
const OPTIONS = {
  "include-verse-numbers": "true",
  "include-first-verse-numbers": "true",
  "include-headings": "false",
  "include-footnotes": "false",
  "include-passage-references": "false",
  "include-short-copyright": "false",
  "include-selahs": "false",
  "indent-poetry": "false",
  "indent-paragraphs": "0",
  "indent-using": "space",
};

/* data/passages.js is a single JSON array literal, and has to stay one:
 * tools/gen_keywords.py reads it by slicing between the first "[" and the last
 * "]" and handing that to json.loads. So we parse and re-emit the same way
 * rather than treating it as JavaScript. */
async function readPassages() {
  const src = await readFile(PASSAGES_JS, "utf8");
  return JSON.parse(src.slice(src.indexOf("["), src.lastIndexOf("]") + 1));
}

const emit = (passages) => "export const passages = " + JSON.stringify(passages) + ";\n";

/* One passage's text, cut into verses.
 *
 * The response is a flat string with "[n]" before each verse and newlines
 * wherever the poetry setting laid one out. Two things matter:
 *
 * Anything before the first marker is dropped. A psalm carries a
 * superscription ("A Psalm of David.", "A Maskil of David.") which is printed
 * ahead of verse 1 and is not part of it -- kept, it would be graded as words
 * the member has to recall.
 *
 * Whitespace inside a verse collapses to a single space, because
 * data/keywords.js indexes words by text.split(" ") and a newline would put a
 * blank token in the middle of the passage. */
function versesFrom(passage) {
  const parts = passage.split(/\[\d+\]/);
  return parts
    .slice(1)
    .map((v) => v.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

async function fetchPassage(ref, key) {
  const url = new URL("https://api.esv.org/v3/passage/text/");
  url.searchParams.set("q", ref);
  for (const [k, v] of Object.entries(OPTIONS)) url.searchParams.set(k, v);

  const res = await fetch(url, { headers: { Authorization: "Token " + key } });
  if (!res.ok) throw new Error(`${ref}: HTTP ${res.status} ${await res.text()}`);
  const body = await res.json();
  const text = (body.passages || [])[0];
  if (!text) throw new Error(`${ref}: no passage in response (canonical: ${body.canonical || "none"})`);

  const verses = versesFrom(text);
  if (!verses.length) throw new Error(`${ref}: no verse markers found`);
  return { canonical: body.canonical, verses };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const key = process.env.ESV_API_KEY;
  if (!key) {
    console.error("ESV_API_KEY is not set. Get a key at https://api.esv.org/account/ and pass it in the environment:");
    console.error("  ESV_API_KEY=... node tools/fetch_passages.mjs");
    process.exit(1);
  }

  const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
  const passages = await readPassages();
  const byRef = new Map(passages.map((p) => [p.ref, p]));
  let nextId = Math.max(...passages.map((p) => p.id)) + 1;
  let added = 0;
  let refreshed = 0;

  for (const [i, entry] of manifest.passages.entries()) {
    if (i) await sleep(THROTTLE_MS);
    const { canonical, verses } = await fetchPassage(entry.ref, key);

    const existing = byRef.get(entry.ref);
    const record = {
      id: existing ? existing.id : nextId++,
      ref: entry.ref,
      book: entry.book,
      // Kept alongside `verses` rather than derived at import: gen_keywords.py
      // reads this file as plain JSON and indexes `text`, and the app's grading
      // has always worked on the flat string.
      text: verses.join(" "),
      testament: entry.testament,
      category: entry.category,
      ...(entry.group ? { group: entry.group } : {}),
      // What a verse-level "Order the phrases" cuts on (see blanks.chunksFor).
      verses,
    };

    if (existing) {
      passages[passages.indexOf(existing)] = record;
      refreshed++;
    } else {
      passages.push(record);
      added++;
    }
    console.log(
      `${entry.ref.padEnd(24)} ${String(verses.length).padStart(2)} verses  ` +
        `${String(record.text.split(" ").length).padStart(4)} words  (${canonical})`,
    );
  }

  if (dryRun) {
    console.log(`\n--dry-run: would add ${added} and refresh ${refreshed}; data/passages.js untouched.`);
    return;
  }
  await writeFile(PASSAGES_JS, emit(passages), "utf8");
  console.log(`\nWrote data/passages.js: ${passages.length} passages (${added} added, ${refreshed} refreshed).`);
  console.log("Now re-run `npm run keywords` -- the blanks indices are aligned to text.split(' ').");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
