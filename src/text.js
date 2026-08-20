/* Small, pure text and date helpers shared across the app. */

/* Normalize a word for comparison: lowercase, keep only letters and digits.
 * Used to grade typed answers and fill-in blanks.
 *
 * Apostrophes go with the rest of the punctuation, so "eagles", "eagles'" and
 * "eagle's" are one word here. That is not a leniency so much as the only
 * defensible reading: a member reciting a passage aloud does not pronounce an
 * apostrophe, and one typing it cannot tell from the sound of the verse where
 * it belongs. It also closes a straight-vs-curly trap — ESV text carries the
 * typographic ’ (already stripped), while a keyboard produces ', so "eagles’"
 * and "eagles'" used to grade as different words. */
export const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/* First-letter scaffold for flashcards: reduce every word to its first letter
 * while keeping punctuation, spacing, and hyphens so the shape of the passage
 * (and its cadence) still cues recall. e.g. "self-control;" -> "s-c;" */
export const firstLetters = (text) => (text || "").replace(/[A-Za-z]+/g, (m) => m[0]);

/* Split a passage into sentences.
 *
 * ESV text closes its quotation mark after the full stop (“…the Lord is one.”
 * You shall love…), so a closing quote belongs to the sentence it ends rather
 * than to the next one — hence the optional quote inside the lookbehind. Text
 * with no terminal punctuation comes back as a single sentence. */
export const sentences = (text) =>
  (text || "")
    .split(/(?<=[.!?][”"’']?)\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

/* Local-day key (YYYY-MM-DD) used to bucket the daily review log and streaks.
 *
 * Deliberately local, not UTC: a member reviewing at 9pm in Berkeley is on
 * today's date, but toISOString() would already have rolled over to tomorrow and
 * split their evening across two buckets — breaking the streak they just earned.
 * The streak walk in progress.js steps through local dates, so this has to
 * agree with it. */
export const dayKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
