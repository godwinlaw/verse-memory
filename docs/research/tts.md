# Text-to-speech for hands-free scripture: research findings

Research date: **2026-08-22**. Target: Chrome on macOS (primary), Chrome/Safari on
iOS, Chrome on Android. Constraint: no build step, static hosting on Cloudflare
Workers static assets, no backend, no paid API if avoidable.

Everything marked **[measured]** was run empirically on this machine (macOS 24.6,
Chromium, Apple local voices) during this research and is reproducible. Everything
marked **[uncertain]** is where sources conflict or I am extrapolating — do not
treat those as fact without testing on a real device.

---

## Recommendations

**1. Fix the voice and the rate on the existing Web Speech path. Today, free, ~40 lines.**
The single biggest cause of "really sucks" is that `new SpeechSynthesisUtterance(text)`
with no `voice` set picks the platform default, and on macOS that default is
**Samantha** — **[measured]** `default: true`, and Readium's curated quality table rates
Samantha `["low", "normal"]`, i.e. never better than *normal*. And the list the app
would have to pick from is mostly landmines: **[measured]** of the **47 English voices
this Mac exposes, 35 appear in Readium's two exclusion lists** — 15 Apple novelty
voices (Albert, Bad News, Bahh, Bells, Boing, Bubbles, Cellos, Good News, Jester,
Organ, Superstar, Trinoids, Whisper, Wobble, Zarvox) and 20 entries rated *veryLow*
(the Eloquence set — Eddy, Flo, Grandma, Grandpa, Reed, Rocko, Sandy, Shelley, each
listed twice for US and UK — plus Fred, Junior, Kathy, Ralph). **Only 12 survive**, and
the best of those is rated *normal*. A name-based ranking plus
`rate ≈ 0.9`, `lang` set explicitly, and pitch left alone is the cheapest large win.

**2. Pre-generate the 183 passages as audio files at authoring time. This is the
obviously-right answer for a fixed corpus, and it is essentially free.**
The corpus is **[measured from `data/passages.js`] 183 passages, 47,609 characters,
9,236 words → ~62–66 minutes of speech**. That is:
- **$0.00** with Azure Neural TTS (500,000 free chars/month) or Google Cloud
  Neural2/Chirp3-HD (1,000,000 free chars/month). Worst case, ElevenLabs
  Multilingual v2 at $0.10/1k chars = **$4.76, one time**.
- **~12 MB total as 24 kbps mono Opus** (~61 KB/passage), or **~30 MB as 64 kbps
  mono AAC/MP3** (~162 KB/passage) if you want Safari-safe playback.
- Well under Cloudflare's static-asset limits (20,000 files free plan, 25 MiB/file).
- Fetched per-passage on demand, so nobody downloads 30 MB — a member downloads
  ~160 KB per verse they actually hear, and the HTTP cache keeps it.

  And critically: an `<audio>` element is a *media* element, which is the only web
  audio primitive iOS treats as backgroundable, gets Media Session lock-screen
  controls, and does not have Chrome's 15-second utterance bug, the `getVoices()`
  race, the cancel semantics, or the "voice sounds different on every member's
  phone" problem. **[uncertain — verify on a real iPhone]** but strongly indicated
  (see §4.4).

**3. Only then consider a runtime TTS proxy — and if you do, put it on the Worker
you already deploy.** `wrangler.jsonc` already ships static assets from a Worker;
adding `"run_worker_first": ["/api/*"]` plus a ~30-line fetch handler gives you a
secret-holding TTS endpoint with no new infrastructure. Cloudflare Workers AI has
first-party TTS (`@cf/deepgram/aura-1` at $0.015 per 1k characters — i.e. **$0.71
for the whole corpus**) so the API key is a Workers AI binding, not a secret you
have to manage. But this is *third* priority: it only buys you dynamic text
(Speak-mode feedback sentences), which is a small fraction of what the app says.

**Do not** pursue browser-local neural TTS (Piper/Kokoro via WASM). The smallest
usable Kokoro ONNX weights are **[measured from the HF API] 86 MB** (`model_q8f16.onnx`),
with `model_quantized.onnx` at 92 MB and fp32 at 326 MB, plus ~10 MB of
onnxruntime-web. That is a 100 MB download before the first word, on a phone, in a
car. It is the wrong shape for this app.

---

## 0. What the app does today, and where the seams are

Two call sites, deliberately kept thin (this is good architecture — the fixes below
land in two files):

- **`src/speaker.js`** — Speak mode. `new SpeechSynthesisUtterance(text)`,
  `synth.speak(u)`. **No voice, no rate, no pitch, no lang.** Watchdog at
  `speechMs(text) * 2.5 + 5000`.
- **`src/beat.js`** (`speak`, `chunkForSpeech`) — Run mode. Already chunks on
  sentences at `MAX_CHUNK_CHARS = 180`, already sets `u.rate = 0.95`, already has a
  per-chunk watchdog and a `speechToken` guard. This file is substantially ahead of
  `speaker.js` and its comments already document the 15-second bug empirically.

**One live bug found while testing.** **[measured]** In Chromium/macOS, calling
`speechSynthesis.cancel()` mid-utterance fires **`onerror` with
`event.error === "interrupted"`** — it does *not* fire `onend`. `speaker.js` wires
`u.onerror = finish`, and `createSpeaker().cancel()` calls `synth.cancel()` with no
token guard, so **cancelling a Speak-mode utterance invokes the caller's `onDone`**,
which is exactly the callback that reopens the microphone and advances the loop.
`beat.js` is immune because `stopSpeaking()` bumps `speechToken` *before* calling
`cancel()`. `speaker.js` needs the same guard (a generation counter checked inside
`finish`), or `cancel()` must clear the handlers before calling `synth.cancel()`.

---

## 1. Voice selection

### 1.1 What is actually on the machine — ground truth

**[measured]** Chromium on this Mac, after voices settled: **191 voices total, 47
English, and `localService === true` for every single one — zero network voices.**
The default (`default: true`) is **Samantha / en-US**.

The English list, verbatim, sorted as returned: Samantha, Aaron, Albert, Arthur,
Bad News, Bahh, Bells, Boing, Bubbles, Catherine, Cellos, Daniel (English (United
Kingdom)), Eddy ×2, Flo ×2, Fred, Good News, Gordon, Grandma ×2, Grandpa ×2, Jester,
Junior, Karen, Kathy, Martha, Moira, Nicky, Organ, Ralph, Reed ×2, Rishi, Rocko ×2,
Sandy ×2, Shelley ×2, Superstar, Tessa, Trinoids, Whisper, Wobble, Zarvox.

Two things to notice:

- **Alex is not there.** **[measured]** `getVoices().some(v => v.name === 'Alex')`
  is `false`, and `say -v '?'` confirms Alex is not installed on this Mac either.
  Readium rates Alex `["high"]` — the *only* `high`-quality Apple en-US voice — but
  Alex is a downloadable voice on modern macOS, not preinstalled. So a ranking that
  puts Alex first is correct but will usually miss.
- **Three quarters of the English list is unusable.** **[measured]** Matching the
  observed names against Readium's two filter files (on the name *before* the first
  ` (`, since macOS suffixes the locale) excludes **35 of 47**: 15 novelty + 20
  veryLow. The **12 survivors** are, in full: Samantha, Aaron, Arthur, Catherine,
  Daniel (en-GB), Gordon, Karen, Martha, Moira, Nicky, Rishi, Tessa — of which
  Aaron, Arthur and Martha are Readium-rated `low` (compact Siri voices) and
  Catherine, Gordon, Karen, Moira, Rishi and Tessa are en-AU/en-IE/en-IN/en-ZA. For a
  US congregation that leaves **Samantha and Nicky**, both capped at *normal*. A naive
  "first en-US voice" or "first voice whose lang starts with en" picker can land on
  Bahh.

**Caveat on this measurement [uncertain]:** the browser I measured in appears to be
an unbranded Chromium (Chrome for Testing) — branded Google Chrome ships Google's
network voices ("Google US English", "Google UK English Female/Male") which did not
appear here. Verify in your own Chrome with the snippet in Appendix A. Everything
about the *Apple* voices holds either way.

### 1.2 Apple's premium/enhanced voices are not reachable from the web

This is the most important and most surprising finding of §1, and it kills the
obvious idea ("tell members to download the Premium voice").

An **Apple Frameworks Engineer**, replying on the Apple Developer Forums, states
plainly: *"It is expected that with Web Speech APIs only the pre-installed voices
are available. Optionally downloadable voices are not available."*
(https://developer.apple.com/forums/thread/723503). The thread shows a German
system with Anna, Markus, Petra, Siri and Viktor installed, where the Web Speech API
returned only the Eloquence group. As of the last post (Nov 2024) Apple had not
acknowledged a fix.

Readium's cross-browser survey says the same from the other side: *"Downloadable
voices don't appear in API lists, and installing higher-quality variants causes
preloaded voices to disappear entirely"*
(https://readium.org/speech/docs/WebSpeech.html).

**[uncertain]** There is genuine conflict in the sources here. Readium's `en.json`
records Apple voices with a `quality` *array* — e.g. Ava and Zoe as
`["low","normal","high"]`, Samantha as `["low","normal"]` — which implies the
installed variant is exposed under the same `name`, meaning a member who installs
"Ava (Premium)" would get a better-sounding voice named `Ava` from `getVoices()`.
Historically that was true on macOS (the Enhanced download replaced the Compact one
under the same name). The Apple engineer's statement and the iOS 16 regression
reports suggest it stopped being true, at least on iOS. **I could not resolve this
and did not have a machine with Premium voices installed to test on.** Treat "ask
members to install Premium voices" as unproven, and design so it is a bonus if it
works rather than the plan.

Consequence: **the quality ceiling of the Web Speech API on Apple hardware is the
preinstalled compact voices** (Samantha, Nicky, Aaron, Daniel, Martha, Arthur —
Readium: `low`/`normal`, and the last four are explicitly noted as "compact version
of a preloaded Siri voice"). That ceiling is the reason the user says it sucks, and
no amount of `rate` tuning moves it. That is the argument for recommendation #2.

### 1.3 Are Chrome's network voices (`localService: false`) better or worse for
long-form scripture?

**Better-sounding, worse-behaved. For this app, worse.** Readium rates
`Google US English` as `high`, which is a tier above Samantha's `normal`. But the
same entry carries a warning note verbatim:

> "This voice is pre-loaded in Chrome on desktop. Utterances that are longer than 14
> seconds long can trigger a bug with this voice."

And the survey text: *"These voices are also plagued by a bug if any utterance read
by the Web Speech API takes longer than 14 seconds and do not return boundary
events... while using Google Chrome's custom voice service, each utterance instance
has a character limit of 200-300."*
(https://readium.org/speech/docs/WebSpeech.html)

So the Google voices:
- require the network — a run in a canyon or a car in a tunnel is silence;
- cut off around 200–250 characters / ~15 seconds;
- **do not fire `boundary` events**, so you cannot even detect progress;
- send every verse to Google's servers on every playback.

`beat.js`'s `MAX_CHUNK_CHARS = 180` is already below the 200-char limit, which is
why Run mode presumably survives them. `speaker.js` has no chunking at all — with a
network voice selected it would be truncated on any passage over ~200 chars, which is
**[measured] 78 of the 183 passages (43 %)**. (Distribution: median 184 chars, mean
260, p90 550, max 1,259; 93 passages — 51 % — exceed `beat.js`'s 180-char chunk size,
which is why that chunking exists.)

Verdict: prefer local voices for long-form, but rank the Google voices above the
Apple compacts *only if* you keep chunks under ~180 chars and accept the network
dependency. My recommendation is to prefer `localService: true` and use the network
voices as a mid-tier fallback.

### 1.4 A concrete ranking heuristic

There is no quality signal on `SpeechSynthesisVoice`. The object has exactly five
properties — `name`, `lang`, `localService`, `voiceURI`, `default` — and none of
them correlates with quality. `default: true` is actively misleading: **[measured]**
it points at Samantha. So quality **must** come from a curated name list. Readium's
project says this explicitly: *"Quality isn't algorithmically determined—it's
manually curated."* (https://readium.org/speech/docs/VoicesAndFiltering.md)

Use Readium's data as the source of truth. It is MIT-ish open data at
`https://github.com/readium/speech/blob/main/json/en.json` plus
`json/filters/novelty.json` and `json/filters/veryLowQuality.json`. Extracted for
en-US/en-GB, in Readium's own order (quality tier in brackets):

| Rank | Name as returned by `getVoices()` | Readium quality | Where |
|---|---|---|---|
| 1 | `Microsoft AvaMultilingual Online (Natural) - English (United States)` and the other `Microsoft * Online (Natural)` voices (Emma, Jenny, Aria, Andrew, Brian, Guy, Eric, Steffan, Christopher, Roger, Sonia, Libby, Ryan, Thomas…) | **veryHigh** | Edge only |
| 2 | `Google US English 5 (Natural)`, `Google US English 1/2/7 (Natural)` (female), `Google US English 3/4/6 (Natural)` (male); `Google UK English 1–6 (Natural)` | **high** | Android, ChromeOS |
| 3 | `Google US English`, `Google UK English Female`, `Google UK English Male` | **high** *(14 s bug, 200–300 char limit, no boundary events, network-only)* | Chrome desktop |
| 4 | `Alex` | **high** | macOS/iOS — **downloadable, usually absent** |
| 5 | `Ava`, `Zoe`, `Serena`, `Jamie` | low / normal / **high** depending on installed variant | macOS/iOS — downloadable |
| 6 | `Allison`, `Samantha`, `Nicky`, `Evan`, `Nathan`, `Tom`, `Joelle`, `Daniel`, `Kate`, `Stephanie`, `Oliver` | normal (best case) | macOS/iOS — Samantha, Nicky, Daniel preinstalled |
| 7 | `Microsoft Zira/David/Mark/Hazel/Susan/George - English (…)` | normal | Windows |
| 8 | `Aaron`, `Martha`, `Arthur` | **low** (compact Siri) | macOS/iOS — preinstalled |
| — | `Chrome OS US English 8`, `Chrome OS UK English 7` | **low** | ChromeOS |

**Hard exclude** (Readium's filter files, complete lists):

- Novelty (15): `Albert, Bad News, Bahh, Bells, Boing, Bubbles, Cellos, Good News,
  Jester, Organ, Superstar, Trinoids, Whisper, Wobble, Zarvox`
- Very low quality (Apple Eloquence + legacy, 13 English): `Eddy, Flo, Grandma,
  Grandpa, Jacques, Reed, Rocko, Sandy, Shelley, Fred, Junior, Kathy, Ralph`
  — note these appear with a parenthesised locale suffix on macOS, e.g.
  `Eddy (English (United States))`, so match on **prefix before ` (`**, not equality.

Practical algorithm:

1. Filter to `v.lang` starting `en` (normalise `_` → `-`; **Android returns `en_US`**,
   per https://talkrapp.com/speechSynthesis.html).
2. Drop anything whose name (before the first ` (`) is in the two exclusion lists.
3. Score by position in an ordered preference array of the names above; tie-break
   `localService: true` above `false` for long-form; tie-break exact `en-US` above
   other English regions.
4. If nothing scores, fall back to the first non-excluded `en-*` voice, and only
   then to `null` (let the platform choose).
5. Persist the chosen `voiceURI` (**not** `name` — codersblock notes name is not
   always unique in Safari and recommends `voiceURI`:
   https://codersblock.com/blog/javascript-text-to-speech-and-its-many-quirks/) and
   expose a voice picker so a member can override. On a fixed set of church laptops
   and phones, letting a person pick once beats any heuristic.

Note the ranking is genuinely platform-shaped, not a single list: the best web voice
in the world is an Edge `(Natural)` voice, which is irrelevant here; the best voice a
macOS Chrome member can reach is `Google US English` (with caveats) or `Alex` (if
installed); the best an iPhone can reach is a compact Apple voice.

**Android caveat**: Readium and talkrapp agree that Chrome on Android *"returns an
unfiltered language/region list rather than available voices"* and that voice choice
is effectively pinned to whatever the user configured in Android system settings —
*"Android restricts you to whatever voice users configured in device settings. The
browser cannot override this."* So on Android, expect the ranking to be advisory at
best, and **always set `u.lang` explicitly** — talkrapp: *"Must explicitly set
`utterance.lang` to match the voice's language, or behavior becomes unpredictable."*

---

## 2. The `getVoices()` race

### 2.1 What actually happens

**[measured]**, and this is the part every blog post gets wrong:

- First synchronous call at page load: **`getVoices().length === 0`**.
- I then attached `speechSynthesis.onvoiceschanged` alongside a 3-second timeout.
  **The timeout won — no event arrived within 3 s — yet by then the list was fully
  populated (191 voices).**

**Caveat on that measurement:** the listener was attached in a *later* call than the
one that observed the empty list, so I cannot distinguish "`voiceschanged` never
fires" from "it fired in the gap before I subscribed." Either way the operational
conclusion is the same and it is the one that matters: **a listener attached after
first paint may receive no event while the list is already populated, so code that
gates solely on the event can hang forever.** On Safari the failure mode is the
mirror image:
the community consensus is that Safari populates synchronously but historically
returned an empty list, and Safari fires `voiceschanged` inconsistently
(https://weboutloud.io/bulletin/speech_synthesis_in_safari/,
https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/voiceschanged_event).

### 2.2 The pattern that actually works

**Poll with a deadline, and treat `voiceschanged` as an accelerator, not a gate.**

```
resolve immediately if getVoices() is non-empty
otherwise:
  - subscribe to voiceschanged (one-shot) -> re-check
  - ALSO poll getVoices() every ~100 ms
  - hard deadline ~2000 ms -> resolve with whatever you have, even []
  - resolving with [] must be a supported outcome: leave utterance.voice unset
    and let the platform default speak. Never block speech on voice selection.
```

Numbers: 100 ms poll, 2,000 ms deadline. Justification for the deadline: **[measured]**
the list was fully populated well inside 3,000 ms without any event arriving; a 2 s ceiling is
comfortably above observed population time and well below the point where a member
pressing Start thinks the app is broken.

Two extra rules that matter for this app specifically:

- **Warm the list at app start, not at Start-press.** Speak mode's whole design turns
  on the single Start gesture; you do not want to spend the first 300 ms of that
  gesture resolving voices. Call the resolver on mount, cache the result, and have
  Start use the cache.
- **Re-resolve on `voiceschanged` even after you have resolved**, because Chrome adds
  network voices late and Android adds engine voices when a language pack finishes
  installing. Just do not *wait* on it.

### 2.3 iOS is a different problem

On iOS the blocker is not the race, it is the gesture. Every source agrees:
*"WebKit only lets `speak()` run inside a click, tap, or keypress handler"*
(https://www.testmuai.com/learning-hub/speech-synthesis-api-browser-support/);
talkrapp reports the same for Chrome M71+ and iOS Safari. This the app already
handles by construction — `createSpeaker()` is built inside the Start press, and
CLAUDE.md documents the reasoning. Two refinements:

- **Prime the engine inside the gesture.** Speak a zero-length or single-space
  utterance synchronously in the Start handler. That converts the whole session to
  "gesture-blessed" on WebKit and costs nothing.
- **iOS's hardware mute switch silences Safari's TTS** but not Chrome-on-iOS's
  (talkrapp). A member who cannot hear anything and has a muted phone will blame the
  app. Worth a line in the Run/Speak screen's existing audio status area — the app
  already has `copy.run.backgroundNote` and a Test sound button, which is exactly the
  right place.

---

## 3. Prosody for scripture

### 3.1 SSML is not an option — and it is worse than "not supported"

Confirmed, with a primary source. The spec says unsupported tags will be stripped;
browsers do not do that. From the MDN browser-compat-data issue
(https://github.com/mdn/browser-compat-data/issues/15663): testing `<speak>hello</speak>`
on **macOS Safari, Firefox and Chrome** produces **"speak hello speak"** — the tags
are *read aloud as words*. The issue tracks open bugs against Chromium, Edge, Gecko
and WebKit, and notes MDN's compat table is wrong to show support.

So SSML is not merely unavailable; emitting it would make the app read XML at a
member driving a car. **Never put angle brackets in `utterance.text`.**

### 3.2 Punctuation and typographic tricks — measured, and mostly useless

I measured utterance duration for the same sentence with different separators
(Samantha, macOS, `volume: 0`, `rate: 1`, median of the run):

| Text between the two clauses | Duration | Delta vs. none |
|---|---|---|
| `God and the` (no punctuation) | **1,680 ms** | — |
| `God, and` (comma) | 2,071 ms | +391 ms |
| `God; and` (semicolon) | 2,069 ms | +389 ms |
| `God: and` (colon) | 2,080 ms | +400 ms |
| `God — and` (em dash) | 2,070 ms | +390 ms |
| `God. And` (period) | **2,110 ms** | +430 ms |
| `God... And` (ellipsis) | 2,113 ms | +433 ms |
| `God\n\nAnd` (blank line) | 2,101 ms | +421 ms |

And the stacking test:

| Attempt to lengthen the pause | Duration |
|---|---|
| `God. And` (one period) | 2,100 ms |
| `God.. And` (two periods) | 2,111 ms |
| `God.... And` (four periods) | 2,113 ms |
| `God... ... ... And` (three ellipses) | 2,102 ms |
| `God . . . And` (spaced periods) | 2,112 ms |

**Findings, all [measured] on macOS/Apple voices:**

1. **Every punctuation mark buys roughly the same pause — about 390–430 ms.** A
   period is worth ~40 ms more than a comma. There is no graded control.
2. **Pauses do not stack.** Four periods, three ellipses and one period are
   indistinguishable (2,100–2,113 ms, within noise). **The "add extra dots for a
   longer pause" folklore is false on this platform.** Some sources claim ellipsis
   creates a longer pause (https://justmarkup.com/articles/2020-05-19-text-to-speech/,
   https://www.audiogo.com/how-to/synthetic-long-pause-words); my measurement
   contradicts that for Apple voices. **[uncertain]** — it may hold for Google's
   network voices or on Android, which I could not measure. Do not rely on it.
3. **Line breaks are *not* ignored** on macOS — `\n\n` produced a period-sized pause
   (2,101 ms). This contradicts justmarkup's "line breaks are ignored". Again,
   platform-specific; do not build on it.

### 3.3 Splitting utterances does not create pauses either — it removes them

The counterintuitive one. Same two clauses:

| Form | Duration |
|---|---|
| One utterance: `"the word of God. And the word of man"` | 2,100 ms |
| Two utterances spoken back-to-back on `onend` | **1,940 ms** |
| Two utterances queued together via two `speak()` calls | **1,941 ms** |

**The inter-utterance gap on macOS is effectively zero** — splitting is *160 ms
faster* than one utterance, because you lose the sentence-final pause and gain
nothing. So chunking (which `beat.js` already does, correctly, for the 15-second
bug) is a *correctness* measure, not a prosody measure.

**Therefore: the only reliable pause lever you have is an explicit `setTimeout`
between chunks.** That is entirely under the app's control, works identically on
every platform, and is the one prosody tool that is not folklore.

Concrete suggestion for scripture, matching how a lector actually reads:

- **~250 ms** between chunks inside a verse (clause boundaries),
- **~500–600 ms** between verses,
- **~900 ms** after the reference before the text begins (Run mode already has a
  beat there; Speak mode's `promptFor` should get one),
- and keep the existing echo pause proportional to length.

This costs nothing and is likely to move perceived quality more than the voice swap,
because the current output runs verses together at a uniform clip.

### 3.4 Rate, pitch, volume

**Rate — measured, and the mapping is badly non-linear on Apple voices.** Same
sentence, Samantha:

| `rate` | Duration | vs. rate 1.0 |
|---|---|---|
| 0.70 | 2,516 ms | +20 % |
| 0.85 | 2,304 ms | +10 % |
| 0.90 | 2,315 ms | +10 % |
| 1.00 | 2,101 ms | — |
| 1.10 | 1,963 ms | −7 % |
| 1.20 | 1,792 ms | −15 % |

Note 0.85 and 0.90 are indistinguishable, and 0.70 — which the spec says should be
43 % slower — is only 20 % slower. **Apple's engine compresses the low end of the
rate range hard.** The practical range on macOS/iOS is roughly 0.8–1.2; below 0.8 you
stop getting slower and start getting strange. codersblock reports a related Safari
bug: *"Rate below 0.5 after being set higher will retain the previous rate."*

**Recommended values for read-aloud scripture:**

```
utterance.rate   = 0.9     // ~10% slower than default on Apple; near-linear elsewhere
utterance.pitch  = 1.0     // leave alone — see below
utterance.volume = 1.0
utterance.lang   = 'en-US' // or the chosen voice's lang; required on Android
```

Reasoning for `rate = 0.9`:
- Default TTS lands around 150–180 wpm. Scripture is syntactically unusual (inverted
  clauses, "shall", "thee"), dense in proper nouns, and — the point of this app —
  the listener is *trying to memorise it*, not skim it. Slowing ~10 % puts it near
  the 130–150 wpm of a good audiobook narrator.
- The listener is driving or running: attention is partial and there is road noise.
- But do not go slower than ~0.85: **[measured]** you get no additional slowing on
  Apple voices, and slow synthetic speech is where the robot artefacts become most
  audible. `beat.js`'s existing `0.95` is defensible; `0.9` is my recommendation, and
  the difference between them is ~5 %, so this is a preference, not a correctness
  issue. **Make it a member-facing setting** — a 0.8/0.9/1.0/1.1 segmented control
  costs almost nothing in this codebase and is worth more than getting the default
  exactly right.

Reasoning for `pitch = 1.0` (i.e. **do not touch pitch**):
- codersblock, tested across browsers: *"Chrome: non-local voices revert pitch 0 to 1"*;
  *"Edge: non-local voices ignore pitch settings"*; *"Safari: pitch values at 0.5 and
  below sound identical."*
- Readium's data has an explicit `pitchControl: false` flag on the Edge Natural voices.
- Lowering pitch to sound "more reverent" is exactly the change that will work on your
  laptop and do nothing (or something ugly) on a member's phone. Leave it at default
  and let voice choice carry the timbre.

Volume: safe range 0–1 with no surprises across browsers (codersblock). Leave at 1
and let the OS mixer handle it — but note the app's Run mode ducks the beat on
`onstart`, which remains the right approach.

### 3.5 Text preparation before it reaches the engine

Cheap wins available without touching prosody:

- **Speak the reference in expanded form.** "John 3:16" is read by some engines as
  "John three colon sixteen" or "John three sixteen". Prefer generating
  "John, chapter three, verse sixteen" for the spoken form only (keep the display
  string as-is). This is a `copy.js`-adjacent change and does not touch grading.
- **`LORD` in small caps** (the ESV's rendering of the Tetragrammaton) is
  all-uppercase in the source text; some engines spell out all-caps words letter by
  letter. Lowercase it to `Lord` on the way to the synthesiser only. **[uncertain]** —
  I did not measure which engines do this; test with your chosen voice.
- **Verse numbers must not be spoken.** The corpus stores `verses[]` with `text` as
  the flat join, so this is already clean, but any future chunking that reads verse
  labels aloud will sound terrible.
- **Do not** insert extra punctuation to shape pacing (§3.2 shows it does nothing) and
  **do not** insert SSML (§3.1 shows it gets read aloud).

---

## 4. Known bugs, and what is actually still broken

### 4.1 The ~15-second / ~200-character cutoff

**What it is.** Chrome cancels or silently abandons an utterance after roughly 15
seconds, landing near 200–250 characters, and never fires `onend`. Widely reported
since 2014 (the canonical chunking gist:
https://gist.github.com/woollsta/2d146f13878a301b36d7). Chromium issues 41294170
("Speech Synthesis stops abruptly after about 15 seconds") and 41346274
("speechSynthesis fails for long text without warning and blocks the API") both
track it.

**[uncertain — official status unverified]** `issues.chromium.org` requires sign-in
and returned only a login page to my fetches, so I could not read the current status
or resolution of either bug. What I can say: community documentation dated into 2026
still describes it as an active limitation
(https://www.testmuai.com/learning-hub/speech-synthesis-api-browser-support/), and
the project's own `beat.js` comments document reproducing it. Treat it as live.

**What I *did* establish [measured].** The bug is **voice-specific, not
Chrome-wide.** With Apple's local Samantha in Chromium/macOS I spoke a **1,250-character**
utterance: it started in 7 ms, fired **240 `boundary` events**, and completed
normally after **68,943 ms** — nearly 69 seconds, with no truncation. That matches
Readium's framing, which attaches the 14-second warning specifically to
`Google US English` / `Google UK English *` and notes those voices *"do not return
boundary events"*. My run returned 240 of them, which is independent confirmation
that I was not on a Google voice.

**Consequence for this app:** if you follow recommendation #1 and pin a *local*
voice, the 15-second bug largely evaporates on macOS. Keep chunking anyway — it is
free insurance, it is already implemented in `beat.js`, and it is what makes the
watchdog granular. `MAX_CHUNK_CHARS = 180` is a good number: below the 200-char
network-voice limit with margin.

### 4.2 The `pause()`/`resume()` keep-alive hack

**Recommendation: do not use it. Chunk instead.**

The hack: call `resume()` (or `pause()` then `resume()`) on a ~10–14 s interval while
speaking, to reset Chrome's internal timer. It is still widely cited in 2025–2026
discussions.

Reasons to avoid it here:

- **It is harmful on Android.** codersblock, tested: *"Pausing and resuming don't work
  on Android devices."* Other reports say `speechSynthesis.pause()` on Android Chrome
  *actually pauses* and does not reliably resume — i.e. the "fix" is the bug. This
  app explicitly targets Android.
- **It is unnecessary if you chunk**, and chunking is already implemented.
- **It fights the app's own watchdogs.** `beat.js` and `speaker.js` both arm timers
  that assume speech proceeds monotonically; an interval that pauses and resumes the
  synthesiser makes those timers' assumptions less true, not more.
- **[uncertain]** whether it is still required at all on 2026 Chrome desktop — I could
  not confirm from a primary source either way.

If you ever do need it, gate it on `!isAndroid && !isIOS && voice.localService === false`.

### 4.3 `cancel()` semantics

**[measured] in Chromium/macOS:**

- `cancel()` during an utterance fires **`onerror` with `error: "interrupted"`**, not
  `onend`. codersblock reports the Safari variant: *"`'end'` event doesn't fire after
  `cancel()`."* Either way, **do not assume `onend`**.
- **Speaking immediately after `cancel()` works.** I called `cancel()` and
  synchronously `speak()`; the new utterance completed normally in 876 ms. The
  well-known "utterances fail silently after `cancel()`" bug did **not** reproduce
  here. **[uncertain]** — it is reported often enough that I would keep the defensive
  code; the standard mitigation is a `speechSynthesis.cancel()` on a fresh tick
  (`setTimeout(..., 0)`) before the next `speak()`, plus the existing watchdog.
- Keep a reference to every live `SpeechSynthesisUtterance`. talkrapp's "critical
  implementation fix": *"event handlers like `onend` may be garbage collected before
  playback completes if the object isn't retained."* `beat.js`'s `sayChunk` closure
  retains `u`; `speaker.js`'s `speak()` does too. Do not "simplify" either.

### 4.4 Backgrounding and screen lock — the one that decides the product

This is the crux for a car and a run, and the answer is bad for Web Speech.

**Desktop, tab hidden — fine. [measured]** During my tests `document.hidden === true`
and `document.visibilityState === "hidden"` throughout, and speech ran normally to
completion (the 69-second utterance finished while hidden). So the frequently
repeated "Chrome throttles synthesis in background tabs" is, at minimum, **not true
for a hidden tab on macOS desktop with a local voice**. Sources asserting otherwise
(testmuai, and several blog posts) appear to be generalising from mobile.

**iOS Safari, app backgrounded or screen locked — broken.** WebOutLoud, who ship a
Safari TTS extension and therefore have skin in the game, report: *speech synthesis
ceases when Safari is backgrounded on iOS while actively speaking, and users must
refresh the page or restart Safari to restore functionality*
(https://weboutloud.io/bulletin/speech_synthesis_in_safari/). Their own product's
answer was to ship a native iOS app for background audio. Separately, WebRTC and
**Web Audio contexts are suspended as soon as the screen locks or Safari
backgrounds** (Apple Developer Forums 774239, 658375). Chrome on iOS is WebKit
underneath, so it inherits this.

**Android Chrome — degraded and device-dependent.** Audio in Chrome on Android stops
when the screen turns off under Android's battery optimisation unless the user sets
Chrome to "Unrestricted" battery usage
(https://www.spf.io/2025/01/30/how-to-keep-audio-playing-in-the-background-in-chrome-on-android/).
Notably, Google's own "Listen to this page" feature *does* keep playing with the
screen off — but that is a browser feature with privileged plumbing, not something a
web page can invoke.

**Screen Wake Lock does not save you.** It is Baseline-newly-available since March
2025, is **secure-context only**, and — decisively — *"only active documents can
acquire screen wake locks and previously acquired locks are automatically released
when document becomes inactive"*
(https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API). It prevents
the screen dimming while the member is looking at the page; it does not survive a
manual lock, and it is refused on low battery or power-save. `beat.js`'s
`holdScreenAwake` is correctly written as a courtesy that nothing depends on — keep
that framing.

**The escape hatch, and why it points at pre-generated audio.** An `<audio>` element
is a *media element*, and media elements are the one web audio primitive iOS is
willing to keep running in the background — it is how web podcast players work on
iPhone. Safari supports the **Media Session API**, giving lock-screen and Control
Centre transport controls with metadata and artwork
(https://dbushell.com/2023/03/20/ios-pwa-media-session-api/, which tracks the
artwork bugs through their iOS 18 fix). **[uncertain — I could not test this on a
device, and it is the single most important thing to verify before committing]**:
there is at least one credible report that in an installed iOS PWA, audio paused for
30 seconds stops working until the app is foregrounded
(https://developer.apple.com/forums/thread/762582). Verify with a 5-minute spike:
a bare page with one `<audio>` element, a playlist of two files, `navigator.mediaSession`
metadata, played on a real iPhone with the screen locked.

If that spike passes — and I expect it to — then **pre-generated audio is not merely
a quality upgrade, it is the only architecture in which Speak/Run mode actually works
in a pocket**, which is the stated use case. That is why it is recommendation #2 and
not a nice-to-have.

**A related consequence the team should know:** Run mode's procedural WebAudio beat
*will* be suspended by an iOS screen lock regardless of what you do, because Web
Audio contexts are suspended. The 2-second lookahead in `beat.js` buys survival
against *timer throttling*, which is a different problem from *context suspension*.
**[uncertain]** whether the beat currently survives a locked iPhone at all; my
reading of the Apple forum threads says it does not. If keeping the beat alive under
lock matters, the beat would have to become a looped `<audio>` file too.

### 4.5 Other confirmed quirks worth encoding

From codersblock (tested cross-browser) and talkrapp (production experience):

- Safari: `boundary` events lack `charLength`; voice `name` is not always unique →
  key on `voiceURI`.
- Android: `boundary` events do not fire at all; locale codes come back as `en_US`
  with an underscore; voice selection is pinned to system settings.
- Chrome: `rate` above 2 prevents speech entirely on non-local voices.
- iOS reports ~55 voices from `getVoices()` but only ~36 are actually selectable, one
  per locale (talkrapp) — another argument for filtering against a curated list
  rather than trusting the array.

---

## 5. Better-than-browser options

### 5.1 Cloud TTS at runtime, and the API-key problem

The problem is real and has no clever client-side answer: **a static app cannot hold
a secret.** Anything in `config.js`, in a module, or in a build artefact is readable
by any member with devtools, and a leaked ElevenLabs key on a church app is somebody
else's voice-cloning budget.

There is exactly one legitimate pattern for this codebase, and it is unusually cheap
here because **the app already deploys as a Cloudflare Worker**, not as a bucket of
files. `wrangler.jsonc` uses Workers static assets, which means there is already a
Worker in front of the assets — it just has no handler.

To add a TTS route:

1. Add a `main` entry pointing at a small Worker module.
2. Add `"run_worker_first": ["/api/*"]` to `wrangler.jsonc`. Per Cloudflare's docs,
   by default static files are tried first and the Worker runs only on a miss;
   `run_worker_first` accepts an array of glob patterns (with `!` exceptions) to
   force specific routes to the Worker
   (https://developers.cloudflare.com/workers/static-assets/routing/worker-script/).
3. The handler forwards everything that is not `/api/*` with `env.ASSETS.fetch(request)`.
4. `/api/tts` takes text, calls the provider, returns audio.

Realistically ~30–50 lines. The genuinely interesting option is **Cloudflare Workers
AI**, because then there is no third-party key at all — TTS is a binding on the
Worker:

| Model | Price |
|---|---|
| `@cf/myshell-ai/melotts` | **$0.0002 per audio minute** |
| `@cf/deepgram/aura-1` | **$0.015 per 1k characters** ($15/1M) |
| `@cf/deepgram/aura-2` | $0.030 per 1k characters |

(https://developers.cloudflare.com/workers-ai/models/melotts/,
https://developers.cloudflare.com/workers-ai/models/aura-1/)

For the whole 47,609-character corpus that is **$0.71 on Aura-1** or, at 62 minutes
of audio, **$0.012 on MeloTTS** — per full pass. But note the free Workers plan caps
at 100,000 requests/day and **10 ms CPU per request**; a TTS call is I/O-bound
(mostly `await`, which does not count against CPU time) so it should fit, but
**[uncertain]** — verify against the Workers AI free-tier neuron allowance, which I
did not confirm.

**Third-party pricing for reference** (all "per 1M characters", so multiply by
0.0476 for one pass of this corpus):

| Provider / model | $/1M chars | This corpus, one pass |
|---|---|---|
| Google Cloud Standard / WaveNet | $4 | $0.19 — **free**, 4M/1M chars/mo free tier |
| OpenAI `tts-1` | $15 | $0.71 |
| Azure Neural | $16 | $0.76 — **free**, 500k chars/mo free tier |
| Google Cloud Neural2 | $16 | $0.76 — **free**, 1M chars/mo free tier |
| Cloudflare Aura-1 | $15 | $0.71 |
| OpenAI `tts-1-hd` | $30 | $1.43 |
| Google Cloud Chirp 3 HD | $30 | $1.43 — **free**, 1M chars/mo free tier |
| ElevenLabs Flash / Turbo | $50 | $2.38 |
| ElevenLabs Multilingual v2/v3 | $100 | $4.76 |
| Google Cloud Studio | $160 | $7.62 |

Sources: https://cloud.google.com/text-to-speech/pricing (free tiers: 4M chars/mo
Standard, 1M/mo WaveNet, 1M/mo Neural2/Studio/Chirp3, stacking and non-expiring);
Azure F0 tier 500k neural chars/mo; ElevenLabs $0.05/1k Flash and $0.10/1k
Multilingual; OpenAI `gpt-4o-mini-tts` is token-priced ($0.60/1M text-input +
$12/1M audio-output tokens) which works out to roughly $15/1M characters —
**[uncertain]**, that conversion is an estimate, not a published rate.

**The headline number: every one of these is under five dollars for the entire
corpus.** Which reframes the whole question — the interesting cost is not money, it
is *when* you pay it.

### 5.2 Pre-generating audio at authoring time — the recommended path

**Real numbers, measured from `data/passages.js`:**

- **183 passages, 47,609 characters, 9,236 words.**
- Mean 260 chars / 50.5 words; **median 184 chars / 35 words**; p90 550; max 1,259;
  min 35. (The distribution is skewed — a handful of long chapter sections dominate.)
- Plus 2,546 characters of references, if you pre-generate those too (you should —
  Speak mode's prompts and Run mode's call-outs are both fixed strings).
- **At 150 wpm: 61.6 minutes total, ~20 s per passage.** At 140 wpm: 66 minutes.

**Total corpus size by codec** (at 150 wpm; ±8 % for the 140–160 wpm range):

| Codec | Total | Per passage |
|---|---|---|
| Opus 24 kbps mono | **11.1 MB** | 61 KB |
| Opus 32 kbps mono | 14.8 MB | 81 KB |
| HE-AAC 32 kbps mono | 14.8 MB | 81 KB |
| **AAC-LC 64 kbps mono** | **29.6 MB** | **162 KB** |
| MP3 64 kbps mono | 29.6 MB | 162 KB |
| MP3 96 kbps mono | 44.3 MB | 242 KB |

Opus is the technically correct choice — *"Opus dramatically outperforms MP3 at every
bitrate, achieving the same perceptual quality at roughly half the bitrate"*, and
24–32 kbps is comfortably transparent for speech
(https://zderadicka.eu/opus-audio-codec-for-audio-books-and-more/,
https://opus-codec.org/comparison/).

**But do not ship Opus alone.** Safari's Opus support is the classic trap: Safari 11
through 18.3 handled Opus only in the CAF container; Ogg Opus was claimed for
Safari 18.4 but independent testing found it *"still incomplete, buggy, and far
behind Firefox and Chrome"* (https://frequal.com/java/OggOpusStillNotWorkingInSafari18_4.html).
Given that half this app's audience is on iOS, ship **AAC-LC 64 kbps mono in an
`.m4a`** as the baseline — universally supported, still only 30 MB total and 162 KB
per passage — and optionally serve Opus/WebM to Chrome via `<source type>` negotiation
if you want to halve mobile-data use later. **Ship one format first.** 30 MB is not a
problem when nobody downloads it all.

**How it ships.**

- 183 files under `dist/audio/<passage-id>.m4a`, generated by a new authoring tool
  alongside `tools/fetch_passages.mjs` — **the pattern already exists in this repo**
  (`ESV_API_KEY=… node tools/fetch_passages.mjs`, run at authoring time, output
  committed, no key in the build). A `tools/gen_audio.mjs` that reads
  `data/passages.js`, calls a TTS API, and writes `.m4a` is the same shape and
  obeys the same rule.
- Cloudflare static-asset limits: **20,000 files on the free plan, 25 MiB per file**
  (https://developers.cloudflare.com/workers/platform/limits/). 183 files at 162 KB is
  a rounding error.
- `scripts/build.mjs` currently copies `index.html`, `src/`, `data/` and `config.js`;
  it would need `audio/` added. That is the only build-system change, and it is a
  one-line change to a copy list — **still no bundler, still no transpile.**
- Caching: static assets on Workers are edge-cached and immutable-friendly. Name files
  by a content hash or bump a version segment (`/audio/v1/<id>.m4a`) so a regenerated
  corpus invalidates cleanly. Optionally add a Cache API / service-worker warm so a
  member can pre-download the whole 30 MB on wifi before a run — **that is the feature
  that makes a run in a dead zone work**, and it is impossible with any runtime TTS.

**Is this the obviously-right answer for a fixed corpus? Yes — with two honest caveats.**

1. **Not everything the app says is fixed.** Speak mode's `feedbackFor` produces
   sentences containing a score, and word-by-word/verse-by-verse feedback names
   specific missed words. Those cannot be fully pre-generated. But the *template*
   parts can, the numbers 0–100 can, and the app already caps spoken misses at
   `MAX_SPOKEN_MISSES`. A hybrid — pre-generated audio for the passage and the
   reference and the fixed phrases, Web Speech (tuned per §1–3) for the residue — is
   entirely reasonable, and the residue is short enough that the 15-second bug never
   bites. Expect a slight timbre mismatch between the two voices; **[uncertain]**
   whether members will find that jarring or simply not notice.
2. **ESV licensing needs a check before you generate.** Crossway's standard use terms
   permit quoting the ESV *"in print, digital, and audio formats up to and inclusive
   of five hundred (500) verses"* subject to the half-a-book and 25 % limits — which
   `test/passages.test.mjs` already asserts over the shipped set, so the text side is
   covered. But Crossway maintains a **separate audio permission request form**
   (https://www.crossway.org/permissions/audio/), and it is not obvious whether
   synthesised audio of licensed text counts as quotation under the standard terms or
   as a derivative audio edition. **[uncertain — this is a real open question, not a
   formality.]** Also check the TTS provider's terms: some grant output rights freely,
   some restrict redistribution of generated audio. A short email to Crossway
   permissions before generating 183 files is cheap insurance, and the app already
   renders their required notice in `views/footer.js`.

### 5.3 Browser-local neural TTS via WASM — not viable here

**Kokoro (82M params, via `kokoro-js` / Transformers.js).** ONNX weight sizes, read
directly from the Hugging Face API for `onnx-community/Kokoro-82M-v1.0-ONNX`
**[measured]**:

| File | Size |
|---|---|
| `model_q8f16.onnx` | **86.0 MB** |
| `model_quantized.onnx` | 92.4 MB |
| `model_uint8f16.onnx` | 114.2 MB |
| `model_q4f16.onnx` | 154.6 MB |
| `model_fp16.onnx` | 163.2 MB |
| `model_q4.onnx` | 305.2 MB |
| `model.onnx` (fp32) | 325.5 MB |

Plus onnxruntime-web's WASM binaries (~10 MB). Quality is genuinely good — this is
the model people compare favourably to commercial TTS — and it runs 100 % locally
with `device: "wasm"` or `"webgpu"`.

**Piper (via `vits-web` / `piper-tts-web`).** Voice models 30–60 MB each plus ~10 MB
of onnxruntime-web; reported *"5–10 second delay before audio"* on a fresh visit,
instant thereafter from cache
(https://quick-tts.com/blog/web-speech-api-vs-piper-vs-kokoro.html). Smaller than
Kokoro, but also noticeably more synthetic — Piper is the "latency matters more than
fidelity" option, which is the opposite of what this app needs.

**Does it work without a bundler?** In principle yes — `kokoro-js` publishes ESM and
is on jsDelivr/esm.sh, so `import { KokoroTTS } from "https://esm.sh/kokoro-js"` in a
`<script type="module">` is plausible. **[uncertain]** — I found no worked
no-bundler example, and the docs warn about deduping the shared Transformers.js
instance, which is exactly the kind of thing a bundler normally solves. There is also
the app's own hard-won rule from CLAUDE.md: a static import of a module that fails to
resolve white-screens the entire module graph, so it would have to be a dynamic
`import()` with a `.catch`, like `loadRunPlaylist`.

**Is it realistic on a phone? No.** ~100 MB minimum over cellular before the first
word, held in device storage, decoded into memory on a phone that is also running a
microphone (Speak mode is half-duplex with `SpeechRecognition`) and a WebAudio beat
(Run mode). And WASM inference on an older Android phone will be slow enough that the
"generate then play" latency becomes its own problem. Compare: **the entire
pre-generated corpus in AAC is 30 MB — less than a third of the smallest Kokoro
model — and needs no inference at all.**

Reject.

---

## 6. Ranked recommendation

### First — tune the Web Speech path (this week, free)

Cheapest big win, and it remains necessary forever as the fallback and as the voice
for dynamic text.

1. **Add a voice resolver** (poll + `voiceschanged` + 2 s deadline, §2.2), a curated
   preference list and the two exclusion lists (§1.4), and persist the choice by
   `voiceURI`.
2. **Set `rate = 0.9`, `lang`, leave `pitch` at 1** on every utterance, in *both*
   `speaker.js` and `beat.js` (§3.4). Expose a rate control to the member.
3. **Bring `speaker.js` up to `beat.js`'s standard**: chunk on sentences at ~180
   chars, one watchdog per chunk. Right now Speak mode has neither, and **[measured]**
   78 of 183 passages (43 %) exceed the 200-char network-voice cutoff, while 93 (51 %)
   exceed `beat.js`'s existing 180-char chunk size.
4. **Fix the `cancel()` bug in `speaker.js`** — `cancel()` fires
   `onerror: "interrupted"`, which currently invokes the caller's `onDone` (§0).
   Guard with a generation token as `beat.js` does.
5. **Add explicit `setTimeout` pauses between chunks** — 250 ms within a verse,
   500–600 ms between verses (§3.3). This is the only prosody lever that actually
   works, and it is likely the second-largest perceived improvement after the voice.
6. Add a voice picker to the settings form. On a congregation-sized user base, one
   person choosing "the good one" beats any heuristic.

**Expected outcome:** goes from "Samantha at default rate, run together" to "best
available local voice, paced like a lector." **[uncertain]** how far that closes the
gap to "genuinely good" — on macOS with only compact Apple voices installed, the
ceiling is still a compact Apple voice. It will be clearly better; it will not be
human.

### Second — pre-generate the corpus (the real fix)

1. **Spike the iOS background-audio question first** (§4.4). One page, one `<audio>`,
   Media Session metadata, real iPhone, screen locked. This is a 30-minute test that
   decides whether the whole plan is worth doing, and it is the single largest
   uncertainty in this document.
2. **Email Crossway permissions** about synthesised audio of ESV text (§5.2 caveat 2).
   Do this in parallel — it costs nothing and may take days to come back.
3. **Write `tools/gen_audio.mjs`**, modelled on `tools/fetch_passages.mjs`: reads
   `data/passages.js`, generates one file per passage plus one per reference,
   authoring-time only, key in the environment, output committed. Pick the provider on
   voice audition, not price — **[measured]** every candidate is under $5 for the whole
   corpus and three of them are $0 inside a free tier. Audition Google Chirp 3 HD,
   Azure Neural, OpenAI `tts-1-hd` and ElevenLabs on the same three verses and let a
   human pick.
4. **Ship AAC-LC 64 kbps mono `.m4a`** — 30 MB total, 162 KB per passage, no Safari
   codec risk (§5.2).
5. **Play through `<audio>`**, with `navigator.mediaSession` metadata and
   `play`/`pause`/`nexttrack` handlers so the lock screen and the car stereo work.
   Keep Web Speech as the fallback when a file 404s or the passage is new.
6. Optionally: a "download for offline" button that warms the Cache API before a run.

**Expected outcome:** the voice becomes indistinguishable from a commercial audio
Bible, playback survives the screen going dark, and the corpus works with no network.
This is the recommendation.

### Third — a Worker TTS route, only for dynamic text

If, after the above, the mismatch between the recorded passages and the synthesised
feedback sentences is annoying: add `"run_worker_first": ["/api/*"]` and a small
handler using Workers AI `@cf/deepgram/aura-1` (§5.1). Cache aggressively — the
feedback vocabulary is small and repetitive, so a Cache API layer in front of it means
the route is hit a handful of times per member ever. **[uncertain]** how the free-tier
Workers AI allowance interacts with this; check before relying on it.

Do **not** do this before the pre-generation work. It adds a moving part, a runtime
network dependency and a per-request cost to solve a smaller share of the problem
than pre-generation solves for free.

### Not recommended

- **Browser-local neural TTS (Piper/Kokoro).** ~100 MB minimum before the first word;
  the entire pre-generated corpus is 30 MB (§5.3).
- **The `pause()`/`resume()` keep-alive.** Harmful on Android, unnecessary if you
  chunk (§4.2).
- **SSML, or typographic pause tricks.** SSML gets read aloud as words (§3.1);
  extra dots do nothing (§3.2, measured).
- **Lowering `pitch` for gravitas.** Ignored or reverted on several engines (§3.4).
- **Relying on Screen Wake Lock for the car/run case.** Released the moment the
  document goes inactive (§4.4).

---

## Appendix A — reproduce the voice audit in your own Chrome

Paste into the console on any HTTPS page. (Written as plain JS, not app code.)

```js
await new Promise(r => {
  const t = setInterval(() => {
    if (speechSynthesis.getVoices().length) { clearInterval(t); r(); }
  }, 100);
  speechSynthesis.onvoiceschanged = () => { clearInterval(t); r(); };
  setTimeout(() => { clearInterval(t); r(); }, 2000);
});
console.table(
  speechSynthesis.getVoices()
    .filter(v => /^en/i.test(v.lang))
    .map(v => ({ name: v.name, lang: v.lang, local: v.localService, def: v.default, uri: v.voiceURI }))
);
```

To time an utterance (the method used for every **[measured]** figure above): set
`u.volume = 0`, record `performance.now()` at `speak()`, and read it again in
`onend`. Note that `volume = 0` did not change timing on macOS — durations scaled
exactly as expected with `rate`.

## Appendix B — measurement conditions

All **[measured]** figures come from one macOS 24.6 machine running a Chromium build
(not branded Chrome — no Google network voices were present), with Apple's
preinstalled voice set and `Samantha` selected explicitly. `document.hidden` was
`true` throughout. Timings are single runs unless noted; the punctuation deltas were
consistent to within ~15 ms across repeats, which is well inside the ~400 ms effect
being measured, but they are **not** statistically rigorous and they characterise
*Apple's* engine only. Nothing here was measured on iOS, Android, Windows, or with a
Google network voice — every claim about those platforms is sourced, not measured,
and is flagged where uncertain.

## Sources

- [MDN — Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)
- [MDN — SpeechSynthesisUtterance.rate](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance/rate) · [.pitch](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance/pitch) · [.text](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance/text)
- [MDN — SpeechSynthesis: voiceschanged event](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/voiceschanged_event) · [pause()](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/pause)
- [MDN — Screen Wake Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API)
- [mdn/browser-compat-data #15663 — SSML support does not work on all platforms](https://github.com/mdn/browser-compat-data/issues/15663)
- [Readium Speech — SpeechSynthesis in browsers and OSes](https://readium.org/speech/docs/WebSpeech.html)
- [Readium Speech — Voices and Filtering](https://raw.githubusercontent.com/readium/speech/main/docs/VoicesAndFiltering.md)
- [Readium Speech — curated English voice list (`json/en.json`)](https://raw.githubusercontent.com/readium/speech/main/json/en.json) · [novelty filter](https://raw.githubusercontent.com/readium/speech/main/json/filters/novelty.json) · [veryLowQuality filter](https://raw.githubusercontent.com/readium/speech/main/json/filters/veryLowQuality.json)
- [HadrienGardeur/web-speech-recommended-voices](https://github.com/HadrienGardeur/web-speech-recommended-voices)
- [Apple Developer Forums 723503 — Web Speech Synthesis API: not all installed voices listed](https://developer.apple.com/forums/thread/723503)
- [Apple Developer Forums 774239 — Safari should allow background WebRTC](https://developer.apple.com/forums/thread/774239) · [658375 — WKWebView Web Audio can't play after locking screen](https://developer.apple.com/forums/thread/658375) · [762582 — iOS audio lockscreen problem in PWA](https://developer.apple.com/forums/thread/762582)
- [WebOutLoud — The State of Speech Synthesis in Safari](https://weboutloud.io/bulletin/speech_synthesis_in_safari/)
- [dbushell — iOS Web Apps and Media Session API](https://dbushell.com/2023/03/20/ios-pwa-media-session-api/)
- [codersblock — JavaScript Text to Speech and Its Many Quirks](https://codersblock.com/blog/javascript-text-to-speech-and-its-many-quirks/)
- [talkrapp — Lessons Learned Using the JavaScript speechSynthesis API](https://talkrapp.com/speechSynthesis.html)
- [testmuai — Speech Synthesis API: Browser Support, Voices, Limitations](https://www.testmuai.com/learning-hub/speech-synthesis-api-browser-support/)
- [Chromium issue 41294170 — Speech Synthesis stops abruptly after about 15 seconds](https://issues.chromium.org/issues/41294170) *(sign-in walled; status unverified)*
- [Chromium issue 41346274 — speechSynthesis fails for long text without warning](https://issues.chromium.org/issues/41346274) *(sign-in walled; status unverified)*
- [woollsta gist — Chrome speech synthesis chunking workaround](https://gist.github.com/woollsta/2d146f13878a301b36d7)
- [justmarkup — Read out loud: text to speech with the Web Speech API](https://justmarkup.com/articles/2020-05-19-text-to-speech/)
- [spf.io — How to keep audio playing in the background in Chrome on Android](https://www.spf.io/2025/01/30/how-to-keep-audio-playing-in-the-background-in-chrome-on-android/)
- [Cloudflare — Workers static assets: worker script routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/) · [bindings](https://developers.cloudflare.com/workers/static-assets/binding/) · [platform limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare Workers AI — melotts](https://developers.cloudflare.com/workers-ai/models/melotts/) · [aura-1](https://developers.cloudflare.com/workers-ai/models/aura-1/) · [pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Google Cloud Text-to-Speech pricing](https://cloud.google.com/text-to-speech/pricing)
- [OpenAI — GPT-4o mini TTS model](https://developers.openai.com/api/docs/models/gpt-4o-mini-tts)
- [Hugging Face — onnx-community/Kokoro-82M-v1.0-ONNX](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX) · [kokoro-js on npm](https://www.npmjs.com/package/kokoro-js)
- [quick-tts — Web Speech API vs Piper vs Kokoro](https://quick-tts.com/blog/web-speech-api-vs-piper-vs-kokoro.html)
- [Ivanovo — Opus audio codec for audiobooks](https://zderadicka.eu/opus-audio-codec-for-audio-books-and-more/) · [Opus codec comparison](https://opus-codec.org/comparison/)
- [Frequal — Ogg Opus still not working in Safari 18.4](https://frequal.com/java/OggOpusStillNotWorkingInSafari18_4.html)
- [Crossway — Permissions](https://www.crossway.org/permissions/) · [ESV audio permission request form](https://www.crossway.org/permissions/audio/)
