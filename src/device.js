/* What kind of machine the app is being read on.
 *
 * Verse Mastery is not offered on a phone or a tablet: working a passage is
 * meant to be a sitting at a desk rather than another reason to pick the phone
 * up, so the app stands a gate in front of itself there (views/mobile-gate.js,
 * dispatched first in App.render — before even the splash, since a member who
 * is not getting in should not be made to watch the boot).
 *
 * The question this module answers is deliberately about the *device*, not the
 * window: a narrow browser window on a laptop is still a laptop, and the app's
 * own breakpoints (styles.css) are what serve it. So nothing here reads a
 * width. What it reads is what the browser says it is — a string and a touch
 * count, both handed in — which keeps the rule a pure function with the seam
 * (`detectMobile`) a single line beside it, as recognizer.js and firebase.js
 * are to voice.js and storage.js. */

/* Phones and small tablets name themselves in the user agent. "Mobi" is the
 * conventional marker (Firefox and Opera on Android, "Mobile Safari" on both
 * iOS and Chrome/Android); the rest are the platforms that predate it or spell
 * it their own way. No desktop UA carries any of these. */
const MOBILE_UA = /Android|iPhone|iPad|iPod|Mobi|Windows Phone|IEMobile|BlackBerry|webOS|Opera Mini|Kindle|Silk/i;

/* Is this a device the app declines to run on? A tablet counts: an iPad is a
 * device you hold, which is the thing being ruled out, not a screen size. */
export function isMobileDevice({ userAgent = "", platform = "", maxTouchPoints = 0 } = {}) {
  if (MOBILE_UA.test(userAgent)) return true;
  // iPadOS 13 and later report themselves as a desktop Mac — same user agent,
  // same platform string. The touchscreen is the only thing that gives them
  // away, and `> 1` rather than `> 0` so a Mac with a drawing tablet plugged in
  // is not mistaken for one.
  return /Mac/i.test(platform) && maxTouchPoints > 1;
}

/* The browser seam: ask the window the question above. Answers false where
 * there is no window at all (the node render suite), which is correct — nothing
 * is being held. */
export function detectMobile(win = typeof window === "undefined" ? undefined : window) {
  const nav = win && win.navigator;
  if (!nav) return false;
  return isMobileDevice({
    userAgent: nav.userAgent || "",
    platform: nav.platform || "",
    maxTouchPoints: nav.maxTouchPoints || 0,
  });
}
