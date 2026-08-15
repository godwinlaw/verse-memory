/* A test in progress — one question at a time.
 *
 * The frame mirrors the review session (progress bar, card, advance button) so
 * the app doesn't feel like two apps, but nothing here reveals an answer: there
 * is no peek, no mode switch, and no mark until the paper is done. Each activity
 * gets its own panel below, selected by the qIs* flags. */

import { html, sx, corners } from "../dom.js";
import { LABEL_SECTION, muted } from "../ui/tokens.js";

/* The quoted scripture a question turns on. */
const QUOTE = "margin:0;font-size:21px;line-height:1.7;max-width:70ch";

/* Name the passage: a piece of a verse, and a box for the reference. */
function namePanel(v) {
  return html`<div style=${sx("display:flex;flex-direction:column;gap:22px")}>
    <p style=${sx(QUOTE)}>“${v.qPrompt}”</p>
    <div style=${sx("display:flex;flex-direction:column;gap:8px;max-width:340px")}>
      <span style=${sx(LABEL_SECTION)}>Where is it from?</span>
      <input className="input" value=${v.qTyped} onChange=${v.onQTyped} placeholder=${v.qPlaceholder} />
      <span style=${sx(`font-size:12px;line-height:1.5;color:${muted(55)}`)}>${v.qHint}</span>
    </div>
  </div>`;
}

/* Pick the reference: the same question, made recognition rather than recall. */
function pickPanel(v) {
  return html`<div style=${sx("display:flex;flex-direction:column;gap:22px")}>
    <p style=${sx(QUOTE)}>“${v.qPrompt}”</p>
    <div style=${sx("display:flex;flex-direction:column;gap:8px;max-width:420px")}>
      ${v.qOptions.map(
        (o) =>
          html` <button key=${o.key} onClick=${o.onClick} style=${sx(o.style)}>
            <span style=${sx(o.markStyle)}></span>${o.label}
          </button>`,
      )}
    </div>
  </div>`;
}

/* Finish the sentence: the lead-in, free recall of the rest, and where it is
 * from — the reference is a quarter of this question's mark. */
function finishPanel(v) {
  return html`<div style=${sx("display:flex;flex-direction:column;gap:20px")}>
    <p style=${sx(QUOTE)}>${v.qLead}<span style=${sx(`color:${muted(45)}`)}> …</span></p>
    <textarea
      className="input"
      value=${v.qTyped}
      onChange=${v.onQTyped}
      placeholder=${v.qPlaceholder}
      style=${sx("min-height:120px;font-size:17px;line-height:1.7")}
    ></textarea>
    <span style=${sx(`font-size:12px;color:${muted(55)}`)}>${v.qHint}</span>
    <div style=${sx("display:flex;flex-direction:column;gap:8px;max-width:340px")}>
      <span style=${sx(LABEL_SECTION)}>${v.qRefLabel}</span>
      <input className="input" value=${v.qRefTyped} onChange=${v.onQRefTyped} placeholder=${v.qRefPlaceholder} />
      <span style=${sx(`font-size:12px;line-height:1.5;color:${muted(55)}`)}>${v.qRefHint}</span>
    </div>
  </div>`;
}

/* Leaving mid-paper throws the whole sitting away, so it is asked about. The
 * backdrop sits above the sticky header (z-index 20) and dismisses on a click
 * outside the box, which is why the box stops the click from reaching it. */
function leaveDialog(v) {
  return html`<div className="dialog-backdrop" onClick=${v.examLeaveCancel} style=${sx("z-index:30")}>
    <div className="dialog blueprint" onClick=${(e) => e.stopPropagation()} style=${sx("background:var(--color-bg)")}>
      ${corners()}
      <div className="dialog-title">Leave the test?</div>
      <div className="dialog-body">
        Nothing you have answered will be marked, and no verse's freshness will change. Any progress in this test will
        not be saved.
      </div>
      <div className="dialog-actions">
        <button className="btn btn-secondary" onClick=${v.examLeaveCancel}>Keep going</button>
        <button className="btn btn-primary" onClick=${v.examLeaveConfirm}>Leave the test</button>
      </div>
    </div>
  </div>`;
}

/* Match verse to reference: verses down the left, references down the right,
 * paired a click at a time. */
function matchPanel(v) {
  return html`<div style=${sx("display:flex;flex-direction:column;gap:18px")}>
    <div style=${sx(`font-size:13px;color:${muted(60)}`)}>${v.qMatchNote}</div>
    <div style=${sx("display:grid;grid-template-columns:1.6fr 1fr;gap:18px;align-items:start")}>
      <div style=${sx("display:flex;flex-direction:column;gap:10px")}>
        ${v.qVerses.map(
          (verse) =>
            html` <button key=${verse.key} onClick=${verse.onClick} style=${sx(verse.style)}>
              <div>${verse.text}</div>
              <div style=${sx("margin-top:8px;" + verse.filedStyle)}>${verse.filedLabel}</div>
            </button>`,
        )}
      </div>
      <div style=${sx("display:flex;flex-direction:column;gap:10px")}>
        ${v.qRefs.map((r) => html`<button key=${r.key} onClick=${r.onClick} style=${sx(r.style)}>${r.label}</button>`)}
      </div>
    </div>
  </div>`;
}

/* Order the phrases */
function scramblePanel(v) {
  return html`<div style=${sx("display:flex;flex-direction:column;gap:22px")}>
    <div
      style=${sx("min-height:96px;border:1px dashed var(--color-divider);padding:16px 18px;font-size:19px;line-height:1.65;color:var(--color-text)")}
    >
      ${v.qScrambleEmpty && html`<span style=${sx(`font-size:13px;color:${muted(45)}`)}>Click the phrases below in the right order.</span>`}
      ${" " + v.qScrambleBuilt}
    </div>
    <div style=${sx("display:flex;flex-wrap:wrap;gap:10px")}>
      ${v.qScrambleChunks.map((c) => html`<button key=${c.key} onClick=${c.onClick} style=${sx(c.style)}>${c.text}</button>`)}
    </div>
    <div style=${sx("display:flex;gap:10px;align-items:center")}>
      <button className="btn btn-secondary" onClick=${v.resetScramble} style=${sx("font-size:12px;padding:4px 12px")}>
        Start over
      </button>
    </div>
  </div>`;
}

/* Fill the blanks */
function blanksPanel(v) {
  return html`<div style=${sx("display:flex;flex-direction:column;gap:20px")}>
    <div
      style=${sx("font-size:21px;line-height:2.1;max-width:74ch;display:flex;flex-wrap:wrap;gap:0 7px;align-items:baseline")}
    >
      ${v.qBlankWords.map(
        (w, i) =>
          html` <span key=${i} style=${sx(w.wrapStyle)}
            >${
              w.isBlank
                ? html`<input
                    id=${w.id}
                    value=${w.value}
                    onChange=${w.onChange}
                    style=${sx(w.inputStyle)}
                  />`
                : w.word
            }</span
          >`,
      )}
    </div>
  </div>`;
}

/* Write it out */
function typePanel(v) {
  return html`<div style=${sx("display:flex;flex-direction:column;gap:18px")}>
    <textarea
      className="input"
      value=${v.qTyped}
      onChange=${v.onQTyped}
      placeholder=${v.qPlaceholder}
      style=${sx("min-height:210px;font-size:17px;line-height:1.7")}
    ></textarea>
  </div>`;
}

export function examView(v) {
  return html`<div
    style=${sx("max-width:1000px;margin:0 auto;padding:36px 36px 80px;display:flex;flex-direction:column;gap:22px")}
  >
    <div style=${sx("display:flex;align-items:center;gap:16px")}>
      <button className="btn btn-secondary" onClick=${v.examLeave} style=${sx("font-size:12px;padding:4px 12px")}>
        Leave the test
      </button>
      <div style=${sx(LABEL_SECTION)}>${v.examActivityName} · ${v.examPosLabel}</div>
      <div style=${sx(`margin-left:auto;font-size:12px;color:${muted(50)}`)}>Marked at the end. No peeking.</div>
    </div>

    <div style=${sx("height:4px;background:var(--color-neutral-200)")}>
      <div style=${sx(v.examBarStyle)}></div>
    </div>

    <div
      className="blueprint"
      style=${sx("padding:40px 44px;display:flex;flex-direction:column;gap:26px;min-height:400px")}
    >
      ${corners()} ${v.qIsName && namePanel(v)} ${v.qIsPick && pickPanel(v)} ${v.qIsFinish && finishPanel(v)}
      ${v.qIsMatch && matchPanel(v)} ${v.qIsScramble && scramblePanel(v)} ${v.qIsBlanks && blanksPanel(v)}
      ${v.qIsType && typePanel(v)}

      <div
        style=${sx("margin-top:auto;display:flex;gap:12px;align-items:center;border-top:1px solid var(--color-divider);padding-top:20px")}
      >
        <button className="btn btn-secondary" onClick=${v.examBack} disabled=${!v.examCanGoBack}>Back</button>
        <button className="btn btn-primary" onClick=${v.examNext}>${v.examNextLabel}</button>
      </div>
    </div>
    ${v.examLeaveAsk && leaveDialog(v)}
  </div>`;
}
