/* Drive mode: state + actions → what the drive screen shows.
 *
 * The screen is glanced at, not worked — the session runs itself once started
 * — so everything here is a label or a single callback. Practice only: no key
 * in here reaches progress or the ladder. */

import { copy } from "../copy.js";
import { DRIVE_MODES } from "../drive.js";
import { isCommitted, reviewPool } from "../progress.js";
import { reviewSettings } from "../profile.js";

export const DRIVE_SOURCES = ["due", "committed", "all"];

/* Which passages a drive source deals. The due queue is reviewPool() at the
 * member's own threshold, so Drive and Review cannot disagree about what is
 * due; the other two relax freshness, not the commit rule. */
export function drivePool(source, passages, progress, profile, now) {
  if (source === "due") return reviewPool(passages, progress, reviewSettings(profile).dueFreshness, now);
  if (source === "committed") return passages.filter((p) => isCommitted(progress[p.id]));
  return passages;
}

export function driveVals({ state, actions, now = Date.now() }) {
  // Defensive default: fixtures and old saved state predate the drive slice.
  const d = state.drive || {
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
  const pool = drivePool(d.source, state.passages, state.progress, state.profile, now);
  const last = d.lastResult;
  return {
    isDrive: state.view === "drive",
    driveTitle: copy.drive.title,
    driveLead: copy.drive.lead,
    driveSupported: d.supported,
    driveUnsupported: copy.drive.unsupported,
    driveRunning: d.running,
    drivePhaseLabel: copy.drive.phases[d.phase] || copy.drive.phases.idle,
    driveListening: d.phase === "listen",
    driveRef: d.running && passage ? passage.ref : "",
    driveHeard: d.running ? d.heard : "",
    driveModeLabel: copy.drive.modeLabel,
    driveModes: DRIVE_MODES.map((key) => ({
      key,
      label: copy.drive.modes[key],
      active: d.mode === key,
      onClick: () => actions.setDriveMode(key),
    })),
    driveSourceLabel: copy.drive.sourceLabel,
    driveSources: DRIVE_SOURCES.map((key) => ({
      key,
      label: copy.drive.sources[key],
      active: d.source === key,
      onClick: () => actions.setDriveSource(key),
    })),
    driveQueueLabel: copy.drive.queueCount(d.running ? d.queue.length : pool.length),
    driveEmpty: !d.running && pool.length === 0 ? copy.drive.empty : "",
    driveScoreLabel: last ? copy.drive.lastScore(last.pct) : "",
    drivePerVerse: last && last.perVerse ? last.perVerse.map((v) => copy.drive.verseSpoken(v.verse, v.pct)) : [],
    driveMissed: last && last.missed ? last.missed.slice(0, 12).join(", ") : "",
    drivePracticeNote: copy.drive.practiceNote,
    driveStartLabel: copy.drive.start,
    driveStopLabel: copy.drive.stop,
    onDriveStart: actions.startDrive,
    onDriveStop: actions.stopDrive,
  };
}
