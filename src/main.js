/* Application entry point: mount the board.
 *
 * Optional Firebase cloud sync is initialized by <App/> itself once local state
 * has loaded (see App.componentDidMount), so it can reconcile remote and local
 * progress. It is a no-op when Firebase is not configured. */

import { ReactDOM, html } from "./dom.js";
import { App } from "./App.js";
import { appConfig } from "./config.js";

ReactDOM.createRoot(document.getElementById("root")).render(
  html`<${App} groupName=${appConfig.groupName} deadline=${appConfig.deadline} />`,
);
