/* The review session — one card at a time.
 *
 * A shared frame (progress bar, reference, mode switch, "next") wraps whichever
 * mode panel is active. Each mode gets its own function below; they are mutually
 * exclusive, selected by the isFlip/isBlanks/isType/isScramble flags. */

import { html, sx, corners, React } from "../dom.js";
import { COLOR_ERROR, LABEL_META, LABEL_SECTION, muted } from "../ui/tokens.js";

/* Flashcard: reference only, optionally scaffolded with first letters, until
 * the member shows the text. The two buttons sit in one fixed row below the
 * card, so showing and hiding is the same control in the same place rather than
 * a button that moves when the passage appears. */
function flipPanel(v) {
  return html`<div style=${sx("display:flex;flex-direction:column;gap:26px")}>
    <div
      style=${sx("min-height:150px;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:22px 0")}
    >
      ${
        v.flipShown
          ? html`<p style=${sx("margin:0;font-size:21px;line-height:1.62;max-width:74ch")}>${v.curText}</p>`
          : v.flipLettersOn
            ? html`<p
                style=${sx("margin:0;font-size:21px;line-height:1.9;max-width:74ch;letter-spacing:.06em;font-family:var(--font-heading);color:var(--color-text)")}
              >
                ${v.flipFirstLetters}
              </p>`
            : html`<div style=${sx(`font-size:13px;color:${muted(55)};text-align:center;max-width:420px`)}>
                Say it aloud from memory, then show the passage to check yourself.
              </div>`
      }
    </div>
    <div style=${sx("display:flex;gap:10px;align-items:center;justify-content:center")}>
      <button className="btn btn-secondary" onClick=${v.toggleFlipLetters} style=${sx("min-width:170px")}>
        ${v.flipLettersLabel}
      </button>
      <button className="btn btn-primary" onClick=${v.toggleFlip} style=${sx("min-width:170px")}>
        ${v.flipToggleLabel}
      </button>
    </div>
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
    <div style=${sx(`font-size:13px;color:${muted(60)}`)}>${v.blanksResult}</div>
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
              // Nothing grades the attempt until it is submitted, so this is
              // the marked paper: the score and the passage word by word.
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
            }</${React.Fragment}
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
      ${v.scrambleMissNote && html`<div style=${sx(`font-size:13px;color:${COLOR_ERROR}`)}>${v.scrambleMissNote}</div>`}
    </div>
  </div>`;
}

/* In a learn session, what this card would take to commit the verse — said on
 * the card rather than only on the setup screen, because it is the thing the
 * sitting is for and the member is looking here, not there. */
function commitBanner(v) {
  return html`<div
    style=${sx(
      "display:flex;align-items:center;gap:12px;padding:11px 15px;font-size:13px;line-height:1.55;" +
        "border-left:3px solid " +
        (v.commitDone ? "var(--color-accent-700)" : "var(--color-divider)") +
        ";background:" +
        (v.commitDone ? "var(--color-accent-100)" : "transparent") +
        ";color:" +
        muted(70),
    )}
  >
    <span
      style=${sx("font-family:var(--font-heading);font-weight:600;letter-spacing:.08em;font-size:11px;text-transform:uppercase;flex:none")}
    >
      ${v.commitDone ? "Committed" : "To commit"}
    </span>
    <span>${v.commitNote}</span>
  </div>`;
}

/* What handing a learn card in was worth: whether it committed the verse.
 * Deliberately not the freshness strip below — a member committing a passage
 * for the first time has no use for a number that decays, and showing one
 * invites them to optimise it instead of writing the passage out. */
function learnResultStrip(v) {
  return html`<div
    key=${v.resultKey}
    style=${sx(
      "display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;border-top:1px solid var(--color-divider);padding-top:18px",
    )}
  >
    <span style=${sx(LABEL_SECTION)}>${v.resultModeName} · submitted</span>
    <span style=${sx(`font-size:13px;color:${muted(60)}`)}>${v.resultScoreLabel}</span>
    <span
      style=${sx(
        "font-size:10px;letter-spacing:.1em;text-transform:uppercase;padding:3px 9px;" +
          (v.learnResultDone
            ? "background:var(--color-accent-900);color:#f2f2f3"
            : `border:1px solid var(--color-divider);color:${muted(55)}`),
      )}
      >${v.learnResultHeadline}</span
    >
    <span style=${sx(`flex:1;min-width:220px;font-size:12px;color:${muted(55)}`)}>${v.learnResultNote}</span>
  </div>`;
}

/* What handing a review card in was worth: the mark, then the freshness it had
 * and the freshness it earned as two bars — the second animating from the first,
 * so the gain (or the loss) is something you watch happen rather than read. */
function resultStrip(v) {
  return html`<div
    key=${v.resultKey}
    style=${sx("display:flex;flex-direction:column;gap:12px;border-top:1px solid var(--color-divider);padding-top:18px")}
  >
    <div style=${sx("display:flex;align-items:baseline;gap:12px;flex-wrap:wrap")}>
      <span style=${sx(LABEL_SECTION)}>${v.resultModeName} · submitted</span>
      <span style=${sx(`font-size:13px;color:${muted(60)}`)}>${v.resultScoreLabel}</span>
      <span style=${sx(`margin-left:auto;font-size:12px;color:${muted(50)}`)}>${v.resultNote}</span>
    </div>
    <div style=${sx("display:flex;align-items:center;gap:18px")}>
      <div style=${sx("flex:1;display:flex;flex-direction:column;gap:7px;max-width:520px")}>
        <div style=${sx("display:flex;align-items:center;gap:12px")}>
          <span style=${sx(`font-size:11px;letter-spacing:.1em;text-transform:uppercase;width:44px;color:${muted(50)}`)}
            >Was</span
          >
          <div style=${sx("flex:1;height:9px;background:var(--color-fresh-track);overflow:hidden")}>
            <div style=${sx(v.resultBeforeBar)}></div>
          </div>
          <span style=${sx(`font-size:13px;width:44px;text-align:right;color:${muted(55)}`)}
            >${v.resultBeforeLabel}</span
          >
        </div>
        <div style=${sx("display:flex;align-items:center;gap:12px")}>
          <span style=${sx("font-size:11px;letter-spacing:.1em;text-transform:uppercase;width:44px")}>Now</span>
          <div style=${sx("flex:1;height:9px;background:var(--color-fresh-track);overflow:hidden")}>
            <div className="fresh-fill" style=${sx(v.resultAfterBar)}></div>
          </div>
          <span style=${sx("font-size:13px;font-weight:600;width:44px;text-align:right")}>${v.resultAfterLabel}</span>
        </div>
      </div>
      <div className="fresh-delta" style=${sx(v.resultDriftStyle)}>${v.resultDriftLabel}</div>
    </div>
  </div>`;
}

/* Leaving mid-session drops the rest of the queue, so it is asked about — the
 * same dialog Test mode uses (see views/exam.js). */
function leaveDialog(v) {
  return html`<div className="dialog-backdrop" onClick=${v.reviewLeaveCancel} style=${sx("z-index:30")}>
    <div className="dialog blueprint" onClick=${(e) => e.stopPropagation()} style=${sx("background:var(--color-bg)")}>
      ${corners()}
      <div className="dialog-title">Leave the session?</div>
      <div className="dialog-body">${v.reviewLeaveNote}</div>
      <div className="dialog-actions">
        <button className="btn btn-secondary" onClick=${v.reviewLeaveCancel}>Keep going</button>
        <button className="btn btn-primary" onClick=${v.reviewLeaveConfirm}>Leave the session</button>
      </div>
    </div>
  </div>`;
}

/* Walking off a card without submitting records nothing at all and throws the
 * attempt away, which is easy to do by accident and impossible to notice
 * afterwards. Forwards or back, the loss is the same, so both are asked. */
function moveDialog(v) {
  return html`<div className="dialog-backdrop" onClick=${v.reviewMoveCancel} style=${sx("z-index:30")}>
    <div className="dialog blueprint" onClick=${(e) => e.stopPropagation()} style=${sx("background:var(--color-bg)")}>
      ${corners()}
      <div className="dialog-title">${v.reviewMoveTitle}</div>
      <div className="dialog-body">${v.moveNote}</div>
      <div className="dialog-actions">
        <button className="btn btn-secondary" onClick=${v.reviewMoveCancel}>Stay on this passage</button>
        <button className="btn btn-primary" onClick=${v.reviewMoveConfirm}>${v.reviewMoveConfirmLabel}</button>
      </div>
    </div>
  </div>`;
}

export function reviewView(v) {
  return html`<div
    style=${sx("max-width:1000px;margin:0 auto;padding:36px 36px 80px;display:flex;flex-direction:column;gap:22px")}
  >
    <div style=${sx("display:flex;align-items:center;gap:16px")}>
      <button className="btn btn-secondary" onClick=${v.askLeaveReview} style=${sx("font-size:12px;padding:4px 12px")}>
        Leave session
      </button>
      <div style=${sx(LABEL_SECTION)}>${v.sessionLabel} · ${v.modeName} · ${v.posLabel}</div>
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
        ${
          !v.isFlip &&
          html`<div style=${sx("margin-left:auto;display:flex;align-items:baseline;gap:10px")}>
            <span style=${sx(`font-size:12px;color:${v.peekSpent ? COLOR_ERROR : muted(50)}`)}>${v.peekNote}</span>
            <button
              className="btn btn-ghost"
              onMouseDown=${v.peekOn}
              onMouseUp=${v.peekOff}
              onMouseLeave=${v.peekOff}
              onTouchStart=${v.peekOn}
              onTouchEnd=${v.peekOff}
              style=${sx("font-size:12px;user-select:none;touch-action:none")}
            >
              ${v.helpLabel}
            </button>
          </div>`
        }
      </div>

      ${v.isLearn && commitBanner(v)} ${v.isFlip && flipPanel(v)} ${v.isBlanks && blanksPanel(v)}
      ${v.isType && typePanel(v)} ${v.isScramble && scramblePanel(v)}
      ${v.showHelp && html`<div style=${sx(`border-left:2px solid var(--color-accent);padding:4px 0 4px 16px;font-size:15px;line-height:1.65;color:${muted(70)};max-width:74ch`)}>${v.curText}</div>`}
      ${v.resultShown && (v.isLearn ? learnResultStrip(v) : resultStrip(v))}

      <div
        style=${sx("margin-top:auto;display:flex;gap:12px;align-items:center;border-top:1px solid var(--color-divider);padding-top:20px")}
      >
        <button className="btn btn-secondary" onClick=${v.goPrev} disabled=${!v.canGoBack}>Previous</button>
        ${
          v.canSubmit &&
          html`<button className="btn btn-primary" onClick=${v.submit} disabled=${v.submitDone}>
            ${v.submitLabel}
          </button>`
        }
        <button className=${v.canSubmit ? "btn btn-secondary" : "btn btn-primary"} onClick=${v.goNext}>
          ${v.nextLabel}
        </button>
        <div style=${sx(`margin-left:auto;font-size:12px;color:${muted(50)}`)}>${v.stakeLabel}</div>
      </div>
    </div>
    ${v.reviewLeaveAsk && leaveDialog(v)} ${v.reviewMoveAsk && moveDialog(v)}
  </div>`;
}
