/* Shared style strings.
 *
 * Views are transcribed from the design as CSS strings parsed by sx() (see
 * dom.js), which keeps the markup readable but invites copy-paste. Anything that
 * appeared verbatim in more than one place lives here instead, so a retune
 * happens once. One-off styles stay inline in the view that uses them — hoisting
 * those would trade readability for indirection.
 *
 * Everything is a plain string (or a function returning one), so these compose
 * with inline styles by concatenation. */

/* Text at reduced emphasis. The design dims by mixing the ink colour toward
 * transparent rather than picking a second grey, so contrast survives a theme
 * change. `pct` is how much of the text colour remains. */
export const muted = (pct) => `color-mix(in srgb, var(--color-text) ${pct}%, transparent)`;

/* The one colour in the app outside the design-system tokens: the "wrong answer"
 * red used by the graders and the sign-in error callout. */
export const COLOR_ERROR = "#a4553f";

/* Uppercase micro-labels. The design uses two tunings — a slightly wider-tracked
 * one for form/section labels, a tighter dimmer one for inline metadata. */
export const LABEL_SECTION = `font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${muted(55)}`;
export const LABEL_META = `font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:${muted(50)}`;

/* Full-screen centred shell used by the sign-in gate and the profile form. */
export const SCREEN_CENTERED =
  "min-height:100vh;background:var(--color-bg);color:var(--color-text);font-family:var(--font-body);" +
  "display:flex;align-items:center;justify-content:center;padding:36px";

/* Wordmark + group name pair at the top of those full-screen shells. */
export const SCREEN_TITLE = "font-family:var(--font-heading);font-weight:600;font-size:22px;letter-spacing:.06em";
export const SCREEN_SUBTITLE = `font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:${muted(55)}`;
export const SCREEN_BODY = `margin:0;font-size:14px;line-height:1.6;color:${muted(70)}`;

/* Boxed error message on the sign-in gate. */
export const CALLOUT_ERROR = `font-size:13px;line-height:1.55;padding:10px 12px;border:1px solid ${COLOR_ERROR};color:${COLOR_ERROR}`;

/* A word the grader could not match, in "Write it out". */
export const WORD_WRONG = `color:${COLOR_ERROR};text-decoration:underline;text-decoration-style:wavy;text-underline-offset:4px`;
export const WORD_RIGHT = "color:var(--color-text)";

/* Small segmented toggle — the review-mode switch, blank/scramble levels, and
 * the two on/off hint toggles all share it. */
export const segButton = (active) =>
  "padding:5px 11px;font-size:12px;font-family:var(--font-heading);font-weight:600;letter-spacing:.06em;" +
  "cursor:pointer;border:1px solid var(--color-divider);background:" +
  (active ? "var(--color-accent)" : "transparent") +
  ";color:" +
  (active ? "var(--color-bg)" : "var(--color-text)");

/* The passage list's status filter tabs — same idea as segButton, but sized for
 * a body-font row and divided by a left rule instead of a full border. */
export const filterTab = (active) =>
  "padding:7px 13px;font-size:13px;font-family:var(--font-body);cursor:pointer;border:none;" +
  "border-left:1px solid var(--color-divider);background:" +
  (active ? "var(--color-accent)" : "transparent") +
  ";color:" +
  (active ? "var(--color-bg)" : "var(--color-text)");

/* Tick box for selecting rows on the passage list. A button rather than a real
 * checkbox, so it inherits the design's square, borderless-radius language
 * instead of the platform control — the tick itself is the only fill. */
export const checkBox = (on) =>
  "width:17px;height:17px;padding:0;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;" +
  "font-size:11px;line-height:1;border:1px solid " +
  (on ? "var(--color-accent)" : "var(--color-divider)") +
  ";background:" +
  (on ? "var(--color-accent)" : "transparent") +
  ";color:var(--color-bg)";

/* Status pill shown against a passage: filled for committed, tinted for in
 * progress, outlined for untouched. */
const TAG_BASE = "display:inline-flex;font-size:10px;letter-spacing:.1em;text-transform:uppercase;padding:3px 9px;";
export const statusTag = (status) =>
  status === "memorized"
    ? TAG_BASE + "background:var(--color-accent-900);color:#f2f2f3"
    : status === "learning"
      ? TAG_BASE + "background:var(--color-accent-200);color:var(--color-accent-800)"
      : TAG_BASE + `border:1px solid var(--color-divider);color:${muted(55)}`;
