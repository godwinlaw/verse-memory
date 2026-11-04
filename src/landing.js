/* Which screen the app opens on.
 *
 * The board is home on a computer. An installed copy opens on Today, the one
 * screen built for a daily visit (manifest.webmanifest names ./?screen=today as
 * its start_url), and a phone does too, since a phone is for the sitting, not
 * for the whole-set map. The URL is the only way in besides the device, so a
 * member who wants a bookmark that opens on Today can have one.
 *
 * Pure: the window's search string and the device's default are handed in, so
 * App.initialState can call it and the node suites can too. */

/* The screens a URL may name. Anything else is ignored rather than trusted:
 * a session screen with no session behind it would be a blank card. */
const LANDINGS = new Set(["today", "board", "list"]);

export function landingView(search, fallback = "board") {
  const params = new URLSearchParams(String(search || ""));
  const screen = params.get("screen");
  return screen && LANDINGS.has(screen) ? screen : fallback;
}
