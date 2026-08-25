/* Samuel mode: getting ready for the 1 and 2 Samuel test.
 *
 * This is the one part of the app that is not about memorizing a verse. The
 * test on the thirtieth of September is over the *books* — who did what, where
 * it happened, and in which chapter — so what it drills is a question bank
 * (data/samuel.js) rather than the passage set, and what it tracks is which
 * questions a member keeps getting wrong.
 *
 * It deliberately does not touch the SRS. A verse's schedule is a claim about
 * how well somebody knows scripture they have committed, and a multiple-choice
 * answer about the census in 2 Samuel 24 is not evidence about that. So the two
 * models sit side by side and never write to each other: `srs.js` keeps the
 * verses, and the small record below keeps the quiz.
 *
 * Everything here is pure. The queue, the marking and the weakest-first
 * ordering are all `(input) => output`, which is what lets the whole mode be
 * tested in node without a browser anywhere near it. */

import { SAMUEL_CHAPTERS, SAMUEL_QUESTIONS } from "../data/samuel.js";
import { mulberry32 } from "./review.js";

/* The exam this mode exists for. Local noon rather than midnight so that a
 * member reading the countdown on the day itself is told "today" rather than
 * being caught by a timezone an hour either side of the boundary. */
export const TEST_DATE = "2026-09-30";

export function daysUntil(dateStr = TEST_DATE, now = Date.now()) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  const target = new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
  const today = new Date(now);
  const noonToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0, 0).getTime();
  return Math.round((target - noonToday) / 86400000);
}

/* ── what a member is asked ─────────────────────────────────────────────────
 *
 * A round is drawn from the bank rather than walked through it in order, and
 * the draw is weighted by what the member has got wrong before. `record` is a
 * map of question id to `{ right, wrong, last }` — small enough to keep in
 * localStorage beside the passage progress, and never merged into it. */

export const ROUND_SIZE = 10;

/* Scoring a question's claim on the next round.
 *
 * A question answered wrongly is worth asking again; one answered rightly three
 * times running is not, at least not yet. The weight is deliberately simple —
 * misses count double what hits discount, and an unseen question sits between
 * the two, so a first pass covers new ground before it starts drilling. */
export function weightOf(stat) {
  if (!stat || (!stat.right && !stat.wrong)) return 2;
  const wrong = stat.wrong || 0;
  const right = stat.right || 0;
  return Math.max(0.25, 1 + wrong * 2 - right);
}

/* Which chapters a round may draw from. `scope` is either null (both books),
 * a book name, or a `{ book, from, to }` range, so a member revising the second
 * half of 1 Samuel the night before is not handed questions about 2 Samuel. */
export function inScope(question, scope) {
  if (!scope) return true;
  if (typeof scope === "string") return question.book === scope;
  if (scope.book && question.book !== scope.book) return false;
  if (scope.from && question.chapter < scope.from) return false;
  if (scope.to && question.chapter > scope.to) return false;
  return true;
}

/* Deal a round: the weightiest questions first, shuffled among themselves so
 * two sittings in a row are not the same ten in the same order. The seed makes
 * it reproducible, which is what lets the tests assert on a round at all. */
export function buildRound(record = {}, { scope = null, size = ROUND_SIZE, seed = 1, bank = SAMUEL_QUESTIONS } = {}) {
  const pool = bank.filter((q) => inScope(q, scope));
  const random = mulberry32(seed);
  const scored = pool.map((q) => ({ q, w: weightOf(record[q.id]) * (0.5 + random()) }));
  scored.sort((a, b) => b.w - a.w);
  return scored.slice(0, Math.min(size, pool.length)).map((s) => s.q);
}

/* The four things a member picks between, in a fixed order per question so the
 * answer does not move if the screen re-renders. */
export function choicesFor(question, seed = 0) {
  const all = [question.answer, ...(question.options || [])];
  const random = mulberry32((seed || 0) + hashId(question.id));
  const out = all.map((v, i) => ({ v, i }));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.map((o) => o.v);
}

/* A stable number from a question's id, so a question's choices are arranged
 * the same way every time it is asked without storing the arrangement. */
function hashId(id) {
  let h = 2166136261;
  for (let i = 0; i < String(id).length; i++) {
    h ^= String(id).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const isRight = (question, answer) => String(answer) === String(question.answer);

/* Fold one answer into the record. Returns a new map rather than mutating, for
 * the same reason srs.js does: the caller is React state. */
export function recordAnswer(record, question, answer, now = Date.now()) {
  const prev = record[question.id] || { right: 0, wrong: 0, last: 0 };
  const right = isRight(question, answer);
  return {
    ...record,
    [question.id]: {
      right: prev.right + (right ? 1 : 0),
      wrong: prev.wrong + (right ? 0 : 1),
      last: now,
    },
  };
}

/* ── how ready a member is ──────────────────────────────────────────────────
 *
 * One figure, and it is deliberately about coverage rather than about a score:
 * the test is in a fortnight and what matters is how much of the material has
 * been seen and stuck, not what percentage the last ten questions were. A
 * question counts as held once it has been answered rightly more often than
 * wrongly and at least once. */
export function readiness(record = {}, bank = SAMUEL_QUESTIONS) {
  const held = bank.filter((q) => {
    const s = record[q.id];
    return s && s.right > 0 && s.right > s.wrong;
  }).length;
  const seen = bank.filter((q) => record[q.id]).length;
  return { held, seen, total: bank.length, pct: bank.length ? Math.round((held / bank.length) * 100) : 0 };
}

/* The chapters a member is weakest on, worst first — what to read tonight.
 * Only chapters actually asked about are ranked, and a chapter nobody has been
 * asked about yet is not a weakness, it is simply unmet. */
export function weakChapters(record = {}, bank = SAMUEL_QUESTIONS, limit = 5) {
  const byChapter = new Map();
  bank.forEach((q) => {
    const stat = record[q.id];
    if (!stat) return;
    const key = q.book + " " + q.chapter;
    const at = byChapter.get(key) || { key, book: q.book, chapter: q.chapter, right: 0, wrong: 0 };
    at.right += stat.right || 0;
    at.wrong += stat.wrong || 0;
    byChapter.set(key, at);
  });
  return [...byChapter.values()]
    .filter((c) => c.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong || a.right - b.right)
    .slice(0, limit);
}

/* One chapter's card, for the read-it-again half of the mode. */
export const chapterAt = (book, chapter) =>
  SAMUEL_CHAPTERS.find((c) => c.book === book && c.chapter === chapter) || null;

export const chaptersOf = (book) => SAMUEL_CHAPTERS.filter((c) => c.book === book);

export const BOOKS = ["1 Samuel", "2 Samuel"];
