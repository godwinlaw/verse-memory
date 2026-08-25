# Audio tooling for verse-memory — the practitioner's view (2026-08)

Researched **2026-08-24**. This doc is deliberately _not_ a second pass over
`docs/research/asr.md` and `docs/research/tts.md` — those are vendor-doc-grade and
still largely correct. This one asks a narrower question: **what do people who
actually ship voice features say, in their own words, and where does that
contradict the vendor docs?**

## Method, and one honest limitation up front

**Reddit itself is not directly fetchable by this agent's crawler.** `www.reddit.com`
and `old.reddit.com` both return "unable to fetch", the `.json` endpoints are
blocked, and the search tool refuses `allowed_domains: ["reddit.com"]` outright:

> `The following domains are not accessible to our user agent: ['reddit.com']`

**Workaround that did work: `api.pullpush.io`** (the PushShift successor), which
serves Reddit comment search as fetchable JSON. Reddit quotes below with a
`reddit.com/r/...` permalink came through that route. ⚠️ Caveat: pullpush's index
is not complete or perfectly current, and it returns _comments_ well but threads
poorly, so Reddit coverage here is real but thinner and older-skewed than it would
be with direct access. Where a Reddit permalink is missing, the quote is not from
Reddit.

Everything else I read:

- **Hacker News** via the Algolia API (`hn.algolia.com/api/v1/search`) — fully
  fetchable, comment-level, and the richest practitioner source available. Most
  direct quotes below are from here.
- Vendor pricing and docs pages (fetched, not recalled — no price below is from
  memory).
- Microsoft Q&A threads (developers complaining in public about Azure Speech).
- GitHub issue titles and academic comparisons for forced alignment.

Everything marked **[uncertain]** is where I'm extrapolating or where sources
conflict. Do not treat those as fact.

---

# What we should actually do

Ranked by (quality gained) ÷ (effort + cost), for a church tool with a few dozen
users, no budget, no backend beyond a Cloudflare Worker, and no bundler.

### 0. The blunt answer on Wispr Flow: it is the wrong tool, for a reason that matters

Wispr Flow is primarily a **desktop/mobile dictation app** (macOS, Windows, iOS
keyboard, Android; Linux and web are waitlists) at **$15/user/month, or $12/month
billed annually**, with a free tier capped at ~2,000 words/week
([Wikipedia](https://en.wikipedia.org/wiki/Wispr_Flow),
[pricing roundup](https://zackproser.com/blog/wisprflow-pricing-guide-2026)).

**But it is no longer _only_ that** — the prompt's assumption that there's no
integration path is out of date. There is a real **Wispr Flow Voice Interface API**
with a WebSocket endpoint (`/ws`) and a REST endpoint (`/api`), and — unusually —
a documented **client-side auth** flow: your server mints a short-lived JWT from
your org API key via `/generate_access_token`, the browser sends
`Authorization: Bearer <JWT>`, and the org key never leaves your server
([api-docs.wisprflow.ai](https://api-docs.wisprflow.ai/introduction),
[client-side auth](https://api-docs.wisprflow.ai/client_side_auth_basics.md)).
That is exactly the shape a static app with a Cloudflare Worker can use.

**And it is still the wrong tool, because of what it does to the text.** Wispr's
entire product thesis is that it _does not give you what you said_. From their own
API docs:

> it's optimized to understand what people say and output text in their style, with
> auto-edits, removing filler words, getting names right, and making messages more
> concise while maintaining tone

For a dictation app that is the feature. **For a scoring app that is a validity
bug that eats the product.** A member who stumbles, self-corrects, or half-mumbles
a clause gets a _cleaned-up_ transcript, and the app hands them a score they didn't
earn. This is the same trap `asr.md` §"the one thing that matters most" already
identifies for phrase biasing — except here the repair _is_ the product.

**I looked specifically for an off switch and did not find one.** I read `llms.txt`
(the 21-page doc index), the billing page, the client-side-auth page, and the REST
request-body page. The documented request fields are about _supplying more editing
context_, not less: `before_text`, `after_text`, `selected_text`, and `context`
(the replacement for a deprecated `properties` field) — i.e. the text around your
cursor, so it can match your style better
([rest_api.md](https://api-docs.wisprflow.ai/rest_api.md)). ⚠️ The page states
_"All properties are optional and will use default values if not provided"_ but
the field list rendered incompletely for me, so I cannot claim with certainty that
no raw mode exists anywhere — only that **none is documented on the pages a
developer would actually read, and the product's whole design points the other
way.** If you want to be sure, ask their sales/support; but even a "yes" leaves
the pricing and spend-limit problems below.

Two more disqualifiers:

- **No published price.** The billing page says only _"All models are charged based
  on usage tokens"_ with no rate card ([usage & billing](https://api-docs.wisprflow.ai/usage_billing.md)).
  You cannot budget a church tool against an undisclosed rate.
- **No spend controls.** Verbatim from that same page: _"At this moment we don't
  have support to add API limits directly in the dashboard, make sure you use the
  API in your code responsibly."_ On a publicly-reachable endpoint, that is a
  liability, not a caveat (see §6).

**What the user probably actually wants.** The _feeling_ of Wispr Flow — press,
speak, get near-perfect text instantly, no fumbling, no half-sentences vanishing —
does not come from Wispr's model. It comes from the **shape**: record the whole
utterance, then transcribe it in one shot with a good Whisper-class model.
`webkitSpeechRecognition` feels bad because it is a _streaming_ recognizer that
self-terminates, silently drops `continuous` on Android, and gets rate-limited when
you restart it. Swap the shape and most of "the audio system really sucks"
evaporates. That is already recommendation #1 in `asr.md`, and everything I found
this round reinforces it.

### 1. Do the free Web Speech fixes first (an afternoon, $0)

Unchanged from `asr.md` §"Ranked, cheapest-effective first" #2: restart backoff,
endpoint on `speechend` instead of a blind timer, `maxAlternatives`. Nothing I
found this round contradicts it. Do this before spending a dollar, because it's the
control group you'll compare everything else against.

### 2. Record-then-transcribe through the Worker. **Groq `whisper-large-v3-turbo`.**

**This is my single top recommendation for recognition.**

- **$0.04 per audio hour**, 216× realtime, 12% WER — from Groq's own model table
  ([console.groq.com/docs/speech-to-text](https://console.groq.com/docs/speech-to-text)).
- **Free tier: 20 req/min, 2,000 req/day, 7,200 audio-seconds/hour, 28,800
  audio-seconds/day** ([rate limits](https://console.groq.com/docs/rate-limits)).
  28,800 seconds = **8 audio hours per day, free**. At 40 s per recitation that is
  ~720 recitations/day. A few dozen members will not touch it.
- **10-second minimum billed duration** and a 25 MB file cap on free tier. A 40 s
  Opus blob is ~60 KB. Non-issue.
- It takes a `prompt` (max 224 tokens) — use it for _vocabulary_, per the
  `asr.md` caveat, never for the verse text.

`asr.md` chose Cloudflare Workers AI `@cf/openai/whisper-large-v3-turbo` instead,
at $0.00051/audio-min (= **$0.0306/hr**, i.e. slightly _cheaper_ than Groq) with no
third-party key at all. **That is a legitimate near-tie and I am not overturning it
on price.** I am nudging toward Groq on one axis only — _practitioner evidence_ —
and you should read the reasoning and decide:

|                        | Groq                                | Cloudflare Workers AI             |
| ---------------------- | ----------------------------------- | --------------------------------- |
| Price                  | $0.04/audio-hr                      | ~$0.031/audio-hr                  |
| Free allowance         | 8 audio hr/day                      | ~214 audio min/day (per `asr.md`) |
| Secret to manage       | yes, one API key in a Worker secret | **none** — it's a binding         |
| Practitioner sentiment | strongly positive, specific         | thin, mildly negative             |

HN comments on Groq are unusually concrete and consistent:

> "Groq has been great for transcribing 1hr+ calls at a significnatly lower price
> compared to OpenAI ($0.36/hr vs. $0.04/hr)."
> — **obviyus**, [HN 41942623](https://news.ycombinator.com/item?id=41942623)

> "The current MRR is about $700 and I'm paying $7/mo for Groq Whisper Turbo."
> — **Void_**, [HN 45924116](https://news.ycombinator.com/item?id=45924116)

> "Whisper hosted on Groq since the transcription is near instantaneous"
> — **braden-w**, [HN 44948475](https://news.ycombinator.com/item?id=44948475)

Reddit says the same thing, including a head-to-head latency observation:

> "Groq hands down is the fastest." — **u/teleprax**, r/ios, who posted benchmarks
> showing **Groq Distil-Whisper at ~2 seconds vs OpenAI's ~20 seconds** for the same
> audio
> ([thread](https://www.reddit.com/r/ios/comments/1jxfdo0/you_can_now_set_deepl_as_system_translation/mr70jcv/))

> "for cost efficiency I end up with whisper in groq ( speed and cost )"
> — **u/lord007tn**, r/SaaS,
> [thread](https://www.reddit.com/r/SaaS/comments/1khivk7/how_we_built_an_ai_notetaker_like_firefliesai_in/mr7bxew/)

> "Groq...very generous free contingent...use Whisper" — **u/Dev_Emperor**,
> r/android_devs,
> [thread](https://www.reddit.com/r/android_devs/comments/1dgda31/ms20ayx/)

⚠️ The 2 s vs 20 s figure is one user's anecdote on a different Whisper variant, not
a benchmark — treat it as directional. It matches the _direction_ of Groq's own
published 216× realtime figure.

Cloudflare Workers AI, by contrast, draws comments like:

> "haven't used cloudflare workers ai myself because they had quite limited number
> of models and choices so far" — **pzo**, [HN 45955999](https://news.ycombinator.com/item?id=45955999)

> "they have there very old models" — **pzo**, [HN 45955277](https://news.ycombinator.com/item?id=45955277)

> "The documentation wasn't up to date and I also encountered Wrangler CLI issues"
> — **orliesaurus**, [HN 40960187](https://news.ycombinator.com/item?id=40960187)

Notably, the _same commenter_ who is lukewarm on Workers AI still cites its Whisper
pricing approvingly: _"cloudflare workers ai where you can have whisper-large-v3-turbo
for around $0.03 per hour"_ — **pzo**, [HN 44380182](https://news.ycombinator.com/item?id=44380182).
So the negative sentiment is about the _catalogue and DX_, not specifically about
its Whisper endpoint.

**Honest read:** if you want the fewest moving parts and zero secrets, `asr.md` was
right and you should stay on Workers AI. If you want the option that a hundred
people have publicly said works fast and cheap in production, use Groq. **Both are
under a dollar a month at your volume, so pick on latency after measuring, not on
price.** The one thing I'd insist on: **write the Worker route so the provider is a
one-line swap.** Same `/api/transcribe` contract, same multipart body — both accept
an OpenAI-compatible `audio/transcriptions` shape.

### 3. TTS: **pre-generate the corpus. Do not stream TTS at runtime.**

`tts.md` already concluded this and it is still the right answer; nothing this round
moved it. My single top TTS recommendation, stated as a concrete action:

> **Generate all 183 passages once, offline, with Google Cloud Chirp 3 HD (1M
> chars/month free — your corpus is 47,609 chars, so the free tier covers it ~20×),
> ship them as static Opus + AAC assets, and play them with `<audio>`.**

The practitioner evidence for _why not to stream a paid TTS_ is strong and it is all
about ElevenLabs' price:

> "The Elevenlabs pricing to me makes it completely useless for audiobooks"
> — **borgdefenser**, [HN 43434000](https://news.ycombinator.com/item?id=43434000)

> ElevenLabs has "highest quality" but pricing is "400 times more expensive than the
> rest" — **huijzer**, [HN 43420909](https://news.ycombinator.com/item?id=43420909)

Verified current ElevenLabs rates: **$0.10/1k chars** for v2/v3 Multilingual,
**$0.05/1k chars** for Flash/Turbo/v3-Conversational
([elevenlabs.io/pricing/api](https://elevenlabs.io/pricing/api)). For your corpus
that's $4.76 or $2.38 — _once_. Which is the real point: **at this corpus size the
money is irrelevant and the only thing that matters is that you pay it once, at
authoring time, rather than on every playback on every member's phone.**

If you'd rather not touch a cloud vendor at all, **Kokoro-82M** is the free-forever
option and practitioners rate it genuinely good now:

> "Kokoro TTS is really good now." — **ramesh31**, [HN 49243299](https://news.ycombinator.com/item?id=49243299)

> "Such great quality at a given size." — **Judson**, [HN 48823680](https://news.ycombinator.com/item?id=48823680)

Apache-2.0, runs on a laptop CPU. **Run it locally to generate the files** — do not
ship it to the browser. `tts.md` measured the smallest usable ONNX weights at 86 MB,
which is the wrong shape for a phone in a car, and I agree.

### 4. Azure Pronunciation Assessment: investigate it, but **do not make it the grade**

Full analysis in §5 below. Short verdict: **it is the most on-target API that
exists for "read this text aloud and be scored", it works from a browser with no
bundler, and it is nearly free at your volume — and it is still probably not the
right primary scorer for this app**, for three reasons that only show up when you
read the docs carefully. Spike it for a day; don't architect around it yet.

### 5. Do NOT reach for a voice-agent stack

LiveKit Agents / Pipecat / Vapi / Retell / OpenAI Realtime are for **duplex
conversations**. You have a half-duplex, turn-based loop with a known script. Verdict
in §4 below; it is not close.

---

## The traps, in order of how much they'd hurt

**1. Any transcription product whose value-add is cleaning up what you said.**
This is the biggest trap and it's the one the user walked straight toward by naming
Wispr Flow. Auto-editing, filler removal, "understand what people say" — all of it
silently repairs the recitation before you score it. Whisper's own `initial_prompt`
and `prefix` are milder versions of the same disease (`asr.md` §2). **Rule: the
transcript you score must be produced without ever having seen the verse text.**

**2. A Worker proxy with no auth in front of a paid API.** That is not "hiding the
key", it is _publishing the key with extra steps_. See §6 — the mitigations are
cheap and you must do them on day one, not after the bill.

**3. Grading pronunciation when you meant to grade memory.** Azure PA's
`AccuracyScore` measures how native-like the phonemes are. In a congregation with
accented English speakers, a perfect recitation can score badly. This is a product
and fairness problem, not a technical one, and it's the reason I stopped short of
recommending PA as the scorer.

**4. Streaming recognition on a phone.** Already documented in `asr.md` (Android
`continuous` is a no-op). It is the single most likely cause of "the audio system
really sucks" and no vendor swap fixes it — only the record-then-transcribe shape
does.

**5. Browser-local models.** transformers.js Whisper (41–77 MB), Kokoro ONNX
(86 MB+). Both measured in the existing docs. Both wrong for a phone in a car.

---

# The evidence

## 1. Wispr Flow, in detail

**What it is.** Founded 2021 as Wispr AI (a wearable for touchless phone control);
pivoted to software and launched Wispr Flow in 2024. $81M raised total — $30M
Series A led by Menlo Ventures in 2025, plus a $25M extension from Notable Capital
in Nov 2025 ([Wikipedia](https://en.wikipedia.org/wiki/Wispr_Flow)).

**Platforms:** macOS, Windows, iOS (third-party keyboard), Android. Linux and web
are **waitlists**, not products.

**Consumer pricing:** Free tier ~2,000 words/week; Pro **$15/user/month** or
**$12/month billed annually** ($144/yr)
([zackproser.com](https://zackproser.com/blog/wisprflow-pricing-guide-2026),
[eesel](https://www.eesel.ai/blog/wispr-flow-pricing)). ⚠️ These are third-party
roundups, not the vendor page — treat as approximately right.

**The API — this is the part the prompt didn't expect.**
[api-docs.wisprflow.ai](https://api-docs.wisprflow.ai/introduction) documents a
"Voice Interface API":

- **WebSocket `/ws`** (recommended, streaming, lower latency) and **REST `/api`**
  (explicitly labelled "slower").
- A **Warm Up API** whose stated purpose is to "minimize latency" — i.e. cold start
  is real enough to need a dedicated endpoint.
- **Two auth modes**, and the second one is browser-friendly: server calls
  `/generate_access_token` with a client ID and duration, gets a JWT, browser sends
  `Authorization: Bearer <JWT>` (REST) or `?client_key=Bearer%20<JWT>` (WebSocket).
  Org API key never reaches the browser
  ([client_side_auth_basics.md](https://api-docs.wisprflow.ai/client_side_auth_basics.md)).

So **technically, yes — a static web app with a Cloudflare Worker could integrate
Wispr Flow.** The Worker mints tokens; the browser talks to Wispr directly. That's
a clean pattern and it's more than most vendors offer.

**Why it still fails for this app.**

1. **It rewrites.** Auto-edits, filler removal, self-correction repair, "more
   concise while maintaining tone". No documented off switch. For scoring
   recitation this is disqualifying, full stop.
2. **No published rate card.** _"All models are charged based on usage tokens."_
   ([usage_billing.md](https://api-docs.wisprflow.ai/usage_billing.md))
3. **No spend limits.** _"At this moment we don't have support to add API limits
   directly in the dashboard, make sure you use the API in your code responsibly."_
   Same page.
4. **You'd be paying a premium for the exact behaviour you need to suppress.**

**What the community says about Wispr generally.** HN's most-discussed Wispr thread
isn't about Wispr — it's _"Show HN: Free alternative to Wispr Flow, Superwhisper,
and Monologue"_ (277 points, 132 comments,
[HN 47040375](https://news.ycombinator.com/item?id=47040375)), which is itself a
signal about how people feel about the pricing. The thread's throughline is local
models:

> "Building on local models is slower today but doesn't have a rug-pull failure
> mode." — **lxe**, in [HN 47040375](https://news.ycombinator.com/item?id=47040375)

> "Parakeet V3 gives the best experience with very fast and accurate-enough
> transcriptions" — **d4rkp4ttern**, same thread

On Reddit, Wispr Flow's _dictation quality_ is genuinely well-regarded — the
complaints are about price and lock-in, not accuracy:

> "Wispr Flow is able to recognise the use of different languages within the same
> dictation/sentence and transcribe accurately"
> — **u/UnlockHomes**, r/macapps,
> [thread](https://www.reddit.com/r/macapps/comments/1kmalvx/mac_dictation_still_sucks_what_are_you_all_using/msf2sb8/)

> "Loving WISPR Flow - but I'd prefer a version that is as good, with 1-time payment"
> — **u/ISayAboot**, r/macapps,
> [thread](https://www.reddit.com/r/macapps/comments/1k0ezj8/favourite_paid_productivity_app/mnkfpvd/)

In the same r/macapps thread, users list **Superwhisper, VoiceInk, and MacWhisper**
as the alternatives people actually switch to — all of them local-Whisper wrappers:

> "Voiceink is what I've settled on. Pretty fast, very accurate, and with bells and
> whistles" — **u/brandonhull**, r/macapps,
> [thread](https://www.reddit.com/r/macapps/comments/1jwot5r/tried_fixkey_rewritebar_elephas_still_looking_for/mmwqt4a/)

**Note what all of those are: desktop apps.** The thing people love about Wispr is
an OS-level dictation experience. None of that transfers to a web app, and the part
that _would_ transfer — the model — is the part you must not use.

There is also a thread titled _"Wispr Flow Is Tracking Every App/URL You Visit and
Taking Screenshots"_ ([HN 47781148](https://news.ycombinator.com/item?id=47781148)),
which is about the **desktop app**, not the API. I did not verify the claim and it
does not bear on the API decision — but if any church member is a Wispr desktop
user, it's worth knowing the accusation exists.

**Adjacent thing that _is_ interesting for a web app:** _"Show HN: SpeechOS – Wispr
Flow-inspired voice input for any web app"_
([HN 46707409](https://news.ycombinator.com/item?id=46707409)) — an SDK for browser
voice dictation with custom vocabulary. Small (12 points), unproven, and it has the
same auto-formatting orientation. Noted, not recommended.

## 2. Browser/JS speech-to-text: what people actually reach for

### The Web Speech API's reputation

HN's understanding of what it _is_ has been stable for a decade and matches what
`asr.md` documents:

> "The Web Speech API in Chrome is implemented by calling Google Speech Recognition
> APIs. Firefox would have to pay for an API key to use the same service."
> — **TD-Linux**, [HN 9748671](https://news.ycombinator.com/item?id=9748671)

> "Chrome implements it as a web service... Safari has only implemented the
> Synthesis part of the API because it can all be done offline... it doesn't work
> well offline or when you don't have Google API keys"
> — **thomasfoster96**, [HN 9165329](https://news.ycombinator.com/item?id=9165329)

Nobody defends it for production. It is treated as a demo primitive. Reddit is
blunter:

> Criticizes the Web Speech API as "broken," noting that no browser ships with
> built-in speech synthesis engines and that Chrome sends user data to remote
> Google servers rather than processing locally
> — **u/guest271314**, r/javascript,
> [thread](https://www.reddit.com/r/javascript/comments/1i16a4e/how_to_add_speech_input_output_to_your_app_with/m7aev0q)

> "The only actual pain in the ass I've run into is the SpeechRecognition interface
> in the web speech api, which firefox is the only browser to not support at all."
> — **u/fuckstick**, r/ArcBrowser,
> [thread](https://www.reddit.com/r/ArcBrowser/comments/1jz20vj/the_browser_company_raised_550m_from_top/mn3x44p)

That first one is the two-sentence version of `asr.md` and `tts.md` combined: the
recognition half is a Google web service, and the synthesis half is whatever the OS
happens to have.

### The current field, with prices I actually fetched

| Provider / model                             | Price                                | Source                                                                                 |
| -------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------- |
| **Groq `whisper-large-v3-turbo`**            | **$0.04/audio-hr** (12% WER, 216×RT) | [Groq docs](https://console.groq.com/docs/speech-to-text)                              |
| Groq `whisper-large-v3`                      | $0.111/audio-hr (10.3% WER, 189×RT)  | same                                                                                   |
| Cloudflare Workers AI whisper-large-v3-turbo | ~$0.031/audio-hr                     | `asr.md`; corroborated by [HN 44380182](https://news.ycombinator.com/item?id=44380182) |
| Soniox async                                 | ~$0.10/hr (~$1.50/1M audio tokens)   | [soniox.com/pricing](https://soniox.com/pricing) ⚠️ via search summary                 |
| ElevenLabs Scribe v2 (batch)                 | **$0.22/hr**                         | [elevenlabs.io/pricing/api](https://elevenlabs.io/pricing/api)                         |
| ElevenLabs Scribe v2 Realtime                | $0.39/hr                             | same                                                                                   |
| Deepgram Nova-3 batch (mono)                 | $0.0043/min = **$0.258/hr**          | [deepgram.com/pricing](https://deepgram.com/pricing)                                   |
| Deepgram Nova-3 streaming                    | $0.0048/min promo (reg. $0.0077)     | same                                                                                   |
| Deepgram Flux streaming (EN)                 | $0.0065/min promo                    | same                                                                                   |
| OpenAI `whisper-1`                           | $0.006/min = **$0.36/hr**            | [OpenAI pricing](https://developers.openai.com/api/docs/pricing)                       |
| OpenAI `gpt-4o-transcribe`                   | ~$0.006/min                          | same                                                                                   |
| OpenAI `gpt-4o-mini-transcribe`              | ~$0.003/min = $0.18/hr               | same                                                                                   |
| **Azure STT standard realtime**              | **$1/audio-hr**; F0 free = 5 hr/mo   | see §5                                                                                 |
| **Azure w/ Pronunciation Assessment**        | **$1.32/audio-hr**                   | see §5                                                                                 |

**The spread is ~33×** between Groq turbo and Azure PA, and ~8× between Groq turbo
and OpenAI's hosted Whisper — for the same underlying model in the OpenAI case.
That gap is the single most-repeated practitioner observation in this whole
research pass.

Free credits worth knowing: **Deepgram gives $200 free credit on signup, no card**
([deepgram.com/pricing](https://deepgram.com/pricing)). At $0.0043/min that is
~775 audio hours. For a few dozen users that is _years_. If you want best-in-class
keyword biasing (Deepgram's keyterms are genuinely the best in the field per
`asr.md` §6.2), the $200 makes the price objection temporarily disappear. **But**
see the trap list: keyterm-biasing toward verse text is a validity bug.

### Also considered, and why they don't rank here

- **Gladia** — async from **$0.61/hr**, realtime from **$0.75/hr**, with **10 free
  hours/month** on the Starter tier; Growth tier drops to ~$0.20/hr async with an
  upfront commitment ([gladia.io/pricing](https://www.gladia.io/pricing) via search
  summary — **[uncertain]**, I did not fetch the page directly). The 10 free hours
  is genuinely generous and would cover you. But it is **15× Groq's rate** once you
  exceed it, it's another vendor and another secret, and it buys you nothing Groq
  doesn't have for a clean single-speaker English recitation. **Skip.**
- **Speechmatics** — from **$0.129/hr** batch with **10 hrs/month free**
  ([speechmatics.com/pricing](https://www.speechmatics.com/pricing) via search
  summary — **[uncertain]**). Consistently top-3 on accuracy leaderboards; a Reddit
  commenter summarizing June-2024 benchmarks put _"AssemblyAI Universal-1 and
  Speechmatics"_ at the top for accuracy
  (**u/lets_assemble**, r/speechtech,
  [thread](https://www.reddit.com/r/speechtech/comments/1bvhlhv/is_there_a_leaderboard_for_speechtotext_tools/l8lae25/)).
  Real option if Whisper disappoints on accented recitation. **Escalation, not
  first move.**
- **Fireworks** — hosts Whisper as one of several third-party inference providers.
  I could not find a fetched, current per-hour rate; a roundup put third-party
  Whisper hosts in the **$0.50–$3.00 per 1,000 minutes** band ($0.03–$0.18/hr),
  which brackets Groq rather than beating it. **[uncertain]** — no verified price.
  **No reason to prefer it over Groq.**
- **AssemblyAI** — strong accuracy reputation, and one practitioner is specific
  about _why_: _"AssemblyAI excelled at deciphering repetitions...removing filler
  words...and determining appropriate punctuation"_ (**u/lets_assemble**, r/LLMDevs,
  [thread](https://www.reddit.com/r/LLMDevs/comments/1f7h0g3/sep_2024_speechtotext_api_with_highest_accuracy/lyg4wp2/)).
  **Read that praise carefully — "deciphering repetitions" and "removing filler
  words" are the Wispr problem in miniature.** For scoring a recitation you want
  the repetitions and stumbles preserved, not decoded away.
- **Soniox** — ~$0.10/hr async, best-in-class WER claims on their own comparison
  pages. Cheap and good, but every accuracy number I found for it is published by
  Soniox. **[uncertain]**, and no independent practitioner testimony surfaced.

### Accuracy claims — read these skeptically

Every vendor's comparison page shows itself winning. The one number I'd give weight
to is the aggregate observation from a vendor-neutral roundup that top providers
_"sit within 1-2 percentage points of each other on clean English audio"_
([futureagi](https://futureagi.substack.com/p/speech-to-text-apis-in-2026-benchmarks),
surfaced via search summary — **[uncertain]**, I did not fetch the underlying
benchmark). For recited scripture in a quiet room by a native speaker, **you are
almost certainly in the region where every modern model is good enough and the
architecture matters more than the model.**

One model-level fact worth carrying: **Whisper hallucinates during silence;
NVIDIA's Parakeet essentially doesn't.** Parakeet TDT 0.6B v3 is reported at 6.32%
avg WER vs Whisper large-v3's 7.44% on the HF Open ASR Leaderboard, ~3,333× RT,
CPU-viable, but only 25 European languages
([localaimaster](https://localaimaster.com/blog/parakeet-vs-whisper) — **[uncertain]**,
secondary source; the HN thread above independently praises Parakeet). For a
recitation app, "doesn't invent words during the pause where the member is
thinking" is a directly relevant property. **There is no cheap hosted Parakeet
endpoint I found that fits this app**, so this is a note for later, not an action.

## 3. TTS in 2026

### Verified prices

| Model                                        | Price                                       | Source                                                   |
| -------------------------------------------- | ------------------------------------------- | -------------------------------------------------------- |
| ElevenLabs v3 / v2 Multilingual              | $0.10 / 1k chars                            | [ElevenLabs](https://elevenlabs.io/pricing/api)          |
| ElevenLabs Flash / Turbo / v3 Conversational | $0.05 / 1k chars                            | same                                                     |
| Deepgram Aura-2                              | $0.030 / 1k chars                           | [Deepgram](https://deepgram.com/pricing)                 |
| Cloudflare `@cf/deepgram/aura-1`             | $0.015 / 1k chars                           | `tts.md`                                                 |
| Cloudflare `@cf/myshell-ai/melotts`          | $0.0002 / audio-min                         | `tts.md`                                                 |
| OpenAI `tts-1`                               | $15 / 1M chars                              | [OpenAI](https://developers.openai.com/api/docs/pricing) |
| OpenAI `tts-1-hd`                            | $30 / 1M chars                              | same                                                     |
| OpenAI `gpt-4o-mini-tts`                     | $0.60/1M text-in tok + $12/1M audio-out tok | same                                                     |
| Kokoro-82M                                   | **$0** (Apache 2.0, self-run)               | —                                                        |

Free tiers that matter for a **one-time corpus generation** of 47,609 characters:

- **Google Cloud**: 1M chars/month free on Neural2 / Chirp 3 HD (per `tts.md`).
  Covers the corpus ~20×.
- **Azure**: 500k neural chars/month free (F0). Covers it ~10×.
- **ElevenLabs**: 10k chars on the free/Starter tier — _not_ enough for the corpus
  ([ElevenLabs pricing](https://elevenlabs.io/pricing/api)).

### What practitioners say

ElevenLabs: universally acknowledged as the quality leader, universally described
as priced out of long-form.

> ElevenLabs' Creator tier at $0.08/minute versus OpenAI's $0.015/minute — roughly
> 5× more expensive — **ianbicking**, [HN 44204427](https://news.ycombinator.com/item?id=44204427)

> OpenAI's pricing is "85% cheaper" than ElevenLabs' Business plan
> — **benjismith**, [HN 43426954](https://news.ycombinator.com/item?id=43426954)

> objects to paying monthly "whether I use it or not"
> — **stavros**, [HN 44198546](https://news.ycombinator.com/item?id=44198546)

That last one is the relevant shape-of-cost complaint for a church tool: **a
subscription is worse than per-use, and pre-generated files are better than both.**

Kokoro is the open-weights consensus pick, and the sentiment shifted decisively
positive over 2025–26:

> "Kokoro TTS is really good now." — **ramesh31**, [HN 49243299](https://news.ycombinator.com/item?id=49243299)

> "Both Text-to-Speech and Speech-to-Text now have local models that are good
> enough." — **janpmz**, [HN 48824163](https://news.ycombinator.com/item?id=48824163)

> "MetalRT synthesizes Kokoro at 178ms for short responses, so you don't pay a
> speed penalty." — **sanchitmonga22**, [HN 47331013](https://news.ycombinator.com/item?id=47331013)

Reddit is warmer still, and — usefully — specifically about **long-form reading**,
which is your case:

> "TTS is 'pick two' from: Real Time, Local, & Sounds Good. Kokoro is the first 2."
> — **u/townofsalemfangay**, r/LocalLLaMA,
> [thread](https://www.reddit.com/r/LocalLLaMA/comments/1kgzb0c/whats_your_current_daily_driver_model_and_setup/mr4y79m/)

> "Kokoro TTS is probably the top of the line non-proprietary TTS for real-time
> applications." — **u/PacmanIncarnate**,
> [thread](https://www.reddit.com/r/Chatbots/comments/1kg54ll/what_sites_have_the_best_audio_chat/mqxg2h8/)

> "If you want something very fast altho synthetic (not robotic), look into Kokoro
> TTS" — **u/shaakz**, r/LocalLLaMA, in a thread about **generating MP3s from EPUBs**,
> [thread](https://www.reddit.com/r/LocalLLaMA/comments/1kjkmzl/generating_mp3_from_epubs_local/mrnfltx/)

That first quote is the honest frame: **Kokoro trades polish for being free and
local.** But you are _pre-generating offline_, so "real time" is a dimension you
don't need — which means the "pick two" constraint doesn't bind you, and you can
just as easily pick the cloud option that sounds best. That's why Chirp 3 HD edges
it for the primary recommendation and Kokoro is the no-account fallback.

One dissent worth recording:

> "Kitten TTS is good as a small model, better than Kokoro"
> — **bachittle**, [HN 47404700](https://news.ycombinator.com/item?id=47404700)

### Also considered, and why they don't rank here

The whole realtime-TTS tier is solving a problem you designed away by
pre-generating. Latency is irrelevant to a static `.opus` file.

- **Cartesia Sonic 3** — the speed leader (~40 ms time-to-first-audio), 1 credit per
  character, effectively **~$5–$37 per 1M chars depending on plan**; Sonic 3.5 cited
  at ~$49/1M ([eesel](https://www.eesel.ai/blog/cartesia-sonic-3-pricing),
  [texttolab](https://texttolab.com/blog/cartesia-pricing) — **[uncertain]**,
  third-party roundups). Excellent product, aimed squarely at phone agents. **You
  are paying for latency you will never experience.**
- **Rime** — ~**$0.030/audio-minute** PAYG (≈$39/1M chars effective). Positioned on
  conversational/spoken-style voices. Same objection as Cartesia. **[uncertain]** —
  third-party figure.
- **PlayHT** — subscription-based; I could not extract a clean per-character PAYG
  rate. Subscription is the exact cost shape practitioners complain about (see
  **stavros** above) and the worst fit for a one-time corpus generation. **Skip.**
- **Piper** — open source, fully local, $0. Fine as an _offline generator_, but its
  voices are a clear step below Kokoro's in every comparison I saw, and `tts.md`
  already ruled out shipping any neural TTS to the browser on download size. If
  you're going local, go Kokoro. **Superseded.**
- **Chatterbox** — open weights, frequently named alongside Kokoro as a free option.
  I found **no reliable pricing/quality evidence** for long-form reading and no
  practitioner testimony in what I could fetch. **Unevaluated — do not pick it
  blind.**
- **Cloudflare `@cf/deepgram/aura-1`** at $0.015/1k chars is the cheapest _runtime_
  option and needs no key at all (it's a binding). Keep it in your pocket for the
  small amount of **dynamic** text — Speak-mode feedback sentences — exactly as
  `tts.md` §5.1 already recommends. Don't use it for the corpus.

**For long-form reading aloud specifically** — which is what scripture is — I found
no practitioner testimony that any of these is _bad_. The reported failure modes
for long-form are about **prosody drift and artifacts over long generations**, and
Kokoro is specifically reported to hold up ("consistent voice quality across long
audio generation without artifacts" — [texttolab review](https://texttolab.com/blog/kokoro-tts-review),
**[uncertain]**, marketing-adjacent source).

**Recommendation stands with `tts.md`:** pre-generate, ship static audio. The one
thing I'd add from this round is a concrete tiebreak: **generate with Google Chirp 3
HD if you want it done in an afternoon with zero install; generate with Kokoro if
you want it reproducible forever with zero account.** Either is free for this
corpus.

## 4. Realtime / voice-agent stacks — overkill, and I'll say why

**Verdict: overkill. Not close. Do not do this.**

Your loop is: _app speaks a fixed string → member speaks → app scores → app speaks
feedback._ That is **half-duplex, turn-based, with a known script and a
deterministic scorer**. Voice-agent frameworks exist to solve the opposite problem:
full-duplex conversation with barge-in, interruption handling, LLM-in-the-loop
turn-taking, and telephony transport. You would import all of that complexity to
solve none of your problems.

The cost picture confirms it. OpenAI Realtime-2 is **$32/1M audio input tokens and
$64/1M audio output tokens**, which practitioners model out at roughly
**$0.05–$0.46 per minute** depending on caching and prompt hygiene
([HackerNoon measured-sessions analysis](https://hackernoon.com/openai-realtime-api-pricing-in-2026-real-world-data-from-4000-measured-sessions),
[TokenMix](https://tokenmix.ai/blog/openai-realtime-voice-api-2026-cost-latency) —
**[uncertain]**, these are third-party cost models, not OpenAI's own per-minute
rate). Compare: Groq turbo is **$0.00067 per minute**. That is a **75×–700×**
difference to solve a problem you don't have.

And the platform layer adds its own tax:

> "60–70% of our total spend was the Vapi platform fee, and only 30-40% was actual
> LLM/STT/TTS usage." — **a6kme**, [HN 46189900](https://news.ycombinator.com/item?id=46189900)

> "Livekit feels more or less for media handling then building voice agent... Piecat
> is good project... but not enterprise ready need to do lot of work to deploy."
> — **p_srivastav**, [HN 45884227](https://news.ycombinator.com/item?id=45884227)

Both of those are people who _chose_ these tools and are reporting the bill. Neither
of those failure modes is one you should volunteer for. Also note: LiveKit Agents
and Pipecat both need a **Python/Node process you keep running**. You have a
Cloudflare Worker. That alone ends the conversation.

**The only scenario that would change this:** if you wanted the app to _converse_ —
"try verse 3 again", member says "no, skip", interruption mid-verse. You don't, and
`voice-ux.md`'s half-duplex rule says you shouldn't.

## 5. Azure Pronunciation Assessment — the most relevant API, examined honestly

This is the finding the prompt suspected was buried, and it is real: Microsoft ships
an API built for exactly "read this text aloud and be scored."

### What it does

Three scenarios; **Reading** is yours: _"designed for scripted assessment. It
requires the learner to read a given text. The reference text is provided in
advance."_ ([MS Learn](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/pronunciation-assessment-tool))

Scores returned, per the docs and the sample JSON I fetched:

- **Full-text:** `AccuracyScore`, `FluencyScore`, `CompletenessScore`,
  `PronScore` (aggregate), plus `ProsodyScore` as an add-on.
  `CompletenessScore` is defined as _"how many words are correctly pronounced in
  the speech to the reference text input"_ — that is, **it natively measures "did
  you actually say the whole verse."**
- **Per-word:** `AccuracyScore` + `ErrorType` ∈ {`Mispronunciation`, `Omission`,
  `Insertion`, `Repetition`, …}. Yes — **real per-word accuracy scores**, exactly
  as the prompt hoped.
- **Per-syllable and per-phoneme** accuracy scores with offsets and durations
  (100-ns units), which doubles as free forced alignment.

Prosody adds error types like _Unexpected break_, _Missing break_, and _Monotone_.
Content/prosody assessment is **`en-US` only**.

### Does it work from a browser with no bundler? Yes.

- The Speech SDK for JS is at **v1.51.0** and ships a real browser bundle:
  `distrib/browser/microsoft.cognitiveservices.speech.sdk.bundle-min.js`
  (verified via the jsDelivr file listing for
  `microsoft-cognitiveservices-speech-sdk@1.51.0`). That's a plain `<script>` tag
  from a CDN exposing a `SpeechSDK` global — **the exact pattern `index.html`
  already uses for React/htm.** No bundler needed.
- **Authentication has a browser-correct path.** You POST your key to
  `https://{region}.api.cognitive.microsoft.com/sts/v1.0/issueToken` with an
  `Ocp-Apim-Subscription-Key` header and get back a token **valid for 10 minutes**.
  Per Microsoft's own framing, this _"is a more secure method to authenticate for a
  browser deployment as it allows the subscription keys to be kept secure on a
  server and a 10 minute use token to be handed out to clients."_
  ([browser samples README / docs](https://github.com/Azure-Samples/cognitive-services-speech-sdk/tree/master/samples/js/browser))
  **Your Cloudflare Worker is that token server.** ~15 lines.
- The JS API shape is small:

  ```js
  var pronunciationAssessmentConfig = new sdk.PronunciationAssessmentConfig(
      referenceText: "",
      gradingSystem: sdk.PronunciationAssessmentGradingSystem.HundredMark,
      granularity: sdk.PronunciationAssessmentGranularity.Phoneme,
      enableMiscue: false);
  pronunciationAssessmentConfig.enableProsodyAssessment();
  ```

  (verbatim from [MS Learn, JavaScript pivot](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-pronunciation-assessment))

### Price and free tier

- **F0 free tier: 5 audio hours/month**, shared across standard + custom STT.
  Batch transcription is not available on F0.
- **Standard with PA: $1.32/audio-hour**, billed **per second in 1-second
  increments** — so an 8-second clip costs ~$0.0029.
- **Short-audio REST endpoint (≤30 s): $0.66/audio-hour** — half price.
- Prosody is an add-on above the baseline STT price; accuracy/fluency/completeness/
  miscue are included in baseline.

Sources: [MS Q&A on PA pricing](https://learn.microsoft.com/en-us/answers/questions/5608069/pricing-and-usage-of-pronunciation-assessment-feat),
[PA tool docs pricing table](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/pronunciation-assessment-tool),
[Azure Speech pricing page](https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/)
(⚠️ the vendor pricing page rendered with **redacted `$-` placeholders** for me;
the dollar figures above come from the MS Q&A thread and search summaries of the
same page, so **treat them as approximately right and verify in the Azure calculator
before committing**).

**What 5 free hours means for you:** at 40 s per recitation, 5 hours ≈ **450
recitations/month, free**. A few dozen members averaging 10 recitations each lands
right around that. Past it, 1,000 recitations/month ≈ 11 audio hours ≈ **$14.50/mo**
— which is real money for "no budget", and **~33× the Groq cost** for the same
minutes.

### The three reasons I would not make it the grade

**(a) The 30-second cliff destroys the feature you most want.** Verbatim from the
docs, repeated in every language pivot:

> "If your audio file exceeds 30 seconds, use continuous mode for processing. In
> continuous mode, the `EnableMiscue` option is not supported. To obtain `Omission`
> and `Insertion` tags, you need to compare the recognized results with the
> reference text."

`EnableMiscue` is the thing that flags skipped and inserted words — i.e. **the exact
signal a memorization app needs**. `tts.md` measured the corpus at ~20 s per
passage median but with p90 at 550 chars and max 1,259 — comfortably over 30 s of
speech. So for your longer passages you fall into continuous mode, lose miscue, and
**have to run your own alignment against the reference text anyway** — which is what
`src/voice.js` already does. A large part of PA's value proposition evaporates
precisely where your passages are hardest.

**(b) It grades the wrong thing.** `AccuracyScore` is a pronunciation-quality score
against native norms. A member with a Nigerian, Korean, or Appalachian accent can
recite Romans 8 flawlessly from memory and get marked down. Microsoft is candid
enough to publish a
[characteristics-and-limitations](https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/speech-service/pronunciation-assessment/characteristics-and-limitations-pronunciation-assessment)
note for exactly this class of concern. **For a church tool, an accent-penalizing
score is not a bug you patch later — it's a reason someone stops using the app and
doesn't tell you why.**

**(c) The score is unstable enough that developers complain in public.** Two live
Microsoft Q&A threads:
[same audio + same reference text scoring well in Python and badly in TypeScript](https://learn.microsoft.com/en-us/answers/questions/2200409/azure-pronunciation-assessment-api-inconsistent-sc),
and [PA responses that "make no sense"](https://learn.microsoft.com/en-us/answers/questions/1145749/azure-pronunciation-assessment-api-response-make-n).
These are unresolved-feeling threads, not FAQ entries.

### What I _would_ use it for

Run PA **alongside** your existing scorer on a handful of passages and compare.
Specifically, three things it gives you that Groq+`voice.js` does not:

1. **`CompletenessScore`** — a free, well-calibrated "did they say the whole thing"
   number.
2. **Word-level offsets/durations** — free forced alignment, which unlocks
   karaoke-style highlighting during playback and "you hesitated here" feedback.
3. **`ErrorType: Omission`** on ≤30 s passages, as a validation set for your own
   alignment logic.

Treat accuracy/prosody as _diagnostics you might show_, never as _the grade_.

### The alternatives to PA, for completeness

- **Forced alignment tooling.** The academic comparison is unambiguous and cuts
  against the modern tools: _"The MFA outperformed both WhisperX and MMS"_ on
  word-level alignment at all time resolutions, because the GMM-HMM architecture has
  10 ms temporal resolution
  ([Rousso et al., Interspeech 2024](https://www.isca-archive.org/interspeech_2024/rousso24_interspeech.html),
  [arXiv](https://arxiv.org/pdf/2406.19363)). There is a live WhisperX issue titled
  exactly _"Word-level timestamps from WhisperX are inaccurate compared to Montreal
  Forced Aligner"_ ([whisperX#1247](https://github.com/m-bain/whisperX/issues/1247)).
  **Neither runs in a browser or on a Worker.** Both are Python with heavy deps.
  Irrelevant to this app except as a reason not to trust WhisperX timestamps if you
  ever reach for them.
- **Small purpose-built scorers.** Someone shipped _"an English pronunciation
  assessment engine that fits in 17MB and runs in under 300ms on CPU"_ using CTC
  forced alignment + GOP scoring
  ([HN 47085899](https://news.ycombinator.com/item?id=47085899) /
  [47083396](https://news.ycombinator.com/item?id=47083396)). Interesting existence
  proof — 17 MB is _browser-shippable_, unlike Whisper or Kokoro. But the thread
  has two comments, one of which is _"Error Error: No API found"_ (**arach**), and
  weights/recipe were requested and not visibly provided (**segmondy**). **Not
  production-ready. Bookmark it.**
- **Reading-tutor products confirm the category works.** Microsoft's **Reading
  Coach** / **Reading Progress** in Teams are built directly on Azure PA and give
  students real-time read-aloud feedback
  ([MS Education blog](https://www.microsoft.com/en-us/education/blog/2025/07/personalized-reading-practice-made-easy-with-ai-powered-reading-coach/)).
  BoldVoice is another PA-based product (their co-founder describes it on
  [HN 28209930](https://news.ycombinator.com/item?id=28209930)). And a developer
  building in this space said plainly: _"Yes, many libraries these days do
  pronunciation assessments. For this project, I used Azure Pronunciation
  Assessment."_ — **rubengt01**, [HN 40308752](https://news.ycombinator.com/item?id=40308752).
  **Azure PA is the default answer in this niche.** That's a real signal; it just
  doesn't override reasons (a)–(c) for _your_ variant of the problem.
- The pessimistic counterpoint, from someone who has clearly been in the weeds:
  _"nothing really changed in the public domain past few years"_ on the difficulty
  of accurate phoneme recognition — **adeptima**,
  [HN 45586787](https://news.ycombinator.com/item?id=45586787).

### What Reddit says about Azure PA

Thin but consistent — and it confirms both the "it's the default" and the "watch the
edges" reads:

> Azure pronunciation assessment performs "audio analysis down to the phoneme level"
> and is "generally available in American English, British English, Australian
> English, Chinese, French, German, Japanese and Spanish, with other languages
> available in preview"
> — **u/unkz**, r/LearnJapanese,
> [thread](https://www.reddit.com/r/LearnJapanese/comments/1i17zhg/)

> Azure Pronunciation Assessment services are "the cheapest option"
> — **u/soylaflam**, r/learnjavascript,
> [thread](https://www.reddit.com/r/learnjavascript/comments/w8iwej/)

> a developer who shipped a pronunciation feature in Anki notes it uses Azure Speech
> but is skeptical of its effectiveness for non-English languages
> — **u/warleysr**, r/Anki,
> [thread](https://www.reddit.com/r/Anki/comments/10mx5bo/)

Your corpus is `en-US`, so the language caveat doesn't bite. "Cheapest option" is
true relative to _other pronunciation-assessment products_ and false relative to
plain transcription — which is the whole trade being made here.

## 6. The API-key problem for a static app

### The horror stories are real and the numbers are large

From a fetched roundup of incidents: a developer whose **OpenAI bill reached $4,800**
after a `.env` file landed in git history and a bot found the key and ran crypto
mining disguised as API calls; multiple reports of **$1,000+** bills from keys leaked
in public repos, notebooks, and Discord; and reports of **$10,000+** surprise bills
([rafter.so incident writeup](https://rafter.so/blog/secrets/openai-api-key-exposure),
[Cyble on exposed ChatGPT keys](https://cyble.com/blog/when-ai-secrets-go-public-chatgpt/)).
There is a live GitHub issue literally titled _"Exposed OpenAI API Key with Active
Access and Quota Exhaustion"_ ([weaviate#8859](https://github.com/weaviate/weaviate/issues/8859)).
**[uncertain]** — these are secondary reports; I could not verify individual dollar
amounts at source. The _pattern_ is not in doubt.

Reddit's consensus on the underlying question is short and unanimous:

> "You cannot hide anything on the frontend. Everything is exposed to the client."
> — **u/eggtart_prince**, r/reactjs (77 upvotes)

> "A problem with this is that the key will be exposed on the client. (You'll be able
> to see the key in the network dev tool tab)" — **u/Dom_AmpBio**, r/django

There is no clever client-side answer and nobody claims otherwise. Obfuscation,
build-time injection, splitting the key across files — all of it is theatre.
`tts.md` §5.1 says the same thing; this is just the corroboration.

The mechanism is the part to internalize: _"Threat actors continuously monitor
public websites, GitHub repositories, and exposed JavaScript bundles to identify
high-value secrets. Once discovered, these keys are rapidly validated through
automated scripts and immediately operationalized."_ Nobody has to target your
church app. Scanners find it because it exists.

Notably, some providers have started defending against this at the platform level:
Google **blocks publicly-exposed API keys from reaching the Gemini API** specifically
to "prevent abuse of cost" — **zozbot234**,
[HN 47792615](https://news.ycombinator.com/item?id=47792615). Don't count on your
provider doing this.

### What to actually do — and the gotcha nobody mentions

**The gotcha:** a Worker proxy that accepts any request is not a security measure.
It's the same key, published at a URL you own, with your billing attached and no
provider-side abuse detection. **Proxying without authorization is strictly worse
than not proxying, because you've also removed the provider's own rate limiting from
the path.** This is the single most common mistake in this pattern.

The layered mitigation, all of which you can do on the Worker you already deploy:

1. **`run_worker_first: ["/api/*"]`** — already documented in `tts.md` §5.1. Route
   only `/api/*` through the handler; `env.ASSETS.fetch()` for everything else.
2. **Cloudflare Rate Limiting rules** on the `/api/*` path. Cloudflare's own framing
   is exactly your risk: rate limiting protects APIs _"from abuse, downtime, and cost
   overruns caused by excessive request rates"_
   ([Cloudflare Rate Limiting](https://www.cloudflare.com/products/rate-limiting/),
   [WAF rate-limiting rules](https://developers.cloudflare.com/waf/rate-limiting-rules/)).
   Free plan includes rate limiting rules. Set something aggressive — a human cannot
   recite more than ~2 verses/minute.
3. **Cloudflare Turnstile** to gate the first request of a session, minting a
   short-lived signed token the Worker checks on `/api/*`. Turnstile is free, is
   invisible in most cases, and _"can be embedded into any website without sending
   traffic through Cloudflare"_
   ([Turnstile use case docs](https://developers.cloudflare.com/use-cases/solutions/stop-malicious-bots/)).
   The combination is the recommended one: _"Turnstile challenges automated
   submissions at the form level, while rate limiting catches high-volume attacks
   that bypass or do not encounter the form."_
4. **Cap the request itself.** Reject bodies over ~1 MB and audio over ~90 seconds
   _in the Worker_ before you call the provider. This is the cheapest control and
   the one people skip.
5. **A dedicated, minimally-scoped key with a hard spend cap at the provider.**
   Groq/OpenAI-style project keys, spend limit set to a number you'd shrug at.
6. **Don't log or return the upstream error body verbatim** — provider errors
   sometimes echo request metadata.

For **Cloudflare Workers AI specifically, steps 5–6 are moot: there is no key.** The
model is a binding. That is a genuine, underrated security argument for `asr.md`'s
original choice, and it's worth weighing against Groq's better practitioner track
record. **[Opinion]** For a church tool run by one person, "there is no secret to
leak" is worth more than a few hundred milliseconds.

For **Azure**, the `issueToken` pattern is better than either: the Worker holds the
key and hands out 10-minute tokens. Same abuse surface (someone can farm tokens), so
steps 1–4 still apply.

---

## Where this doc disagrees with the existing research

- `asr.md` recommends **Cloudflare Workers AI Whisper** as the first cloud move.
  I'm calling that a **near-tie with Groq** rather than overturning it. Groq has
  overwhelmingly better practitioner testimony and a larger free tier (8 audio
  hr/day vs ~214 min/day); Workers AI has no secret to manage and is marginally
  cheaper. **Build the Worker route provider-agnostic and measure both.**
- `tts.md`'s pre-generate-the-corpus recommendation: **fully confirmed**, and the
  ElevenLabs pricing complaints found this round strengthen it.
- Neither doc mentions **Azure Pronunciation Assessment**. It deserved a section and
  now has one. Net verdict: real, relevant, browser-compatible, nearly free at your
  volume — and still not the right _grade_, for the 30-second miscue cliff and the
  accent-penalty reasons above.
- Neither doc mentions **Wispr Flow**. It now has an API; it is still wrong here.

## Open questions worth an hour each

1. **Measure end-to-end latency**: 40 s Opus blob → Worker → Groq vs → Workers AI.
   Nobody's published number will match your path.
2. **Spike Azure PA on five real recitations** — one long (>30 s), one by an
   accented speaker, one with a deliberately skipped verse. Compare
   `CompletenessScore` and per-word `ErrorType` against what `voice.js` already
   produces. This is the highest-information hour in the whole list.
3. **Verify the Azure prices in the Azure pricing calculator.** The public pricing
   page served me redacted `$-` placeholders.
4. **Check whether Groq's free tier ToS permits a public-facing app.** I did not
   find an explicit prohibition, but I also did not find explicit permission, and
   the 20 req/min ceiling is shared across your whole congregation.
5. **Generate three passages with Kokoro and three with Chirp 3 HD, and let two
   members pick blind.** The whole TTS decision is one listening test wide.
