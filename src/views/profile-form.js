/* Member profile form.
 *
 * Shown full-screen after sign-in until the member has given a name, ministry
 * group, gender, and graduating class (v.isSetup — no way out), and reopened
 * from the header for later edits (v.isSetup false — cancellable). */

import { html, sx, corners } from "../dom.js";
import { LABEL_SECTION, SCREEN_BODY, SCREEN_CENTERED, SCREEN_SUBTITLE, SCREEN_TITLE } from "../ui/tokens.js";

const FIELD = "display:flex;flex-direction:column;gap:7px";

/* Ask mobile keyboards for digits. Spread rather than written inline because
 * Prettier lowercases attribute names inside these templates, and React wants
 * the camelCase `inputMode` (it warns on `inputmode`). */
const NUMERIC_KEYBOARD = { inputMode: "numeric" };

export function profileFormView(v) {
  return html`<div style=${sx(SCREEN_CENTERED)}>
    <div
      className="blueprint"
      style=${sx("max-width:480px;width:100%;padding:40px 40px 36px;display:flex;flex-direction:column;gap:20px")}
    >
      ${corners()}
      <div style=${sx("display:flex;flex-direction:column;gap:2px")}>
        <div style=${sx(SCREEN_TITLE)}>${v.title}</div>
        <div style=${sx(SCREEN_SUBTITLE)}>${v.groupName}</div>
      </div>
      <p style=${sx(SCREEN_BODY)}>
        Tell us a bit about yourself. Your name, ministry group, gender, and graduating class shape the leaderboard and
        group stats.
      </p>

      <label style=${sx(FIELD)}>
        <span style=${sx(LABEL_SECTION)}>Name</span>
        <input className="input" value=${v.name} onChange=${v.onName} placeholder="Your full name" />
      </label>

      <div style=${sx(FIELD)}>
        <span style=${sx(LABEL_SECTION)}>Ministry group</span>
        <div style=${sx("position:relative")}>
          <input
            className="input"
            value=${v.ministryGroup}
            onChange=${v.onMinistryInput}
            onFocus=${v.onMinistryFocus}
            onBlur=${v.onMinistryBlur}
            placeholder="Start typing to search…"
            style=${sx("width:100%;box-sizing:border-box")}
          />
          ${
            v.ministryOpen &&
            v.ministryMatches.length > 0 &&
            html`<div
              style=${sx("position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:5;max-height:210px;overflow:auto;background:var(--color-bg);border:1px solid var(--color-divider)")}
            >
              ${v.ministryMatches.map(
                (m) => html`<button key=${m.label} onMouseDown=${m.onSelect} style=${sx(m.style)}>${m.label}</button>`,
              )}
            </div>`
          }
        </div>
      </div>

      <div style=${sx(FIELD)}>
        <span style=${sx(LABEL_SECTION)}>Gender</span>
        <div style=${sx("display:flex;gap:8px")}>
          ${v.genders.map(
            (g) => html`<button key=${g.label} onClick=${g.onClick} style=${sx(g.style)}>${g.label}</button>`,
          )}
        </div>
      </div>

      <label style=${sx(FIELD)}>
        <span style=${sx(LABEL_SECTION)}>Graduating class</span>
        <input
          className="input"
          value=${v.gradClass}
          onChange=${v.onGradClass}
          placeholder="e.g. 2016"
          ...${NUMERIC_KEYBOARD}
        />
      </label>

      <div style=${sx("margin-top:10px;padding-top:20px;border-top:1px solid var(--color-divider);display:flex;flex-direction:column;gap:20px")}>
        <div style=${sx(SCREEN_SUBTITLE)}>DUE NOW SETTINGS</div>
        <label style=${sx(FIELD)}>
          <span style=${sx(LABEL_SECTION)}>Top X verses to show in "Due Now"</span>
          <input
            className="input"
            type="number"
            min="1"
            value=${v.dueTopX}
            onChange=${v.onDueTopX}
            ...${NUMERIC_KEYBOARD}
          />
        </label>
        <label style=${sx(FIELD)}>
          <span style=${sx(LABEL_SECTION)}>Freshness threshold (%) for "Due Now"</span>
          <input
            className="input"
            type="number"
            min="0"
            max="100"
            value=${v.dueFreshness}
            onChange=${v.onDueFreshness}
            ...${NUMERIC_KEYBOARD}
          />
        </label>
      </div>

      <div style=${sx("display:flex;gap:10px;margin-top:4px")}>
        <button
          className="btn btn-primary"
          onClick=${v.onSubmit}
          disabled=${!v.complete}
          style=${sx("letter-spacing:.04em" + (v.complete ? "" : ";opacity:.6;cursor:default"))}
        >
          ${v.submitLabel}
        </button>
        ${!v.isSetup && html`<button className="btn btn-secondary" onClick=${v.onCancel}>Cancel</button>`}
      </div>
    </div>
  </div>`;
}
