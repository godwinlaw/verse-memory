/* Application entry point: mount the board.
 *
 * Optional Firebase cloud sync is initialized by <App/> itself once local state
 * has loaded (see App.componentDidMount), so it can reconcile remote and local
 * progress. It is a no-op when Firebase is not configured. */

import { ReactDOM, html } from "./dom.js";
import { App } from "./App.js";
import { appConfig, features } from "./config.js";
import { registerOffline } from "./offline.js";

ReactDOM.createRoot(document.getElementById("root")).render(
  html`<${App} groupName=${appConfig.groupName} motto=${appConfig.motto} deadline=${appConfig.deadline} />`,
);

// Working with no signal: sw.js keeps the app's files, see src/offline.js.
// After the mount, since nothing on screen waits for it, and only where the
// deploy asks for it (config.js, features.offline).
if (features.offline) registerOffline();
