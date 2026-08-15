/* Application entry point: mount the board and activate optional cloud sync. */

import { ReactDOM, html } from "./dom.js";
import { App } from "./App.js";
import { appConfig } from "./config.js";
import { initFirebaseSync } from "./firebase.js";

// Optional: sync progress to Firebase when a project is configured (no-op otherwise).
initFirebaseSync();

ReactDOM.createRoot(document.getElementById("root")).render(
  html`<${App} groupName=${appConfig.groupName} deadline=${appConfig.deadline} />`
);
