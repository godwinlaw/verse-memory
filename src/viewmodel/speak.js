/* Speak mode: state + actions → what the speak screen shows.
 *
 * The screen is glanced at, not worked — the session runs itself once started
 * — so everything here is a label or a single callback. Practice only: no key
 * in here reaches progress or the ladder. */

import { copy } from "../copy.js";
import { SPEAK_MODES } from "../speak.js";
import { isCommitted, reviewPool } from "../progress.js";
import { reviewSettings } from "../profile.js";

export const SPEAK_SOURCES = ["due", "committed", "all"];

/* Which passages a speak source deals. The due queue is reviewPool() at the
 * member's own threshold, so Speak and Review cannot disagree about what is
 * due; the other two relax freshness, not the commit rule. */
export function speakPool(source, passages, progress, profile, now) {
  if (source === "due") return reviewPool(passages, progress, reviewSettings(profile).dueFreshness, now);
  if (source === "committed") return passages.filter((p) => isCommitted(progress[p.id]));
  return passages;
}

export function speakVals({ state, actions, now = Date.now() }) {
  // Defensive default: fixtures and old saved state predate the speak slice.
  const d = state.speak || {
    supported: false,
    running: false,
    mode: "passage",
    source: "due",
    queue: [],
    index: 0,
    phase: "idle",
    lastResult: null,
    heard: "",
  };
  const passage = d.queue.length ? state.passages.find((p) => p.id === d.queue[d.index % d.queue.length]) : null;
  const pool = speakPool(d.source, state.passages, state.progress, state.profile, now);
  const last = d.lastResult;
  return {
    isSpeak: state.view === "speak",
    speakTitle: copy.speak.title,
    speakLead: copy.speak.lead,
    speakSupported: d.supported,
    speakUnsupported: copy.speak.unsupported,
    speakRunning: d.running,
    speakPhaseLabel: copy.speak.phases[d.phase] || copy.speak.phases.idle,
    speakListening: d.phase === "listen",
    speakRef: d.running && passage ? passage.ref : "",
    speakHeard: d.running ? d.heard : "",
    speakModeLabel: copy.speak.modeLabel,
    speakModes: SPEAK_MODES.map((key) => ({
      key,
      label: copy.speak.modes[key],
      active: d.mode === key,
      onClick: () => actions.setSpeakMode(key),
    })),
    speakSourceLabel: copy.speak.sourceLabel,
    speakSources: SPEAK_SOURCES.map((key) => ({
      key,
      label: copy.speak.sources[key],
      active: d.source === key,
      onClick: () => actions.setSpeakSource(key),
    })),
    speakQueueLabel: copy.speak.queueCount(d.running ? d.queue.length : pool.length),
    speakEmpty: !d.running && pool.length === 0 ? copy.speak.empty : "",
    /* Why a session ended by itself — a refused microphone otherwise looks
     * exactly like the member pressing Stop. */
    speakError: !d.running && d.error ? d.error : "",
    speakScoreLabel: last ? copy.speak.lastScore(last.pct) : "",
    speakPerVerse: last && last.perVerse ? last.perVerse.map((v) => copy.speak.verseSpoken(v.verse, v.pct)) : [],
    speakMissed: last && last.missed ? last.missed.slice(0, 12).join(", ") : "",
    speakPracticeNote: copy.speak.practiceNote,
    speakStartLabel: copy.speak.start,
    speakStopLabel: copy.speak.stop,
    onSpeakStart: actions.startSpeak,
    onSpeakStop: actions.stopSpeak,
  };
}
