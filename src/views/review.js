/* The review session — one card at a time.
 *
 * A shared frame (progress bar, reference, mode switch, "next") wraps whichever
 * mode panel is active. Each mode gets its own function below; they are mutually
 * exclusive, selected by the isFlip/isBlanks/isType/isScramble flags. */

import { html, sx, corners, React } from "../dom.js";
import { LABEL_META, LABEL_SECTION, muted } from "../ui/tokens.js";

/* Flashcard: reference only, optionally scaffolded with first letters, until
 * the member reveals the text. */
function flipPanel(v) {
  return html`<div style=${sx("display:flex;flex-direction:column;gap:26px")}>
    ${
      v.flipHidden &&
      html`<div style=${sx("display:flex;flex-direction:column;align-items:center;gap:18px;padding:44px 0")}>
        ${
          v.flipLettersOn
            ? html`<p
                style=${sx("margin:0;font-size:21px;line-height:1.9;max-width:74ch;letter-spacing:.06em;font-family:var(--font-heading);color:var(--color-text)")}
              >
                ${v.flipFirstLetters}
              </p>`
            : html`<div style=${sx(`font-size:13px;color:${muted(55)};text-align:center;max-width:420px`)}>
                Say it aloud from memory, then reveal to check yourself.
              </div>`
        }
        <div style=${sx("display:flex;gap:10px;align-items:center")}>
          <button className="btn btn-secondary" onClick=${v.toggleFlipLetters}>
            ${v.flipLettersOn ? "Hide first letters" : "Show first letters"}
          </button>
          <button className="btn btn-primary" onClick=${v.reveal}>Reveal the passage</button>
        </div>
      </div>`
    }
    ${
      v.flipShown &&
      html`<div style=${sx("display:flex;flex-direction:column;gap:22px")}>
        <p style=${sx("margin:0;font-size:21px;line-height:1.62;max-width:74ch")}>${v.curText}</p>
        <div><button className="btn btn-secondary" onClick=${v.hide}>Hide the passage</button></div>
      </div>`
    }
  </div>`;
}

/* Fill the blanks: the passage with its key words replaced by inputs. */
function blanksPanel(v) {
  return html`<div style=${sx("display:flex;flex-direction:column;gap:20px")}>
    <div style=${sx("display:flex;align-items:center;gap:10px;flex-wrap:wrap")}>
      <span style=${sx(LABEL_SECTION)}>Blanks</span>
      <div style=${sx("display:flex;gap:6px")}>
        ${v.blankLevels.map((lv) => html`<button key=${lv.key} onClick=${lv.onClick} style=${sx(lv.style)}>${lv.label}</button>`)}
      </div>
      <span style=${sx(`font-size:12px;color:${muted(55)}`)}>${v.blankLevelDesc}</span>
      <span style=${sx("width:1px;height:20px;background:var(--color-divider);margin:0 4px")}></span>
      <span style=${sx(LABEL_SECTION)}>First letter</span>
      <button onClick=${v.toggleBlankHint} style=${sx(v.blankHintStyle)}>${v.blankHintOn ? "On" : "Off"}</button>
    </div>
    <div
      style=${sx("font-size:21px;line-height:2.1;max-width:74ch;display:flex;flex-wrap:wrap;gap:0 7px;align-items:baseline")}
    >
      ${v.blankWords.map(
        (w, i) =>
          html` <span key=${i} style=${sx(w.wrapStyle)}
            >${
              w.isBlank
                ? html`<input
                    id=${w.id}
                    value=${w.value}
                    onChange=${w.onChange}
                    onKeyDown=${w.onKeyDown}
                    placeholder=${w.hint}
                    style=${sx(w.inputStyle)}
                  />`
                : w.word
            }</span
          >`,
      )}
    </div>
    <div style=${sx("display:flex;gap:10px;align-items:center")}>
      <button className="btn btn-primary" onClick=${v.checkBlanks}>Check</button>
      <div style=${sx(`font-size:13px;color:${muted(60)}`)}>${v.blanksResult}</div>
    </div>
  </div>`;
}

/* Write it out: free recall, graded word by word. In first-letter mode it is a
 * live drill — the reveal updates as you type, with no separate grade step. */
function typePanel(v) {
  return html`<div style=${sx("display:flex;flex-direction:column;gap:18px")}>
    <div style=${sx("display:flex;align-items:center;gap:10px;flex-wrap:wrap")}>
      <span style=${sx(LABEL_SECTION)}>First letters only</span>
      <button onClick=${v.toggleTypeFirstLetter} style=${sx(v.typeFirstLetterStyle)}>
        ${v.typeFirstLetterOn ? "On" : "Off"}
      </button>
      <span style=${sx(`font-size:12px;color:${muted(55)}`)}
        >Type just the first letter of each word instead of the whole passage.</span
      >
    </div>
    ${
      v.typeLive
        ? html`<${React.Fragment}
            ><textarea
              className="input"
              value=${v.typed}
              onChange=${v.onTyped}
              placeholder=${v.typePlaceholder}
              style=${sx("min-height:90px;font-size:19px;line-height:1.9;letter-spacing:.35em")}
            ></textarea>
            <div style=${sx("display:flex;align-items:baseline;gap:12px")}>
              <div style=${sx("font-family:var(--font-heading);font-weight:600;font-size:34px;line-height:1")}>
                ${v.typeRevealScore}
              </div>
              <div style=${sx(`font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:${muted(55)}`)}>
                words revealed
              </div>
            </div>
            <div style=${sx("font-size:21px;line-height:2;max-width:74ch;display:flex;flex-wrap:wrap;gap:0 8px")}>
              ${v.typeReveal.map((r, i) => html`<span key=${i} style=${sx(r.style)}>${r.text}</span>`)}
            </div></${React.Fragment}
          >`
        : html`<${React.Fragment}
            >${v.typeUngraded && html`<textarea className="input" value=${v.typed} onChange=${v.onTyped} placeholder=${v.typePlaceholder} style=${sx("min-height:210px;font-size:17px;line-height:1.7")}></textarea>`}
            ${
              v.typeGraded &&
              html`<div style=${sx("display:flex;flex-direction:column;gap:16px")}>
                <div style=${sx("display:flex;align-items:baseline;gap:12px")}>
                  <div style=${sx("font-family:var(--font-heading);font-weight:600;font-size:52px;line-height:1")}>
                    ${v.typeScore}
                  </div>
                  <div style=${sx(`font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:${muted(55)}`)}>
                    words matched
                  </div>
                </div>
                <div style=${sx("font-size:19px;line-height:1.8;max-width:74ch;display:flex;flex-wrap:wrap;gap:0 7px")}>
                  ${v.typeDiff.map((d, i) => html`<span key=${i} style=${sx(d.style)}>${d.word}</span>`)}
                </div>
              </div>`
            }
            <div style=${sx("display:flex;gap:10px")}>
              <button className="btn btn-primary" onClick=${v.checkTyped}>${v.typeButtonLabel}</button>
            </div></${React.Fragment}
          >`
    }
  </div>`;
}

/* Order the phrases: the passage cut into chunks, rebuilt by clicking them in
 * sequence. */
function scramblePanel(v) {
  return html`<div style=${sx("display:flex;flex-direction:column;gap:22px")}>
    <div style=${sx("display:flex;align-items:center;gap:10px;flex-wrap:wrap")}>
      <span style=${sx(LABEL_SECTION)}>Granularity</span>
      <div style=${sx("display:flex;gap:6px")}>
        ${v.scrambleLevels.map((lv) => html`<button key=${lv.key} onClick=${lv.onClick} style=${sx(lv.style)}>${lv.label}</button>`)}
      </div>
      <span style=${sx(`font-size:12px;color:${muted(55)}`)}>${v.scrambleLevelDesc}</span>
    </div>
    <div
      style=${sx("min-height:96px;border:1px dashed var(--color-divider);padding:16px 18px;font-size:19px;line-height:1.65;color:var(--color-text)")}
    >
      ${v.scrambleEmpty && html`<span style=${sx(`font-size:13px;color:${muted(45)}`)}>Click the phrases below in the right order.</span>`}
      ${" " + v.scrambleBuilt}
    </div>
    <div style=${sx("display:flex;flex-wrap:wrap;gap:10px")}>
      ${v.scrambleChunks.map((c) => html`<button key=${c.key} onClick=${c.onClick} style=${sx(c.style)}>${c.text}</button>`)}
    </div>
    <div style=${sx("display:flex;gap:10px;align-items:center")}>
      <button className="btn btn-secondary" onClick=${v.resetScramble} style=${sx("font-size:12px;padding:4px 12px")}>
        Start over
      </button>
      <div style=${sx(`font-size:13px;color:${muted(60)}`)}>${v.scrambleResult}</div>
    </div>
  </div>`;
}

export function reviewView(v) {
  return html`<div
    style=${sx("max-width:1000px;margin:0 auto;padding:36px 36px 80px;display:flex;flex-direction:column;gap:22px")}
  >
    <div style=${sx("display:flex;align-items:center;gap:16px")}>
      <button className="btn btn-secondary" onClick=${v.endSession} style=${sx("font-size:12px;padding:4px 12px")}>
        Leave session
      </button>
      <div style=${sx(LABEL_SECTION)}>${v.modeName} · ${v.posLabel}</div>
      <div style=${sx("margin-left:auto;display:flex;gap:6px")}>
        ${v.modeSwitch.map((m) => html`<button key=${m.key} onClick=${m.onClick} style=${sx(m.style)}>${m.short}</button>`)}
      </div>
    </div>

    <div style=${sx("height:4px;background:var(--color-neutral-200)")}>
      <div style=${sx(v.sessionBarStyle)}></div>
    </div>

    <div
      className="blueprint"
      style=${sx("padding:40px 44px;display:flex;flex-direction:column;gap:26px;min-height:400px")}
    >
      ${corners()}

      <div
        style=${sx("display:flex;align-items:baseline;gap:14px;border-bottom:1px solid var(--color-divider);padding-bottom:14px")}
      >
        <h2 style=${sx("margin:0")}>${v.curRef}</h2>
        <div style=${sx(LABEL_META)}>${v.curMeta}</div>
        ${!v.isFlip && html`<button className="btn btn-ghost" onMouseDown=${v.peekOn} onMouseUp=${v.peekOff} onMouseLeave=${v.peekOff} onTouchStart=${v.peekOn} onTouchEnd=${v.peekOff} style=${sx("margin-left:auto;font-size:12px;user-select:none;touch-action:none")}>${v.helpLabel}</button>`}
      </div>

      ${v.isFlip && flipPanel(v)} ${v.isBlanks && blanksPanel(v)} ${v.isType && typePanel(v)}
      ${v.isScramble && scramblePanel(v)}
      ${v.showHelp && html`<div style=${sx(`border-left:2px solid var(--color-accent);padding:4px 0 4px 16px;font-size:15px;line-height:1.65;color:${muted(70)};max-width:74ch`)}>${v.curText}</div>`}

      <div
        style=${sx("margin-top:auto;display:flex;gap:12px;align-items:center;border-top:1px solid var(--color-divider);padding-top:20px")}
      >
        <button className="btn btn-primary" onClick=${v.advance}>Done — next passage</button>
        <div style=${sx(`margin-left:auto;font-size:12px;color:${muted(50)}`)}>${v.curProgressNote}</div>
      </div>
    </div>
  </div>`;
}
