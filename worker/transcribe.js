/* The transcription route, and the only server code this app has.
 *
 * Everything else about this deploy is static assets (see wrangler.jsonc): the
 * app is React and htm off a CDN with no bundler, and the one thing a browser
 * genuinely cannot do for itself is hold an API key. So `run_worker_first`
 * hands `/api/*` to this script and lets `env.ASSETS` serve the rest untouched,
 * which is both the cheapest routing and the smallest surface — a request that
 * is not `/api/transcribe` never reaches a line of provider code.
 *
 * ── THE RULE THAT IS NOT A STYLE PREFERENCE ─────────────────────────────────
 *
 * **The expected verse is never sent to the transcriber. Not ever, not in any
 * field, not "just for the proper nouns of this passage".**
 *
 * Every biasing mechanism a speech API offers — Whisper's `initial_prompt` and
 * `prefix`, Chrome's `phrases`, Deepgram's keyterms — makes the engine more
 * likely to return the text you gave it *whether or not the member actually
 * said it*. `prefix` is the extreme case: it literally forces the decoder to
 * begin with your text. For a dictation product that is free accuracy. For a
 * product that puts a score on a recitation it is a validity bug that eats the
 * whole feature — the app would be grading the member on its own expectations,
 * and a member who skipped verse 3 would be told they said it.
 * (docs/research/asr.md, "the one thing that matters most";
 * docs/research/audio-tools-2026.md, trap #1.)
 *
 * So: this route accepts **audio and nothing else**. There is no request field
 * a client can put text into, which is deliberate — a rule enforced by the
 * absence of a parameter cannot be forgotten by a caller in a hurry. The one
 * prompt that exists is `TRANSCRIBE_VOCAB`, a **server-side** environment
 * variable holding a fixed list of *words* — proper nouns and archaic forms the
 * corpus is full of and Whisper is not (`Melchizedek`, `Zerubbabel`, `thy`,
 * `steadfast`) — with no ordering and no verse in it. That is biasing toward
 * the vocabulary rather than toward the word sequence, which fixes "the engine
 * cannot spell Habakkuk" without touching "did they say the whole psalm". If
 * you are ever tempted to pass a passage through it, the answer is no; keep two
 * transcripts or keep none.
 *
 * ── ABUSE ───────────────────────────────────────────────────────────────────
 *
 * A Worker proxy with no controls in front of a paid API is not "hiding the
 * key", it is publishing the key at a URL you own with your billing attached
 * and the provider's own rate limiting removed from the path
 * (docs/research/audio-tools-2026.md §6). The controls below are the ones that
 * are free and belong in the request path. What is still missing, and is
 * follow-up work rather than an oversight:
 *
 *   - **Cloudflare Turnstile.** Gate the first request of a session, mint a
 *     short-lived signed token, check it here. Free, and usually invisible.
 *   - **Per-IP rate limiting.** A WAF rate-limiting rule on `/api/*`, or the
 *     Workers rate-limiting binding. A human cannot recite more than about two
 *     verses a minute, so the ceiling can be aggressive.
 *   - **A provider-side spend cap** on the Groq key, for the Groq path only.
 *
 * Until those exist, the caps here are what stand between a scanner and the
 * bill, which is why they are checked before anything is proxied and why a
 * malformed request gets a 4xx from this file rather than a forwarded one from
 * somebody else's. */

/* One megabyte, matching MAX_UPLOAD_BYTES in src/transcriber.js. At the bitrate
 * the client records, that is minutes of speech — a body that reaches it is not
 * a long recitation, it is somebody else. */
const MAX_BODY_BYTES = 1000000;

/* How long the whole request gets, upstream call included. A Worker that hangs
 * on a provider is a Worker holding a connection open for free. */
const UPSTREAM_TIMEOUT_MS = 25000;

const ROUTE = "/api/transcribe";

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_MODEL = "whisper-large-v3-turbo";
const WORKERS_AI_MODEL = "@cf/openai/whisper-large-v3-turbo";

/* A refusal says what was wrong and nothing else.
 *
 * In particular it never echoes the upstream body: provider errors sometimes
 * quote request metadata back, and the one thing worse than a 500 is a 500 with
 * somebody's account details in it. */
const fail = (status, reason) =>
  new Response(JSON.stringify({ error: reason }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const ok = (text) =>
  new Response(JSON.stringify({ text }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/* ---------------------------------------------------------------- providers */

/* Both options the research names, behind one interface, because it was
 * explicit that this should be a one-line swap: "write the Worker route so the
 * provider is a one-line swap. Same /api/transcribe contract, same body."
 *
 * Each takes the audio and returns a transcript string. Neither is handed a
 * verse; the only text either can receive is `vocab`, which came from the
 * environment and not from the request. */
const PROVIDERS = {
  /* Cloudflare Workers AI. Slightly cheaper than Groq (~$0.031 vs $0.04 per
   * audio hour) and — the reason it is the default — **there is no secret at
   * all**. The model is a binding, so there is no key in this repo, no key in a
   * Worker secret, no key to leak from a public endpoint and no provider
   * account for a scanner to run up a bill on. For a church tool run by one
   * person that is worth more than a few hundred milliseconds of latency. The
   * practitioner testimony for Groq is genuinely better (audio-tools-2026.md
   * §2) and the two are a near-tie on price, so measure and swap if the latency
   * disappoints — that is what TRANSCRIBE_PROVIDER is for. */
  async workersai(env, bytes, mime, vocab) {
    /* ⚠️ Unverified without a deploy: the turbo model's documented input is a
     * **base64 string**, where the older `@cf/openai/whisper` takes an array of
     * byte values. If a deploy returns a shape error here, that is the line to
     * look at first. Encoded in slices because `String.fromCharCode(...bytes)`
     * on a megabyte overflows the call stack. */
    const audio = base64(bytes);
    const input = { audio };
    if (vocab) input.prompt = vocab; // vocabulary only — see the head of this file
    const out = await env.AI.run(WORKERS_AI_MODEL, input);
    return textOf(out);
  },

  /* Groq's hosted whisper-large-v3-turbo: $0.04 per audio hour, 216× realtime,
   * and a free tier of 28,800 audio-seconds a day, which at forty seconds a
   * recitation is some seven hundred a day. Needs GROQ_API_KEY as a Worker
   * secret — `wrangler secret put GROQ_API_KEY` — and that key is the whole
   * reason this is not the default. */
  async groq(env, bytes, mime, vocab) {
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: mime }), "recitation" + extensionFor(mime));
    form.append("model", GROQ_MODEL);
    form.append("response_format", "json");
    if (vocab) form.append("prompt", vocab); // vocabulary only — see the head of this file
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: "Bearer " + env.GROQ_API_KEY },
      body: form,
    });
    if (!res.ok) throw new Error("upstream " + res.status);
    return textOf(await res.json());
  },
};

/* Which provider this deploy uses. `TRANSCRIBE_PROVIDER` decides where it is
 * set; otherwise Workers AI whenever the binding exists, for the no-secret
 * reason above, and Groq only when there is a key and no binding. */
export function providerFor(env) {
  const named = String((env && env.TRANSCRIBE_PROVIDER) || "").toLowerCase();
  if (named && PROVIDERS[named]) return named;
  if (env && env.AI) return "workersai";
  if (env && env.GROQ_API_KEY) return "groq";
  return "";
}

/* Whisper's own envelope, from either provider. */
const textOf = (out) => {
  if (!out) return "";
  if (typeof out.text === "string") return out.text.trim();
  if (out.result && typeof out.result.text === "string") return out.result.text.trim();
  return "";
};

const extensionFor = (mime) => {
  if (mime.startsWith("audio/ogg")) return ".ogg";
  if (mime.startsWith("audio/mp4")) return ".mp4";
  return ".webm";
};

/* Base64 in slices. A megabyte spread across the arguments of one call is how
 * `String.fromCharCode(...bytes)` blows the stack, and it does it at the size
 * where it matters rather than in testing. */
function base64(bytes) {
  const STEP = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += STEP) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + STEP));
  }
  return btoa(binary);
}

/* ------------------------------------------------------------------- route */

async function transcribe(request, env) {
  /* Only a POST, and only of audio. Both refusals are here so that a probe —
   * and this endpoint will be probed, because it exists — costs a string
   * comparison rather than a provider call. */
  if (request.method !== "POST") return fail(405, "method");

  const mime = (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (!mime.startsWith("audio/")) return fail(415, "content-type");

  /* Content-Length first, because refusing before reading is the cheap half —
   * but never only Content-Length, because a client is free to lie about it or
   * omit it entirely with a chunked body. The bytes are counted below. */
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > MAX_BODY_BYTES) return fail(413, "too-large");

  let bytes;
  try {
    bytes = new Uint8Array(await request.arrayBuffer());
  } catch {
    return fail(400, "body");
  }
  if (!bytes.length) return fail(400, "empty");
  if (bytes.length > MAX_BODY_BYTES) return fail(413, "too-large");

  const provider = providerFor(env);
  if (!provider) return fail(503, "not-configured");

  /* Vocabulary from the environment, never from the request. Trimmed to
   * Whisper's 224-token ceiling by character count, generously — this is a word
   * list, not prose. */
  const vocab = String((env && env.TRANSCRIBE_VOCAB) || "").slice(0, 800);

  /* The duration cap. A provider that hangs must not hold this request open
   * indefinitely: the client has its own timeout, but a Worker that keeps
   * running after the browser gave up is time nobody is waiting for. */
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), UPSTREAM_TIMEOUT_MS));
  try {
    const text = await Promise.race([PROVIDERS[provider](env, bytes, mime, vocab), timeout]);
    return ok(text || "");
  } catch {
    /* Deliberately not the upstream message. The client treats any failure as
     * an empty recital, which Speak mode already answers by reading the verse
     * out together, so there is nothing here worth leaking to say. */
    return fail(502, "upstream");
  }
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === ROUTE) return transcribe(request, env);
    /* `run_worker_first` in wrangler.jsonc means only `/api/*` arrives here at
     * all, so this is the fallthrough for an /api path that is not a route, and
     * the static site for anything that somehow is. */
    if (pathname.startsWith("/api/")) return fail(404, "no-route");
    return env.ASSETS.fetch(request);
  },
};
