/* The review session — one card at a time.
 *
 * A shared frame (progress bar, reference, mode switch, "next") wraps whichever
 * mode panel is active. Each mode gets its own function below; they are mutually
 * exclusive, selected by the isFlip/isBlanks/isType/isScramble flags. */

import { copy } from "../copy.js";
import { html, sx, corners, React } from "../dom.js";
import { COLOR_ERROR, CONTROL_ROW, LABEL_META, LABEL_SECTION, muted } from "../ui/tokens.js";

/* Flashcard: a real two-sided card (styles.css, the two-sided card — the guide
 * demonstrates this same component). The reference is on the front and the
 * passage on the back, and the card turns over rather than swapping its
 * contents, so the member can see which way round they are.
 *
 * The first-letter scaffold stands in for the passage rather than sitting beside
 * it, so it is on the back too, in the passage's place: the back of the card is
 * the answer, at whichever strength was asked for. The front is the reference
 * either way.
 *
 * The two buttons sit in one fixed row below the card, so showing and hiding is
 * the same control in the same place rather than a button that moves when the
 * passage appears. Each turns the card to its own side of that pair and reads
 * Show or Hide by what is actually on screen (App.revealFlipSide), so a press is
 * never a state change the member cannot see. Clicking the card turns it too,
 * but it is deliberately not a tab stop of its own: "Show passage" below it is a
 * real button that already does exactly this, and a second one would only be a
 * duplicate stop reading out the same thing. */
function flipPanel(v) {
  return html`<div style=${sx("display:flex;flex-direction:column;gap:26px")}>
    <div
      className=${"flip-card" + (v.flipShown ? " is-flipped" : "")}
      title=${v.flipCardLabel}
      onClick=${v.turnCard}
      style=${sx("width:100%;max-width:720px;margin:0 auto;cursor:pointer")}
    >
      <div className="flip-card-inner" style=${sx("min-height:196px")}>
        <div className="flip-card-face" aria-hidden=${v.flipShown}>
          <div style=${sx(LABEL_META)}>${v.flipFrontLabel}</div>
          <div style=${sx("font-size:34px;line-height:1.15")}>${v.curRef}</div>
          <div
            style=${sx(`font-size:13px;font-family:var(--font-body);font-weight:400;color:${muted(55)};max-width:44ch`)}
          >
            ${v.flipHint}
          </div>
        </div>
        <div className="flip-card-face flip-card-back" aria-hidden=${!v.flipShown}>
          <div style=${sx(LABEL_META + ";font-family:var(--font-heading)")}>${v.curRef}</div>
          ${
            v.flipLettersOn
              ? html`<p
                  style=${sx(`margin:0;font-size:19px;line-height:1.9;max-width:74ch;letter-spacing:.06em;color:${muted(75)}`)}
                >
                  ${v.flipFirstLetters}
                </p>`
              : html`<p style=${sx("margin:0;font-size:21px;line-height:1.62;max-width:74ch")}>${v.curText}</p>`
          }
        </div>
      </div>
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
    <div style=${sx(CONTROL_ROW)}>
      <span style=${sx(LABEL_SECTION)}>${copy.review.blanksLabel}</span>
      <div style=${sx("display:flex;gap:6px")}>
        ${v.blankLevels.map((lv) => html`<button key=${lv.key} className="seg-btn" onClick=${lv.onClick} style=${sx(lv.style)}>${lv.label}</button>`)}
      </div>
      <span style=${sx(`font-size:12px;color:${muted(55)}`)}>${v.blankLevelDesc}</span>
      ${
        v.blankParityShown &&
        html`<${React.Fragment}
          ><span style=${sx("width:1px;height:20px;background:var(--color-divider);margin:0 4px")}></span>
          <span style=${sx(LABEL_SECTION)}>${copy.review.blanksParityLabel}</span>
          <div style=${sx("display:flex;gap:6px")}>
            ${v.blankParities.map(
              (pt) =>
                html`<button key=${pt.key} className="seg-btn" onClick=${pt.onClick} style=${sx(pt.style)}>
                  ${pt.label}
                </button>`,
            )}
          </div></${React.Fragment}
        >`
      }
      <span style=${sx("width:1px;height:20px;background:var(--color-divider);margin:0 4px")}></span>
      <span style=${sx(LABEL_SECTION)}>${copy.review.blanksFirstLetter}</span>
      <button className="seg-btn" onClick=${v.toggleBlankHint} style=${sx(v.blankHintStyle)}>
        ${v.blankHintOn ? copy.common.on : copy.common.off}
      </button>
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
                    className="blank-input"
                    value=${w.value}
                    onChange=${w.onChange}
                    onKeyDown=${w.onKeyDown}
                    placeholder=${w.hint}
                    autocomplete="off"
                    autocorrect="off"
                    autocapitalize="off"
                    spellcheck=${false}
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

/* Reciting aloud is one switch, on a line of its own directly above the box it
 * fills. It is built like the scaffold's row above it — label, segmented
 * On/Off, a note — because it is the same kind of thing: a way of working the
 * card, not a feature of its own. What a member says lands in the box below, so
 * there is nothing else to draw: no transcript panel, no undo buttons. The box
 * is a textarea the whole time, and backspace is backspace.
 *
 * The dot is the one part that has to move: a microphone is the only control
 * here whose state cannot be seen by looking at it, and "switched on" is not
 * the same as "listening" — there is a permission prompt in between. */
function voiceRow(v) {
  return html`<div style=${sx(CONTROL_ROW)}>
    <span style=${sx(LABEL_SECTION)}>${v.voiceLabel}</span>
    <button className="seg-btn" onClick=${v.voiceToggle} disabled=${!v.voiceSupported} style=${sx(v.voiceStyle)}>
      ${v.voiceListening && html`<span className="mic-dot"></span>`}${v.voiceOn ? copy.common.on : copy.common.off}
    </button>
    ${v.voiceNote && html`<span style=${sx(v.voiceNoteStyle)}>${v.voiceNote}</span>`}
  </div>`;
}

/* One word of a marked attempt. A word that came out right (or has not been
 * reached yet) is just itself; a word the member missed carries what they wrote
 * in its place, struck through beneath it, so the mistake is legible rather
 * than merely flagged.
 *
 * Shared by the marked paper and the live first-letter reveal on purpose: both
 * are saying the same thing — here is the word, here is what you put — so they
 * should not say it two different ways. */
const attemptWord = (key, w) =>
  w.typed
    ? html`<span
        key=${key}
        style=${sx("display:inline-flex;flex-direction:column;align-items:center;line-height:1.25")}
      >
        <span style=${sx(w.style)}>${w.text}</span>
        <span style=${sx(`font-size:11px;font-weight:400;text-decoration:line-through;color:${muted(55)}`)}
          >${w.typed}</span
        >
      </span>`
    : html`<span key=${key} style=${sx(w.style)}>${w.text}</span>`;

/* From memory: free recall, graded word by word, given either by typing or by
 * reciting into the same box (see voiceRow). In first-letter mode it is a
 * live drill instead — the reveal updates as you type, with no separate grade
 * step, and there is nothing to recite. */
function typePanel(v) {
  return html`<div style=${sx("display:flex;flex-direction:column;gap:18px")}>
    <div style=${sx(CONTROL_ROW)}>
      <span style=${sx(LABEL_SECTION)}>${copy.review.typeFirstLetterLabel}</span>
      <button className="seg-btn" onClick=${v.toggleTypeFirstLetter} style=${sx(v.typeFirstLetterStyle)}>
        ${v.typeFirstLetterOn ? copy.common.on : copy.common.off}
      </button>
      <span style=${sx(`font-size:12px;color:${muted(55)}`)}>${copy.review.typeFirstLetterNote}</span>
    </div>
    ${v.voiceShown && voiceRow(v)}
    ${
      v.typeLive
        ? html`<${React.Fragment}
            ><textarea
              id=${v.typeInputId}
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
                ${copy.review.typeRevealed}
              </div>
            </div>
            <div style=${sx("font-size:21px;line-height:2;max-width:74ch;display:flex;flex-wrap:wrap;gap:0 8px")}>
              ${v.typeReveal.map((r, i) => attemptWord(i, r))}
            </div></${React.Fragment}
          >`
        : html`<${React.Fragment}
            >${v.typeUngraded && html`<textarea id=${v.typeInputId} className="input" value=${v.typed} onChange=${v.onTyped} onSelect=${v.onCaret} placeholder=${v.typePlaceholder} style=${sx("min-height:210px;font-size:17px;line-height:1.7")}></textarea>`}
            ${
              v.typeGraded &&
              // Nothing grades the attempt until it is submitted, so this is
              // the marked paper: the score and the passage word by word. It
              // takes the place of the box the member was writing in, so it
              // arrives rather than appearing (styles.css, .item-in).
              html`<div className="item-in" style=${sx("display:flex;flex-direction:column;gap:16px")}>
                <div style=${sx("display:flex;align-items:baseline;gap:12px")}>
                  <div style=${sx("font-family:var(--font-heading);font-weight:600;font-size:52px;line-height:1")}>
                    ${v.typeScore}
                  </div>
                  <div style=${sx(`font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:${muted(55)}`)}>
                    ${copy.review.typeMatched}
                  </div>
                </div>
                <div
                  style=${sx(
                    "font-size:19px;line-height:1.8;max-width:74ch;display:flex;flex-wrap:wrap;align-items:flex-end;gap:2px 7px",
                  )}
                >
                  ${v.typeDiff.map((d, i) => attemptWord(i, d))}
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
    <div style=${sx(CONTROL_ROW)}>
      <span style=${sx(LABEL_SECTION)}>${copy.review.scrambleLabel}</span>
      <div style=${sx("display:flex;gap:6px")}>
        ${v.scrambleLevels.map((lv) => html`<button key=${lv.key} className="seg-btn" onClick=${lv.onClick} style=${sx(lv.style)}>${lv.label}</button>`)}
      </div>
      <span style=${sx(`font-size:12px;color:${muted(55)}`)}>${v.scrambleLevelDesc}</span>
    </div>
    <div
      style=${sx("min-height:96px;border:1px dashed var(--color-divider);padding:16px 18px;font-size:19px;line-height:1.65;color:var(--color-text)")}
    >
      ${v.scrambleEmpty && html`<span style=${sx(`font-size:13px;color:${muted(45)}`)}>${copy.review.scrambleEmptyHint}</span>`}
      ${" " + v.scrambleBuilt}
    </div>
    <div style=${sx("display:flex;flex-wrap:wrap;gap:10px")}>
      ${v.scrambleChunks.map((c) => html`<button key=${c.key} className="chunk" onClick=${c.onClick} style=${sx(c.style)}>${c.text}</button>`)}
    </div>
    <div style=${sx("display:flex;gap:10px;align-items:center")}>
      <button className="btn btn-secondary" onClick=${v.resetScramble} style=${sx("font-size:12px;padding:4px 12px")}>
        ${copy.common.startOver}
      </button>
      <div style=${sx(`font-size:13px;color:${muted(60)}`)}>${v.scrambleResult}</div>
      ${v.scrambleMissNote && html`<div style=${sx(`font-size:13px;color:${COLOR_ERROR}`)}>${v.scrambleMissNote}</div>`}
    </div>
  </div>`;
}

/* Looking the passage up, directly above where it appears.
 *
 * It sits at the foot of the card rather than in its header, which is where it
 * used to be: the reveal opens below the activity, so a control at the top of
 * the card scrolled the answer it had just produced off the bottom of the
 * screen. Beside what it reveals, the press and the passage are one place.
 *
 * Not shown on the flashcard, which is already a reveal. */
function peekRow(v) {
  return html`<div style=${sx(CONTROL_ROW)}>
    <button
      className="seg-btn"
      onClick=${v.togglePeek}
      aria-pressed=${v.peekLatched}
      style=${sx(v.peekStyle + ";user-select:none")}
    >
      ${v.helpLabel}
    </button>
    <span style=${sx(`font-size:12px;color:${v.peekSpent ? COLOR_ERROR : muted(50)}`)}>${v.peekNote}</span>
  </div>`;
}

/* Whichever activity is running, wrapped in the one thing all four share: they
 * are dealt rather than redrawn. The wrapper is keyed on the card and the mode
 * together (v.cardKey), so moving to the next verse and switching exercise on
 * this one are the same gesture — the panel is replaced and enters from the
 * side (styles.css, .card-swap), while the frame around it holds still. */
function activityPanel(v) {
  return html`<div key=${v.cardKey} className="card-swap" style=${sx("display:flex;flex-direction:column;gap:26px")}>
    ${v.isLearn && commitBanner(v)} ${v.isFlip && flipPanel(v)} ${v.isBlanks && blanksPanel(v)}
    ${v.isType && typePanel(v)} ${v.isScramble && scramblePanel(v)}
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
      ${v.commitDone ? copy.review.commitDoneTag : copy.review.commitTodoTag}
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
    className="result-strip"
    style=${sx(
      "display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;border-top:1px solid var(--color-divider);padding-top:18px",
    )}
  >
    <span style=${sx(LABEL_SECTION)}>${copy.review.resultSubmitted(v.resultModeName)}</span>
    <span style=${sx(`font-size:13px;color:${muted(60)}`)}>${v.resultScoreLabel}</span>
    <span
      style=${sx(
        "font-size:10px;letter-spacing:.1em;text-transform:uppercase;padding:3px 9px;" +
          (v.learnResultDone
            ? "background:var(--color-reverse-bg);color:var(--color-reverse-text)"
            : `border:1px solid var(--color-divider);color:${muted(55)}`),
      )}
      >${v.learnResultHeadline}</span
    >
    <span style=${sx(`flex:1;min-width:220px;font-size:12px;color:${muted(55)}`)}>${v.learnResultNote}</span>
    ${
      v.learnRetryShown &&
      html`<button className="btn btn-secondary" onClick=${v.retryCard} style=${sx("font-size:12px;padding:4px 12px")}>
        ${copy.review.tryAgain}
      </button>`
    }
  </div>`;
}

/* What handing a review card in was worth: the mark, then the freshness it had
 * and the freshness it earned as two bars — the second animating from the first,
 * so the gain (or the loss) is something you watch happen rather than read. */
function resultStrip(v) {
  return html`<div
    key=${v.resultKey}
    className="result-strip"
    style=${sx("display:flex;flex-direction:column;gap:12px;border-top:1px solid var(--color-divider);padding-top:18px")}
  >
    <div style=${sx("display:flex;align-items:baseline;gap:12px;flex-wrap:wrap")}>
      <span style=${sx(LABEL_SECTION)}>${copy.review.resultSubmitted(v.resultModeName)}</span>
      <span style=${sx(`font-size:13px;color:${muted(60)}`)}>${v.resultScoreLabel}</span>
      <span style=${sx(`margin-left:auto;font-size:12px;color:${muted(50)}`)}>${v.resultNote}</span>
    </div>
    <div style=${sx("display:flex;align-items:center;gap:18px")}>
      <div style=${sx("flex:1;display:flex;flex-direction:column;gap:7px;max-width:520px")}>
        <div style=${sx("display:flex;align-items:center;gap:12px")}>
          <span style=${sx(`font-size:11px;letter-spacing:.1em;text-transform:uppercase;width:44px;color:${muted(50)}`)}
            >${copy.review.resultWas}</span
          >
          <div style=${sx("flex:1;height:9px;background:var(--color-fresh-track);overflow:hidden")}>
            <div style=${sx(v.resultBeforeBar)}></div>
          </div>
          <span style=${sx(`font-size:13px;width:44px;text-align:right;color:${muted(55)}`)}
            >${v.resultBeforeLabel}</span
          >
        </div>
        <div style=${sx("display:flex;align-items:center;gap:12px")}>
          <span style=${sx("font-size:11px;letter-spacing:.1em;text-transform:uppercase;width:44px")}
            >${copy.review.resultNow}</span
          >
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
      <div className="dialog-title">${copy.review.leaveTitle}</div>
      <div className="dialog-body">${v.reviewLeaveNote}</div>
      <div className="dialog-actions">
        <button className="btn btn-secondary" onClick=${v.reviewLeaveCancel}>${copy.common.keepGoing}</button>
        <button className="btn btn-primary" onClick=${v.reviewLeaveConfirm}>${copy.review.leaveConfirm}</button>
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
        <button className="btn btn-secondary" onClick=${v.reviewMoveCancel}>${copy.review.moveStay}</button>
        <button className="btn btn-primary" onClick=${v.reviewMoveConfirm}>${v.reviewMoveConfirmLabel}</button>
      </div>
    </div>
  </div>`;
}

export function reviewView(v) {
  return html`<div
    className="screen"
    style=${sx("max-width:1000px;margin:0 auto;padding:36px 36px 80px;display:flex;flex-direction:column;gap:22px")}
  >
    <div style=${sx("display:flex;align-items:center;gap:16px")}>
      <button className="btn btn-secondary" onClick=${v.askLeaveReview} style=${sx("font-size:12px;padding:4px 12px")}>
        ${copy.review.leave}
      </button>
      <div style=${sx(LABEL_SECTION)}>${v.sessionLabel} · ${v.modeName} · ${v.posLabel}</div>
      <div style=${sx("margin-left:auto;display:flex;gap:6px")}>
        ${v.modeSwitch.map((m) => html`<button key=${m.key} className="seg-btn" onClick=${m.onClick} style=${sx(m.style)}>${m.short}</button>`)}
      </div>
    </div>

    <div style=${sx("height:4px;background:var(--color-neutral-200)")}>
      <div className="meter-step" style=${sx(v.sessionBarStyle)}></div>
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
      </div>

      ${activityPanel(v)} ${!v.isFlip && peekRow(v)}
      ${v.showHelp && html`<div className="reveal-in" style=${sx(`border-left:2px solid var(--color-accent);padding:4px 0 4px 16px;font-size:15px;line-height:1.65;color:${muted(70)};max-width:74ch`)}>${v.curText}</div>`}
      ${v.resultShown && (v.isLearn ? learnResultStrip(v) : resultStrip(v))}

      <div
        style=${sx("margin-top:auto;display:flex;gap:12px;align-items:center;border-top:1px solid var(--color-divider);padding-top:20px")}
      >
        <button className="btn btn-secondary" onClick=${v.goPrev} disabled=${!v.canGoBack}>
          ${copy.review.previous}
        </button>
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
