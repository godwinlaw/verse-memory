/* "Fill the blanks" word selection and "Order the phrases" chunking.
 *
 * Rather than blanking every Nth word by position, we pick the words that
 * actually carry meaning: action verbs, imperatives, and key theological nouns.
 * Function words are never blanked. The preferred keyword pool is precomputed
 * offline by spaCy (tools/gen_keywords.py -> data/keywords.js); the lexical
 * heuristic below is only a fallback for passages lacking precomputed data. */

import { norm } from "./text.js";
import { keywordIndices } from "../data/keywords.js";

const KEY_STOP = new Set(
  ("a an the and or but nor so if then than as of to in on at by for with from into " +
   "through unto upon among between about over under above below out up down again " +
   "i me my mine we us our ours you your yours he him his she her hers it its they them " +
   "their theirs this that these those there here who whom whose which what when where " +
   "why how not no yes o oh yet also very only own same all any some each every both few " +
   "more most such will shall would should can could may might must do does did done " +
   "have has had is are was were be been being am let us").split(/\s+/));

const KEY_VERBS = new Set(
  ("love loved loves trust seek sought obey obeying keep kept delight commit believe believed " +
   "believes follow abide pray prayed rejoice repent repentance remember know knew known hear " +
   "heard hears listen come came comes go went give gave given gives serve served walk walked " +
   "stand stood rest wait waited humble submit resist honor glorify confess present put take " +
   "took hold held run ran fight fought guard worship praise fear remain bear bore bears forgive " +
   "save saved redeemed created transformed renew renewed cast meditate consider count counted " +
   "pressed press strive receive received ask asked knock find found enter denied deny lose lost " +
   "loses gain gained boast endure teach teaching learn mount strengthen strengthened comfort " +
   "dwell dwelt reign discern make made lay laid believe cleanse cleanses proclaim overcome " +
   "overcame reap sow sows sown live lives die died dies bring brought bringeth turn call called " +
   "speak said says say behold see seen look revive grow gives hate destroy break buy exalt " +
   "exalted flee flee casting caring cares snatch prepare prosper prospers act carries fret " +
   "acknowledge lean added think fulfill draw eat labor steal declares crucified glorify " +
   "instruct raised reconciled justified perish suffered suffering please despise").split(/\s+/));

const KEY_NOUNS = new Set(
  ("lord god christ jesus spirit faith hope love heart heart's hearts soul mind minds strength " +
   "grace salvation sin sins righteousness life death word words cross gospel kingdom peace joy " +
   "power glory truth light darkness flesh world father son holy eternal mercy mercies wisdom " +
   "prayer name blood covenant law commandment commandments understanding desires paths " +
   "supplication thanksgiving requests way ways heaven earth throne shepherd sheep fruit " +
   "patience kindness goodness faithfulness gentleness selfcontrol salvation servant justice " +
   "voice mouth eyes hand hands people children brothers disciples saints nation nations " +
   "covenant temptation gift gifts riches money treasure treasures devil weakness weaknesses " +
   "anger anxieties trouble race gate door strength anxious steadfast wings creation likeness " +
   "image ministry passions members works work fruit witnesses sacrifice offering discipline " +
   "confidence conscience").split(/\s+/));

/* How many of a passage's ranked keywords to actually blank. The keyword pool
 * is ordered most-important first, so a lower level keeps the highest-value
 * words (names, key verbs) and drops the more incidental ones. */
export const BLANK_LEVELS = [
  { key: "light",  label: "Light",  desc: "only the most important words", frac: 0.4 },
  { key: "medium", label: "Medium", desc: "a balanced set of key words",   frac: 0.7 },
  { key: "full",   label: "Full",   desc: "every key word",                frac: 1.0 },
];

// Granularity of the "Order the phrases" exercise: how finely the passage is
// cut into shufflable chunks. minWords sets the smallest phrase before adjacent
// parts get merged; maxChunks caps the count; fallback is the word-group size
// used when punctuation alone leaves too few pieces. wordGroup, when set, cuts
// strictly into fixed-size word groups — ignoring punctuation so phrases get
// broken apart mid-clause.
export const SCRAMBLE_LEVELS = [
  { key: "coarse", label: "Coarse", desc: "a few long phrases",         minWords: 6, maxChunks: 5,  fallback: 8 },
  { key: "medium", label: "Medium", desc: "balanced phrases",           minWords: 2, maxChunks: 13, fallback: 3 },
  { key: "fine",   label: "Fine",   desc: "short three-word fragments",  minWords: 1, maxChunks: 40, fallback: 3, wordGroup: 3 },
];

/* Indices (into text.split(" ")) of the words to blank for a passage. */
export function keyBlankSet(text, id, level = 1) {
  const words = (text || "").split(" ");
  const frac = (BLANK_LEVELS[level] || BLANK_LEVELS[1]).frac;
  // Preferred path: per-passage keywords precomputed offline by spaCy's neural
  // tagger. The pool is ranked, so we blank the top `frac` of it; consecutive
  // keywords are allowed.
  const pool = keywordIndices[id];
  if (pool && pool.length) {
    const n = Math.max(1, Math.round(pool.length * frac));
    const chosen = new Set();
    for (const i of pool.slice(0, n)) {
      if (i < 0 || i >= words.length) continue;
      chosen.add(i);
    }
    return chosen;
  }
  // Fallback lexical heuristic (used only if a passage lacks precomputed data).
  const cand = [];
  words.forEach((w, i) => {
    const n = norm(w);
    if (n.length < 3) return;            // skip tiny tokens
    if (!/[a-z]/.test(n)) return;        // must contain letters
    if (KEY_STOP.has(n)) return;         // skip function words
    // The opening word is eligible only when it is a genuine content verb /
    // imperative (e.g. "Trust", "Come", "Seek", "Rejoice", "Submit", "Humble",
    // "Delight", "Create") — never a trivial or function opener.
    if (i === 0 && !KEY_VERBS.has(n)) return;
    let score = 1 + Math.min(n.length, 9) * 0.1;
    if (KEY_VERBS.has(n)) score += 2.5;                     // action / imperative
    if (KEY_NOUNS.has(n)) score += 2.0;                     // key theological noun
    const prev = words[i - 1] || "";
    if (/^[A-Z]/.test(w) && !/[.!?;:"”)]$/.test(prev)) score += 0.8; // proper noun mid-sentence
    cand.push({ i, score });
  });
  cand.sort((a, b) => b.score - a.score || a.i - b.i);
  const target = Math.max(1, Math.round((words.length / 4) * (frac / 0.7)));
  const chosen = new Set();
  for (const c of cand) {
    if (chosen.size >= target) break;
    if (chosen.has(c.i - 1) || chosen.has(c.i + 1)) continue; // keep blanks non-adjacent
    chosen.add(c.i);
  }
  return chosen;
}

/* Cut a passage into shufflable phrase chunks at the given granularity. */
export function chunksFor(t, level = 1) {
  const cfg = SCRAMBLE_LEVELS[level] || SCRAMBLE_LEVELS[1];
  let out;
  if (cfg.wordGroup) {
    // Cut strictly by word count, ignoring punctuation, so phrases are broken apart.
    const w = t.split(" ");
    out = [];
    for (let i = 0; i < w.length; i += cfg.wordGroup) out.push(w.slice(i, i + cfg.wordGroup).join(" "));
    // Fold a short trailing remainder into the previous chunk so no fragment is under wordGroup words.
    if (out.length > 1 && out[out.length - 1].split(" ").length < cfg.wordGroup) out.splice(-2, 2, out.slice(-2).join(" "));
  } else {
    const parts = t.split(/(?<=[,.;:!?”"])\s+/).filter(Boolean);
    const merged = [];
    for (const p of parts) {
      if (merged.length && (p.split(" ").length < cfg.minWords || merged[merged.length - 1].split(" ").length < cfg.minWords))
        merged[merged.length - 1] += " " + p;
      else merged.push(p);
    }
    out = merged;
    if (out.length < 3) {
      const w = t.split(" ");
      out = [];
      for (let i = 0; i < w.length; i += cfg.fallback) out.push(w.slice(i, i + cfg.fallback).join(" "));
    }
  }
  if (out.length > cfg.maxChunks) {
    const size = Math.ceil(out.length / cfg.maxChunks);
    const o2 = [];
    for (let i = 0; i < out.length; i += size) o2.push(out.slice(i, i + size).join(" "));
    out = o2;
  }
  return out;
}
