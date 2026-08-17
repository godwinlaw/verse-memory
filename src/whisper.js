/* Whisper on the device: the fallback recognition engine.
 *
 * Loaded only when a member actually chooses it (see recognizer.js), because
 * both halves of it are a download: transformers.js from a CDN, and the model
 * weights from Hugging Face. Once fetched the browser caches them, so the cost
 * is paid once per device.
 *
 * It exists for the two members the browser's own engine does not serve: the one
 * on Firefox, which has no SpeechRecognition at all, and the one who would
 * rather their voice did not travel to Google to be turned into words. Nothing
 * here leaves the machine after the model arrives.
 *
 * What it cannot do is stream. Whisper transcribes a stretch of audio, not a
 * running one, so the passage arrives a phrase at a time instead of a word at a
 * time. That shapes the whole module: rather than transcribing on a timer and
 * cutting members off mid-clause, it listens for the pause at the end of a
 * phrase and sends what came before it. The pauses in recited scripture are
 * exactly the phrase boundaries, so this lands close to where a member would
 * have drawn them anyway — and those phrases are the chunks voice.js hands back
 * one at a time when they undo. */

const CDN = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0";

/* English-only Whisper, quantised: about 75 MB the first time, then cached. The
 * larger multilingual models buy nothing here — every passage is in English —
 * and the smaller `tiny` mishears enough words to cost a member marks on a
 * write-out that should have committed the verse. */
const MODEL = "onnx-community/whisper-base.en";
const DTYPE = "q8";

/* Whisper's own sample rate. Anything else has to be resampled before it goes
 * in, so the capture graph is asked for this directly and only resamples when a
 * browser declines to give it (Safari picks its own rate). */
const SAMPLE_RATE = 16000;

/* Where a phrase ends. Loud enough to be speech, quiet enough for long enough to
 * be a breath, and never a segment so long that a member has recited half the
 * passage before seeing any of it. */
const SPEECH_RMS = 0.012;
const SILENCE_MS = 650;
const MIN_SPEECH_MS = 400;
const MAX_SEGMENT_MS = 12000;

/* A tap on the capture graph: hands every block of samples back to the main
 * thread and does nothing else. Registered from a blob rather than a file
 * because the app has no build step to copy one into place. */
const WORKLET_SRC = `
class TapProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor("tap", TapProcessor);
`;

/* Root-mean-square level of a block — how loud it is, in one number. */
function rms(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / (samples.length || 1));
}

/* Linear resample to Whisper's rate. Only reached on a browser that ignored the
 * sample rate the AudioContext asked for. */
function resample(samples, from, to) {
  if (from === to) return samples;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(samples.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const at = i * ratio;
    const low = Math.floor(at);
    const high = Math.min(low + 1, samples.length - 1);
    out[i] = samples[low] + (samples[high] - samples[low]) * (at - low);
  }
  return out;
}

/* Whisper marks non-speech with bracketed tags ("[BLANK_AUDIO]", "(coughing)").
 * They are the model narrating the recording, not words the member said, so
 * they never belong in a transcript that is about to be graded. */
function cleanText(text) {
  return String(text || "")
    .replace(/[[(][^\])]*[\])]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

let transcriber = null; // memoized across sessions — the model loads once

async function loadTranscriber(onProgress) {
  if (transcriber) return transcriber;
  const { pipeline } = await import(CDN);
  transcriber = await pipeline("automatic-speech-recognition", MODEL, {
    dtype: DTYPE,
    progress_callback: (p) => {
      if (p && p.status === "progress" && typeof p.progress === "number") onProgress(Math.round(p.progress));
    },
  });
  return transcriber;
}

/* Why capture failed, in the vocabulary recognizer.ERRORS uses. */
function captureError(e) {
  const name = e && e.name;
  if (name === "NotAllowedError" || name === "SecurityError") return "not-allowed";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "no-microphone";
  return "failed";
}

/* One microphone session. `handlers` is the same four callbacks every engine is
 * driven through — see recognizer.js for what each one means. */
export function createWhisper(handlers) {
  let stream = null;
  let context = null;
  let node = null;
  let source = null;
  let running = false;
  let disposed = false;

  // The phrase being spoken, and how much quiet has followed it.
  let buffer = [];
  let bufferedMs = 0;
  let quietMs = 0;
  let speaking = false;
  // Transcription is chained rather than fired in parallel, so two phrases
  // cannot come back out of the order they were said in.
  let queue = Promise.resolve();

  function reset() {
    buffer = [];
    bufferedMs = 0;
    quietMs = 0;
    speaking = false;
  }

  /* Send what has been buffered to the model and write back whatever it heard. */
  function flush() {
    if (!speaking || bufferedMs < MIN_SPEECH_MS) return reset();
    const audio = new Float32Array(buffer.reduce((n, b) => n + b.length, 0));
    let at = 0;
    for (const block of buffer) {
      audio.set(block, at);
      at += block.length;
    }
    reset();
    handlers.onStatus("working");
    queue = queue
      .then(async () => {
        if (disposed) return;
        const out = await transcriber(audio);
        const text = cleanText(out && out.text);
        if (text) handlers.onFinal(text);
      })
      .catch(() => handlers.onError("failed"))
      .then(() => {
        if (running && !disposed) handlers.onStatus("listening");
      });
  }

  /* One block of samples off the capture graph: buffered, and measured for the
   * pause that ends the phrase. */
  function onBlock(block) {
    if (!running) return;
    const samples = resample(block, context.sampleRate, SAMPLE_RATE);
    const ms = (samples.length / SAMPLE_RATE) * 1000;
    const loud = rms(samples) > SPEECH_RMS;

    if (loud) {
      speaking = true;
      quietMs = 0;
    } else if (!speaking) {
      // Silence before a word has been said is not part of the phrase.
      return;
    } else {
      quietMs += ms;
    }

    buffer.push(samples);
    bufferedMs += ms;
    if (quietMs >= SILENCE_MS || bufferedMs >= MAX_SEGMENT_MS) flush();
  }

  async function open() {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    context = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SAMPLE_RATE });
    source = context.createMediaStreamSource(stream);
    if (context.audioWorklet) {
      const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: "text/javascript" }));
      await context.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      node = new AudioWorkletNode(context, "tap");
      node.port.onmessage = (e) => onBlock(e.data);
    } else {
      // Deprecated, but the only tap older Safari offers.
      node = context.createScriptProcessor(4096, 1, 1);
      node.onaudioprocess = (e) => onBlock(new Float32Array(e.inputBuffer.getChannelData(0)));
    }
    source.connect(node);
    // A ScriptProcessor only runs while it is connected to something; the gain
    // of zero is what keeps the member from hearing themselves back.
    const sink = context.createGain();
    sink.gain.value = 0;
    node.connect(sink);
    sink.connect(context.destination);
  }

  function close() {
    running = false;
    if (node) node.disconnect();
    if (source) source.disconnect();
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (context && context.state !== "closed") context.close().catch(() => {});
    node = source = stream = context = null;
    reset();
  }

  return {
    async start() {
      if (running) return;
      try {
        handlers.onStatus("loading", 0);
        await loadTranscriber((pct) => !disposed && handlers.onStatus("loading", pct));
        if (disposed) return;
        await open();
        if (disposed) return close();
        running = true;
        handlers.onStatus("listening");
      } catch (e) {
        close();
        handlers.onError(captureError(e));
      }
    },
    stop() {
      if (!running) return close();
      // Whatever was mid-phrase when they stopped is still worth writing down.
      flush();
      close();
      handlers.onStatus("off");
    },
    dispose() {
      disposed = true;
      close();
    },
  };
}
