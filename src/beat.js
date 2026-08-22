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

/* The scheduler books far further ahead than a lookahead loop normally would,
 * and that is the whole reason run mode survives being a *run*. A browser
 * throttles a background tab's timers to about once a second — and a phone in
 * a pocket with the screen off is a background tab. Booking 120ms of audio
 * every 25ms works beautifully on screen and starves into silence the moment
 * the member puts the phone away, which is precisely when the beat matters.
 * So the window is two seconds: even a timer beaten down to 1Hz always has a
 * second of music still booked ahead of the clock. */
const LOOKAHEAD_MS = 200; // how often the scheduler wakes
const SCHEDULE_AHEAD_S = 2.0; // how far it books notes each wake
const BEAT_GAIN = 0.5; // audible over road noise and a pair of earbuds
const DUCK_GAIN = 0.22; // while the voice is speaking — under it, not gone

export function createBeat() {
  if (!beatSupported()) return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  let ctx = null;
  let master = null;
  /* Every drum and bass note is played into a bus rather than straight at the
   * master gain, and the bus is thrown away whenever the beat restarts. With
   * two seconds of music always booked ahead (see SCHEDULE_AHEAD_S), switching
   * preset would otherwise lay the new pattern over two seconds of the old one
   * — notes already handed to the audio clock cannot be recalled, but a bus
   * they are playing into can be unplugged. */
  let bus = null;
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
    freshBus();
  };

  /* Unplug whatever is still playing and start a clean bus. */
  const freshBus = () => {
    if (bus) bus.disconnect();
    bus = ctx.createGain();
    bus.gain.value = 1;
    bus.connect(master);
  };

  const kick = (t) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(g).connect(bus);
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
    src.connect(filter).connect(g).connect(bus);
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
    osc.connect(filter).connect(g).connect(bus);
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
      /* A context created outside a gesture — or suspended by a previous Stop —
       * starts silent, and `resume()` is a promise: booking notes against a
       * clock that has not started yet schedules them all in the past, which is
       * a beat that never plays. So the first note is placed once the context
       * is really running. */
      const begin = () => {
        freshBus(); // whatever the last pattern still had booked is unplugged
        step = 0;
        nextTime = ctx.currentTime + 0.05;
        master.gain.setValueAtTime(BEAT_GAIN, ctx.currentTime);
        if (!timer) timer = setInterval(tick, LOOKAHEAD_MS);
        tick(); // book the first bar now rather than a timer-tick late
      };
      if (ctx.state === "suspended") {
        const p = ctx.resume();
        if (p && typeof p.then === "function") p.then(begin, begin);
        else begin();
      } else begin();
    },

    /* Two plain beeps, for a member who pressed play and heard nothing: if
     * these are silent the fault is the device or the tab, not the beat. */
    testTone() {
      ensure();
      if (ctx.state === "suspended") ctx.resume();
      master.gain.setValueAtTime(BEAT_GAIN, ctx.currentTime);
      const t0 = ctx.currentTime + 0.05;
      [0, 0.3].forEach((offset, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.frequency.value = i ? 880 : 660;
        g.gain.setValueAtTime(0.0001, t0 + offset);
        g.gain.exponentialRampToValueAtTime(0.6, t0 + offset + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + offset + 0.22);
        osc.connect(g).connect(master);
        osc.start(t0 + offset);
        osc.stop(t0 + offset + 0.25);
      });
    },

    /* What the audio hardware actually thinks is going on — "running",
     * "suspended", "closed", or "off" where there is no context at all. It is
     * reported on the screen, because a silent run has no other symptom. */
    state() {
      return ctx ? ctx.state : "off";
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

/* A verse is said in sentence-sized pieces, because Chrome stops speaking part
 * way through an utterance longer than about fifteen seconds and never fires
 * `onend` — which, in a loop that waits for `onend` before moving on, is not a
 * clipped verse but a session that stops dead. Splitting on sentences keeps
 * every utterance well inside that, and gives the voice its punctuation back. */
const MAX_CHUNK_CHARS = 180;

export function chunkForSpeech(text, max = MAX_CHUNK_CHARS) {
  const clean = String(text || "").trim();
  if (!clean) return [];
  if (clean.length <= max) return [clean];
  // Sentence first, then clause, then a hard split — whichever the text offers.
  const pieces = clean.match(/[^.!?;:]+[.!?;:]*\s*/g) || [clean];
  const out = [];
  let buf = "";
  for (const piece of pieces) {
    if ((buf + piece).length > max && buf) {
      out.push(buf.trim());
      buf = "";
    }
    if (piece.length > max) {
      // One enormous sentence: cut it on the last space inside the window.
      let rest = piece;
      while (rest.length > max) {
        const cut = rest.lastIndexOf(" ", max);
        out.push(rest.slice(0, cut > 40 ? cut : max).trim());
        rest = rest.slice(cut > 40 ? cut : max);
      }
      buf = rest;
    } else buf += piece;
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter(Boolean);
}

/* Roughly how long a line takes to say, used to arm the watchdog below. About
 * two and a half words a second at the rate we speak at, with a floor for the
 * very short lines a reference is. */
export function speechMs(text) {
  const words = String(text || "")
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(2500, (words / 2.5) * 1000);
}

/* A token so a cancelled recitation cannot go on speaking its later chunks. */
let speechToken = 0;

/* Say one line — in pieces if it is long — then call back. `onEnd` fires
 * exactly once, whatever the browser does: an utterance that errors, or that
 * simply never reports itself finished, still moves the loop along, because a
 * hands-free session has nobody to press anything when it stalls. */
export function speak(text, handlers = {}) {
  const { onStart, onEnd } = typeof handlers === "function" ? { onEnd: handlers } : handlers;
  const done = () => {
    if (onEnd) onEnd();
  };
  if (!speechSupported()) return done();

  const chunks = chunkForSpeech(text);
  if (!chunks.length) return done();

  speechToken += 1;
  const mine = speechToken;
  let started = false;

  const sayChunk = (i) => {
    if (mine !== speechToken) return;
    if (i >= chunks.length) return done();

    const u = new window.SpeechSynthesisUtterance(chunks[i]);
    u.rate = 0.95;
    let settled = false;
    let watchdog = null;
    const next = () => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      if (mine !== speechToken) return;
      sayChunk(i + 1);
    };
    u.onstart = () => {
      if (started || mine !== speechToken) return;
      started = true;
      if (onStart) onStart();
    };
    u.onend = next;
    u.onerror = next;
    window.speechSynthesis.speak(u);
    /* The watchdog is the whole reason this is safe to leave running in a car:
     * a browser that goes quiet without saying so is indistinguishable from one
     * still talking, so the loop gives every line a generous ceiling and then
     * carries on regardless. */
    watchdog = setTimeout(next, speechMs(chunks[i]) * 2.5 + 5000);
    // A voice that never reports starting should not hold the beat ducked.
    if (!started && onStart) setTimeout(() => u.onstart && u.onstart(), 400);
  };

  sayChunk(0);
}

export function stopSpeaking() {
  speechToken += 1;
  if (speechSupported()) window.speechSynthesis.cancel();
}
