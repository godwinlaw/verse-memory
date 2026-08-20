/* Which way round the page is printed.
 *
 * The reader's operating system is still the default and still answers for most
 * members (see the theme block in styles.css). This module is only what it takes
 * for a member to say otherwise on one device — a screen read under office
 * lights and the same screen read at night are two different questions, which is
 * why the answer is **device-local and never synced**, like the exercise
 * preferences it sits beside in storage.js. A member signing in on a second
 * machine gets that machine's system answer, not the choice they made on this
 * one.
 *
 * The split is the one device.js makes: `normalizeTheme` and `resolveTheme` are
 * pure and unit-tested, and everything that has to ask the window is at the
 * bottom, kept to three lines.
 *
 * **The resolving happens here rather than in the stylesheet**, and that is what
 * keeps the dark palette written once. CSS cannot say "dark unless the member
 * asked for light" without repeating the whole block of token overrides under a
 * second selector, so `prefers-color-scheme` is read in one place — here — and
 * what lands on the root element is always the settled answer: `data-theme` of
 * "light" or "dark", never "system". The stylesheet reads that attribute and
 * nothing else. index.html stamps it before the first paint, so the page never
 * opens on the wrong ground and then turns over. */

/* What a member can choose, in the order the switch offers them: the two
 * grounds, then the standing instruction to keep asking the system. These are
 * persisted values (storage.saveTheme), so the labels live in copy.js. */
export const THEMES = ["light", "dark", "system"];

export const DEFAULT_THEME = "system";

/* A stored value, made safe. Anything corrupt, absent, or left by a build that
 * offered a choice this one does not, falls back to following the reader. */
export function normalizeTheme(raw) {
  return THEMES.includes(raw) ? raw : DEFAULT_THEME;
}

/* The choice, settled against what the system says: one of the two grounds the
 * stylesheet knows how to paint. `prefersDark` is passed in rather than asked
 * for, so the rule is testable without a browser. */
export function resolveTheme(theme, prefersDark) {
  const choice = normalizeTheme(theme);
  if (choice === "system") return prefersDark ? "dark" : "light";
  return choice;
}

/* ── the window seam ──────────────────────────────────────────────────────── */

const DARK_QUERY = "(prefers-color-scheme: dark)";

const darkMedia = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(DARK_QUERY) : null);

export function prefersDark() {
  const mq = darkMedia();
  return !!(mq && mq.matches);
}

/* Stamp the settled answer on the root element, which is the only thing the
 * stylesheet ever reads. Same attribute and same values as the pre-paint stamp
 * in index.html, so the app agrees with the page it booted on. */
export function applyTheme(theme) {
  const root = typeof document !== "undefined" && document.documentElement;
  if (root) root.dataset.theme = resolveTheme(theme, prefersDark());
}

/* A reader who turns their system over while the app is open. Only "system"
 * has anything to answer here, but re-stamping is what resolveTheme already
 * does, so the caller does not have to know which choice is live. Returns the
 * unsubscribe. */
export function watchSystemTheme(onChange) {
  const mq = darkMedia();
  if (!mq || !mq.addEventListener) return () => {};
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
