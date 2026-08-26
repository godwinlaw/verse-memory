/* Record the whole recitation, then transcribe it in one shot.
 *
 * Written like recognizer.js: an optional overlay the app runs happily
 * without. `recordingSupported()` coming back false — or `transcribeUrl` never
 * having been configured — just means Speak mode listens the way it always
 * has, through the browser's own streaming recognizer. Nothing here is a
 * replacement for that file; it is a second door into the same room, and
 * App.js is where the choice between them is made and visible.
 *
 * Why a second door at all. Streaming is the wrong *shape* for this app, and
 * the reasons are not tuning problems that a better threshold would fix
 * (docs/research/asr.md §1, §1.2, §1.3):
 *
 *   - Chrome desktop ends a `continuous` session of its own accord after about
 *     a minute, with no error and no ending a caller can tell from a real one.
 *     A sixty-second passage sits exactly on that line.
 *   - On Chrome for Android `continuous` is a documented no-op — MDN's compat
 *     data records "The property can be set, but has no effect". The car is a
 *     phone, so the mode's whole use case is the one where the flag does
 *     nothing.
 *   - Restarting a session that ended gets rate-limited, and a session that
 *     trips that limiter thereafter ends the instant it opens, forever.
 *     recognizer.js backs off around it, which is a good patch on a bad shape.
 *
 * None of those exist for a recorder. A MediaRecorder holds the microphone for
 * as long as it is asked to, on every platform, and the transcript arrives once
 * rather than in revisions. What is paid for it is a wait — a second or three
 * after the member stops — and Speak mode already pauses to say something after
 * every recital, so the wait lands inside a gap the design had already accepted.
 *
 * **The verse is never sent.** Not from here, and not from the Worker on the
 * other end. Every "bias the recogniser toward the expected text" mechanism —
 * Whisper's `initial_prompt` and `prefix`, Chrome's `phrases`, Deepgram's
 * keyterms — makes the engine more likely to return the expected words whether
 * or not the member said them, which is free accuracy for a dictation app and a
 * validity bug for a scoring one. See the head of worker/transcribe.js, where
 * the rule is enforced rather than merely stated.
 *
 * The seam is `{ start, stop, cancel }` and the split between the last two is
 * the same one speaker.js makes, for the same reason: `stop(onDone)` is the
 * turn ending, so it uploads and calls back, and `cancel()` is the caller
 * taking control back, so it does neither. A Stop press that still posted the
 * audio and still called back would reopen a microphone for a session nobody
 * is in.
 *
 * And it fails soft, everywhere. A refused microphone reports through
 * `onError`; every other failure — a dead endpoint, a timeout, a malformed
 * body, a blob over the cap — resolves `onDone("")`, which Speak mode already
 * knows how to answer (scoreRecital abstains, and the verse is read out
 * together). A hands-free loop waiting forever for a callback has ended without
 * telling anybody, at the wheel, which is the one place there is nobody free to
 * press a button.
 *
 * The pure parts — `pickMimeType`, `transcriptFrom`, `recordingRejection` — take
 * plain values and are unit-tested without a window, the way speaker.js keeps
 * `pickVoice` apart from its seam. */

/* Containers worth asking for, best first.
 *
 * Opus is the whole reason to prefer the first two: it is the only codec here
 * tuned for speech at a bitrate a phone on cellular can spare, and a forty
 * second recitation comes out in tens of kilobytes rather than megabytes.
 * WebM/Opus is Chrome and Firefox; Ogg/Opus is Firefox's other spelling of it;
 * `audio/mp4` (AAC) is Safari, which supports neither of the first two and
 * costs a few times the bytes for the same speech. Whisper takes all of them.
 * Nothing supported is an honest answer and returns "" — the caller falls back
 * to the streaming recognizer rather than recording something nobody can
 * decode. */
export const MIME_PREFERENCE = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm", "audio/mp4"];

/* Opus at 16 kbps mono is comfortably intelligible speech and is what keeps the
 * upload small enough that the size cap below is a guard rather than a limit:
 * ninety seconds lands near 180 KB, a typical forty-second recitation near 80.
 * Recording a verse at music bitrates would cost a member on cellular real
 * money for no accuracy at all — Whisper resamples to 16 kHz regardless. */
export const AUDIO_BITS_PER_SECOND = 16000;

/* The hard ceiling on one recording. Nothing a member recites from memory runs
 * to ninety seconds — the longest shipped passage is well under it — so this is
 * not a limit on the feature, it is the thing that stops a microphone left open
 * by a bug from posting an hour of a car to a paid endpoint. The Worker refuses
 * the same way from its own side, because a client-side cap protects nothing:
 * see docs/research/audio-tools-2026.md §6, "a Worker proxy that accepts any
 * request is not a security measure". */
export const MAX_RECORD_MS = 90000;

/* A recorder asked to stop takes a moment to flush its last chunk, so the
 * duration guard is checked against the cap plus a beat rather than against the
 * cap exactly. Refusing a recording for being one frame over its own ceiling
 * would throw away a recital the member actually gave. */
export const RECORD_GRACE_MS = 2000;

/* One megabyte, matching the Worker's cap. At 16 kbps this is around eight
 * minutes of audio, so a blob that reaches it is not a long recitation — it is
 * a browser that ignored the bitrate hint, or a bug. Either way it is not worth
 * uploading. */
export const MAX_UPLOAD_BYTES = 1000000;

/* How long the endpoint gets before the turn gives up on it. A hung request is
 * the failure that strands a hands-free loop: the member has stopped speaking,
 * the app has said nothing, and there is no press available to get out of it.
 * Fifteen seconds is generous for a Whisper-turbo round trip on a small blob
 * and still short enough that the loop recovers inside one turn. */
export const FETCH_TIMEOUT_MS = 15000;

/* And how long to wait for the recorder's own `onstop` before uploading
 * whatever chunks have already arrived. Same argument, one layer down. */
export const STOP_TIMEOUT_MS = 1500;

/* Is anybody speaking?
 *
 * A recorder produces no transcript while it runs, so the silence timer that
 * ends a turn has nothing to re-arm from — which is what this is for. An
 * AnalyserNode on the same stream gives a level, and a level over a floor is
 * "the member is still going", which is exactly the signal `onText` gives the
 * streaming path. It is deliberately not a voice-activity model: it cannot tell
 * a member from a passing truck, and it does not have to, because everything
 * downstream of it is a timer with a ceiling over it. */
export const SOUND_RMS = 0.02;
export const SOUND_POLL_MS = 100;
const ANALYSER_FFT = 1024;

/* Error codes shared with recognizer.js, so `copy.speak.micError` reads them
 * without learning that there is a second way to listen. */
const errorFor = (err) => {
  const name = (err && (err.name || err.message)) || "";
  if (name === "NotAllowedError" || name === "SecurityError") return "not-allowed";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "no-microphone";
  return "failed";
};

/* ------------------------------------------------------------------- pure */

/* A mime type is compared without its spaces and without its case, because a
 * browser is free to hand back `audio/webm; codecs=opus` where the constant
 * above writes `audio/webm;codecs=opus` and the difference is not a difference. */
const normMime = (t) =>
  String(t || "")
    .toLowerCase()
    .replace(/\s+/g, "");

/* The best container the browser will actually record, or "" if it will record
 * none of them. Pure, and the whole of the preference rule: a caller hands in
 * what `MediaRecorder.isTypeSupported` said yes to and gets back which one to
 * ask for. */
export function pickMimeType(supported) {
  const have = new Set((Array.isArray(supported) ? supported : []).map(normMime));
  return MIME_PREFERENCE.find((t) => have.has(normMime(t))) || "";
}

/* The transcript out of a response body, or "" out of anything else.
 *
 * The Worker normalises both providers to `{ text }`, and `{ result: { text } }`
 * is Workers AI's own envelope, accepted here so that pointing `transcribeUrl`
 * straight at an unwrapped endpoint during a spike still works. Everything else
 * — a string, a null, an error object, a body that was HTML because a proxy
 * returned a login page — is "" rather than a throw, because there is no caller
 * for whom a thrown parse is better than an empty recital. */
export function transcriptFrom(body) {
  if (!body || typeof body !== "object") return "";
  const text =
    typeof body.text === "string"
      ? body.text
      : body.result && typeof body.result.text === "string"
        ? body.result.text
        : "";
  return text.trim();
}

/* Why a recording should not be sent, or null if it should.
 *
 * Pure, and checked on the way out rather than only on the way in: the cap on
 * recording length is a timer and timers can be missed, so the bytes are looked
 * at as well. "empty" is the commonest of these by far and is not a fault — it
 * is a member who never said anything, which the loop already answers by
 * reading the verse. */
export function recordingRejection({ bytes = 0, ms = 0 } = {}) {
  if (!bytes) return "empty";
  if (bytes > MAX_UPLOAD_BYTES) return "too-large";
  if (ms > MAX_RECORD_MS + RECORD_GRACE_MS) return "too-long";
  return null;
}

/* ------------------------------------------------------------------- seam */

/* What this browser will let us record, asked of the browser rather than
 * guessed from a user agent. */
function supportedMimeTypes(win) {
  const MR = win.MediaRecorder;
  if (typeof MR !== "function" || typeof MR.isTypeSupported !== "function") return [];
  return MIME_PREFERENCE.filter((t) => {
    try {
      return MR.isTypeSupported(t);
    } catch {
      return false;
    }
  });
}

/* Asked once at startup, so no view-model ever has to question the window.
 * Three things have to be true — a recorder, a way to open the microphone, and
 * a container both ends understand — and any of them missing simply means Speak
 * mode listens the way it always has. */
export function recordingSupported() {
  if (typeof window === "undefined") return false;
  const nav = window.navigator;
  if (!nav || !nav.mediaDevices || typeof nav.mediaDevices.getUserMedia !== "function") return false;
  return !!pickMimeType(supportedMimeTypes(window));
}

/* Watch the level on a live stream and call back while there is sound on it.
 * Returns a function that tears the whole thing down, or null if the browser
 * would not give us an analyser — in which case the caller is on its own timer,
 * which is why App.js arms a ceiling per turn regardless of this. */
function meterSound(win, stream, onSound) {
  const Ctx = win.AudioContext || win.webkitAudioContext;
  if (!Ctx || typeof onSound !== "function") return null;
  let ctx = null;
  let timer = null;
  try {
    ctx = new Ctx();
    const analyser = ctx.createAnalyser();
    if (typeof analyser.getFloatTimeDomainData !== "function") throw new Error("no float data");
    analyser.fftSize = ANALYSER_FFT;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    timer = win.setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      if (Math.sqrt(sum / buf.length) >= SOUND_RMS) onSound();
    }, SOUND_POLL_MS);
  } catch {
    if (timer) win.clearInterval(timer);
    if (ctx) {
      try {
        ctx.close();
      } catch {
        /* a context that never opened */
      }
    }
    return null;
  }
  return () => {
    win.clearInterval(timer);
    try {
      ctx.close();
    } catch {
      /* already closed, or a browser mid-teardown */
    }
  };
}

/* One recorder for one turn.
 *
 * `endpoint` is `appConfig.transcribeUrl`; with nothing configured this returns
 * null, which is the same answer an unsupported browser gets and the same
 * fallback either way. `onSound` fires while there is a voice on the microphone
 * and is what the caller's silence timer re-arms from. `onError` is a microphone
 * that was refused or is not there — a failure that cannot resolve itself
 * mid-session, so the caller stops rather than grading past it. */
export function createTranscriber({ endpoint, onSound, onError } = {}) {
  if (!endpoint || !recordingSupported()) return null;
  const win = window;
  const mimeType = pickMimeType(supportedMimeTypes(win));

  /* The generation token, exactly as speaker.js uses one: bumping it is what
   * makes every callback still in flight inert, without having to find and
   * unpick each of them. */
  let token = 0;
  let stream = null;
  let recorder = null;
  let unmeter = null;
  let cap = null;
  let startedAt = 0;
  let stopping = false;
  const chunks = [];

  /* Let go of the microphone. Called the moment the audio is captured rather
   * than when the upload finishes: the recording indicator staying lit through
   * every transcription would tell a member the app is still listening while it
   * is only talking to a server. */
  const release = () => {
    if (unmeter) unmeter();
    unmeter = null;
    if (cap) win.clearTimeout(cap);
    cap = null;
    if (stream) {
      try {
        stream.getTracks().forEach((t) => t.stop());
      } catch {
        /* a stream the browser already reclaimed */
      }
    }
    stream = null;
    recorder = null;
  };

  const blobOf = () => (chunks.length ? new win.Blob(chunks, { type: mimeType }) : null);

  /* POST the recording and resolve with whatever transcript came back — or with
   * "" for every way that can fail, which is the whole failure policy of this
   * file in one function. The timeout is the important half: a request that
   * hangs is what strands the loop. */
  const send = (blob) => {
    const ctl = typeof win.AbortController === "function" ? new win.AbortController() : null;
    const timer = win.setTimeout(() => {
      if (ctl) ctl.abort();
    }, FETCH_TIMEOUT_MS);
    return win
      .fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": blob.type || mimeType || "application/octet-stream" },
        body: blob,
        signal: ctl ? ctl.signal : undefined,
      })
      .then((res) => (res && res.ok ? res.json() : null))
      .then(transcriptFrom)
      .catch(() => "")
      .then((text) => {
        win.clearTimeout(timer);
        return text;
      });
  };

  return {
    /* Open the microphone. Asynchronous by necessity — a permission prompt sits
     * in the middle of it — so a `stop()` that lands before the stream does
     * still calls back, with nothing. */
    start() {
      token += 1;
      const mine = token;
      stopping = false;
      chunks.length = 0;
      startedAt = Date.now();
      win.navigator.mediaDevices
        .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
        .then((s) => {
          if (mine !== token) {
            s.getTracks().forEach((t) => t.stop());
            return;
          }
          stream = s;
          recorder = new win.MediaRecorder(s, { mimeType, audioBitsPerSecond: AUDIO_BITS_PER_SECOND });
          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size) chunks.push(e.data);
          };
          recorder.start();
          unmeter = meterSound(win, s, () => {
            if (mine === token) onSound && onSound();
          });
          /* The ceiling. It stops the recorder rather than discarding what it
           * has, so a session that somehow ran long still gets marked on its
           * first ninety seconds instead of losing the recital entirely. */
          cap = win.setTimeout(() => {
            try {
              recorder.stop();
            } catch {
              /* already stopped */
            }
          }, MAX_RECORD_MS);
        })
        .catch((err) => {
          if (mine !== token) return;
          release();
          if (onError) onError(errorFor(err));
        });
    },

    /* The turn ending: close the recording, send it, and call back exactly once
     * with the transcript — or with "" for every failure, since the caller is a
     * loop that must not be left waiting. */
    stop(onDone) {
      if (stopping) return;
      stopping = true;
      const mine = token;
      let settled = false;
      let sent = false;

      const settle = (text) => {
        if (settled) return;
        settled = true;
        if (mine === token && onDone) onDone(text || "");
      };

      const upload = () => {
        if (sent) return;
        sent = true;
        const ms = Date.now() - startedAt;
        release();
        const blob = blobOf();
        if (recordingRejection({ bytes: blob ? blob.size : 0, ms })) return settle("");
        send(blob).then(settle, () => settle(""));
      };

      if (!recorder || recorder.state === "inactive") return upload();
      recorder.onstop = upload;
      /* And a watchdog under it: an `onstop` that never arrives must not be the
       * end of the session, so whatever chunks are already in hand go anyway. */
      win.setTimeout(upload, STOP_TIMEOUT_MS);
      try {
        recorder.stop();
      } catch {
        upload();
      }
    },

    /* The caller taking control back. Nothing is uploaded and nothing calls
     * back — see the head of the file. */
    cancel() {
      token += 1;
      stopping = true;
      chunks.length = 0;
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          /* a recorder that never opened */
        }
      }
      release();
    },
  };
}
