/* Test mode — a graded exam over a chosen slice of the set.
 *
 * Self study (review.js) is untimed, ungraded, and one passage at a time: the
 * act of reviewing is the whole signal, so it can only ever raise a verse's
 * freshness. A test is the other half of the app. The member says how many
 * verses to be tested on, which of them count, and which activities to face;
 * answers every question with no feedback; and gets one score per verse, which
 * moves its freshness up *or down* (srs.nextStep / srs.testedLast).
 *
 * Everything here is pure. buildExam() takes a seed, so the same setup and seed
 * always produce the same paper — that is what makes the generator testable and
 * what stops a re-render from quietly rewriting the question under the member.
 * The running session (which question, what has been typed) belongs to the
 * component, exactly as a review session does.
 *
 * The module is "exam" in code and "Test" in the UI: `test` is taken by the
 * test suite, and a file called src/test.js next to test/ helps no one.
 *
 * The four activities:
 *   name-ref  a chunk of a verse → type where it is from (book + chapter)
 *   pick-ref  a chunk of a verse → choose the reference, or none of the above
 *   finish    a sentence stops partway → type the rest of it, and where it is from
 *   match     four verses and four references → pair them up
 */

import { sentences } from "./text.js";
import { chunksFor, keyBlankSet } from "./blanks.js";
import { gradeReference, gradeWritten, matchesWord } from "./grading.js";
import { freshness, migrate, nextStep, stabilityFor, testedLast, TEST_PASS } from "./srs.js";
import { dueOrder, progressReader } from "./progress.js";
import { mulberry32 } from "./review.js";
import { inCategory, normalizeCategory } from "./categories.js";

/* ── setup ────────────────────────────────────────────────────────────────── */

/* How many verses a test can cover. 0 means every eligible verse. */
export const SIZE_OPTIONS = [10, 20, 30, 40, 50, 70, 100, 0];

/* Granularity of the freshness ceiling, in points. */
export const FRESHNESS_STEP = 10;

/* `key` is persisted in the saved setup and read back by normalizeSetup(), so
 * these keys are part of the stored data — renaming one drops that activity
 * from a member's saved preferences. */
export const ACTIVITIES = [
  {
    key: "name-ref",
    name: "Name the passage",
    short: "Name it",
    desc: "A piece of a verse, with nothing else. Type the book and chapter it comes from.",
  },
  {
    key: "pick-ref",
    name: "Pick the reference",
    short: "Pick",
    desc: "The same question as multiple choice — four references and none of the above.",
  },
  {
    key: "finish",
    name: "Finish the sentence",
    short: "Finish",
    desc: "A sentence from the verse stops partway. Type the rest of it, and where it is from.",
  },
  {
    key: "match",
    name: "Match verse to reference",
    short: "Match",
    desc: "Four verses and four references, side by side. Pair each one up.",
  },
  {
    key: "scramble",
    name: "Order the phrases",
    short: "Order",
    desc: "The passage is cut into phrases and shuffled. Put them back.",
  },
  {
    key: "blanks",
    name: "Fill the blanks",
    short: "Blanks",
    desc: "The key words — verbs, actions, and names — are removed. Type what belongs there.",
  },
  {
    key: "type",
    name: "Write it out",
    short: "Write",
    desc: "Type the whole passage from memory.",
  },
];

export const ACTIVITY_KEYS = ACTIVITIES.map((a) => a.key);

export const activityByKey = (key) => ACTIVITIES.find((a) => a.key === key) || ACTIVITIES[0];

export const DEFAULT_SETUP = {
  size: 10,
  committedOnly: false,
  maxFreshness: 100, // include verses at or below this freshness
  // null is "All". See categories.js — the paper is narrowed to one shelf, but
  // the decoy references it offers are not (see buildExam).
  category: null,
  activities: ACTIVITY_KEYS,
};

/* Verses per matching question, and the size its reference column is padded to
 * with decoys — so the last block of a test, however short it lands, is still a
 * real choice rather than a giveaway. */
export const MATCH_BLOCK = 4;

/* Shortest sentence worth quoting as a prompt, or asking to be completed. */
const MIN_PROMPT_WORDS = 6;
const MIN_FINISH_WORDS = 8;

/* Fraction of a sentence given away as the lead-in of "Finish the sentence". */
const FINISH_LEAD = 0.45;

/* "Finish the sentence" also asks where the sentence is from. Recalling the
 * words is the exercise, so the reference is a quarter of the mark — enough to
 * be worth answering, not enough to sink a member who knows the verse but not
 * its address. */
export const FINISH_REF_WEIGHT = 0.25;

/* Multiple choice: how many references are offered besides "None of the above",
 * and how often the right one is left out of them. */
const MC_CHOICES = 4;
const MC_NONE_RATE = 0.2;
export const NONE_OF_THE_ABOVE = "none";

/* Longest verse snippet shown in a matching grid, so four of them fit. */
const MATCH_SNIPPET = 130;

/* Fold a stored (or half-built) setup back into a usable one, dropping anything
 * out of range so a value left by an older build can't select a size or an
 * activity that no longer exists. */
export function normalizeSetup(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  const activities = ACTIVITY_KEYS.filter((k) => (Array.isArray(s.activities) ? s.activities.includes(k) : true));
  return {
    size: SIZE_OPTIONS.includes(s.size) ? s.size : DEFAULT_SETUP.size,
    committedOnly: !!s.committedOnly,
    maxFreshness: Number.isFinite(s.maxFreshness)
      ? Math.max(0, Math.min(100, Math.round(s.maxFreshness)))
      : DEFAULT_SETUP.maxFreshness,
    // A saved category that no longer exists reads back as "All" rather than
    // as a shelf with nothing on it.
    category: normalizeCategory(s.category),
    // An empty selection would build an empty paper; fall back to everything.
    activities: activities.length ? activities : ACTIVITY_KEYS,
  };
}

/* ── choosing what to test ────────────────────────────────────────────────── */

/* Every verse the setup admits, stalest first — so slicing the top N tests what
 * the member is least likely to still hold. */
export function eligiblePassages(passages, progress, setup, now = Date.now()) {
  const read = progressReader(progress, now);
  const max = setup.maxFreshness;
  // The category narrows what is *tested*. It deliberately does not narrow the
  // `passages` that buildExam() hands to pickRefQuestion / matchQuestion: a
  // wrong reference is only worth reasoning about if it could plausibly have
  // come from anywhere in the set, so the decoys keep the run of the whole
  // thing even when the paper is one shelf.
  return dueOrder(inCategory(passages, setup.category), progress, now).filter((p) => {
    if (setup.committedOnly && read.statusOf(p.id) !== "memorized") return false;
    return read.freshness(p.id) <= max;
  });
}

/* The verses a test with this setup would actually cover. */
export function examPassages(passages, progress, setup, now = Date.now()) {
  const pool = eligiblePassages(passages, progress, setup, now);
  return setup.size > 0 ? pool.slice(0, setup.size) : pool;
}

/* ── building the paper ───────────────────────────────────────────────────── */

const pickOne = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];

/* Fisher–Yates over the seeded generator — an unbiased permutation, and the
 * same one every time for a given seed. */
function shuffle(rnd, items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const sample = (rnd, items, n) => shuffle(rnd, items).slice(0, n);

/* A sentence long enough to stand on its own as a prompt; the whole passage if
 * it has no such sentence (a one-line verse, most often). */
function promptChunk(text, rnd) {
  const parts = sentences(text).filter((s) => s.split(" ").length >= MIN_PROMPT_WORDS);
  return parts.length ? pickOne(rnd, parts) : text;
}

function snippetOf(text) {
  const first = sentences(text)[0] || text;
  return first.length > MATCH_SNIPPET ? first.slice(0, MATCH_SNIPPET).trimEnd() + "…" : first;
}

/* Wrong references to offer against `p`. Same testament and a different book
 * makes for a decoy that has to be reasoned about rather than eliminated on
 * sight; one from the same book (a different chapter) is included where the set
 * has one, since that is the distinction actually worth being able to draw. */
function distractorRefs(p, pool, rnd, n) {
  const others = pool.filter((x) => x.id !== p.id);
  const sameBook = others.filter((x) => x.book === p.book);
  const nearby = others.filter((x) => x.book !== p.book && x.testament === p.testament);
  const chosen = sameBook.length ? sample(rnd, sameBook, 1) : [];
  const rest = (nearby.length >= n - chosen.length ? nearby : others).filter((x) => !chosen.includes(x));
  return [...chosen, ...sample(rnd, rest, n - chosen.length)].slice(0, n);
}

function nameRefQuestion(p, rnd) {
  return { kind: "name-ref", ids: [p.id], ref: p.ref, prompt: promptChunk(p.text, rnd) };
}

function pickRefQuestion(p, pool, rnd) {
  // Leaving the right answer out now and then is what makes "None of the above"
  // a real option instead of a decoration.
  const omit = rnd() < MC_NONE_RATE;
  const refs = distractorRefs(p, pool, rnd, omit ? MC_CHOICES : MC_CHOICES - 1);
  const options = shuffle(rnd, omit ? refs : [...refs, p]).map((x) => ({ key: String(x.id), label: x.ref }));
  return {
    kind: "pick-ref",
    ids: [p.id],
    ref: p.ref,
    prompt: promptChunk(p.text, rnd),
    // "None of the above" always sits last, where a member expects it.
    options: [...options, { key: NONE_OF_THE_ABOVE, label: "None of the above" }],
    correctKey: omit ? NONE_OF_THE_ABOVE : String(p.id),
  };
}

function finishQuestion(p, rnd) {
  const long = sentences(p.text).filter((s) => s.split(" ").length >= MIN_FINISH_WORDS);
  const sentence = long.length ? pickOne(rnd, long) : p.text;
  const words = sentence.split(" ");
  // Always leave at least one word to supply, however short the sentence is.
  const cut = Math.min(Math.max(2, Math.round(words.length * FINISH_LEAD)), words.length - 1);
  return {
    kind: "finish",
    ids: [p.id],
    ref: p.ref,
    lead: words.slice(0, cut).join(" "),
    answer: words.slice(cut).join(" "),
  };
}

function matchQuestion(block, pool, rnd) {
  const decoys = sample(
    rnd,
    pool.filter((p) => !block.includes(p)),
    Math.max(0, MATCH_BLOCK - block.length),
  );
  return {
    kind: "match",
    ids: block.map((p) => p.id),
    verses: shuffle(rnd, block).map((p) => ({ key: String(p.id), id: p.id, ref: p.ref, text: snippetOf(p.text) })),
    refs: shuffle(rnd, [...block, ...decoys]).map((p) => ({ key: String(p.id), label: p.ref })),
  };
}

function scrambleQuestion(p, rnd) {
  // Use medium granularity (1) by default. A long passage carries its verses,
  // and at medium that means two-verse chunks rather than clause fragments.
  const chunks = chunksFor(p.text, 1, p.verses);
  const shuffled = shuffle(
    rnd,
    chunks.map((v, i) => ({ v, i })),
  );
  return { kind: "scramble", ids: [p.id], ref: p.ref, chunks, shuffled };
}

function blanksQuestion(p) {
  // Use medium blanking level (1) by default
  const blanksSet = keyBlankSet(p.text, p.id, 1);
  const words = p.text.split(" ");
  return { kind: "blanks", ids: [p.id], ref: p.ref, words, blanks: Array.from(blanksSet) };
}

function typeQuestion(p) {
  return { kind: "type", ids: [p.id], ref: p.ref, text: p.text };
}

/* Build one paper.
 *
 * Activities are dealt round-robin across the chosen verses, so every activity
 * the member asked for turns up and each verse is asked about once. The verses
 * dealt "match" are then gathered into blocks — a matching question covers
 * several verses at once, which is why a question carries `ids` rather than a
 * single id, and why scoring is per verse rather than per question. */
export function buildExam({ passages, progress, setup, now = Date.now(), seed = 1 }) {
  const chosen = examPassages(passages, progress, setup, now);
  const acts = ACTIVITY_KEYS.filter((k) => setup.activities.includes(k));
  if (!chosen.length || !acts.length) return { questions: [], ids: [] };

  const rnd = mulberry32(seed);
  const questions = [];
  const forMatch = [];
  chosen.forEach((p, i) => {
    const act = acts[i % acts.length];
    if (act === "match") forMatch.push(p);
    else if (act === "name-ref") questions.push(nameRefQuestion(p, rnd));
    // Decoys are drawn from the whole set, not just the slice under test — the
    // wrong answers should be the rest of the board.
    else if (act === "pick-ref") questions.push(pickRefQuestion(p, passages, rnd));
    else if (act === "finish") questions.push(finishQuestion(p, rnd));
    else if (act === "scramble") questions.push(scrambleQuestion(p, rnd));
    else if (act === "blanks") questions.push(blanksQuestion(p));
    else if (act === "type") questions.push(typeQuestion(p));
  });
  for (let i = 0; i < forMatch.length; i += MATCH_BLOCK) {
    questions.push(matchQuestion(forMatch.slice(i, i + MATCH_BLOCK), passages, rnd));
  }

  return {
    // Keys are stable within a paper (a verse is asked about once), which is
    // what React needs to keep an input from being re-created under the caret.
    questions: shuffle(rnd, questions).map((q) => ({ ...q, key: q.kind + ":" + q.ids.join("-") })),
    ids: chosen.map((p) => p.id),
  };
}

/* How many questions a paper over `count` verses will come to, so the setup
 * screen can say what it is about to hand out. Mirrors the dealing rule in
 * buildExam() above — a test asserts the two stay in step. */
export function plannedQuestions(count, activities) {
  const acts = ACTIVITY_KEYS.filter((k) => activities.includes(k));
  if (!count || !acts.length) return 0;
  let matched = 0;
  for (let i = 0; i < count; i++) if (acts[i % acts.length] === "match") matched++;
  return count - matched + Math.ceil(matched / MATCH_BLOCK);
}

/* ── marking ──────────────────────────────────────────────────────────────── */

/* Mark one answer. Every kind returns the same shape: a score in [0, 1] per
 * verse the question covers, plus whatever the summary needs to show its
 * working. `answer` is whatever the view collected — a string for a typed
 * reference, a { text, ref } pair for a finished sentence, an option key for
 * multiple choice, a { verseKey: refKey } map for a matching grid — and is
 * allowed to be missing (an unanswered question). */
export function gradeQuestion(q, answer) {
  if (q.kind === "name-ref") {
    const graded = gradeReference(answer || "", q.ref);
    return { ...graded, score: graded.score, scores: [{ id: q.ids[0], score: graded.score }] };
  }
  if (q.kind === "pick-ref") {
    const score = answer === q.correctKey ? 1 : 0;
    const chosen = q.options.find((o) => o.key === answer);
    return { score, chosenLabel: chosen ? chosen.label : "", scores: [{ id: q.ids[0], score }] };
  }
  if (q.kind === "finish") {
    const given = typeof answer === "string" ? { text: answer } : answer || {};
    const written = gradeWritten(q.answer.split(" "), given.text || "");
    const ref = gradeReference(given.ref || "", q.ref);
    const score = written.score * (1 - FINISH_REF_WEIGHT) + ref.score * FINISH_REF_WEIGHT;
    return { ...written, ref, score, scores: [{ id: q.ids[0], score }] };
  }
  if (q.kind === "scramble") {
    const placed = answer || [];
    let hits = 0;
    for (let i = 0; i < q.chunks.length; i++) {
      if (placed[i] === i) hits++;
    }
    const score = q.chunks.length ? hits / q.chunks.length : 0;
    return { hits, total: q.chunks.length, score, scores: [{ id: q.ids[0], score }] };
  }
  if (q.kind === "blanks") {
    const given = answer || {};
    let hits = 0;
    const total = q.blanks.length;
    for (const i of q.blanks) {
      if (matchesWord(q.words[i], given[i])) hits++;
    }
    const score = total ? hits / total : 0;
    return { hits, total, score, scores: [{ id: q.ids[0], score }] };
  }
  if (q.kind === "type") {
    const given = typeof answer === "string" ? answer : "";
    const written = gradeWritten(q.text.split(" "), given);
    return { ...written, score: written.score, scores: [{ id: q.ids[0], score: written.score }] };
  }
  const given = answer || {};
  const pairs = q.verses.map((v) => {
    const chosenKey = given[v.key];
    const chosen = q.refs.find((r) => r.key === chosenKey);
    return { id: v.id, ref: v.ref, chosenLabel: chosen ? chosen.label : "", ok: chosenKey === v.key };
  });
  const hits = pairs.filter((x) => x.ok).length;
  return {
    pairs,
    hits,
    total: pairs.length,
    score: pairs.length ? hits / pairs.length : 0,
    scores: pairs.map((x) => ({ id: x.id, score: x.ok ? 1 : 0 })),
  };
}

/* Mark a whole paper.
 *
 * `answers` is keyed by question index, the way the session collects them. A
 * verse's result is the mean of every question that asked about it, which for
 * every activity but matching is exactly one. */
export function scoreExam(questions, answers = {}) {
  const marked = questions.map((q, i) => {
    const graded = gradeQuestion(q, answers[i]);
    return { q, index: i, answer: answers[i], ...graded, correct: graded.score >= TEST_PASS };
  });

  const byId = new Map();
  for (const m of marked) {
    for (const { id, score } of m.scores) {
      const cur = byId.get(id) || { sum: 0, n: 0 };
      byId.set(id, { sum: cur.sum + score, n: cur.n + 1 });
    }
  }
  const results = [...byId].map(([id, x]) => ({ id, score: x.sum / x.n }));
  const total = marked.length;

  return {
    marked,
    results,
    right: marked.filter((m) => m.correct).length,
    total,
    // The headline is the mean question score, not the pass count, so a
    // half-remembered sentence reads as half a mark rather than a failure.
    score: total ? marked.reduce((sum, m) => sum + m.score, 0) / total : 0,
  };
}

/* Fold a marked paper back into the progress map.
 *
 * A paper moves a verse along the same interval ladder a session card does, on
 * the same three hinges (srs.nextStep): the mark itself is the evidence, since
 * every question on a paper is marked and there is no unmarked activity to
 * excuse. A poor mark therefore costs a rung and a blank one puts the verse back
 * on the first, and testedLast() backdates the verse to the freshness the member
 * actually demonstrated.
 *
 * A test moves freshness, never status. Committing is reserved for writing the
 * passage out in full in a learn session (srs.commitsVerse) — a paper of
 * multiple choice and matching, however well it goes, is not that. Nor is a
 * failure a demotion: a verse already committed keeps the status it earned, so
 * nothing is lost to one bad morning. Pure: returns the next map. */
export function applyExam({ progress, results, now = Date.now() }) {
  const next = { ...(progress || {}) };
  const rows = results.map(({ id, score }) => {
    const prev = migrate(next[id]);
    const step = nextStep(prev, score);
    const stability = stabilityFor(step);
    const hits = (prev.hits || 0) + (score >= TEST_PASS ? 1 : 0);
    const rec = {
      ...prev,
      hits,
      step,
      stability,
      last: testedLast(stability, score, now),
      // A test is the one write whose `last` is deliberately in the past, so it
      // stamps when it happened separately for the cross-device merge.
      updatedAt: now,
      status: prev.status === "memorized" ? "memorized" : "learning",
    };
    next[id] = rec;
    return { id, score, passed: score >= TEST_PASS, before: freshness(prev, now), after: freshness(rec, now) };
  });
  return { progress: next, rows };
}
