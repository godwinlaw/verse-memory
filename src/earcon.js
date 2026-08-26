/* The two sounds that say whose turn it is.
 *
 * A hands-free session is a conversation, and a conversation nobody can see
 * needs the one thing a screen gives for free: knowing when it is your turn.
 * Speak mode had no such signal at all — the app stopped talking, the
 * microphone opened silently, and the member was left to guess. Guessing late
 * means the first words of the verse are said into a microphone that is already
 * listening but to a member who has not started, and guessing early means they
 * are said into one that is not open yet. Either way the recital is clipped and
 * the mark is wrong, which the member reads as the app being bad at listening.
 *
 * So: a rising two-tone when the microphone opens, and a single soft low tone
 * when it closes. Rising for "go", falling for "got it" — the direction is the
 * message, and it is the same direction every telephone system has used for the
 * same two meanings for fifty years.
 *
 * They are synthesized rather than played from files for the reason the beat is
 * (see beat.js): nothing to ship, nothing to fetch, nothing to fail. This is a
 * separate module from beat.js because Speak mode has no beat — borrowing run
 * mode's audio engine to make two beeps would tie the two features together at
 * the one place they have nothing in common. */

export const earconSupported = () =>
  typeof window !== "undefined" && !!(window.AudioContext || window.webkitAudioContext);

/* Quiet enough to sit under a car radio without being startling, loud enough to
 * be heard over one. Tuned by ear against the beat's own gain. */
const GAIN = 0.22;

/* The two calls, as (frequency, start offset, length) triples. Kept short —
 * a quarter of a second in total — because every millisecond of an earcon is a
 * millisecond the member is waiting to speak. */
const OPEN = [
  { hz: 660, at: 0, dur: 0.09 },
  { hz: 990, at: 0.1, dur: 0.13 },
];
const CLOSE = [{ hz: 420, at: 0, dur: 0.16 }];

export function createEarcons() {
  if (!earconSupported()) return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  let ctx = null;

  const play = (tones) => {
    if (!ctx) ctx = new Ctx();
    // The context is built on the member's Start press like everything else in
    // the session, but a browser may still have suspended it since; resuming a
    // running context is harmless, so this is never conditional.
    if (ctx.state === "suspended") ctx.resume();
    const t0 = ctx.currentTime + 0.02;
    tones.forEach(({ hz, at, dur }) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = hz;
      // Ramped rather than switched: a gain that steps straight to full volume
      // clicks, and a click is the one sound that reads as a fault.
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(GAIN, t0 + at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      osc.connect(g).connect(ctx.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + dur + 0.02);
    });
  };

  return {
    open: () => play(OPEN),
    close: () => play(CLOSE),
    dispose() {
      if (ctx) ctx.close();
      ctx = null;
    },
  };
}
