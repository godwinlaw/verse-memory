/* Turning a feature flag on for the length of one render.
 *
 * `features` (src/config.js) is what decides which pieces of the app are on
 * offer, and several of them are currently off — the Stats board, the guide,
 * the sign-up form and the welcome nudge that followed it. They are hidden
 * rather than deleted, and this is what keeps that claim honest: the render
 * suite reaches every one of those screens by flipping its flag, so a screen
 * that has quietly rotted behind a flag still fails a test.
 *
 * The flags are read where they are used rather than captured at import, so
 * assigning over the object is enough and nothing has to be re-imported. */

import { features } from "../../src/config.js";

export function withFeatures(overrides, fn) {
  const before = { ...features };
  Object.assign(features, overrides);
  try {
    return fn();
  } finally {
    Object.assign(features, before);
  }
}
