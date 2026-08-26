/* Run mode: what the run screen shows — the beat controls, the verse being
 * called out, and the playlist panel. The audio itself lives behind the
 * actions (src/beat.js via App); nothing here touches it. */

import { copy } from "../copy.js";
import { BEAT_PRESETS } from "../beat.js";
import { segButton } from "../ui/tokens.js";

const RUN_DEFAULTS = {
  preset: "hype",
  bpm: 165,
  playing: false,
  nowRef: "",
  nowText: "",
  saying: "",
  audio: "off",
  playlist: [],
  supported: true,
};

export function runVals({ state, actions }) {
  const run = { ...RUN_DEFAULTS, ...(state.run || {}) };
  return {
    isRun: state.view === "run",
    runTitle: copy.run.title,
    runBlurb: copy.run.blurb,
    runSupported: run.supported,
    runUnsupportedNote: copy.run.unsupported,
    runPlaying: run.playing,
    runToggleLabel: run.playing ? copy.run.stop : copy.run.start,
    runToggle: run.playing ? actions.stopRun : actions.startRun,
    runPresetLabel: copy.run.presetLabel,
    runPresets: BEAT_PRESETS.map((p) => ({
      key: p.key,
      label: p.name,
      onClick: () => actions.setRunPreset(p.key),
      style: segButton(run.preset === p.key),
    })),
    runBpm: run.bpm,
    runBpmLabel: copy.run.bpmLabel,
    runBpmDown: () => actions.setRunBpm(run.bpm - 5),
    runBpmUp: () => actions.setRunBpm(run.bpm + 5),
    runNowRef: run.nowRef,
    runNowText: run.nowText,
    runIdleNote: copy.run.idleNote,
    /* The three things a silent run cannot otherwise tell anyone: what the
     * audio hardware is doing, what is being said, and that a backgrounded tab
     * is the usual culprit — plus the beeps that settle app-or-machine. */
    runAudioNote: run.playing ? copy.run.audioState(run.audio) : "",
    runSayingNote: run.saying ? copy.run.saying(run.saying) : "",
    runBackgroundNote: copy.run.backgroundNote,
    runTestLabel: copy.run.testSound,
    runTestSound: actions.testRunSound,
    runPlaylistTitle: copy.run.playlistTitle,
    runPlaylistPinnedLabel: copy.run.psalmsPlaylist,
    runPlaylistPinnedUrl: "https://open.spotify.com/playlist/2J256T9x2D6ysT1zOwpNyE",
    runPlaylist: run.playlist || [],
  };
}
