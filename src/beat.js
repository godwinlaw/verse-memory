/* The run-mode audio seam: a procedural hype beat (WebAudio) and the voice that
 * calls verses out over it (speechSynthesis). Written like recognizer.js — an
 * optional overlay, and beatSupported() returning false just means the screen
 * has no beat to offer. All audio-graph code stays in this module.
 *
 * The beat is synthesized, not sampled: kick (sine pitch-drop), hi-hat
 * (filtered noise), snare (noise burst) and a one-note bass line, scheduled
 * ahead of the clock with the standard lookahead pattern so a busy main thread
 * cannot stutter the loop. */

/* Three presets tuned to running cadence — steps are 16ths over one bar. */
export const BEAT_PRESETS = [
  {
    key: "steady",
    name: "Steady",
    bpm: 150,
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    bass: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0],
  },
  {
    key: "hype",
    name: "Hype",
    bpm: 165,
    kick: [1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 0],
    hat: [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
    bass: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
  },
  {
    key: "sprint",
    name: "Sprint",
    bpm: 180,
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0],
    hat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1],
    bass: [1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 1],
  },
];

export const presetByKey = (key) => BEAT_PRESETS.find((p) => p.key === key) || BEAT_PRESETS[0];

export function beatSupported() {
  return typeof window !== "undefined" && !!(window.AudioContext || window.webkitAudioContext);
}

export function speechSupported() {
  return typeof window !== "undefined" && !!window.speechSynthesis;
}

const LOOKAHEAD_MS = 25; // how often the scheduler wakes
const SCHEDULE_AHEAD_S = 0.12; // how far it books notes each wake
const BEAT_GAIN = 0.28; // modest — the voice rides on top
const DUCK_GAIN = 0.1; // while the voice is speaking

export function createBeat() {
  if (!beatSupported()) return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let timer = null;
  let preset = BEAT_PRESETS[0];
  let bpm = preset.bpm;
  let step = 0;
  let nextTime = 0;

  const ensure = () => {
    if (ctx) return;
    ctx = new Ctx();
    master = ctx.createGain();
    master.gain.value = BEAT_GAIN;
    master.connect(ctx.destination);
    // Two seconds of white noise, shared by the hat and the snare.
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  };

  const kick = (t) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + 0.3);
  };

  const noiseHit = (t, { freq, type, dur, gain }) => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur + 0.05);
  };

  const bass = (t, stepIndex) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sawtooth";
    // A two-note figure: root and a fifth up on the back half of the bar.
    osc.frequency.value = stepIndex < 8 ? 55 : 82.4;
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 400;
    osc.connect(filter).connect(g).connect(master);
    osc.start(t);
    osc.stop(t + 0.22);
  };

  const scheduleStep = (i, t) => {
    if (preset.kick[i]) kick(t);
    if (preset.hat[i]) noiseHit(t, { freq: 7000, type: "highpass", dur: 0.05, gain: 0.35 });
    if (preset.snare[i]) noiseHit(t, { freq: 1800, type: "bandpass", dur: 0.15, gain: 0.9 });
    if (preset.bass[i]) bass(t, i);
  };

  const tick = () => {
    const stepDur = 60 / bpm / 4; // a 16th
    while (nextTime < ctx.currentTime + SCHEDULE_AHEAD_S) {
      scheduleStep(step, nextTime);
      nextTime += stepDur;
      step = (step + 1) % 16;
    }
  };

  return {
    start(presetKey, wantBpm) {
      ensure();
      preset = presetByKey(presetKey);
      bpm = wantBpm || preset.bpm;
      if (ctx.state === "suspended") ctx.resume();
      step = 0;
      nextTime = ctx.currentTime + 0.05;
      master.gain.setValueAtTime(BEAT_GAIN, ctx.currentTime);
      if (!timer) timer = setInterval(tick, LOOKAHEAD_MS);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      if (ctx) ctx.suspend();
    },
    setBpm(b) {
      bpm = b;
    },
    /* Lower the beat under the voice, and bring it back after. */
    duck(on) {
      if (!ctx || !master) return;
      const target = on ? DUCK_GAIN : BEAT_GAIN;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
    },
    dispose() {
      this.stop();
      if (ctx) ctx.close();
      ctx = null;
    },
  };
}

/* Say one line, then call back. `onend` always fires exactly once — a browser
 * whose synthesis errors still moves the loop along. */
export function speak(text, onend) {
  if (!speechSupported()) {
    if (onend) onend();
    return;
  }
  const u = new window.SpeechSynthesisUtterance(text);
  u.rate = 0.95;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    if (onend) onend();
  };
  u.onend = finish;
  u.onerror = finish;
  window.speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (speechSupported()) window.speechSynthesis.cancel();
}
