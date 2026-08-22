/* Drive mode: the hands-free screen.
 *
 * Built to be glanced at from a car dashboard, not worked: the reference and
 * the score are set very large and high-contrast, and once the session runs
 * the only control on offer is Stop. Everything else — mode, queue, start —
 * is chosen before the first press. */

import { html, sx } from "../dom.js";
import { CALLOUT_ERROR, LABEL_SECTION, SCREEN_TITLE, muted, segButton } from "../ui/tokens.js";

const FIELD = "display:flex;flex-direction:column;gap:9px";
const BIG_REF = "font-family:var(--font-heading);font-weight:600;font-size:52px;letter-spacing:.02em;line-height:1.1";
const BIG_SCORE = "font-family:var(--font-heading);font-weight:600;font-size:40px";

export function driveView(v) {
  return html`<div className="screen" style=${sx("max-width:760px;margin:0 auto;padding:34px 22px 60px")}>
    <div style=${sx("display:flex;flex-direction:column;gap:8px;margin-bottom:26px")}>
      <div style=${sx(SCREEN_TITLE)}>${v.driveTitle}</div>
      <p style=${sx(`margin:0;font-size:14px;line-height:1.6;color:${muted(70)}`)}>${v.driveLead}</p>
      <p style=${sx(`margin:0;font-size:12px;color:${muted(55)}`)}>${v.drivePracticeNote}</p>
    </div>

    ${!v.driveSupported && html`<p style=${sx(`font-size:14px;color:${muted(70)}`)}>${v.driveUnsupported}</p>`}
    ${
      v.driveSupported &&
      !v.driveRunning &&
      html`<div style=${sx("display:flex;flex-direction:column;gap:22px")}>
        <div style=${sx(FIELD)}>
          <span style=${sx(LABEL_SECTION)}>${v.driveModeLabel}</span>
          <div style=${sx("display:flex;gap:8px")}>
            ${v.driveModes.map(
              (m) =>
                html`<button key=${m.key} className="seg-btn" onClick=${m.onClick} style=${sx(segButton(m.active))}>
                  ${m.label}
                </button>`,
            )}
          </div>
        </div>
        <div style=${sx(FIELD)}>
          <span style=${sx(LABEL_SECTION)}>${v.driveSourceLabel}</span>
          <div style=${sx("display:flex;gap:8px")}>
            ${v.driveSources.map(
              (s) =>
                html`<button key=${s.key} className="seg-btn" onClick=${s.onClick} style=${sx(segButton(s.active))}>
                  ${s.label}
                </button>`,
            )}
          </div>
          <span style=${sx(`font-size:12px;color:${muted(55)}`)}>${v.driveQueueLabel}</span>
        </div>
        ${v.driveEmpty && html`<p style=${sx(`margin:0;font-size:14px;color:${muted(70)}`)}>${v.driveEmpty}</p>`}
        ${v.driveError && html`<p role="status" style=${sx(`margin:0;${CALLOUT_ERROR}`)}>${v.driveError}</p>`}
        ${
          !v.driveEmpty &&
          html`<div>
            <button
              className="btn btn-primary"
              onClick=${v.onDriveStart}
              style=${sx("font-size:16px;padding:12px 22px")}
            >
              ${v.driveStartLabel}
            </button>
          </div>`
        }
      </div>`
    }
    ${
      v.driveSupported &&
      v.driveRunning &&
      html`<div style=${sx("display:flex;flex-direction:column;gap:26px;align-items:flex-start")}>
        <div style=${sx("display:flex;align-items:center;gap:10px")}>
          <span style=${sx(LABEL_SECTION)}>${v.drivePhaseLabel}</span>
          ${v.driveListening && html`<span className="mic-dot" />`}
        </div>
        <div style=${sx(BIG_REF)}>${v.driveRef}</div>
        ${
          v.driveScoreLabel &&
          html`<div style=${sx("display:flex;flex-direction:column;gap:8px")}>
            <div style=${sx(BIG_SCORE)}>${v.driveScoreLabel}</div>
            ${v.driveMissed && html`<div style=${sx(`font-size:14px;color:${muted(65)}`)}>${v.driveMissed}</div>`}
            ${v.drivePerVerse.map((line, i) => html`<div key=${i} style=${sx("font-size:15px")}>${line}</div>`)}
          </div>`
        }
        <button className="btn btn-secondary" onClick=${v.onDriveStop} style=${sx("font-size:15px;padding:10px 20px")}>
          ${v.driveStopLabel}
        </button>
      </div>`
    }
  </div>`;
}
