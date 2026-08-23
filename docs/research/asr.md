# Speech recognition for recited scripture — research

Researched 2026-08-22. Chrome stable at the time of writing is **151/152**
([Chrome Releases, Aug 2026](https://chromereleases.googleblog.com/2026/08/)).

Everything below is about one question: **the app speaks a reference, the member
recites 20–60 seconds of ESV text from memory, and the app scores it.** Today
that runs on `webkitSpeechRecognition` with `continuous = true` and
`interimResults = true` (`src/recognizer.js`), with a 2.5 s silence timer in
`App.js` deciding when the member stopped, and `src/voice.js` fitting the
recognised words back onto the passage.

---

## Recommendations

### The one thing that matters most, stated first

**There is a trap at the centre of this problem.** Every "bias the recogniser
toward the expected text" mechanism — Chrome's `phrases`, Whisper's
`initial_prompt`, Deepgram's keyterms — makes the recogniser *more likely to
output the expected verse whether or not the member actually said it*. That is
free accuracy for a dictation app and a **validity bug for a scoring app**. Whisper's
`prefix` parameter is the extreme case: it literally forces the decoder to start
with the text you give it.

So the biasing recommendation is not "bias toward this verse", it is:

- **Bias toward the vocabulary, not the word sequence.** Feed the recogniser the
  *rare tokens* of the corpus — proper nouns (`Shadrach`, `Melchizedek`,
  `Zerubbabel`), archaic function words (`thy`, `thine`, `hath`), and
  `steadfast` / `LORD` — not the ordered verse text. This fixes "the engine
  cannot spell Habakkuk" without fixing "the member skipped verse 3".
- **Use moderate boosts.** MDN is explicit: *"A high value such as 9.0 or 10.0
  might make the recognition engine erroneously recognize other phrases as the
  specified phrase. Therefore, such values should be used rarely"*
  ([MDN, `SpeechRecognitionPhrase.boost`](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognitionPhrase/boost)).
  Start at 2.0–3.0 and measure.
- **If you ever do verse-level prompting, keep two transcripts** — an unbiased
  one for the score and a biased one for display — or the score stops meaning
  anything.

This tension should be written into the design the way "the microphone is never
started by anything but the member" already is.

### Ranked, cheapest-effective first

**1. Stop streaming. Record the recitation, then transcribe it in one shot.**
*(Costs: one architectural change; ~$0.0005 per audio minute; ~214 audio minutes
per day free.)*

This is the single biggest win and it removes an entire class of bugs rather
than patching them:

- Chrome's `continuous` session **stops on its own after roughly a minute**, with
  no error and no `onend` you can distinguish from a real end
  ([chromium-html5, "Web Speech API limit of 60 seconds?"](https://groups.google.com/a/chromium.org/g/chromium-html5/c/s2XhT-Y5qAc)).
  A 60-second passage is right on that line.
- `continuous` on **Chrome for Android is a documented no-op** — MDN's compat
  data records *"The property can be set, but has no effect"*
  ([BCD `api/SpeechRecognition.json`](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/SpeechRecognition.json)).
  The car use case is on a phone. This is very likely a large part of why the
  experience "really sucks".
- iOS Safari's implementation is separately unreliable in continuous mode
  (self-stopping, first-attempt failures, interim results that behave
  inconsistently) — see §2.4.
- The restart pattern the app uses today (`rec.start()` immediately inside
  `onend`) is the pattern Chrome **rate-limits**, which makes sessions "end
  instantaneously" (§1.3).

Speak mode already has a discrete LISTEN phase and a half-duplex rule, so
record-then-transcribe fits the existing shape almost exactly: `MediaRecorder`
opens where the recognizer opens today, closes on the endpointer, and posts one
blob to a Cloudflare Worker.

Recommended backend: **Cloudflare Workers AI `@cf/openai/whisper-large-v3-turbo`**,
because the app already deploys to Workers, the price is `$0.00051 per audio
minute`, and — critically — the endpoint exposes `initial_prompt` *and*
`prefix` biasing parameters
([Cloudflare model page](https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/)).
The free allowance of 10,000 neurons/day at 46.63 neurons/audio-minute works out
to **~214 free audio minutes per day** across the whole congregation
([Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)).
Beyond that, an hour of recitation costs about **three cents**.

Perceived latency cost: a 20-second recitation becomes a ~1–3 second wait after
the member stops speaking, instead of a transcript that appears as they go.
*(That range is an estimate from typical turbo-Whisper serving latencies plus a
~60 KB Opus upload — I did not benchmark Workers AI directly. Measure it before
committing.)* Speak mode already pauses to say feedback, so a short wait lands
inside a gap the design has already accepted.

**2. Same-day free patches to the Web Speech path** (which you still want as the
desktop fast path and the offline fallback). *(Costs: an afternoon. Zero bytes,
zero money.)*

- **Back off the restart.** Never call `start()` synchronously inside `onend`;
  use a short delay and a consecutive-failure counter. See §1.3.
- **Endpoint on `speechend` / `soundend`, not a blind 2.5 s timer.** These are
  spec'd events (§5.1) and they fire on Chrome. Keep the timer only as a
  ceiling.
- **Set `maxAlternatives = 5` and pick the alternative that best matches the
  expected verse.** This is free best-of-N accuracy that feeds straight into the
  alignment `voice.js` already does. ⚠️ **Uncertain**: the spec allows it
  (§1.4) and Chrome has supported the attribute since Chrome 33, but there are
  widespread reports that Chrome returns a single alternative in practice,
  especially with `continuous`/`interimResults` on. **Test this empirically
  before building on it — it is a ten-minute experiment.**
- **Turn on `SpeechRecognition.phrases` where available** (Chrome **142+**,
  desktop only) with the *vocabulary* list from the caveat above. See §2.2.

**3. Endpointing: Silero VAD via `@ricky0123/vad-web`** if `speechend` proves
too jumpy for a car or a run. *(Costs: ~2 MB model + onnxruntime-web WASM,
loaded lazily on entering Speak mode.)* It loads from jsDelivr as **classic
`<script>` tags exposing a global** — the same pattern `index.html` already uses
for React/htm — so it fits the no-bundler constraint without argument (§5.2).
Load it with the same lazy `import()`-with-`.catch` discipline as
`loadRunPlaylist`.

**Not recommended right now:**

- **Whisper in the browser (transformers.js).** ~41 MB first load for
  `whisper-tiny.en` int8, ~77 MB for `base.en` int8 (§3.2). WebGPU is *slower*
  than WASM for Whisper on at least some Apple silicon (§3.4). And the feature
  that would justify it — `initial_prompt` — **is not implemented**; the PR is
  still open (§3.5). Revisit if that PR merges *and* you want offline-in-a-car.
- **Deepgram / AssemblyAI as the first move.** Both are excellent and both have
  real phrase biasing, but they are 8–10× the price of Workers AI Whisper for
  this workload and add a second vendor. They are the escalation if Whisper's
  accuracy on recited scripture disappoints (§6).

### What is free vs. costs money vs. costs bytes

| Change | Money | Bytes | Effort |
|---|---|---|---|
| Restart backoff, `speechend` endpointing | free | 0 | hours |
| `maxAlternatives` best-of-N | free | 0 | hours |
| `phrases` contextual biasing (Chrome 142+ desktop) | free | 0 | hours |
| Silero VAD endpointing | free | ~2 MB + ORT WASM, lazy | a day |
| Workers AI Whisper via Worker proxy | ~$0.0005/audio-min, ~214 min/day free | ~0 | a day or two |
| Deepgram Nova-3 + keyterms | $0.0056/audio-min | ~0 | a day |
| In-browser Whisper (transformers.js) | free per use | 41–77 MB first load | a week |

---

## 1. Web Speech API reality check

### 1.1 It goes to Google's servers, and it needs the network

**Confirmed.** Chrome's own developer blog says it plainly: Chrome "takes the
audio and sends it to Google's servers to perform the transcription"
([Chrome for Developers, *Voice driven web apps*](https://developer.chrome.com/blog/voice-driven-web-apps-introduction-to-the-web-speech-api)).
MDN repeats it as current behaviour: *"By default, using speech recognition on a
web page involves a server-based recognition engine. Your audio is sent to a web
service for recognition processing, so it won't work offline."*
([MDN, *Using the Web Speech API*](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API)).

Practical consequences for this app:

- **No network, no recognition.** A member reciting in a car with patchy
  cellular gets `network` errors, and `recognizer.js` correctly stops the whole
  session on those — which means one tunnel ends the sitting.
- **The transcription is a round trip.** Interim results are streamed back, but
  they are Google's guesses about conversational English, revised in flight.
- **Privacy**: every recitation is audio sent to a third party. Worth a line in
  the guide if it is not there already.

Since Chrome 139 there is an **on-device** path (§2.3) that changes this, but it
is opt-in, desktop-only, and has a troubled history on macOS.

### 1.2 Session limits and silent stopping

The spec has **no** stated session-length limit
([W3C/WebAudio Web Speech API spec](https://webaudio.github.io/web-speech-api/)).
Chrome's implementation does, in practice: with `continuous = true`, recognition
stops after roughly a minute even while audio continues, and **no error is
raised** — reported repeatedly on chromium-html5
([*Web Speech API limit of 60 seconds?*](https://groups.google.com/a/chromium.org/g/chromium-html5/c/s2XhT-Y5qAc)).
Chrome also stops accepting input after a period of silence.

⚠️ This "about a minute" figure is developer-observed, not documented by Google,
and may have moved. It is nonetheless the well-known behaviour that
`recognizer.js`'s `wanted` flag exists to paper over — and the comment in that
file ("Chrome ends a session of its own accord after a pause") is correct.

**No per-origin quota applies to Chrome-branded builds.** The often-cited "50
requests per day" limit is for the *Chrome Speech API key* used by Chromium
builds and by developers embedding Chromium — not for web pages running in
Chrome itself
([chromium-dev, *Raise Quota at Speech API?*](https://groups.google.com/a/chromium.org/g/chromium-dev/c/TJRsxtxkB_Y)).
This is exactly the failure mode that bites Electron apps
([electron#8810](https://github.com/electron/electron/issues/8810)) and is worth
knowing if the app is ever wrapped.

### 1.3 The `onend`-restart pattern, and why the current one is risky

The standard pattern is what `recognizer.js` does: keep a `wanted` flag, and on
an unrequested `onend`, call `start()` again. The problem is *how soon*.

Chrome **rate-limits rapid restarts**: developers who restart immediately on
`end` or on a `no-speech` error report that "speech-recognition sessions end
instantaneously" thereafter
([chromium-html5 thread](https://groups.google.com/a/chromium.org/g/chromium-html5/c/s2XhT-Y5qAc)).
The current code calls `rec.start()` **synchronously inside `onend`**, which is
the worst case for that limiter, and swallows the resulting exception with an
empty `catch` that relies on "the next `onend` will try again" — a loop that can
spin.

Concrete fixes, all free:

```
onend -> if (!wanted) off
      -> else setTimeout(restart, backoffMs)   // 250ms, doubling, capped
      -> count consecutive restarts inside N seconds; give up and surface an error
```

Also worth knowing: each restart is a **new** `SpeechRecognitionResultList`, so
`event.resultIndex` resets. `voice.js`'s `tail` model handles that correctly
because it settles text into `typed`, but any per-session accumulator elsewhere
would not.

### 1.4 `confidence` — what it means, and whether it is usable

The spec defines it as *"a numeric estimate between 0 and 1 of how confident the
recognition system is that the recognition is correct"*
([spec](https://webaudio.github.io/web-speech-api/)). Two things make it
close to useless here:

- It is **per-alternative for a whole result**, not per word. You cannot tell
  which word in a recited verse the engine was unsure about — which is precisely
  what a scoring app would want.
- The values on final results are **not calibrated in any documented way**.
  There is no published mapping from Chrome's `confidence` to an error rate.
- ⚠️ It is widely reported that Chrome leaves `confidence` at `0` on **interim**
  results, but I found **no primary source** for that in this research — treat
  it as unverified and check it with the same ten-minute `onresult` experiment
  as §7 item 1.

**Verdict:** do not gate anything on `confidence`. If you want a
"were you close?" signal, `grading.js` computing the edit distance against the
known passage is strictly better information than the engine's self-report,
because you know the answer and the engine does not.

### 1.5 `maxAlternatives` — the free best-of-N idea

The spec: *"This attribute will set the maximum number of
SpeechRecognitionAlternatives per result. The default value is 1."*
([spec](https://webaudio.github.io/web-speech-api/)). Chrome has supported the
attribute since **Chrome 33**, Safari since **14.1**
([BCD](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/SpeechRecognition.json)).

The idea is sound and it is exactly the right shape for this app: set
`maxAlternatives = 5`, and for each final result, score every alternative
against the expected passage with the machinery `voice.js` already has, then
accept the best-matching one. That converts N-best rescoring — a real ASR
technique — into ten lines of client code, and it **biases only the
*selection*, never the acoustics**, which makes it much safer for scoring than
`phrases` or `initial_prompt`: the engine still had to consider that hypothesis
on its own merits.

⚠️ **Uncertainty, flagged loudly.** I could not find a primary source
confirming how many alternatives Chrome actually returns in `continuous` +
`interimResults` mode. Multiple developer reports say Chrome returns one
alternative regardless of the setting, and none of the sources I found are
authoritative either way. This is trivially testable in the browser
(`console.log(result.length)` inside `onresult`) and should be tested before any
design depends on it.

---

## 2. Biasing recognition toward the expected text

### 2.1 `SpeechGrammarList` / JSGF is dead — spec-level, not just Chrome

The spec now says it outright:

> "Grammar support has been deprecated and removed. The grammar objects remain
> in the spec for backwards compatibility purposes only and do not affect speech
> recognition."
> — [W3C/WebAudio Web Speech API](https://webaudio.github.io/web-speech-api/)

That matches the long-standing Chromium position: grammars are ignored and are
**never sent to the server**
([chromium-html5, *SpeechGrammarList working?*](https://groups.google.com/a/chromium.org/g/chromium-html5/c/wHhkRzshYzw);
[chromium-dev, *Google Speech API - webkitSpeechGrammarList*](https://groups.google.com/a/chromium.org/g/chromium-dev/c/y0TO8MI10LI)).
`webkitSpeechGrammarList` still exists in Chrome (BCD lists `grammars` from
Chrome 33) and constructing one throws nothing — it is a **no-op**. Safari never
implemented it at all.

**Do not spend any time on JSGF.** It was the obvious answer and it is gone.

### 2.2 `SpeechRecognition.phrases` — contextual biasing, and it shipped

This is the replacement, and it is the most directly relevant new API for this
app.

- **What it is:** an array of `SpeechRecognitionPhrase` objects, each a
  `{ phrase, boost }` pair, assigned to `recognition.phrases`. `boost` is a
  float in **[0.0, 10.0]**, default 1.0
  ([MDN, `SpeechRecognition.phrases`](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/phrases);
  [W3C explainer](https://github.com/WebAudio/web-speech-api/blob/main/explainers/contextual-biasing.md)).
  It is an `ObservableArray`, so phrases can be swapped per card without
  rebuilding the recognizer.
- **Version:** **Chrome 142** on desktop
  ([BCD](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/SpeechRecognition.json);
  [Chrome 142 release notes](https://developer.chrome.com/release-notes/142);
  [Intent to Ship](https://www.mail-archive.com/blink-dev@chromium.org/msg14350.html)).
  Chrome is on 151/152 now, so **the primary target platform has this today.**
- **Platforms:** Windows, macOS, Linux, with ChromeOS to follow. **Not Android,
  not Android WebView** (Intent to Ship, explicit). BCD records
  `chrome_android: false`. Safari and Firefox: not supported.
- **The catch:** Chrome's implementation is tied to **on-device** recognition.
  The Intent to Ship references on-device models; MDN's own example sets
  `recognition.processLocally = true` alongside `recognition.phrases`; and the
  W3C explainer says *"Some user agents (e.g. Chrome) might only support
  on-device contextual biasing"*. So using `phrases` in Chrome means going
  through the SODA path in §2.3, with everything that implies.
- **No published WER numbers.** The explainer gives none. Treat "significantly
  improves accuracy for domain vocabulary" as a claim to verify, not a fact.

**How to use it here (safely).** Build one phrase list per session from the
*rare vocabulary* of the passage set — proper nouns, archaic forms, `LORD`,
`steadfast`, `Shadrach`, `Meshach`, `Abednego` — at boost 2.0–3.0. Do **not**
push whole verse text at boost 9. See the trap at the top of this document.

### 2.3 On-device recognition: `available()`, `install()`, `processLocally`

- **What it does:** `SpeechRecognition.available({ langs, processLocally })`
  returns `"available" | "downloadable" | "downloading" | "unavailable"`;
  `SpeechRecognition.install({ langs, processLocally })` triggers the language
  pack download; `recognition.processLocally = true` requires local processing
  and throws `language-not-supported` on `start()` if the pack is missing
  ([W3C explainer](https://github.com/WebAudio/web-speech-api/blob/main/explainers/on-device-speech-recognition.md);
  [MDN `processLocally`](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally);
  [MDN `install()`](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/install_static)).
- **Version:** `processLocally`, `available()`, `install()` all land in
  **Chrome 139**, desktop only; `chrome_android: false`
  ([BCD](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/SpeechRecognition.json)).
  It rides on Chrome's **SODA** components (visible at `chrome://components`).
- **Does it improve accuracy?** The explainer claims "better accuracy and
  latency" but gives **no benchmarks**. Do not assume on-device SODA beats
  Google's cloud model on hard vocabulary — historically the cloud model is the
  stronger one. What on-device unambiguously buys you is (a) no network
  dependency, (b) no audio leaving the device, and (c) **access to `phrases`**.
- ⚠️ **Reliability warning, and it lands on your primary platform.** There is a
  documented history of the on-device path breaking on **macOS**: Chromium issue
  [444393111](https://issues.chromium.org/issues/444393111)
  ("`speechRecognition.available({ processLocally: true, langs: ['en-US'] })`
  broken in macOS"), on-device Web Speech disabled until 142.0.7403.0 over a
  language-specifier regression, and downstream reports of `available()`
  returning `"downloading"` forever with no SODA component ever installing
  ([brave-browser#55414](https://github.com/brave/brave-browser/issues/55414)).
  I could not read the Chromium issue directly (the tracker requires sign-in),
  so **the current status on Chrome 151/152 macOS is unverified**. Test
  `await SpeechRecognition.available({ langs: ['en-US'], processLocally: true })`
  on the actual target machine before designing around it, and always have a
  cloud fallback.

### 2.4 Safari and iOS

- `webkitSpeechRecognition` exists from Safari **14.1** (macOS) / iOS 14.5.
  `continuous` is listed as properly supported only from **Safari 17**; 14.1–17
  had a partial implementation
  ([BCD](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/SpeechRecognition.json)).
- `phrases`, `processLocally`, `available()`, `install()`, `grammars`: **all
  false** on Safari and Safari iOS.
- Practical reports of iOS behaviour: the microphone not stopping when the
  speaker does, "buffer clogging", no recognition on the first attempt, and
  `interimResults` behaving inconsistently — with recognition sometimes
  throttling and flipping to cloud processing
  ([lilting.ch, *How to Stabilize the WebSpeech API on iOS*](https://lilting.ch/en/articles/ios-webspeech-api-tips);
  [WebKit/Documentation#120](https://github.com/WebKit/Documentation/issues/120)).
  The community workaround is **push-to-talk with a singleton recognizer**,
  warmed up in advance — which is nearly the opposite of a hands-free continuous
  loop.
- On macOS, "Listen for 'Hey Siri'" being enabled has been reported to suppress
  `onresult` entirely.

**Conclusion for phones:** the Web Speech API is not a sound foundation for
hands-free continuous recitation on either mobile browser. Android Chrome's
`continuous` does nothing; iOS Safari's is unreliable. This alone justifies
recommendation 1.

---

## 3. Whisper in the browser

### 3.1 Does it work with no bundler, from a CDN? Yes.

transformers.js v3+ is published as a browser-ready ES module on jsDelivr:

```js
import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";
const pipe = await pipeline("automatic-speech-recognition",
                            "onnx-community/whisper-base.en", { device: "webgpu" });
```

This is the documented usage and it requires no bundler
([transformers.js README](https://github.com/huggingface/transformers.js/);
[jsDelivr package](https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.2.4/README.md)).
It fits this app's constraints. It would want the same lazy
`import().catch()` treatment as `loadRunPlaylist`, and it really wants a Web
Worker so inference does not block the render thread.

### 3.2 Model sizes — real numbers from the model cards

From the ONNX file listings on Hugging Face
([whisper-tiny.en](https://huggingface.co/onnx-community/whisper-tiny.en/tree/main/onnx),
[whisper-base.en](https://huggingface.co/onnx-community/whisper-base.en/tree/main/onnx)):

| Model | variant | encoder | decoder (merged) | **total first load** |
|---|---|---|---|---|
| whisper-tiny.en | fp32 | 32.9 MB | 119 MB | ~152 MB |
| whisper-tiny.en | fp16 | 16.5 MB | 59.6 MB | ~76 MB |
| whisper-tiny.en | **int8 / quantized** | 10.1 MB | 30.7 MB | **~41 MB** |
| whisper-tiny.en | q4 | 9.02 MB | 86.7 MB | ~96 MB |
| whisper-base.en | fp32 | 82.5 MB | 209 MB | ~292 MB |
| whisper-base.en | fp16 | 41.3 MB | 105 MB | ~146 MB |
| whisper-base.en | **int8 / quantized** | 23.2 MB | 53.7 MB | **~77 MB** |
| whisper-base.en | q4 | 18.8 MB | 124 MB | ~143 MB |

Note the counter-intuitive result: **`q4` is larger than `int8`** for the
decoder in these exports (86.7 MB vs 30.7 MB for tiny), because q4 leaves
embeddings and much else at higher precision. If you go this route, `int8`
("quantized") is the size-optimal choice, not `q4`.

`small` is roughly 3× `base`; at ~250 MB int8 it is not a serious candidate for
a phone in a car.

### 3.3 First-load cost, in practice

41 MB (tiny.en int8) on a good home connection is a few seconds; on LTE in a car
it is 30–60 seconds and it is data the member pays for. It caches in the browser
Cache API after the first run, but a phone will evict it. **This is the fact
that disqualifies in-browser Whisper as the primary path for the car and running
use cases**, independent of accuracy.

### 3.4 WebGPU vs WASM — WebGPU is not automatically faster

The one concrete, apples-to-apples benchmark I found, on a **Mac mini M2**,
transcribing **60 seconds** of audio with transformers.js Whisper
([transformers.js#894](https://github.com/huggingface/transformers.js/issues/894)):

| dtype | WebGPU | WASM |
|---|---|---|
| fp32 encoder + q4 decoder | 9.5 s | **5.9 s** |
| fp32 + fp32 | 9.6 s | **4.9 s** |
| q8 + q8 | 27 s | **5.2 s** |

WASM beat WebGPU in every configuration on that hardware, dramatically so for
int8. Transformers.js v3's headline claim is "up to 100× faster than WASM" for
WebGPU
([HF blog, *Transformers.js v3*](https://www.huggingface.co/blog/transformersjs-v3)) —
that is an embedding-model figure and clearly does **not** transfer to Whisper's
autoregressive decoder on Apple silicon.

⚠️ Extrapolating from that single data point: a **20-second** utterance on a
mid-range laptop is plausibly **1.5–2.5 s** with `base.en` on WASM, and on a
mid-range phone perhaps **5–15 s** — but I have no phone benchmark and these are
extrapolations, not measurements. Memory: expect roughly 2–3× the model file
size resident.

Also note that Whisper processes audio in fixed **30-second windows**, so a
20-second utterance costs the same as a 30-second one.

### 3.5 Whisper prompting in transformers.js — **not available yet**

This is the finding that decides it. Python `transformers` supports
`prompt_ids` / `initial_prompt`. transformers.js does **not**:

- [transformers.js#923](https://github.com/xenova/transformers.js/issues/923),
  "WhisperModel initial_prompt", opened **8 Sep 2024** — still **open**.
- [transformers.js#1028](https://github.com/huggingface/transformers.js/issues/1028),
  "Supports Whisper `prompt` and `prefix`", opened **14 Nov 2024** — still
  **open**.
- [PR #1540](https://github.com/huggingface/transformers.js/pull/1540) implements
  `prompt_ids` (~20 lines, closes both issues), created **22 Feb 2026** — still
  **open, unmerged** as of this research.

So the biggest reason to run Whisper client-side — biasing it toward the
expected verse — is currently unavailable. Meanwhile the *server-side* Whisper
at Cloudflare exposes `initial_prompt` today (§6.1). That asymmetry is the whole
argument for the proxy.

### 3.6 whisper.cpp WASM and Moonshine

- **whisper.cpp WASM** works and has a browser demo, but it ships as an
  Emscripten build you host yourself rather than as a CDN-published ES module,
  which makes it a worse fit for a no-build app; its `initial_prompt` support
  would also need you to drive the C API from JS. ⚠️ **I did not verify the
  packaging claim with a search this session** — it is recall, not a sourced
  finding. Since it would only matter if you decided against transformers.js
  anyway, I did not spend a search on it. Not recommended here.
- **Moonshine** (Useful Sensors) is genuinely interesting for this shape of
  problem: it is designed for short utterances, uses memory proportional to
  audio length rather than padding to 30 s, and
  `moonshine-tiny-fr` is reported "competitive with Whisper-tiny with 30% fewer
  parameters" and "~9× faster than real-time on CPU"
  ([onnx-community model cards](https://huggingface.co/onnx-community/moonshine-base-ONNX)).
  It is supported in transformers.js
  ([PR #1099](https://github.com/huggingface/transformers.js/pull/1099)).
  ⚠️ But: Moonshine has **no prompting/biasing mechanism at all**, and its
  accuracy on rare proper nouns is likely *worse* than Whisper's, not better.
  For scripture specifically, "small and fast" is not the axis that is failing.
  Worth a look only if you decide streaming-on-device is the goal.

---

## 4. Streaming vs. batch — batch wins here

**Streaming is not needed for this feature and is actively harmful.** The member
recites 20–60 seconds and then wants a score. There is no interaction that
depends on partial text: `speak.js` goes PROMPT → LISTEN → GRADE → FEEDBACK, and
the grading happens once, at the end. Streaming buys a live transcript on
screen — for a member who is driving or running and *must not look at the
screen*, that is worth nothing.

What record-then-transcribe dodges:

- The ~60 s continuous cap (§1.2).
- The restart rate-limiting (§1.3).
- Android's `continuous` no-op and iOS's continuous flakiness (§2.4).
- The half-duplex teardown dance is simpler: you stop the recorder, you do not
  have to tear down and rebuild a live recognizer.
- Single-shot recognition is what iOS Safari is actually *good* at.

Costs: perceived latency (see recommendation 1) and the loss of the live
"filling in" effect on the desktop typed box in Review mode — so **keep the Web
Speech path for the desktop `type` activity** where the member is looking at the
textarea, and use batch for **Speak mode** where they are not. That split maps
exactly onto where each API is strong.

### Recording audio in the browser

- **`MediaRecorder` formats.** Chrome/Edge/Firefox: `audio/webm;codecs=opus`.
  Safari: `audio/mp4` (AAC) historically; **iOS Safari only wrote mp4 from 14.5
  to 18.3, and gained WebM/Opus in 18.4** (March 2025)
  ([WebKit, *MediaRecorder API*](https://webkit.org/blog/11353/mediarecorder-api/)).
  Always probe with `MediaRecorder.isTypeSupported()` and **prefix-match** the
  mime type on the server; exact string matching rejects
  `audio/webm;codecs=opus`.
- **Bitrate.** Opus at 24–32 kbps mono is plenty for speech: a 20-second
  recitation is **~60–80 KB**. Cellular-safe.
- **What Whisper needs.** 16 kHz mono float32. Server-side (Workers AI,
  Deepgram, OpenAI) you just post the container and they handle decoding. Only
  if you run Whisper *in the browser* do you need to do this yourself:

  ```js
  const ctx = new AudioContext({ sampleRate: 16000 });
  const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
  const pcm = buf.getChannelData(0);   // Float32Array @ 16 kHz
  ```

  ⚠️ Safari's `decodeAudioData` has historically been inconsistent about
  resampling to the context rate; verify on the target iOS version, and be
  prepared to resample manually via `OfflineAudioContext`.
- **iOS gesture rule.** `AudioContext` starts suspended on iOS until a user
  gesture — but Speak mode's design already funnels everything through the one
  Start press, so this is already solved.

---

## 5. Endpointing — knowing when the member stopped

The current rule (2.5 s of quiet after a settled result, with a max-wait
ceiling) is reasonable as a fallback but is the wrong primary signal: it is
blind to whether there is *sound*, so road noise does not extend it and a
thinking pause mid-psalm cuts the member off.

### 5.1 The API's own events (free, zero bytes)

The spec defines `soundstart` / `soundend` ("some sound, possibly speech") and
`speechstart` / `speechend` ("the speech that will be used for speech
recognition has started/ended")
([spec](https://webaudio.github.io/web-speech-api/)). Chrome fires these. Using
`speechend` as the primary endpoint and the 2.5 s timer only as a ceiling is a
strictly better rule than what is there now, and costs nothing.

⚠️ Not reliable on iOS Safari — see §2.4, where the microphone is reported not
to stop at all when the speaker does.

### 5.2 Web Audio RMS/energy VAD (free, ~50 lines)

An `AnalyserNode` on the mic stream, RMS over 20 ms frames, with an adaptive
noise floor. This is genuinely fine for a quiet room and genuinely bad in a
moving car, where engine and road noise sit above any fixed threshold. If you
build one, make the threshold adaptive (track the 10th percentile of recent
frame energies as the floor) rather than constant.

### 5.3 Silero VAD via `@ricky0123/vad-web` (recommended if energy VAD isn't enough)

- **Fits the no-bundler constraint cleanly.** Documented CDN usage is two
  classic script tags exposing a `vad` global — the same shape as this app's
  React/htm loading
  ([vad-web browser guide](https://docs.vad.ricky0123.com/user-guide/browser/)):

  ```html
  <script src="https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/ort.wasm.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.29/dist/bundle.min.js"></script>
  ```
  ```js
  const myvad = await vad.MicVAD.new({
    onnxWASMBasePath: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/",
    baseAssetPath:    "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.29/dist/",
    onSpeechEnd: (audio) => { /* Float32Array @ 16 kHz — feed it straight to the transcriber */ },
  });
  ```

- **Size:** the Silero VAD ONNX model is **~2 MB** (`silero_vad_v5.onnx` /
  `silero_vad_legacy.onnx` in the package;
  [snakers4/silero-vad](https://github.com/snakers4/silero-vad) describes the
  JIT model as around two megabytes), plus the onnxruntime-web WASM runtime and
  an AudioWorklet bundle.
- **Why it's the right tool here:** it is a *neural* speech/non-speech
  classifier, so it distinguishes a member's voice from road noise in a way an
  energy threshold cannot. And its `onSpeechEnd` hands you a **Float32Array at
  16 kHz** — exactly what a transcriber wants — so it does the endpointing *and*
  the audio capture in one component. That is a very clean fit with
  recommendation 1.
- **Tuning:** `positiveSpeechThreshold` / `negativeSpeechThreshold`,
  `redemptionFrames` (how much silence before declaring the end — raise this for
  a member pausing between verses), `minSpeechFrames`, `preSpeechPadFrames`.
  ⚠️ The browser guide page I fetched did not list the default values; get them
  from the API docs before tuning.
- ⚠️ Requires `AudioWorklet`, which is fine on modern Safari/iOS but has had
  bugs there historically. Verify on the target device.

---

## 6. Cloud STT behind a Cloudflare Worker

The app already deploys to Workers, so a `POST /api/transcribe` route on the
same Worker is essentially free infrastructure and keeps any API key off the
client. All prices below are pay-as-you-go, checked 2026-08-22.

### 6.1 Cloudflare Workers AI — Whisper ⭐ recommended first move

- **Models:** `@cf/openai/whisper` and `@cf/openai/whisper-large-v3-turbo`.
- **Price:** `$0.0005` per audio minute for both; large-v3-turbo is quoted more
  precisely as **`$0.00051` per audio minute** / 46.63 neurons per audio minute
  ([Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/);
  [model page](https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/)).
- **Free allowance:** 10,000 neurons/day → **≈214 audio minutes/day free**.
  Beyond that, 1,000 neurons cost $0.011.
- **Biasing: yes, and it is the good kind.** The input schema exposes
  **`initial_prompt`** ("help provide context to the model on the contents of
  the audio") and **`prefix`** ("can guide the transcription result"), plus
  `vad_filter`, `beam_size`, `condition_on_previous_text`,
  `hallucination_silence_threshold`, and the usual Whisper thresholds.
- **Accuracy:** large-v3-turbo is a far stronger model than `whisper-tiny` and
  is not tuned for conversational English the way Google's Web Speech model is —
  it handles formal, read, archaic English well, which is exactly this corpus.
- **Same-vendor, same-deploy, one `env.AI.run()` call.** No new account, no
  second bill.
- ⚠️ The docs page did not state audio format limits or a maximum request size.
  Verify before shipping; a 60-second Opus blob is small, but Workers has a
  request body limit you should confirm for your plan.
- ⚠️⚠️ **`prefix` is dangerous for a scoring app.** It forces the decoder's
  output to begin with your text. Use `initial_prompt` with *vocabulary*, never
  `prefix` with the verse.

### 6.2 Deepgram — best-in-class biasing, ~10× the price

- **Nova-3 pre-recorded:** `$0.0043`/min monolingual. **Streaming:**
  `$0.0048`/min (promotional; list `$0.0077`/min)
  ([Deepgram pricing](https://deepgram.com/pricing)). **$200 free credit** for
  new accounts.
- **Keyterm Prompting:** `+$0.0013`/min. Supports **up to 100 terms**, max
  **500 tokens** across all keyterms per request, passed as repeated `keyterm=`
  query parameters. Nova-3 and Flux only; older models use the legacy `keywords`
  feature with `KEYWORD:INTENSIFIER` weights
  ([Deepgram keyterm docs](https://developers.deepgram.com/docs/keyterm)).
- **Effect:** Deepgram's own examples show confidence on a rare term going from
  0.887 → 0.990 ("nacho") and 0.712 → 0.965 ("tretinoin"). Those are confidence
  scores, not WER, and the docs caveat "actual results may vary".
- **Verdict:** the 100-term / 500-token budget is a *very* good fit for the
  vocabulary-biasing strategy — you could ship one global list of the ~100
  rarest tokens across the whole passage set and never change it per card.
  Total `$0.0056`/min, ~11× Workers AI. Escalate here if Whisper's accuracy
  disappoints.

### 6.3 AssemblyAI

- **Universal-3.5 Pro async:** `$0.21/hr` = **`$0.0035`/min**.
  **Universal-2 async:** `$0.15/hr` = `$0.0025`/min. **Universal-Streaming
  English:** `$0.15/hr` ([AssemblyAI pricing](https://www.assemblyai.com/pricing)).
  **$50 free credit.**
- **Biasing:** keyterms prompting, **+$0.05/hr for up to 1,000 terms** on async
  Universal-3.5 Pro — a much larger budget than Deepgram's 100.
- ⚠️ The pricing page warns that the **legacy `word_boost` parameter may
  silently route requests to cheaper models**, producing surprising bills and
  surprising accuracy. Use the modern keyterms parameter.
- **Verdict:** cheapest of the three big vendors on async, and the 1,000-term
  budget could hold the rare vocabulary of the *entire* passage set. A credible
  alternative to Deepgram.

### 6.4 OpenAI

([OpenAI pricing](https://developers.openai.com/api/docs/pricing))

| model | price |
|---|---|
| `gpt-transcribe` | **$0.0045** / min |
| `gpt-4o-transcribe` | $0.006 / min |
| `gpt-4o-mini-transcribe` | $0.003 / min |
| `whisper-1` | $0.006 / min |
| `gpt-live-transcribe` (realtime) | $0.017 / min |

- **Biasing:** the transcription endpoint accepts **`prompt`** (free-form
  context) and, on the newer models, **`keywords`** (literal terms expected in
  the audio) plus `languages`
  ([Create transcription reference](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create)).
  The docs are explicit that *"Keywords are hints, not required output"* — the
  right semantics for a scoring app.
- The classic Whisper `prompt` is capped at **224 tokens**, and attention weights
  the *end* of a long prompt more heavily
  ([arXiv:2410.18363](https://arxiv.org/html/2410.18363)). For a single verse
  that limit is not binding; for a whole-corpus vocabulary list it is.
- **Verdict:** good models, 9× the Workers AI price, and a third-party
  dependency the app does not currently have.

### 6.5 Google Cloud Speech-to-Text

Not investigated in depth. Google's `SpeechAdaptation` / speech contexts
(phrase sets with boost) is the mature version of exactly the mechanism Chrome
just exposed as `phrases`, and Chirp models are strong. It is worth pricing if
you end up wanting the strongest possible biasing, but it adds GCP to a stack
that currently has Cloudflare and Firebase, and Workers AI Whisper is roughly
an order of magnitude cheaper.

### 6.6 Price comparison for this app

Assume 40 members × 10 recitations/day × 40 s = ~266 audio min/day ≈ 4.4 audio
hours/day ≈ **133 audio hours/month**.

| Option | $/audio-min | monthly at 133 hr | biasing |
|---|---|---|---|
| Web Speech API | $0 | $0 | `phrases`, desktop Chrome 142+ only |
| Workers AI whisper-large-v3-turbo | $0.00051 | **~$4** gross — but the free 214 min/day covers all but ~52 min/day, so **~$0.80** actual | `initial_prompt`, `prefix` |
| AssemblyAI Universal-2 async | $0.0025 | ~$20 | keyterms, up to 1,000 |
| OpenAI `gpt-transcribe` | $0.0045 | ~$36 | `prompt`, `keywords` |
| Deepgram Nova-3 + keyterms | $0.0056 | ~$45 | keyterms, up to 100 |

The costs are all small. **Choose on accuracy and on how well the biasing
mechanism suits a scoring app, not on price.**

---

## 7. Open questions worth ten minutes each in a real browser

These are the places where I could not get a primary source and where the
answer changes the design:

1. **Does Chrome actually return >1 alternative** with `maxAlternatives = 5`
   under `continuous` + `interimResults`? Log `result.length` in `onresult`.
2. **Does on-device work on this Mac?**
   `await SpeechRecognition.available({ langs:['en-US'], processLocally:true })`
   — and if `"downloadable"`, does `install()` actually complete? (§2.3 warns it
   may not.)
3. **Does `phrases` work without `processLocally`** in Chrome 151? Set phrases,
   leave `processLocally` false, and see whether `start()` succeeds and whether
   accuracy changes.
4. **Workers AI round-trip latency** for a 30 s Opus blob from a phone on LTE.
5. **How much does `initial_prompt` inflate the score?** Record one deliberately
   wrong recitation (skip a clause, substitute a synonym) and transcribe it both
   with and without the verse in the prompt. If the biased transcript "fixes"
   the mistake, verse-level prompting is disqualified for scoring and only the
   vocabulary list survives.

---

## Sources

- [MDN — Using the Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API)
- [MDN — SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)
- [MDN — SpeechRecognition.phrases](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/phrases)
- [MDN — SpeechRecognitionPhrase.boost](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognitionPhrase/boost)
- [MDN — SpeechRecognition.processLocally](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally)
- [MDN — SpeechRecognition.install()](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/install_static)
- [MDN browser-compat-data — api/SpeechRecognition.json](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/SpeechRecognition.json)
- [W3C/WebAudio — Web Speech API specification](https://webaudio.github.io/web-speech-api/)
- [W3C explainer — contextual biasing](https://github.com/WebAudio/web-speech-api/blob/main/explainers/contextual-biasing.md)
- [W3C explainer — on-device speech recognition](https://github.com/WebAudio/web-speech-api/blob/main/explainers/on-device-speech-recognition.md)
- [Chrome for Developers — Voice driven web apps](https://developer.chrome.com/blog/voice-driven-web-apps-introduction-to-the-web-speech-api)
- [Chrome 142 release notes](https://developer.chrome.com/release-notes/142)
- [blink-dev — Intent to Ship: Web Speech API contextual biasing](https://www.mail-archive.com/blink-dev@chromium.org/msg14350.html)
- [Chrome Platform Status — Web Speech API contextual biasing](https://chromestatus.com/feature/5225615177023488)
- [chromium-html5 — SpeechGrammarList working?](https://groups.google.com/a/chromium.org/g/chromium-html5/c/wHhkRzshYzw)
- [chromium-dev — Google Speech API: webkitSpeechGrammarList](https://groups.google.com/a/chromium.org/g/chromium-dev/c/y0TO8MI10LI)
- [chromium-html5 — Web Speech API limit of 60 seconds?](https://groups.google.com/a/chromium.org/g/chromium-html5/c/s2XhT-Y5qAc)
- [chromium-dev — Raise Quota at Speech API?](https://groups.google.com/a/chromium.org/g/chromium-dev/c/TJRsxtxkB_Y)
- [Chromium issue 444393111 — available({processLocally}) broken on macOS](https://issues.chromium.org/issues/444393111)
- [Chromium issue 40324711 — continuous recognition broken on Android](https://issues.chromium.org/issues/40324711)
- [brave-browser#55414 — on-device SpeechRecognition hangs "downloading"](https://github.com/brave/brave-browser/issues/55414)
- [WebKit/Documentation#120 — interimResults on iOS](https://github.com/WebKit/Documentation/issues/120)
- [lilting.ch — How to Stabilize the WebSpeech API on iOS](https://lilting.ch/en/articles/ios-webspeech-api-tips)
- [WebKit blog — MediaRecorder API](https://webkit.org/blog/11353/mediarecorder-api/)
- [transformers.js — repository](https://github.com/huggingface/transformers.js/)
- [HF blog — Transformers.js v3](https://www.huggingface.co/blog/transformersjs-v3)
- [transformers.js#894 — Whisper WebGPU vs WASM performance](https://github.com/huggingface/transformers.js/issues/894)
- [transformers.js#923 — WhisperModel initial_prompt](https://github.com/xenova/transformers.js/issues/923)
- [transformers.js#1028 — Supports Whisper prompt and prefix](https://github.com/huggingface/transformers.js/issues/1028)
- [transformers.js PR#1540 — prompt_ids support (open)](https://github.com/huggingface/transformers.js/pull/1540)
- [transformers.js PR#1099 — Moonshine ASR support](https://github.com/huggingface/transformers.js/pull/1099)
- [HF — onnx-community/whisper-tiny.en ONNX files](https://huggingface.co/onnx-community/whisper-tiny.en/tree/main/onnx)
- [HF — onnx-community/whisper-base.en ONNX files](https://huggingface.co/onnx-community/whisper-base.en/tree/main/onnx)
- [HF — onnx-community/moonshine-base-ONNX](https://huggingface.co/onnx-community/moonshine-base-ONNX)
- [vad-web — browser user guide](https://docs.vad.ricky0123.com/user-guide/browser/)
- [snakers4/silero-vad](https://github.com/snakers4/silero-vad)
- [Cloudflare — Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Cloudflare — whisper-large-v3-turbo model](https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/)
- [Deepgram — pricing](https://deepgram.com/pricing)
- [Deepgram — Keyterm Prompting](https://developers.deepgram.com/docs/keyterm)
- [AssemblyAI — pricing](https://www.assemblyai.com/pricing)
- [OpenAI — API pricing](https://developers.openai.com/api/docs/pricing)
- [OpenAI — Create transcription reference](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create)
- [arXiv:2410.18363 — Contextual Biasing for Whisper without fine-tuning](https://arxiv.org/html/2410.18363)
