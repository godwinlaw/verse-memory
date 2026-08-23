/* The browser's own speech synthesis, wrapped.
 *
 * Written like recognizer.js: an optional overlay the app runs happily
 * without. `speechSupported()` coming back false just means Speak mode is not
 * offered on this browser. Kept thin on purpose — what is said, and when,
 * lives with the callers; this file only knows how to say it.
 *
 * `onDone` still fires whether the utterance finished, failed, or simply went
 * quiet without saying so, because a caller waiting to reopen the microphone
 * must never be left waiting. But it does **not** fire after `cancel()`, and
 * that exception is the whole reason this file was rewritten. Cancelling
 * mid-utterance reports `onerror` with `error: "interrupted"` rather than
 * `onend` (measured in Chromium on macOS, docs/research/tts.md §4.3), so a
 * speaker that treats every error as an ending calls back the very callback
 * that reopens the microphone and advances the queue — a Stop, or a walk off
 * the screen, silently moved the session on with nobody there. A cancel is the
 * caller taking control back, so every callback still in flight is made inert
 * by a generation token, exactly as beat.js's `stopSpeaking()` guards run mode.
 *
 * The rest of the file is docs/research/tts.md recommendation #1: a curated
 * voice, `rate = 0.9`, an explicit `lang`, sentence-sized chunks, and a real
 * pause between them. The pure parts — `pickVoice`, `chunkForSpeech`,
 * `speechMs` — take plain values and are unit-tested without a window, the way
 * device.js and theme.js keep their rule apart from their seam. */

export const speechSupported = () => typeof window !== "undefined" && !!window.speechSynthesis;

/* Ten per cent under the default. Scripture is syntactically strange, dense in
 * proper nouns, and — the point of the app — being memorised rather than
 * skimmed, by a member who is driving or running. Slowing it puts the reading
 * near an audiobook narrator's 130–150 wpm. Not slower: Apple's engine
 * compresses the low end of the range so hard that 0.85 and 0.9 are
 * indistinguishable and 0.7 is only 20% slower than 1.0 (measured, §3.4), and
 * slow synthetic speech is where the robot artefacts are loudest. */
export const RATE = 0.9;

/* Pitch is deliberately left at 1: Chrome reverts it on non-local voices, Edge
 * ignores it, and Safari flattens everything at or under 0.5, so lowering it
 * for gravitas is the change that works on one laptop and nowhere else. Voice
 * choice carries the timbre instead. */
export const PITCH = 1;

/* Set on every utterance, and required rather than merely polite: Android's
 * behaviour is unpredictable when the utterance's language does not match the
 * voice's, and it is the fallback when no voice could be chosen at all. */
export const SPEECH_LANG = "en-US";

/* A verse is said in sentence-sized pieces, for the same reason beat.js does
 * it: Chrome abandons an utterance longer than about fifteen seconds part way
 * through and never fires `onend`, and Chrome's network voices cut off around
 * 200 characters besides. 180 leaves margin under both, and 51% of the shipped
 * passages are longer than it (§1.3), so this is not a rare path. */
export const MAX_CHUNK_CHARS = 180;

/* The only pause lever that actually works. Punctuation buys a flat ~400ms
 * whatever mark is used and does not stack, extra dots do nothing, and
 * splitting an utterance in two is *faster* than leaving it whole because the
 * inter-utterance gap is effectively zero (§3.2, §3.3 — all measured). So the
 * space a lector leaves between clauses has to be put back by hand. 250ms is
 * the within-a-verse figure; a caller wanting the longer beat between verses
 * passes `gapMs` and gets it. */
export const CHUNK_PAUSE_MS = 250;

/* How long a line ought to take to say, with a floor for the short ones — the
 * ceiling the watchdog below is armed with. It is a second copy of the estimate
 * in beat.js rather than a shared import, because this file is the seam Speak
 * mode is written against and run mode's beat is not part of that contract. */
export function speechMs(text) {
  const words = String(text || "")
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(2500, (words / 2.5) * 1000);
}

/* Cut a line into pieces the browser will finish. A second copy of beat.js's
 * `chunkForSpeech` for the same reason `speechMs` is one: the two seams are
 * written against different callers and neither should be able to break the
 * other by retuning its own voice. */
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

/* ------------------------------------------------------------------ voices */

/* There is no quality signal anywhere on a SpeechSynthesisVoice. The object
 * carries exactly five properties — name, lang, localService, voiceURI,
 * default — and not one of them correlates with how the voice sounds. `default`
 * is actively misleading: on this Mac it points at Samantha, which Readium
 * rates no better than *normal*. So quality has to come from a curated list of
 * names, which is what Readium's own project concluded after surveying every
 * platform: "Quality isn't algorithmically determined — it's manually curated."
 *
 * The order below is Readium's, read out of docs/research/tts.md §1.4, with one
 * reconciliation. The table ranks Chrome desktop's network voices (`Google US
 * English` and friends) above the Apple locals on sound alone, but the prose
 * under it recommends the opposite for this app — "prefer localService: true
 * and use the network voices as a mid-tier fallback" — because those voices
 * need the network (a run in a canyon is silence), cut off around 200
 * characters, and fire no boundary events at all. A member memorising verses on
 * a phone is exactly who that costs, so they sit below the Apple voices that
 * always work and above the compacts nobody enjoys. */
export const PREFERRED_VOICES = [
  // Edge's Natural voices — the best on the web, and only ever on Edge.
  "Microsoft AvaMultilingual Online",
  "Microsoft EmmaMultilingual Online",
  "Microsoft AndrewMultilingual Online",
  "Microsoft BrianMultilingual Online",
  "Microsoft Ava Online",
  "Microsoft Emma Online",
  "Microsoft Jenny Online",
  "Microsoft Aria Online",
  "Microsoft Andrew Online",
  "Microsoft Brian Online",
  "Microsoft Guy Online",
  "Microsoft Eric Online",
  "Microsoft Steffan Online",
  "Microsoft Christopher Online",
  "Microsoft Roger Online",
  "Microsoft Sonia Online",
  "Microsoft Libby Online",
  "Microsoft Ryan Online",
  "Microsoft Thomas Online",
  // Google's Natural voices, on Android and ChromeOS — the system's own.
  "Google US English 5",
  "Google US English 1",
  "Google US English 2",
  "Google US English 7",
  "Google US English 3",
  "Google US English 4",
  "Google US English 6",
  "Google UK English 1",
  "Google UK English 2",
  "Google UK English 3",
  "Google UK English 4",
  "Google UK English 5",
  "Google UK English 6",
  // Apple. Alex is the only *high* one and is a download, so a ranking that
  // puts it first is right and will usually miss; the rest below it are the
  // downloadable enhanced voices, then the preinstalled ones.
  "Alex",
  "Ava",
  "Zoe",
  "Serena",
  "Jamie",
  "Allison",
  "Samantha",
  "Nicky",
  "Evan",
  "Nathan",
  "Tom",
  "Joelle",
  "Daniel",
  "Kate",
  "Stephanie",
  "Oliver",
  // Chrome desktop's network voices: better-sounding, worse-behaved. See above.
  "Google US English",
  "Google UK English Female",
  "Google UK English Male",
  // Windows' SAPI voices.
  "Microsoft Zira",
  "Microsoft David",
  "Microsoft Mark",
  "Microsoft Hazel",
  "Microsoft Susan",
  "Microsoft George",
  // Apple's compact Siri voices — rated *low*, but they are real speech.
  "Aaron",
  "Martha",
  "Arthur",
  // ChromeOS's own, last of the things worth naming.
  "Chrome OS US English 8",
  "Chrome OS UK English 7",
];

/* Apple's joke voices. They are not bad voices, they are not voices — "Bells"
 * chimes the words and "Bad News" reads them over a funeral march. A naive
 * "first English voice" picker can and does land on one of these, which is why
 * the exclusion is absolute rather than a low rank: there is no state of the
 * world in which a member should hear Zarvox recite the Beatitudes. */
export const NOVELTY_VOICES = [
  "Albert",
  "Bad News",
  "Bahh",
  "Bells",
  "Boing",
  "Bubbles",
  "Cellos",
  "Good News",
  "Jester",
  "Organ",
  "Superstar",
  "Trinoids",
  "Whisper",
  "Wobble",
  "Zarvox",
];

/* Readium's *veryLow* tier: Apple's Eloquence set and the legacy voices from
 * the era before Samantha. They speak English, and that is the most that can be
 * said for them. Between these two lists, 35 of the 47 English voices this Mac
 * exposes are ruled out (measured, §1.1) — three quarters of what a naive
 * picker would be choosing from. */
export const LOW_QUALITY_VOICES = [
  "Eddy",
  "Flo",
  "Grandma",
  "Grandpa",
  "Jacques",
  "Reed",
  "Rocko",
  "Sandy",
  "Shelley",
  "Fred",
  "Junior",
  "Kathy",
  "Ralph",
];

const EXCLUDED = new Set([...NOVELTY_VOICES, ...LOW_QUALITY_VOICES].map((n) => n.toLowerCase()));

/* macOS hangs the locale off the end of the name — "Eddy (English (United
 * States))", and the same Eddy again for the UK — so both lists above are
 * matched against the name *before* the first bracket rather than against the
 * whole of it. */
const baseName = (name) =>
  String(name || "")
    .split(" (")[0]
    .trim();

/* Android hands locales back as `en_US`, with an underscore, where every other
 * platform uses a hyphen. One normalisation here is cheaper than a caller
 * remembering. */
const normLang = (lang) =>
  String(lang || "")
    .replace(/_/g, "-")
    .trim();
const primaryLang = (lang) => normLang(lang).split("-")[0].toLowerCase();

/* Where a voice sits in the preference list, or past the end of it if it is not
 * named there. The match is a prefix rather than an equality because platforms
 * decorate the names they return in their own way — Windows appends
 * " - English (United States)", macOS appends " (English (United Kingdom))",
 * Edge appends both — and the decoration is never the part worth ranking. The
 * character after the match has to be punctuation or a space, so "Daniel"
 * cannot claim a "Danielle". */
function preferenceRank(name) {
  const n = String(name || "").toLowerCase();
  for (let i = 0; i < PREFERRED_VOICES.length; i++) {
    const entry = PREFERRED_VOICES[i].toLowerCase();
    if (n === entry) return i;
    if (n.startsWith(entry) && !/[a-z0-9]/.test(n.charAt(entry.length))) return i;
  }
  return PREFERRED_VOICES.length;
}

/* Two sort keys, compared position by position — the first difference decides. */
function better(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}

/* The best voice on offer for a language, or null to let the platform choose.
 *
 * Pure: it takes plain objects shaped like a SpeechSynthesisVoice and returns
 * one of them — the array's own element, never a copy, because Chrome ignores
 * an utterance whose `voice` is not an object it handed out itself.
 *
 * Four tie-breaks under the curated rank, in the order they matter. Local
 * before network, because long-form reading is exactly where a network voice
 * cuts out. The asked-for region before another English one, so a US
 * congregation is not read to in Australian. `default: true` only after those,
 * since the platform's own idea of a default is the thing this function exists
 * to second-guess. Then the order the browser listed them in, so the answer is
 * stable across calls.
 *
 * Returning null is a supported outcome and not a failure — a browser with
 * nothing but novelty voices, or no voices at all yet, should be left to speak
 * in its own default rather than handed something worse than it. */
export function pickVoice(voices, { lang = SPEECH_LANG } = {}) {
  const list = Array.isArray(voices) ? voices : [];
  const want = normLang(lang) || SPEECH_LANG;
  const wantPrimary = primaryLang(want);
  const wantRegion = want.toLowerCase();
  let best = null;
  let bestKey = null;
  for (let i = 0; i < list.length; i++) {
    const v = list[i];
    if (!v || typeof v.name !== "string") continue;
    if (primaryLang(v.lang) !== wantPrimary) continue;
    if (EXCLUDED.has(baseName(v.name).toLowerCase())) continue;
    const key = [
      preferenceRank(v.name),
      v.localService ? 0 : 1,
      normLang(v.lang).toLowerCase() === wantRegion ? 0 : 1,
      v.default ? 0 : 1,
      i,
    ];
    if (!bestKey || better(key, bestKey)) {
      best = v;
      bestKey = key;
    }
  }
  return best;
}

/* --------------------------------------------------------- the voice list */

/* `getVoices()` is empty on the first synchronous call at page load and fills
 * in some time later, and the received wisdom — wait for `voiceschanged` — is
 * wrong in both directions. Measured (§2.1): the event did not arrive inside
 * three seconds on this machine, yet the list was fully populated by then; and
 * Safari fires it inconsistently or not at all. Code that gates on the event
 * hangs forever on one platform and code that reads once gets nothing on the
 * other.
 *
 * So the event is treated as an accelerator, never as a gate: poll alongside
 * it, give up after a deadline, and carry on with whatever arrived — including
 * nothing. Speech is never blocked on this; a missing voice only means the
 * browser's own default speaks the line. */
const VOICE_POLL_MS = 100;
const VOICE_DEADLINE_MS = 2000;

/* The cache is keyed to the window it was read from, because voices belong to a
 * browsing context — which also means a test can hand over a second window and
 * get a clean answer rather than the first one's leftovers. */
let cache = null;

function cacheFor(win) {
  if (cache && cache.win === win) return cache;
  if (cache) cache.stop();
  cache = { win, voices: [], lang: null, voice: null, warmed: false, stop: () => {} };
  return cache;
}

/* Re-read the list. A non-empty answer replaces what we had and throws away the
 * pick made from the old one — Chrome adds its network voices late and Android
 * adds engine voices when a language pack finishes installing, so a list that
 * has already settled once can still get better. */
function refresh(c) {
  let list = [];
  try {
    list = c.win.speechSynthesis.getVoices() || [];
  } catch {
    /* a browser mid-teardown; the poll or the deadline will settle it */
  }
  if (!list.length) return false;
  c.voices = list;
  c.lang = null;
  c.voice = null;
  return true;
}

/* Start resolving the voice list, harmlessly and at most once per window.
 *
 * Called at import below so the list is warm long before anybody presses Start:
 * Speak mode's whole design turns on that single gesture, and spending the
 * first moments of it waiting on a browser to enumerate 191 voices is exactly
 * the pause a member reads as the app being broken. */
export function warmVoices(win = typeof window === "undefined" ? null : window) {
  if (!win || !win.speechSynthesis) return;
  const c = cacheFor(win);
  if (c.warmed) return;
  c.warmed = true;
  const synth = win.speechSynthesis;
  /* The property rather than addEventListener: it is what every browser
   * supports and what the research reproduced with. It stays attached after the
   * list settles, so a late arrival is picked up — the point is only never to
   * *wait* on it. */
  synth.onvoiceschanged = () => refresh(c);
  if (refresh(c)) return;
  const poll = win.setInterval(() => {
    if (refresh(c)) c.stop();
  }, VOICE_POLL_MS);
  const deadline = win.setTimeout(() => c.stop(), VOICE_DEADLINE_MS);
  c.stop = () => {
    win.clearInterval(poll);
    win.clearTimeout(deadline);
    c.stop = () => {};
  };
}

/* The chosen voice for a language, resolved once and remembered until the list
 * changes under it. Never blocks and never throws: with nothing resolved yet
 * this is null, which is the browser's own default speaking. */
function voiceFor(win, lang) {
  const c = cacheFor(win);
  if (c.lang !== lang) {
    c.lang = lang;
    c.voice = pickVoice(c.voices, { lang });
  }
  return c.voice;
}

/* ---------------------------------------------------------------- speaking */

export function createSpeaker(options = {}) {
  if (!speechSupported()) return null;
  const win = window;
  const synth = win.speechSynthesis;
  const defaults = { rate: RATE, lang: SPEECH_LANG, gapMs: CHUNK_PAUSE_MS, maxChars: MAX_CHUNK_CHARS, ...options };
  warmVoices(win);

  /* The generation counter. Every callback that could reach the caller — an
   * `onend`, an `onerror`, a watchdog, the timer holding the pause between two
   * chunks — checks it first, so bumping it is what makes a whole utterance
   * inert without having to find and unpick each of its handlers. */
  let token = 0;
  /* Every timer this speaker armed, so a cancel leaves nothing ticking. The
   * token alone would already make them harmless; clearing them as well is what
   * stops a stopped session holding a browser's timer queue for eleven seconds
   * after nobody is listening. */
  const timers = new Set();
  /* And every utterance still in flight. Retaining them is not tidiness: a
   * SpeechSynthesisUtterance that goes out of scope can be collected with its
   * handlers before the browser has finished speaking it, which is a line that
   * never reports itself done. */
  const live = new Set();

  const arm = (fn, ms) => {
    const t = win.setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
    return t;
  };

  /* Abandon whatever is in flight. Bumping the token first is the order that
   * matters — `synth.cancel()` fires the interrupted-utterance's `onerror`
   * synchronously on some browsers, so the guard has to already be true. */
  const abandon = () => {
    token += 1;
    for (const t of timers) win.clearTimeout(t);
    timers.clear();
    live.clear();
  };

  return {
    /* Say a line, in pieces if it is long, then call back exactly once.
     *
     * `onDone` fires whether the utterance finished, failed, or simply went
     * quiet without saying so — the last of those is not hypothetical, and a
     * hands-free session that waits forever for a callback has ended without
     * telling anybody, at the wheel, which is the one place there is nobody
     * free to press a button. So every piece carries a generous ceiling and the
     * loop carries on regardless when it runs out.
     *
     * The one thing that does not call back is a cancel. See the head of the
     * file: the caller cancelling *is* the caller taking control back, and
     * calling `onDone` at it would reopen a microphone for a session nobody is
     * in.
     *
     * The third argument is optional and the two-argument call is unchanged —
     * App.js's `speak(text, () => …)` means what it always meant. */
    speak(text, onDone, opts = {}) {
      const cfg = { ...defaults, ...opts };
      abandon();
      const mine = token;
      let ended = false;
      const done = () => {
        if (ended || mine !== token) return;
        ended = true;
        if (onDone) onDone();
      };

      const chunks = chunkForSpeech(text, cfg.maxChars);
      if (!chunks.length) return done();

      const sayChunk = (i) => {
        if (mine !== token) return;
        if (i >= chunks.length) return done();

        const u = new win.SpeechSynthesisUtterance(chunks[i]);
        const voice = voiceFor(win, cfg.lang);
        if (voice) u.voice = voice;
        /* Set from the voice where there is one, so the two cannot disagree,
         * and from the request where there is not. */
        u.lang = (voice && normLang(voice.lang)) || cfg.lang;
        u.rate = cfg.rate;
        u.pitch = PITCH;
        u.volume = 1;
        live.add(u);

        let settled = false;
        let watchdog = null;
        const next = () => {
          if (settled) return;
          settled = true;
          live.delete(u);
          if (watchdog) {
            win.clearTimeout(watchdog);
            timers.delete(watchdog);
          }
          if (mine !== token) return;
          if (i + 1 >= chunks.length) return done();
          /* The pause a lector leaves. It has to be a real timer because the
           * gap the browser leaves between two utterances is zero — see
           * CHUNK_PAUSE_MS. */
          arm(() => sayChunk(i + 1), cfg.gapMs);
        };
        u.onend = next;
        u.onerror = next;
        synth.speak(u);
        watchdog = arm(next, speechMs(chunks[i]) * 2.5 + 5000);
      };

      sayChunk(0);
    },

    /* Stop talking, now, and mean it: nothing already in flight reaches the
     * caller afterwards. */
    cancel() {
      abandon();
      try {
        synth.cancel();
      } catch {
        /* a browser with no voice engine behind the API */
      }
    },
  };
}

/* Warm the list as soon as the module is imported, which is app start — see
 * warmVoices. Guarded, so importing this file in node (the test suite) does
 * nothing at all. */
warmVoices();
