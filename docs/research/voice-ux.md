# Speak mode: what a good hands-free voice loop sounds like

Product research + design specification. Written against the Speak mode shipped in
`src/speak.js` / `App.js`, whose whole turn is currently:

> "Recite Psalm 23:1." → *[listen]* → "62 percent correct." → next verse

**The one-line diagnosis: the loop is an exam when it should be a rehearsal.** It takes a
recitation and gives back a number. It never gives back the verse. Every mature product in
this space — scripture and language alike — is built on *anticipate, attempt, then hear the
truth*. Hearing the correct verse read back **is** the feedback. The score is seasoning.

Everything below follows from that.

---

## The loop we should build

Literal script. Bracketed italics are non-speech. All spoken lines are written in the voice
of `copy.js` — plain, warm, short sentences, no exclamation marks, no hype.

### Session open — spoken once

> **App:** "Ten verses due today. I'll read the reference, you say the verse, then I'll read
> it back. If you get stuck, say 'hint'."
>
> *[1.5s]*
>
> *[earcon: two-tone rising, ~250ms — "your turn"]*

Say the shape of the session up front and then never explain again. The person now knows
three things they currently have to guess: how long this is, whose turn it is, and that
there is a way out of being stuck.

### A verse — the recall turn (the default)

> **App:** "Psalm twenty-three, verse one."
>
> *[400ms]*
>
> *[earcon: rising two-tone — your turn]*
>
> *[microphone opens — LISTEN]*
>
> **Person:** "The Lord is my shepherd, I shall not want."
>
> *[endpoint detected → earcon: single soft low tone, ~150ms — "got it"]*

Then exactly one of four endings, by band. Note that **three of the four end with the verse
being read aloud.** That is the point of the whole redesign.

**Clean — 95% or better**

> **App:** "That's it."
>
> *[0.8s]* → next verse

No read-back. Getting it right is rewarded with *speed*, which is the only currency that
matters in a car. This also creates real variety in the rhythm: a good run feels fast, a bad
run feels patient. Right now every turn is the same length regardless of how it went.

**Close — 80 to 94%**

> **App:** "Close. Here it is."
>
> *[reads the verse at 0.92 rate]*
>
> *[1.2s]* → next verse

Optionally, when three or fewer words were missed and they are content words, one clause
before the read-back:

> **App:** "Close — you dropped 'shall'. Here it is." → *[verse]*

Never name more than two words aloud. Beyond two, the read-back is doing the work and the
list is just noise.

**Shaky — 55 to 79%**

> **App:** "Not quite. Listen."
>
> *[reads the verse]*
>
> **App:** "Now you."
>
> *[earcon]* → *[LISTEN — second attempt]*
>
> **App:** "There it is." *(or, if still short)* "Getting closer. We'll come back to it."
>
> → next verse

This is the mastery loop, and it is *one* extra attempt, immediately, right after hearing
the correct text. That is the moment the second attempt is worth anything.

**Lost — under 55%, or nothing usable heard**

> **App:** "Let's take this one together."
>
> *[reads the verse]*
>
> **App:** "Say it with me."
>
> *[reads the verse again, 0.88 rate]*
>
> → next verse

Deliberately **no** graded second attempt here. Do not make someone fail the same verse
twice in twenty seconds. Read it, let them speak over it, move on, and re-queue it later in
the session (see cadence below).

### Being stuck — the prompter

This is the feature the current loop is most obviously missing, and the one that will make
the biggest difference to how it feels.

**Silence from the start.** After 5 seconds with no speech at all:

> *[mic closes]*
>
> **App:** "It starts, 'The Lord is my shepherd.'"
>
> *[mic reopens — same attempt continues, no new earcon]*

After a further 7 seconds of nothing:

> **App:** "Here's the whole thing."
>
> *[reads the verse]* → next verse

**A stall in the middle.** They started, got three words in, and stopped. The app already
aligns heard words onto the passage positionally (`src/voice.js`), so it knows *where* they
dried up. After ~3 seconds of silence with the passage clearly unfinished:

> *[mic closes]*
>
> **App:** *[quieter, 0.9 rate]* "…I shall not want."
>
> *[mic reopens — same attempt continues, no penalty]*

Feed the next three words and get out of the way. This is what a stage prompter does, and it
is the single most humane thing an audio memorization app can do. Nothing in the surveyed
products does it.

**The half-duplex mechanics matter here and are easy to get wrong.** The microphone cannot
stay open while the app speaks the prompt — the recognizer would transcribe the app's own
voice and the grader would credit the person with words they never said. So a prompt is a
real `sayThen()` cycle: tear down, speak, rebuild. Two things must survive that gap so it
still grades as **one continuous attempt** rather than a fresh turn:

- the transcript accumulated so far, and the alignment position within the passage;
- a record of which words the app supplied, so **prompted words are excluded from the score**.
  A verse the app had to feed three words into did not earn those three words.

No new earcon on reopen either — an earcon means "new turn", and this is not one.

**On request** — the person says "hint":

> **App:** *[the next three words from where they are]* → *[LISTEN continues]*

### Commands, in situ

> **Person:** "read it"
> **App:** "Sure." → *[reads the verse]* → "Now you." → *[earcon]* → *[LISTEN]*

> **Person:** "skip"
> **App:** "Okay." → next verse

> **Person:** "repeat"
> **App:** *[re-reads whatever it last said]*

> **Person:** "again"
> **App:** *[re-prompts the same reference]* → *[earcon]* → *[LISTEN]*

> **Person:** "slower"
> **App:** "Okay." *[drops TTS rate one notch for the rest of the session]*

> **Person:** "stop"
> **App:** "Stopped. Six left — we'll start there next time."

### Session close

> **App:** "That's ten. Six clean. Four to come back to, and we'll open with those next
> time."

A session needs an ending. Right now it wraps forever until someone reaches for the phone —
which is the one thing the mode exists to avoid.

### Within-session cadence (the Pimsleur part)

- A verse graded **shaky or lost** is re-inserted **2 to 3 verses later**, not looped
  immediately and not deferred to another day.
- A re-inserted verse that comes back clean leaves the session queue.
- A re-inserted verse that misses a second time is read once more and dropped for the day —
  three failures on one verse in one session is where a person quits.
- Never the same verse twice in a row, except for the single immediate repair attempt in the
  shaky band.

That is graduated-interval recall at session scale, which is exactly what Pimsleur's core
mechanic is
([Pimsleur](https://www.pimsleur.com/blog/why-graduated-interval-recall-is-the-key-to-mastering-a-new-language/)).

### Two session shapes, not one

- **Recall session** (above) — the default for verses the SRS considers committed and fresh.
- **Learn session** — for a verse that is weak or new, invert the turn:
  reference → *verse read* → *[2s]* → "Now you." → earcon → LISTEN → verse read again.
  This is Remember Me's hands-free loop exactly, and it is the right loop for a verse you do
  not yet have ([remem.me](https://www.remem.me/docs/audio/)).

Pick per verse from the existing progress record rather than making it a session-level
setting. The person should never have to decide.

### Timing numbers

Concrete replacements for the current flat `SPEAK_SILENCE_MS` ≈ 2.5s / `SPEAK_MAX_WAIT_MS`.
These are engineering starting points, not measured values — mark them as tunable and expect
to move them after real car testing.

| Thing | Value | Why |
|---|---|---|
| Reference → earcon gap | 400ms | Space so the earcon reads as a separate signal, not a syllable |
| Earcon "your turn" | ~250ms, two-tone rising (880 → 1175 Hz) | Synthesize it — `beat.js` already has WebAudio, no files needed |
| Earcon "got it" | ~150ms, single 440 Hz, quiet | Confirms the mic closed. Silence after speaking is what feels broken |
| First-word grace | 5s | Then the prompter, not a failure |
| Endpoint silence, normal | 2.0s | Slightly tighter than today because the prompter now covers the stalls |
| Endpoint silence, mid-verse | 4.5s | Applied when the transcript covers <70% of expected words — they are thinking, not finished |
| Attempt ceiling | max(20s, words × 0.9s) | A long chapter needs a long turn; today's fixed ceiling punishes the long ones |
| Read-back rate | 0.92 of default | Scripture at conversational TTS rate is too fast to follow |
| Gap after a clean verse | 1.2s | |
| Gap after a read-back | 2.0s | Let it land before the next reference |
| Max continuous speaking stretch | 12s | Chunk on sentences — reuse `chunkForSpeech()` from `beat.js` |

That last row is not only a UX rule. Chrome abandons utterances beyond roughly 15 seconds
without firing `onend` — the app already knows this and handles it in Run mode. Speak mode's
read-backs will hit the same wall the moment it starts reading whole passages.

---

## What existing apps actually do

**The headline finding: essentially nobody does speech scoring in a hands-free loop.** Of
the products surveyed, exactly one (Verses, iOS) grades spoken recitation at all, and it does
so as an on-screen game mode, not eyes-free. Every product that markets a *hands-free* /
*driving* audio experience is running a **passive** loop: reference → pause → correct text,
self-checked. Verse Mastery's Speak mode is doing something genuinely novel — which is also
why there is no prior art to copy for the feedback half, and why it needs designing rather
than borrowing.

### Remember Me — the closest thing to a reference implementation

Its hands-free loop, in its own words: it *"speaks the reference, waits during a **recall
pause** so you can recite the passage from memory, then reads the passage so you can check
yourself"* ([remem.me/docs/audio](https://www.remem.me/docs/audio/)).

That is Pimsleur's anticipation gap applied to scripture, and it is the structure I am
recommending. Exposed settings: speech rate, volume, **pause between verses (seconds)**,
**recall pause (seconds)**, sleep timer, repeat-the-list toggle, caption display. There is a
separate self-recording path (record yourself, reveal the text, play back, self-assess) and a
temporary in-session "flag" to re-read a missed verse without touching its schedule — note
that flagging requires a tap, so their re-queue is *not* hands-free. Ours can be.

No speech recognition. No scoring. The recall pause is user-tunable rather than adaptive.

### The Bible Memory App (formerly Scripture Typer; "Bible Memory Pro" appears to be the same product line — inferred, I found no separate app of that name)

Audio is a **Bible Verse Recorder**: you record yourself reading your verses, then play them
back in a continuous loop, optionally over background music from your device. Marketed
explicitly for review while driving. Audio and flashcards are paid tier.
([biblememory.com](https://biblememory.com/),
[Play Store](https://play.google.com/store/apps/details?id=com.millennialsolutions.scripturetyper&hl=en_US),
[App Store](https://apps.apple.com/us/app/the-bible-memory-app/id496790833))

Its interval ladder is the one Verse Mastery already borrowed (see `srs.INTERVALS`). Its
audio is pure playback — no recall gap, no listening, no scoring. **The interesting thing is
that its audio value proposition is "your own voice",** which is a real insight: people
report recordings of themselves being stickier than TTS.

### Fighter Verses

*"The audio loops continually so that through repetition you can become familiar with the
text"*, and it is pitched for *"when you can't look at the device, like when driving,
walking, or running."* Its differentiator is **human narration (Max McLean) rather than
TTS**, plus memory songs setting verses to music — several reviews single out the human
voice against *"robotic, AI-generated voices"* in competitors.
([Truth78](https://truth78.org/pages/fv-app),
[App Store](https://apps.apple.com/us/app/fighter-verses-memorize-bible/id411711646),
[learnofchrist review](https://learnofchrist.com/resources/fighter-verses))

Six on-screen quiz modes, spaced review — but the audio path is loop-only. No recall gap, no
scoring. **The voice-quality point is a direct hit on our current build,** which uses the
browser's default `speechSynthesis` voice.

### Verses (iOS)

The only surveyed product with spoken grading. Six game modes: Tap to Reveal, Listen,
Reorder, Word Bank, Type Out, and **Speak Out** — *"recite the passage back verbally"*, and
the app *"will grade your accuracy and track your progress."*
([getverses.com](https://www.getverses.com/),
[App Store](https://apps.apple.com/us/app/verses-bible-memory/id939461663))

The marketing site gives no detail on scoring method, feedback phrasing, or whether Speak Out
can run eyes-free — I fetched the page directly and it simply does not say. **Inference, not
report:** given it is presented as one of six on-screen games in a progression, Speak Out is
almost certainly a screen-attended single-verse exercise, not a continuous hands-free session.
Worth someone installing it and checking; it is the nearest competitor to what we are
building.

### Dwell

Not a memorization app — an audio Bible — but it is the state of the art for *scripture as
listening*, and its feature list is a checklist of what a good audio experience has that
Speak mode does not: 20+ distinct human voice recordings, independent volume for voice and
music, background music beds, sleep mode, offline download, and a **"Repeat & Reflect"**
memorization feature.
([dwellapp.io](https://dwellapp.io/calvin),
[Play Store](https://play.google.com/store/apps/details?id=com.dwellapp.dwell&hl=en_US),
[review](https://timwildsmith.com/reviews/dwell-app))

The lesson is voice quality and audio comfort, not loop structure.

### YouVersion (Bible App)

Memorization is a **word-selection puzzle** — tap words to fill blanks, retry on a wrong pick
— available only in five languages. Audio exists (professional narration per translation) but
is entirely separate from the memorize feature; there is no spaced repetition system behind
it.
([YouVersion support](https://help.youversion.com/l/en/article/h8owck8of7-verse-memorization))

Effectively no overlap with hands-free memorization. Mentioned for completeness.

### What people are actually asking for

Community threads surfaced a request for *"an audible method for scripture memorization that
repeats verses over and over without having to input commands or read the screen"*, with
workarounds including a generic audio looper and, more recently, using ChatGPT's voice mode
to be tested aloud
([faith.tools roundup](https://faith.tools/bible-memory),
[biblememorygoal comparison](https://www.biblememorygoal.com/memory-methods/best-bible-memory-apps/)).

**This is the demand signal.** People are jury-rigging voice assistants to get exactly the
loop Speak mode is trying to be. The idea is right; the execution is what is wrong.

---

## Language learning: the mature version of this pattern

### Pimsleur — the mechanic to copy

Two named principles, both directly applicable:

**Graduated Interval Recall.** Items are prompted at expanding intervals — *"revisit it for
review a minute later. Each subsequent review occurs at a greater interval — for example, 5
minutes, 15 minutes"* — repeated intensively at first, then at ever-greater gaps.
([Pimsleur](https://www.pimsleur.com/blog/why-graduated-interval-recall-is-the-key-to-mastering-a-new-language/))

Verse Mastery has this **between** sessions (`srs.INTERVALS`) and nothing like it **within** a
session. The Speak queue is a flat carousel. That is why a bad verse just rolls past.

**The Principle of Anticipation.** Learners *"listen, pause for understanding, generate a
response, and then compare their response to a native speaker's."* Pimsleur designed against
*"the dulling effect of mere repetition"* by requiring the learner to produce the answer
before hearing it. The lesson cycle is literally **audio, silence, audio, silence**.
([Art of Memory](https://artofmemory.com/blog/the-pimsleur-language-method/),
[Pimsleur on memory](https://www.pimsleur.com/blog/memory-and-language-learning-how-pimsleur-helps-you-retain-what-you-learn))

Note the fourth beat: *compare your response to the correct one*. **Verse Mastery has beats
one, two and three and is missing beat four.** It replaces the correct answer with a
percentage. That is the whole bug.

### Duolingo

Read-aloud exercises are transcribed by ASR and scored **pass/fail**, tuned generously — *"mumble
something in the neighborhood and you usually pass."* No phoneme-level scoring in the core
course. The design goal is explicitly *keeping the learner moving*.
([Duolingo speaking whitepaper](https://duolingo-papers.s3.amazonaws.com/reports/duolingo-speaking-whitepaper.pdf),
[assessment whitepaper](https://englishtest-static.duolingo.com/media/resources/media/resources/whitepapers/speaking-whitepaper.pdf))

The takeaway is not the leniency, it is the **banding**. The world's most-used speech-practice
product decided a continuous score was the wrong output for a speaking exercise. We are
currently shipping a continuous score to someone at 60mph.

### ELSA Speak — the counter-example, and why it does not apply

ELSA does the opposite: phoneme-level analysis, highlighting the exact mispronounced sound,
so learners *"know exactly which sounds require practice rather than guessing why they
received a low score."* Feedback arrives as a bell/buzz earcon plus colour-coded text, mouth
diagrams, waveforms, and A/B playback against a native speaker.
([ELSA FAQ](https://elsaspeak.com/en/faqs/how-does-elsas-pronunciation-feedback-work),
[ELSA blog](https://blog.elsaspeak.com/en/advantage-of-elsa-feedback/))

Two things transfer and one does not.

- **Transfers:** feedback must be *specific and actionable*, never a bare number. ELSA's own
  framing — a score leaves you guessing — is the exact complaint against "62 percent correct."
- **Transfers:** the bell/buzz earcon pair. Cheap, instant, eyes-free.
- **Does not transfer:** all of the visual apparatus. ELSA's specificity is delivered
  *visually*. Ours has to be delivered by **reading the correct verse back**, because that is
  the only eyes-free channel for "here is what it should have been."

### Anki + TTS

The community pattern is a card whose front is TTS of a prompt, a pause, then TTS of the
answer, chained for hands-free review — the same audio/silence/audio shape, self-graded, with
grading deferred to the screen later. It is worth noting mainly as confirmation that when
people build audio-only review themselves, they build **prompt → gap → answer** and accept
losing the grading, rather than building **prompt → gap → score**.

*(Inference from the general shape of Anki audio-review setups rather than a specific cited
source — I did not find an authoritative write-up in this pass.)*

### Voice interface fundamentals

- *"Clearly defining turn-taking is crucial ... using techniques like audio cues and silence
  detection."* Earcons should mark each state change: a ping when listening starts, a
  different sound when processing begins, a chime on completion.
- *"Silence past three seconds and the user assumes the system crashed."*
- Endpointing by trailing-silence VAD is the traditional approach; every 800ms of endpoint
  timeout adds most of a second to every single turn, which compounds badly over a long
  session.
- Barge-in — letting the user interrupt while the system is talking — is standard practice in
  mature voice agents.

([Fuselab VUI guide](https://fuselabcreative.com/voice-user-interface-design-guide-2026/),
[LiveKit on turn detection](https://livekit.com/blog/turn-detection-voice-agents-vad-endpointing-model-based-detection),
[Aufait UX](https://www.aufaitux.com/blog/voice-user-interface-design-best-practices/))

**Barge-in is architecturally impossible for us and this is important.** `sayThen()` tears
the recognizer down before the speaker opens its mouth, because a microphone left open while
the app talks transcribes the app's own voice and the session grades itself. Speak mode is
**half-duplex by necessity**. Nobody should later "fix" the design by promising the user they
can interrupt. The mitigation is the 12-second cap on continuous speech plus a hardware stop
(see Safety).

---

## Feedback that is useful, not discouraging

### Why "62 percent correct" is the wrong output

Four separate failures in five words:

1. **No action attached.** 62% does not tell you which words, or what to do next.
2. **It is the wrong resolution.** The difference between 62% and 67% is meaningless and
   unactionable, but it *feels* like information, so the listener spends attention on it.
3. **It is a verdict, and verdicts accumulate.** Twenty verses at 60-something percent is
   twenty small failures in a row, delivered in a flat synthetic voice, with nothing offered
   in between.
4. **It occupies the slot where the verse should be.** This is the real cost. The one thing
   a person who just fumbled a verse wants is to hear the verse.

### The replacement

Four bands, one short line each, and — the load-bearing part — **the correct text read back
in three of the four cases.** Bands and copy as specified in the loop above. Restated
compactly:

| Band | Line | Then |
|---|---|---|
| ≥95% | "That's it." | next verse, fast |
| 80–94% | "Close. Here it is." | read the verse |
| 55–79% | "Not quite. Listen." | read the verse, then one retry |
| <55% | "Let's take this one together." | read it twice, re-queue later |
| nothing heard | *(prompter, not a verdict — see below)* | |

### When to say nothing at all

- **Never** announce a percentage in driving mode.
- **Never** comment on how long they took.
- **Never** say anything at all between a clean verse and the next reference beyond "That's
  it." Silence after success is a reward.
- **Never** narrate the machinery — no "processing", no "grading your recitation", no
  "listening now" (the earcon says it in 250ms).
- On a second attempt that improves but still misses, say "Getting closer. We'll come back to
  it." and stop. Do not re-report the band.

### The line to delete first

> "I did not hear anything. Moving on."

This is currently the most-heard line in any noisy car, it is dismissive, and it is a lie —
the app heard road noise and gave up. Replace with the prompter escalation: partial first
words → whole verse → next. The person is never told they failed to be heard; they are just
helped.

### On naming missed words

Worth doing, narrowly. `feedbackFor()` already computes the missed set and caps it at
`MAX_SPOKEN_MISSES` = 8. **Eight is far too many to speak aloud.** Recommended rule:

- Name missed words only when there are **three or fewer**.
- Name at most **two**, in passage order.
- Only content words — never articles, conjunctions or prepositions on their own. Dropping
  "and" is not a memory failure worth a sentence.
- Format: `"Close — you dropped 'shall' and 'green'. Here it is."` then read the verse.

Above three misses, the read-back *is* the specific feedback and a word list is only noise.
The existing "Word by word" feedback mode should be **disabled in driving mode entirely** and
kept as a post-session on-screen review.

### Copy voice check

All recommended lines: short sentences, plain words, no exclamation marks, no gamified hype,
warm but unsentimental. "That's it." / "Close." / "Not quite. Listen." / "Let's take this one
together." / "There it is." That matches the register of the existing `copy.speak` strings
and of `copy.run.idleNote`.

---

## Voice commands

### The vocabulary — six words, plus two aliases

Collisions below are **measured against the 183 passages actually shipped in
`data/passages.js`**, not recalled — word-boundary match, case-insensitive.

| Command | Does | Collisions in the shipped set |
|---|---|---|
| **hint** | Next three words from where you are | **0** |
| **skip** | Abandon this verse, go to the next | **0** |
| **repeat** | Re-say the last spoken thing | **0** |
| **stop** | End the session | **0** |
| **read it** | Read the whole verse, then hand back the turn | **0** ("read" appears nowhere) |
| **again** | Re-prompt the same reference and re-listen | **2** — John 14:1–3, Hebrews 11:32–38 |
| *slower / louder* | Adjust TTS | **0** each |

So the proposed vocabulary is almost entirely collision-free **today**, and "again" is the
only word needing the carrier rule, on two verses.

**On "help" as the hint word — reject it anyway.** It collides only once in the current set
(Hebrews 4:15–16, *"grace to help in time of need"*), so the measured risk is low. But it is
the highest-risk word in the vocabulary against the *set as it will grow*: Psalm 46:1 (*"a
very present help in trouble"*) and Psalm 121:1–2 (*"my help comes from the LORD"*) are among
the most commonly memorized verses in English and are obvious future additions to the Psalms
shelf. **"hint" has zero collisions and no plausible future ones.** Take the free win.

Similarly, avoid **"one more"** as an alias for *again* — "one" appears in 36 shipped
passages and "more" in 12.

### The safe detection design

Four conditions, all required. An utterance is treated as a command only when:

1. **It arrives during LISTEN.** Half-duplex means there is no other window. This is not a
   limitation to work around; it is the entire command surface.
2. **It is the whole final utterance**, not a substring — the settled transcript for that
   phrase is the command word and nothing else.
3. **It is standalone** — preceded by at least 600ms of silence and followed by the endpoint.
   A command spoken inside a flowing recitation is not standalone.
4. **It does not match the expected next word at the current alignment position.** The app
   already tracks where in the passage the recitation has reached (`voice.js` aligns heard
   words onto the passage positionally). If the next expected word *is* "again", the utterance
   is recitation, full stop.

### The collision rule — computable, and testable at build time

Do not hand-tune this. **At queue time, compute which command words appear anywhere in the
current passage's text.** For those words *and only those*, on *that verse only*, require a
carrier prefix:

- Psalm 23 contains none of the command words → bare "stop" and bare "again" are safe.
- John 14:1–3 contains "again" (*"I will come again"*) → on that verse only, "again" alone is
  recitation; the command requires **"okay again"**. Same for Hebrews 11:32–38.
- Every other command word, on every one of the 183 shipped passages, needs no carrier at all.

The person pays the carrier-word tax on the handful of verses that need it and nowhere else.
This is cheap to implement (a set intersection against `passage.text`) and cheap to verify:
ship a unit test over `data/passages.js` asserting, for each command word, exactly which
passages collide — so the list can never silently grow when new passages are added.

### Stop must never fail

Stopping is the one command with a safety consequence, so it gets three independent paths:

1. Standalone "stop" during LISTEN, per the rules above.
2. **"stop stop"** — a doubled standalone utterance always stops, on any verse, carrier or
   not. Nothing in scripture repeats a bare "stop".
3. **Hardware.** Headphone/media-button pause, and a full-width Stop control on screen for a
   passenger. Neither requires the driver to read anything.

The half-duplex constraint means "stop" spoken while the app is talking is *not heard*. This
must be designed around, not wished away: the 12-second cap on continuous speech guarantees a
LISTEN window is never more than a few seconds away, and the hardware paths cover the rest.

### False triggers we should accept

A false *hint* or a false *repeat* costs three seconds and is barely noticed. A false *skip*
costs a verse. A false *stop* ends the session. Tune the confidence threshold per command by
that cost — loose for hint and repeat, strict for skip and stop. Do not use one threshold for
all six.

---

## Safety in the car

The app currently shows a warning (`copy.mobileGate.safety`, `views/mobile-gate.js`). That is
the right first move and it is not the same as designing the audio for a car.

NHTSA's guidance is framed around glance behaviour: risk of an unsafe event rises
substantially once a glance away from the road exceeds **2.0 seconds**, and the Phase 1
guidelines set 2 seconds as the single-glance acceptance criterion. Auditory-vocal interfaces
were explicitly deferred to a later phase, so there is **no federal numeric standard for a
voice task like ours** — the 2-second figure is the applicable anchor and the rest is inferred
from it.
([Federal Register 2013](https://www.federalregister.gov/documents/2013/04/26/2013-09883/visual-manual-nhtsa-driver-distraction-guidelines-for-in-vehicle-electronic-devices),
[NHTSA human factors guidance](https://www.nhtsa.gov/document/human-factors-design-guidance-driver-vehicle-interfaces))

### What the audio design does differently

- **Nothing is ever conveyed only on screen.** If the app knows it, it says it. A driving
  session that requires a glance to be understood has failed regardless of what it says.
- **No timing pressure, ever.** Never "you took too long", never a countdown, never a ticking
  sound. The attempt ceiling exists to stop the loop hanging, not to hurry anyone — and when
  it fires it produces a read-back, not a failure.
- **No question that needs an answer.** Every prompt must have a safe default on silence. Do
  not say "Do you want to try that again?" and wait — do the safe thing and let a command
  override it.
- **Predictable rhythm.** Same earcon, same gaps, same band lines every time. Predictability
  is what lets attention stay on the road.
- **Duck and yield.** Lower or pause for navigation prompts and calls; resume where it left
  off. Losing your place because your GPS spoke is infuriating and is a reason to reach for
  the phone.
- **Survive screen-off.** The Run mode lesson applies directly: a phone in a pocket with the
  screen off is a throttled background tab. Schedule ahead, request a wake lock as a courtesy
  and depend on nothing.

### What should simply be disabled in driving mode

- **Percentage scores**, spoken or displayed. Bands only.
- **"Word by word" feedback mode** — a spoken list of missed words is the most attention-costly
  output the app can produce.
- **"Verse by verse" percentages** — up to N spoken numbers per turn, unactionable.
- **Any typed correction** of a misheard word.
- **Streaks, ranks, the leaderboard, and anything with jeopardy attached.** A person should
  never feel a reason to interact with the screen mid-drive to protect a number.
- **Session-end summary detail** beyond one warm sentence. Save it for when they park.

### What the screen should be

One reference in the largest type that fits, and a full-width Stop control. Nothing else. The
test is that a passenger glancing over understands the state in well under two seconds, and
that the driver never needs to.

---

## The "sucks" diagnosis, in priority order

1. **The loop never gives the verse back.** It takes a recitation and returns a number.
   Someone who just half-remembered a verse wants, more than anything, to hear the verse — and
   hearing it is the only eyes-free way to learn what they got wrong. This one flaw makes the
   session feel extractive rather than helpful.
   **Fix:** read the correct text back on every non-clean turn. This is the single change.

2. **The score is the wrong output.** "62 percent correct" is unactionable, falsely precise,
   and accumulates as a run of small failures.
   **Fix:** four bands, one short line each, no numbers spoken in driving mode.

3. **Turn-taking is invisible.** There is no signal for "start speaking now" and none for "I
   heard you." The person guesses, starts late, gets clipped, and cannot tell whether the app
   is listening or dead.
   **Fix:** two synthesized earcons — rising two-tone on mic open, single soft tone on mic
   close. Reuse the WebAudio graph in `beat.js`; no files to ship.

4. **A flat 2.5-second endpoint cuts people off mid-verse.** The pause in the middle of a
   half-remembered verse is exactly where recall is happening, and the app treats it as "done"
   and grades the fragment. That is a punishment for trying.
   **Fix:** adaptive endpointing — 2.0s when the transcript looks complete, 4.5s when it
   covers under 70% of the expected words — plus the prompter feeding the next three words on
   a stall.

5. **There is no way to be stuck.** No hint, no way to hear it, nothing between silence and
   failure. The audio equivalent of the first-letter scaffold simply does not exist.
   **Fix:** the prompter (next three words, automatic on stall or on "hint"), plus "read it".

6. **There is no recovery from a mistake.** A bad verse rolls past and is gone. Nothing in the
   session gives you a second chance at the thing you just discovered you did not know.
   **Fix:** one immediate retry after the read-back in the shaky band, and re-insert the verse
   2–3 turns later.

7. **Dead air and a monotone rhythm.** Every turn is the same length and shape regardless of
   how it went, punctuated by silences that are indistinguishable from a crash. VUI guidance:
   past three seconds of silence people assume the system has died.
   **Fix:** vary the turn by band (clean turns get fast, bad turns get patient), and never
   leave a gap over ~2s that is not bracketed by an earcon.

8. **The default browser voice is unpleasant, and scripture read at conversational TTS rate is
   hard to follow.** Fighter Verses' whole audio differentiator is human narration against
   *"robotic, AI-generated voices"* — that critique lands squarely on us.
   **Fix, cheap:** explicitly select the best available `speechSynthesis` voice rather than
   taking the default, drop the read-back rate to ~0.92, and chunk on sentence boundaries so
   punctuation is audible (`chunkForSpeech()` already exists).
   **Fix, later:** pre-recorded human audio for the shipped set is the highest-ceiling
   improvement available and the one users notice first.

9. **The session has no shape and no end.** It wraps forever. There is no "here is what we are
   doing", no sense of progress, and no ending — so the only way out is to pick up the phone,
   which is the exact thing the mode exists to prevent.
   **Fix:** a stated queue length at the open, and a one-sentence close.

10. **Errors end the session outright.** `onError` stops everything, which is right for a
    denied microphone and wrong for one dropped network blip on a drive.
    **Fix:** distinguish fatal from transient — retry a transient recognizer failure once,
    silently, and only stop with a spoken reason on a genuine fault.

11. **"I did not hear anything. Moving on."** Dismissive, most-heard line in a noisy car, and
    it terminates the turn rather than helping.
    **Fix:** delete it. Escalate through the prompter instead.

---

## One open question worth deciding deliberately

Speak mode is currently **practice only** — it never calls `App.record()`, so nothing moves
along the ladder. That is a defensible scope choice (a recital graded through road noise is
poor evidence), but combined with everything above it means a person can spend twenty focused
minutes reciting and have the app record nothing at all. That is its own reason the mode feels
hollow.

**Recommendation:** let Speak mode move a verse **forwards only, never backwards.**

- A clean band recitation (≥95%) awards freshness and may advance a rung, exactly as a typed
  attempt would.
- Every other band records nothing — no freshness spent, no rung lost, no lapse.

This makes a session count without letting a misheard word in a car cost anyone a verse's
schedule, and it needs no new grader: `gradeWritten` and `commitsVerse` already read the
attempt rather than how the words arrived.

Whether a clean *spoken* recitation should be allowed to **commit** a verse is a separate and
harder call, and worth deciding with the church rather than in code.

---

## Sources

- [Remember Me — Audio features](https://www.remem.me/docs/audio/)
- [The Bible Memory App](https://biblememory.com/) · [Play Store](https://play.google.com/store/apps/details?id=com.millennialsolutions.scripturetyper&hl=en_US) · [App Store](https://apps.apple.com/us/app/the-bible-memory-app/id496790833)
- [Fighter Verses — Truth78](https://truth78.org/pages/fv-app) · [App Store](https://apps.apple.com/us/app/fighter-verses-memorize-bible/id411711646) · [review](https://learnofchrist.com/resources/fighter-verses)
- [Verses — getverses.com](https://www.getverses.com/) · [App Store](https://apps.apple.com/us/app/verses-bible-memory/id939461663)
- [Dwell](https://dwellapp.io/calvin) · [Play Store](https://play.google.com/store/apps/details?id=com.dwellapp.dwell&hl=en_US) · [review](https://timwildsmith.com/reviews/dwell-app)
- [YouVersion — verse memorization](https://help.youversion.com/l/en/article/h8owck8of7-verse-memorization)
- [faith.tools — Bible memory apps](https://faith.tools/bible-memory) · [biblememorygoal comparison](https://www.biblememorygoal.com/memory-methods/best-bible-memory-apps/)
- [Pimsleur — Graduated Interval Recall](https://www.pimsleur.com/blog/why-graduated-interval-recall-is-the-key-to-mastering-a-new-language/) · [Pimsleur on memory](https://www.pimsleur.com/blog/memory-and-language-learning-how-pimsleur-helps-you-retain-what-you-learn) · [Art of Memory on the Pimsleur method](https://artofmemory.com/blog/the-pimsleur-method/)
- [Duolingo — speaking whitepaper](https://duolingo-papers.s3.amazonaws.com/reports/duolingo-speaking-whitepaper.pdf) · [assessing speaking](https://englishtest-static.duolingo.com/media/resources/media/resources/whitepapers/speaking-whitepaper.pdf)
- [ELSA Speak — how feedback works](https://elsaspeak.com/en/faqs/how-does-elsas-pronunciation-feedback-work) · [ELSA blog](https://blog.elsaspeak.com/en/advantage-of-elsa-feedback/)
- [LiveKit — turn detection, VAD and endpointing](https://livekit.com/blog/turn-detection-voice-agents-vad-endpointing-model-based-detection) · [Fuselab VUI guide](https://fuselabcreative.com/voice-user-interface-design-guide-2026/) · [Aufait UX — VUI best practices](https://www.aufaitux.com/blog/voice-user-interface-design-best-practices/)
- [NHTSA Visual-Manual Driver Distraction Guidelines (2013)](https://www.federalregister.gov/documents/2013/04/26/2013-09883/visual-manual-nhtsa-driver-distraction-guidelines-for-in-vehicle-electronic-devices) · [Human Factors Design Guidance for DVIs](https://www.nhtsa.gov/document/human-factors-design-guidance-driver-vehicle-interfaces)

### Where this document infers rather than reports

- Verses' Speak Out being screen-attended rather than hands-free — inferred from its
  presentation as one of six game modes; the site does not say.
- "Bible Memory Pro" being the same product as The Bible Memory App / Scripture Typer —
  inferred; no separate app of that name surfaced.
- The Anki + TTS pattern — described from the general shape of community audio-review setups,
  not from a cited write-up.
- All timing values in the table — engineering starting points reasoned from the VUI sources
  and the app's existing constants, not measured in a car.
- Command-word collisions are **measured**, not inferred — checked against all 183 passages in
  `data/passages.js` at the time of writing. They are a fact about the *current* set only, and
  will drift as passages are added; hence the recommendation to enforce it with a test rather
  than a hand-maintained list.
- The claim that no surveyed app scores speech hands-free — based on public product pages and
  reviews, not on installing each app.
