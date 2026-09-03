/* What counts as a mobile device, the rule the app's first gate reads.
 *
 * Only the pure half is asserted here; `detectMobile` is the one-line seam that
 * asks the window the same question, and e2e/mobile.spec.mjs is what drives it
 * in a real phone-shaped browser. */

import test from "node:test";
import assert from "node:assert/strict";

import { isMobileDevice, detectMobile } from "../src/device.js";

/* Real user agents, so a regex tightened later has something to answer to. */
const UA = {
  iPhone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  androidFirefox: "Mozilla/5.0 (Android 13; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0",
  iPadLegacy:
    "Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1",
  // iPadOS 13+ asks for the desktop site by default and its user agent says so.
  iPadOS:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  windows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  linuxFirefox: "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0",
};

test("a phone or a tablet is turned away", () => {
  for (const key of ["iPhone", "androidChrome", "androidFirefox", "iPadLegacy"]) {
    assert.equal(isMobileDevice({ userAgent: UA[key] }), true, key);
  }
});

test("a computer is let through", () => {
  for (const key of ["mac", "windows", "linuxFirefox"]) {
    assert.equal(isMobileDevice({ userAgent: UA[key], platform: "MacIntel" }), false, key);
  }
});

test("an iPad claiming to be a Mac is caught by its touchscreen", () => {
  const iPad = { userAgent: UA.iPadOS, platform: "MacIntel", maxTouchPoints: 5 };
  assert.equal(isMobileDevice(iPad), true);
  // The same machine without the touchscreen is the Mac it says it is. A
  // trackpad reports 0, and a single stylus 1, hence the threshold.
  assert.equal(isMobileDevice({ ...iPad, maxTouchPoints: 0 }), false);
  assert.equal(isMobileDevice({ ...iPad, maxTouchPoints: 1 }), false);
});

test("a touchscreen alone is not a mobile device", () => {
  // A Windows laptop with a touchscreen is still a laptop: only the Mac-shaped
  // lie needs the touch count to settle it.
  assert.equal(isMobileDevice({ userAgent: UA.windows, platform: "Win32", maxTouchPoints: 10 }), false);
});

test("nothing to go on is not a phone", () => {
  // The node render suite has a window with no navigator on it; the app's own
  // fallback everywhere else is to carry on rather than lock the member out.
  assert.equal(isMobileDevice(), false);
  assert.equal(isMobileDevice({}), false);
  assert.equal(detectMobile(undefined), false);
  assert.equal(detectMobile({}), false);
});

test("the seam asks the window the same question", () => {
  assert.equal(detectMobile({ navigator: { userAgent: UA.androidChrome } }), true);
  assert.equal(detectMobile({ navigator: { userAgent: UA.mac } }), false);
  assert.equal(detectMobile({ navigator: { userAgent: UA.iPadOS, platform: "MacIntel", maxTouchPoints: 5 } }), true);
});
