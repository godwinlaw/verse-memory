/* Samuel mode: the study screen.
 *
 * Two tabs and nothing else on the page, because the fortnight before an exam
 * is not the moment to be offered options. Quiz asks; Read gives the chapter
 * back. The countdown sits at the top of both, since it is the reason the
 * screen exists. */

import { html, sx } from "../dom.js";
import { CONTROL_ROW, LABEL_SECTION, SCREEN_BODY, SCREEN_TITLE, muted } from "../ui/tokens.js";

const CARD = "border:1px solid var(--color-divider);padding:18px 20px";
const CHOICE_BASE =
  "display:block;width:100%;text-align:left;padding:12px 14px;font-size:15px;line-height:1.5;cursor:pointer;" +
  "border:1px solid var(--color-divider);background:none;color:var(--color-text);font-family:var(--font-body)";

const choiceStyle = (state) => {
  if (state === "right") return CHOICE_BASE + ";border-color:var(--color-accent);font-weight:600";
  if (state === "wrong") return CHOICE_BASE + ";border-color:var(--color-error);color:var(--color-error)";
  if (state === "idle") return CHOICE_BASE + `;color:${muted(45)}`;
  return CHOICE_BASE;
};

export function samuelView(v) {
  return html`<div
    className="screen"
    style=${sx("max-width:760px;margin:0 auto;padding:34px 22px 70px;display:flex;flex-direction:column;gap:22px")}
  >
    <div style=${sx("display:flex;flex-direction:column;gap:8px")}>
      <div style=${sx(SCREEN_TITLE)}>${v.samuelTitle}</div>
      <p style=${sx(SCREEN_BODY)}>${v.samuelLead}</p>
      <div
        style=${sx(
          "font-family:var(--font-heading);font-weight:600;font-size:18px;" +
            (v.samuelUrgent ? "color:var(--color-error)" : ""),
        )}
      >
        ${v.samuelCountdown}
      </div>
    </div>

    <div style=${sx("display:flex;flex-direction:column;gap:6px")}>
      <div style=${sx(LABEL_SECTION)}>${v.samuelReadyLabel}</div>
      <div style=${sx("height:8px;border:1px solid var(--color-divider)")}>
        <div
          className="meter-fill"
          style=${sx("height:100%;background:var(--color-accent);width:" + v.samuelReadyPct + "%")}
        />
      </div>
      <div style=${sx(`font-size:12px;color:${muted(55)}`)}>${v.samuelSeenLabel}</div>
    </div>

    <div style=${sx(CONTROL_ROW)}>
      ${v.samuelTabs.map(
        (t) =>
          html`<button key=${t.key} className="seg-btn" onClick=${t.onClick} style=${sx(t.style)}>${t.label}</button>`,
      )}
    </div>

    ${v.samuelTab === "quiz" && quizPane(v)} ${v.samuelTab === "read" && readPane(v)}
  </div>`;
}

function quizPane(v) {
  return html`<div style=${sx("display:flex;flex-direction:column;gap:18px")}>
    <div style=${sx(CONTROL_ROW)}>
      <span style=${sx(LABEL_SECTION)}>${v.samuelScopeLabel}</span>
      ${v.samuelScopes.map(
        (s) =>
          html`<button key=${s.key} className="seg-btn" onClick=${s.onClick} style=${sx(s.style)}>${s.label}</button>`,
      )}
    </div>

    ${
      v.samuelQuestion &&
      html`<div style=${sx(CARD + ";display:flex;flex-direction:column;gap:14px")}>
        <div style=${sx(LABEL_SECTION)}>${v.samuelQuestion.position}</div>
        <div style=${sx("font-size:19px;line-height:1.45")}>${v.samuelQuestion.prompt}</div>
        <div style=${sx("display:flex;flex-direction:column;gap:8px")}>
          ${v.samuelQuestion.choices.map(
            (c) =>
              html`<button key=${c.key} className="option" onClick=${c.onClick} style=${sx(choiceStyle(c.state))}>
                ${c.label}
              </button>`,
          )}
        </div>
        ${
          v.samuelAnswered &&
          html`<div style=${sx("display:flex;flex-direction:column;gap:10px")}>
            <div style=${sx("font-size:14px;line-height:1.5" + (v.samuelCorrect ? "" : ";color:var(--color-error)"))}>
              ${v.samuelVerdict}
            </div>
            <div style=${sx(`font-size:12px;color:${muted(55)}`)}>${v.samuelQuestion.ref}</div>
            <div>
              <button className="btn btn-primary" onClick=${v.onSamuelNext} style=${sx("padding:10px 22px")}>
                ${v.samuelNextLabel}
              </button>
            </div>
          </div>`
        }
      </div>`
    }
    ${v.samuelRoundDone && html`<div style=${sx(CARD)}>${v.samuelRoundScore}</div>`}
    ${v.samuelEmpty && html`<p style=${sx(SCREEN_BODY)}>${v.samuelEmpty}</p>`}

    <div>
      <button className="btn btn-primary" onClick=${v.onSamuelStart} style=${sx("padding:12px 26px;font-size:16px")}>
        ${v.samuelStartLabel}
      </button>
    </div>

    ${
      v.samuelWeak.length > 0 &&
      html`<div style=${sx("display:flex;flex-direction:column;gap:8px")}>
        <div style=${sx(LABEL_SECTION)}>${v.samuelWeakLabel}</div>
        ${v.samuelWeak.map(
          (c) =>
            html`<button
              key=${c.key}
              className="queue-row"
              onClick=${c.onClick}
              style=${sx(
                "display:flex;justify-content:space-between;gap:12px;padding:10px 12px;cursor:pointer;" +
                  "border:1px solid var(--color-divider);background:none;color:var(--color-text);font-family:var(--font-body);font-size:14px",
              )}
            >
              <span>${c.label}</span><span style=${sx(`color:${muted(55)}`)}>${c.note}</span>
            </button>`,
        )}
      </div>`
    }
  </div>`;
}

function readPane(v) {
  return html`<div style=${sx("display:flex;flex-direction:column;gap:14px")}>
    <div style=${sx(CONTROL_ROW)}>
      ${v.samuelBooks.map(
        (b) =>
          html`<button key=${b.key} className="seg-btn" onClick=${b.onClick} style=${sx(b.style)}>${b.label}</button>`,
      )}
    </div>
    <div style=${sx("display:flex;flex-direction:column;gap:8px")}>
      ${v.samuelChapters.map(
        (c) =>
          html`<div key=${c.key} style=${sx("border:1px solid var(--color-divider)")}>
            <button
              className="queue-row"
              onClick=${c.onClick}
              style=${sx(
                "display:flex;gap:12px;width:100%;text-align:left;padding:11px 13px;cursor:pointer;border:none;" +
                  "background:none;color:var(--color-text);font-family:var(--font-body);font-size:14px",
              )}
            >
              <span style=${sx("font-weight:600;min-width:2.5em")}>${c.chapter}</span>
              <span>${c.title}</span>
            </button>
            ${
              c.open &&
              html`<div style=${sx("padding:0 13px 13px 13px;display:flex;flex-direction:column;gap:8px")}>
                <div style=${sx("font-size:14px;line-height:1.6")}>${c.summary}</div>
                ${c.people && html`<div style=${sx(`font-size:12px;color:${muted(60)}`)}>${c.people}</div>`}
                ${c.places && html`<div style=${sx(`font-size:12px;color:${muted(50)}`)}>${c.places}</div>`}
              </div>`
            }
          </div>`,
      )}
    </div>
  </div>`;
}
