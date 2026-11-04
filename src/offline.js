/* Working with no signal: the browser seam for the service worker.
 *
 * sw.js at the site root is what keeps the app's own files and the three CDN
 * scripts in a cache, and answers from it when the network does not (see the
 * note at the top of that file). This module only asks the browser to install
 * it. Written like recognizer.js: a browser with no service workers, or a page
 * not served over HTTPS or localhost, simply gets the app as it always was, a
 * site that needs the network.
 *
 * Nothing else in the app knows a worker exists. The record is in localStorage
 * either way and cloud sync already copes with being unreachable (the sync
 * banner), so an offline sitting is an ordinary sitting whose push is retried
 * when the signal comes back. */

export const SW_PATH = "./sw.js";

export function offlineSupported(win = typeof window === "undefined" ? undefined : window) {
  return !!(win && win.navigator && "serviceWorker" in win.navigator);
}

/* Register the worker. Resolves to the registration, or to null wherever that
 * is not possible, which is never an error the member needs to hear about. */
export function registerOffline(win = typeof window === "undefined" ? undefined : window) {
  if (!offlineSupported(win)) return Promise.resolve(null);
  try {
    // updateViaCache "none": the worker script itself is always checked
    // against the server, so a deploy reaches installed copies on their next
    // open rather than whenever the HTTP cache lets go of the old one.
    return win.navigator.serviceWorker.register(SW_PATH, { updateViaCache: "none" }).catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
}
