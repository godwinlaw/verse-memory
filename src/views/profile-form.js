/* Member profile form.
 *
 * Shown full-screen after sign-in until the member has given a name, ministry
 * group, gender, and graduating class (v.isSetup — no way out), and reopened
 * from the header for later edits (v.isSetup false — cancellable). */

import { copy } from "../copy.js";
import { html, sx, corners, React } from "../dom.js";
import {
  COLOR_ERROR,
  LABEL_SECTION,
  SCREEN_BODY,
  SCREEN_CENTERED,
  SCREEN_SUBTITLE,
  SCREEN_TITLE,
  muted,
} from "../ui/tokens.js";

const FIELD = "display:flex;flex-direction:column;gap:7px";
/* A ruled-off block below the profile's own fields. Both users set their own
 * gap, so the rule itself is all that is shared. */
const SECTION =
  "margin-top:10px;padding-top:20px;border-top:1px solid var(--color-divider);display:flex;flex-direction:column";

/* Ask mobile keyboards for digits. Spread rather than written inline because
 * Prettier lowercases attribute names inside these templates, and React wants
 * the camelCase `inputMode` (it warns on `inputmode`). */
const NUMERIC_KEYBOARD = { inputMode: "numeric" };

/* Wiping the record. Nothing about it is recoverable, so the button is guarded
 * twice over: the section says what it does before it is pressed, and pressing
 * it only opens the dialog below. */
function resetSection(v) {
  return html`<div style=${sx(SECTION + ";gap:12px")}>
    <div style=${sx(SCREEN_SUBTITLE)}>${copy.profileForm.reset.section}</div>
    <p style=${sx(SCREEN_BODY)}>${copy.profileForm.reset.note}</p>
    <div style=${sx(`font-size:13px;color:${muted(55)}`)}>${v.resetStanding}</div>
    <button
      className="btn btn-secondary"
      onClick=${v.onResetAsk}
      disabled=${!v.canReset}
      style=${sx(`align-self:flex-start;color:${COLOR_ERROR};border-color:${COLOR_ERROR}`)}
    >
      ${copy.profileForm.reset.button}
    </button>
  </div>`;
}

/* The warning, in the order it matters: what is erased, that it reaches the
 * member's other devices, and what survives. Same dialog the sessions use for
 * losing an unsubmitted card (views/review.js), since the loss is the same
 * kind — only bigger. */
function resetDialog(v) {
  return html`<div className="dialog-backdrop" onClick=${v.onResetCancel} style=${sx("z-index:30")}>
    <div className="dialog blueprint" onClick=${(e) => e.stopPropagation()} style=${sx("background:var(--color-bg)")}>
      ${corners()}
      <div className="dialog-title">${copy.profileForm.reset.title}</div>
      <div className="dialog-body" style=${sx("display:flex;flex-direction:column;gap:10px")}>
        <p style=${sx(`margin:0;color:${COLOR_ERROR}`)}>${v.resetWarning}</p>
        <p style=${sx("margin:0")}>${copy.profileForm.reset.sync}</p>
        <p style=${sx("margin:0")}>${copy.profileForm.reset.keeps}</p>
      </div>
      <div className="dialog-actions">
        <button className="btn btn-secondary" onClick=${v.onResetCancel}>${copy.profileForm.reset.cancel}</button>
        <button
          className="btn btn-primary"
          onClick=${v.onResetConfirm}
          style=${sx(`background:${COLOR_ERROR};border-color:${COLOR_ERROR}`)}
        >
          ${copy.profileForm.reset.confirm}
        </button>
      </div>
    </div>
  </div>`;
}

export function profileFormView(v) {
  return html`<div style=${sx(SCREEN_CENTERED)}>
    <div
      className="blueprint shell-settle"
      style=${sx("max-width:480px;width:100%;padding:40px 40px 36px;display:flex;flex-direction:column;gap:20px")}
    >
      ${corners()}
      <div style=${sx("display:flex;flex-direction:column;gap:2px")}>
        <div style=${sx(SCREEN_TITLE)}>${v.title}</div>
        <div style=${sx(SCREEN_SUBTITLE)}>${v.groupName}</div>
      </div>
      ${
        v.showIdentity &&
        html`<${React.Fragment}>
          <label style=${sx(FIELD)}>
            <span style=${sx(LABEL_SECTION)}>${copy.profileForm.name}</span>
            <input
              className="input"
              value=${v.name}
              onChange=${v.onName}
              placeholder=${copy.profileForm.namePlaceholder}
            />
          </label>

          <div style=${sx(FIELD)}>
            <span style=${sx(LABEL_SECTION)}>${copy.profileForm.ministryGroup}</span>
            <div style=${sx("position:relative")}>
              <input
                className="input"
                value=${v.ministryGroup}
                onChange=${v.onMinistryInput}
                onFocus=${v.onMinistryFocus}
                onBlur=${v.onMinistryBlur}
                placeholder=${copy.profileForm.ministryPlaceholder}
                style=${sx("width:100%;box-sizing:border-box")}
              />
              ${
                v.ministryOpen &&
                v.ministryMatches.length > 0 &&
                html`<div
                  style=${sx("position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:5;max-height:210px;overflow:auto;background:var(--color-bg);border:1px solid var(--color-divider)")}
                >
                  ${v.ministryMatches.map(
                    (m) =>
                      html`<button key=${m.label} onMouseDown=${m.onSelect} style=${sx(m.style)}>${m.label}</button>`,
                  )}
                </div>`
              }
            </div>
          </div>

          <div style=${sx(FIELD)}>
            <span style=${sx(LABEL_SECTION)}>${copy.profileForm.gender}</span>
            <div style=${sx("display:flex;gap:8px")}>
              ${v.genders.map(
                (g) => html`<button key=${g.label} onClick=${g.onClick} style=${sx(g.style)}>${g.label}</button>`,
              )}
            </div>
          </div>

          <label style=${sx(FIELD)}>
            <span style=${sx(LABEL_SECTION)}>${copy.profileForm.gradClass}</span>
            <input
              className="input"
              value=${v.gradClass}
              onChange=${v.onGradClass}
              placeholder=${copy.profileForm.gradClassPlaceholder}
              ...${NUMERIC_KEYBOARD}
            />
          </label>
        <//>`
      }
      ${
        v.showSharing &&
        html`<div style=${sx(SECTION + ";gap:12px")}>
          <div style=${sx(SCREEN_SUBTITLE)}>${copy.profileForm.sharing}</div>
          <div style=${sx(FIELD)}>
            <span style=${sx(LABEL_SECTION)}>${copy.profileForm.shareRanking}</span>
            <div style=${sx("display:flex;gap:8px")}>
              ${v.shareRankingOptions.map(
                (o) => html`<button key=${o.key} onClick=${o.onClick} style=${sx(o.style)}>${o.label}</button>`,
              )}
            </div>
          </div>
          <p style=${sx(`margin:0;font-size:13px;color:${muted(55)}`)}>${v.shareRankingNote}</p>
        </div>`
      }
      ${
        v.showReviewSettings &&
        html`<div style=${sx(SECTION + ";gap:20px")}>
          <div style=${sx(SCREEN_SUBTITLE)}>${copy.profileForm.reviewSettings}</div>
          <label style=${sx(FIELD)}>
            <span style=${sx(LABEL_SECTION)}>${copy.profileForm.dueFreshness}</span>
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
          <label style=${sx(FIELD)}>
            <span style=${sx(LABEL_SECTION)}>${copy.profileForm.commitThreshold}</span>
            <input
              className="input"
              type="number"
              min=${v.commitThresholdMin}
              max=${v.commitThresholdMax}
              value=${v.commitThreshold}
              onChange=${v.onCommitThreshold}
              ...${NUMERIC_KEYBOARD}
            />
          </label>
          <div style=${sx(FIELD)}>
            <span style=${sx(LABEL_SECTION)}>${copy.profileForm.difficulty}</span>
            <div style=${sx("display:flex;gap:8px")}>
              ${v.defaultDifficultyLevels.map(
                (lv) => html`<button key=${lv.key} onClick=${lv.onClick} style=${sx(lv.style)}>${lv.label}</button>`,
              )}
            </div>
          </div>
        </div>`
      }
      ${
        v.showAppearance &&
        html`<div style=${sx(SECTION + ";gap:12px")}>
          <div style=${sx(SCREEN_SUBTITLE)}>${copy.profileForm.appearance}</div>
          <div style=${sx(FIELD)}>
            <span style=${sx(LABEL_SECTION)}>${copy.profileForm.theme}</span>
            <div style=${sx("display:flex;gap:8px")}>
              ${v.themeOptions.map(
                (t) => html`<button key=${t.key} onClick=${t.onClick} style=${sx(t.style)}>${t.label}</button>`,
              )}
            </div>
          </div>
        </div>`
      }
      ${v.isSetup && html`<p style=${sx(SCREEN_BODY)}>${copy.profileForm.settingsLater}</p>`}
      ${v.showReset && resetSection(v)}

      <div style=${sx("display:flex;gap:10px;margin-top:4px")}>
        <button
          className="btn btn-primary"
          onClick=${v.onSubmit}
          disabled=${!v.complete}
          style=${sx("letter-spacing:.04em" + (v.complete ? "" : ";opacity:.6;cursor:default"))}
        >
          ${v.submitLabel}
        </button>
        ${!v.isSetup && html`<button className="btn btn-secondary" onClick=${v.onCancel}>${copy.common.cancel}</button>`}
      </div>
    </div>
    ${v.showReset && v.resetAsking && resetDialog(v)}
  </div>`;
}
