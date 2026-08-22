/* Run mode — big simple controls, readable at arm's length on a run:
 * preset, BPM, one Start/Stop, the verse being called out in large type,
 * and the running playlist below. */

import { html, sx } from "../dom.js";
import { CONTROL_ROW, LABEL_SECTION, muted } from "../ui/tokens.js";

export function runView(v) {
  return html`<div
    className="screen"
    style=${sx("max-width:820px;margin:0 auto;padding:40px 36px 80px;display:flex;flex-direction:column;gap:26px")}
  >
    <div>
      <h2 style=${sx("margin:0")}>${v.runTitle}</h2>
      <div style=${sx(`font-size:13px;color:${muted(55)};margin-top:4px`)}>${v.runBlurb}</div>
    </div>

    ${!v.runSupported && html`<div style=${sx(`font-size:13px;color:${muted(60)}`)}>${v.runUnsupportedNote}</div>`}
    ${
      v.runSupported &&
      html`<div style=${sx("display:flex;flex-direction:column;gap:18px")}>
        <div style=${sx(CONTROL_ROW)}>
          <span style=${sx(LABEL_SECTION)}>${v.runPresetLabel}</span>
          ${v.runPresets.map(
            (p) =>
              html`<button key=${p.key} className="seg-btn" onClick=${p.onClick} style=${sx(p.style)}>
                ${p.label}
              </button>`,
          )}
        </div>
        <div style=${sx(CONTROL_ROW)}>
          <span style=${sx(LABEL_SECTION)}>${v.runBpmLabel}</span>
          <button className="btn btn-secondary" onClick=${v.runBpmDown} style=${sx("padding:6px 14px")}>−</button>
          <span
            style=${sx("font-family:var(--font-heading);font-weight:600;font-size:20px;min-width:52px;text-align:center")}
            >${v.runBpm}</span
          >
          <button className="btn btn-secondary" onClick=${v.runBpmUp} style=${sx("padding:6px 14px")}>+</button>
        </div>
        <div>
          <button
            className=${v.runPlaying ? "btn btn-secondary" : "btn btn-primary"}
            onClick=${v.runToggle}
            style=${sx("font-size:18px;padding:14px 40px;letter-spacing:.08em")}
          >
            ${v.runToggleLabel}
          </button>
        </div>
        <div className="run-callout" style=${sx("min-height:140px;padding:24px;border:1px solid var(--color-divider)")}>
          ${
            v.runPlaying && v.runNowRef
              ? html`<div>
                  <div style=${sx(LABEL_SECTION)}>${v.runNowRef}</div>
                  <div style=${sx("font-size:24px;line-height:1.5;margin-top:10px")}>${v.runNowText}</div>
                </div>`
              : html`<div style=${sx(`font-size:14px;color:${muted(55)}`)}>${v.runIdleNote}</div>`
          }
        </div>
      </div>`
    }

    <div style=${sx("display:flex;flex-direction:column;gap:10px")}>
      <div style=${sx(LABEL_SECTION)}>${v.runPlaylistTitle}</div>
      <a
        href=${v.runPlaylistPinnedUrl}
        target="_blank"
        rel="noreferrer"
        style=${sx("font-size:14px;color:var(--color-accent)")}
        >${v.runPlaylistPinnedLabel}</a
      >
      ${v.runPlaylist.map(
        (s) =>
          html`<a
            key=${s.url}
            href=${s.url}
            target="_blank"
            rel="noreferrer"
            style=${sx("font-size:14px;color:var(--color-text)")}
            >${s.title} — ${s.artist}${s.ref ? html` <span style=${sx(`color:${muted(50)}`)}>(${s.ref})</span>` : ""}</a
          >`,
      )}
    </div>
  </div>`;
}
