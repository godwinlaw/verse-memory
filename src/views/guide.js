/* The guide, the app explained, drawn rather than listed.
 *
 * Four things are shown here rather than described: a passage crossing from the
 * learn half of the set to the review half, the real forgetting curve under a
 * slider, the interval ladder with a marker climbing it, and a small looping
 * demonstration of each of the four activities.
 * The drawings are SVG and CSS keyframes (see the guide block in styles.css),
 * no canvas, no library, and every animation is dropped under
 * prefers-reduced-motion. */

import { html, sx, corners } from "../dom.js";
import { LABEL_META, LABEL_SECTION, muted } from "../ui/tokens.js";

/* ── what commits a passage ───────────────────────────────────────────────── */

/* Two columns and one passage crossing between them. The card is absolutely
 * placed at half the track's width, so the keyframes can move it exactly one
 * column across without either half knowing a pixel figure. */
function commitDiagram(v) {
  const column = (title, note, side) =>
    html`<div
      style=${sx(
        `flex:1;padding:12px 14px 14px;border:1px dashed var(--color-divider);display:flex;flex-direction:column;gap:3px;` +
          (side === "right" ? "background:color-mix(in srgb, var(--color-accent) 6%, transparent)" : ""),
      )}
    >
      <div style=${sx(LABEL_SECTION)}>${title}</div>
      <div style=${sx(`font-size:12px;color:${muted(55)}`)}>${note}</div>
    </div>`;

  return html`<div className="guide-commit-track">
    <div style=${sx("display:flex;gap:16px;height:92px")}>
      ${column(v.guideCommitFrom, v.guideCommitFromNote, "left")}
      ${column(v.guideCommitTo, v.guideCommitToNote, "right")}
    </div>
    <div className="guide-commit-card">
      <div
        style=${sx("padding:9px 12px;background:var(--color-bg);border:1px solid var(--color-accent);display:flex;flex-direction:column;gap:2px")}
      >
        <div style=${sx("font-family:var(--font-heading);font-weight:600;font-size:14px")}>${v.guideSample.ref}</div>
        <div style=${sx(`font-size:11px;color:${muted(55)};overflow:hidden;text-overflow:ellipsis;white-space:nowrap`)}>
          ${v.guideSample.lead} ${v.guideSample.blank}.
        </div>
      </div>
    </div>
    <div className="guide-stamp" style=${sx("position:absolute;left:0;right:0;bottom:8px;text-align:center")}>
      <span
        style=${sx("font-family:var(--font-heading);font-weight:600;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--color-accent)")}
        >${v.guideCommitStamp}</span
      >
    </div>
  </div>`;
}

/* ── freshness ────────────────────────────────────────────────────────────── */

function curveChart(v) {
  const p = v.guidePlot;
  return html`<svg
    viewBox="0 0 520 176"
    role="img"
    aria-label=${v.guideCurveAria}
    style=${sx("width:100%;height:auto;display:block")}
  >
    <line x1=${p.left} y1=${p.top} x2=${p.left} y2=${p.bottom} stroke="var(--color-divider)" strokeWidth="1" />
    <line x1=${p.left} y1=${p.bottom} x2=${p.right} y2=${p.bottom} stroke="var(--color-divider)" strokeWidth="1" />

    <line
      x1=${p.left}
      y1=${v.guideMarkY}
      x2=${p.right}
      y2=${v.guideMarkY}
      stroke="var(--color-accent)"
      strokeWidth="1"
      strokeDasharray="4 4"
      opacity="0.7"
    />
    <text x=${p.left + 6} y=${Number(v.guideMarkY) - 6} fontSize="10" letterSpacing="0.06em" fill="var(--color-accent)">
      ${v.guideMarkLabel}
    </text>

    ${v.guideCurves.map(
      (c) =>
        html`<path
          key=${c.key}
          d=${c.d}
          fill="none"
          stroke=${c.strong ? "var(--color-accent)" : muted(35)}
          strokeWidth=${c.strong ? 2 : 1.5}
          strokeDasharray=${c.strong ? "none" : "3 4"}
          strokeLinecap="round"
        />`,
    )}

    <line
      x1=${v.guideCurves[0].cx}
      y1=${p.top}
      x2=${v.guideCurves[0].cx}
      y2=${p.bottom}
      stroke="var(--color-text)"
      strokeWidth="1"
      opacity="0.22"
    />
    ${v.guideCurves.map(
      (c) =>
        html`<circle
          key=${c.key}
          cx=${c.cx}
          cy=${c.cy}
          r=${c.strong ? 5 : 4}
          fill=${c.strong ? "var(--color-accent)" : "var(--color-bg)"}
          stroke=${c.strong ? "var(--color-bg)" : muted(45)}
          strokeWidth="2"
        />`,
    )}

    <text x=${p.left - 8} y=${p.top + 4} textAnchor="end" fontSize="10" fill=${muted(45)}>100%</text>
    <text x=${p.left - 8} y=${p.bottom + 4} textAnchor="end" fontSize="10" fill=${muted(45)}>0%</text>
    ${v.guideAxis.map(
      (a) =>
        html`<text key=${a.day} x=${a.x} y=${p.bottom + 18} textAnchor="middle" fontSize="10" fill=${muted(45)}>
          ${a.label}
        </text>`,
    )}
  </svg>`;
}

function curvePanel(v) {
  return html`<div style=${sx("display:flex;flex-direction:column;gap:16px")}>
    <label style=${sx("display:flex;flex-direction:column;gap:7px")}>
      <span style=${sx(LABEL_SECTION)}>${v.guideDaysPrompt}, ${v.guideDaysLabel}</span>
      <input
        type="range"
        min="0"
        max=${v.guideDaysMax}
        step="1"
        value=${v.guideDays}
        onChange=${(e) => v.setGuideDays(e.target.value)}
        style=${sx("width:100%;accent-color:var(--color-accent);cursor:pointer")}
      />
    </label>

    <div style=${sx("display:flex;flex-direction:column;gap:10px")}>
      ${v.guideCurves.map(
        (c) =>
          html`<div key=${c.key} style=${sx("display:flex;align-items:baseline;gap:12px")}>
            <span
              style=${sx(
                "font-family:var(--font-heading);font-weight:600;font-size:30px;line-height:1;width:74px;flex:none;color:" +
                  (c.strong ? "var(--color-accent)" : muted(45)),
              )}
              >${c.pct}%</span
            >
            <span style=${sx(`font-size:13px;line-height:1.5;color:${muted(65)}`)}>${c.label}</span>
          </div>`,
      )}
    </div>

    <div
      style=${sx("padding:11px 14px;border-left:3px solid var(--color-accent);font-size:13px;line-height:1.6;background:color-mix(in srgb, var(--color-accent) 7%, transparent)")}
    >
      ${v.guideFreshVerdict}
    </div>
  </div>`;
}

/* ── the schedule ─────────────────────────────────────────────────────────── */

/* srs.INTERVALS drawn as what it is: a ladder, one rung per gap, each rung's bar
 * as long as the gap it stands for. A marker climbs it on a loop, which is the
 * only thing here that moves, the rungs themselves are the model's own list, so
 * retuning INTERVALS redraws this without anyone editing it. */
function ladderPanel(v) {
  return html`<div className="guide-ladder" role="img" aria-label=${v.guideRungsAria}>
    ${v.guideRungs.map(
      (r) =>
        html`<div key=${r.key} className="guide-rung" style=${sx("--rung-i:" + r.index)}>
          <span className="guide-rung-label">${r.label}</span>
          <i className="guide-rung-bar" style=${sx("width:" + r.weight + "%")}></i>
        </div>`,
    )}
  </div>`;
}

/* The four bands of srs.nextStep. The arrow is decorative, each row says in
 * words which way the verse moves, so it is hidden from a screen reader. */
const RULE_GLYPH = { up: "↑", same: "=", down: "↓", reset: "↧" };

function ladderRules(v) {
  return html`<div style=${sx("display:flex;flex-direction:column;gap:2px")}>
    ${v.guideLadderRules.map(
      (r) =>
        html`<div
          key=${r.key}
          style=${sx("display:flex;align-items:baseline;gap:13px;padding:10px 2px;border-bottom:1px solid var(--color-divider)")}
        >
          <span aria-hidden="true" className=${"guide-rule-dir is-" + r.dir}>${RULE_GLYPH[r.dir]}</span>
          <span style=${sx("flex:none;width:16ch;font-size:13px;font-weight:600;line-height:1.5")}>${r.when}</span>
          <span style=${sx(`font-size:13px;line-height:1.5;color:${muted(65)}`)}>${r.then}</span>
        </div>`,
    )}
  </div>`;
}

/* ── the four activities ──────────────────────────────────────────────────── */

/* One looping demonstration per activity, keyed by the same mode key the model
 * uses. Everything moving is a CSS keyframe (styles.css, guide block). */
function activityDemo(key, sample) {
  if (key === "flip") {
    // The real component (styles.css, the two-sided card), turned by a loop
    // instead of by the member, so the demonstration cannot drift from it.
    return html`<div className="guide-demo guide-flip flip-card">
      <div className="flip-card-inner">
        <div className="flip-card-face">${sample.ref}</div>
        <div className="flip-card-face flip-card-back">${sample.lead} ${sample.blank}.</div>
      </div>
    </div>`;
  }
  if (key === "scramble") {
    return html`<div className="guide-demo guide-order">
      ${sample.phrases.map((p, i) => html`<i key=${i} style=${sx("width:" + [86, 68, 78][i] + "%")}></i>`)}
    </div>`;
  }
  if (key === "blanks") {
    return html`<div className="guide-demo guide-blanks">
      <span>${sample.lead} </span>
      <span className="guide-blank"><span>${sample.blank}</span></span>
      <span>.</span>
    </div>`;
  }
  return html`<div className="guide-demo guide-type">
    <b>${sample.lead} ${sample.blank}.</b><i className="guide-caret"></i>
  </div>`;
}

function activityCard(a, sample, flag) {
  return html`<div
    className="blueprint"
    style=${sx("padding:18px 20px 20px;display:flex;flex-direction:column;gap:12px")}
  >
    ${corners()}
    <div style=${sx("display:flex;align-items:baseline;gap:8px;flex-wrap:wrap")}>
      <h5 style=${sx("margin:0")}>${a.name}</h5>
      ${
        a.commits &&
        html`<span
          style=${sx("font-size:9px;letter-spacing:.1em;text-transform:uppercase;padding:2px 7px;background:var(--color-reverse-bg);color:var(--color-reverse-text)")}
          >${flag}</span
        >`
      }
    </div>
    ${activityDemo(a.key, sample)}
    <p style=${sx(`margin:0;font-size:13px;line-height:1.6;color:${muted(70)}`)}>${a.desc}</p>
    <p style=${sx(`margin:0;font-size:12px;line-height:1.55;color:${muted(50)}`)}>${a.pays}</p>
  </div>`;
}

/* ── the screen ───────────────────────────────────────────────────────────── */

const sectionHead = (title, note) =>
  html`<div style=${sx("display:flex;align-items:baseline;gap:12px;flex-wrap:wrap")}>
    <h4 style=${sx("margin:0;letter-spacing:.02em")}>${title}</h4>
    ${note && html`<div style=${sx(LABEL_META)}>${note}</div>`}
  </div>`;

export function guideView(v) {
  return html`<div className="guide-page screen">
    <div
      className="blueprint"
      style=${sx("background:var(--color-reverse-bg);color:var(--color-reverse-text);border-color:var(--color-reverse-bg);padding:34px 40px;display:flex;flex-direction:column;gap:16px")}
    >
      ${corners()}
      <div style=${sx("font-size:11px;letter-spacing:.16em;text-transform:uppercase;opacity:.72")}>
        ${v.guideKicker}
      </div>
      <h2 style=${sx("margin:0;font-size:44px;line-height:1")}>${v.guideTitle}</h2>
      <p style=${sx("margin:0;font-size:15px;line-height:1.75;opacity:.85;max-width:74ch")}>${v.guideLead}</p>
    </div>

    <div style=${sx("display:flex;flex-direction:column;gap:18px")}>
      ${sectionHead(v.guideCommitTitle, v.guideCommitNote)}
      <div className="guide-split">
        <div className="blueprint" style=${sx("padding:24px 28px")}>${corners()} ${commitDiagram(v)}</div>
        <div style=${sx("display:flex;flex-direction:column;gap:14px")}>
          <p style=${sx(`margin:0;font-size:14px;line-height:1.75;color:${muted(70)}`)}>${v.guideCommitBody}</p>
          <p style=${sx(`margin:0;font-size:13px;line-height:1.7;color:${muted(55)}`)}>${v.guideCommitFoot}</p>
        </div>
      </div>
    </div>

    <div style=${sx("display:flex;flex-direction:column;gap:18px")}>
      ${sectionHead(v.guideFreshTitle, v.guideFreshNote)}
      <p style=${sx(`margin:0;font-size:14px;line-height:1.75;color:${muted(70)};max-width:78ch`)}>
        ${v.guideFreshBody}
      </p>
      <div className="guide-split">
        <div className="blueprint" style=${sx("padding:24px 26px 18px")}>${corners()} ${curveChart(v)}</div>
        ${curvePanel(v)}
      </div>
      <p style=${sx(`margin:0;font-size:13px;line-height:1.7;color:${muted(55)};max-width:78ch`)}>
        ${v.guideFreshFoot}
      </p>
    </div>

    <div style=${sx("display:flex;flex-direction:column;gap:18px")}>
      ${sectionHead(v.guideLadderTitle, v.guideLadderNote)}
      <p style=${sx(`margin:0;font-size:14px;line-height:1.75;color:${muted(70)};max-width:78ch`)}>
        ${v.guideLadderBody}
      </p>
      <div className="guide-split">
        <div className="blueprint" style=${sx("padding:22px 26px")}>${corners()} ${ladderPanel(v)}</div>
        ${ladderRules(v)}
      </div>
      <p style=${sx(`margin:0;font-size:13px;line-height:1.7;color:${muted(55)};max-width:78ch`)}>
        ${v.guideLadderFoot}
      </p>
    </div>

    <div style=${sx("display:flex;flex-direction:column;gap:18px")}>
      ${sectionHead(v.guideActivityTitle, v.guideActivityNote)}
      <div className="guide-activities">
        ${v.guideActivities.map(
          (a) => html`<div key=${a.key}>${activityCard(a, v.guideSample, v.guideCommitsFlag)}</div>`,
        )}
      </div>
    </div>

    <div style=${sx("display:flex;justify-content:center;padding:8px 0 4px")}>
      <button
        className="btn btn-primary"
        onClick=${v.guideStartLearning}
        style=${sx("padding:12px 28px;font-size:15px")}
      >
        ${v.guideStart}
      </button>
    </div>
  </div>`;
}
