/* Small, pure text and date helpers shared across the app. */

/* Normalize a word for comparison: lowercase, strip everything but letters,
 * digits, and apostrophes. Used to grade typed answers and fill-in blanks. */
export const norm = (s) => s.toLowerCase().replace(/[^a-z0-9']/g, "");

/* First-letter scaffold for flashcards: reduce every word to its first letter
 * while keeping punctuation, spacing, and hyphens so the shape of the passage
 * (and its cadence) still cues recall. e.g. "self-control;" -> "s-c;" */
export const firstLetters = (text) => (text || "").replace(/[A-Za-z]+/g, (m) => m[0]);

/* Local-day key (YYYY-MM-DD) used to bucket the daily review log and streaks. */
export const dayKey = (d) => d.toISOString().slice(0, 10);
