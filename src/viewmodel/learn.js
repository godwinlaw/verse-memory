/* View-model for the learn setup screen: what a learn session should take on.
 *
 * Learning is the other half of the app from review. Review keeps committed
 * verses from fading; a learn session works on the verses that are not committed
 * yet and tries to commit them. It runs the same cards and the same four
 * activities as a review session — the difference is the shelf it draws from,
 * and that writing a passage out in full here is what commits it
 * (see srs.commitsVerse). */

import { copy } from "../copy.js";
import { learnPool } from "../progress.js";
import { LEARN_SIZE, QUEUE_PREVIEW_ROWS } from "../review.js";
import { segButton } from "../ui/tokens.js";

/* Sittings a member can bite off. 0 is "All", the same convention the review
 * setup uses for its size picker. */
const SIZES = [1, 3, 5, 10, 0];

export function learnSetupVals({ state, prog, actions }) {
  const size = (state.learnSetup && state.learnSetup.size) !== undefined ? state.learnSetup.size : LEARN_SIZE;

  const pool = learnPool(state.passages, state.progress);
  const verses = size === 0 ? pool : pool.slice(0, size);
  const started = pool.filter((p) => prog.statusOf(p.id) === "learning").length;

  return {
    learnSetupSizes: SIZES.map((n) => ({
      key: String(n),
      label: n === 0 ? copy.common.all : String(n),
      onClick: () => actions.setLearnSetup({ size: n }),
      style: segButton(size === n),
    })),

    // What the session will actually open with, so the choice is not blind.
    learnQueuePreview: verses.slice(0, QUEUE_PREVIEW_ROWS).map((p) => ({
      id: p.id,
      ref: p.ref,
      snippet: p.text.slice(0, 70),
      statusLabel:
        prog.statusOf(p.id) === "learning" ? copy.learnSetup.previewStarted : copy.learnSetup.previewNotStarted,
    })),
    learnPreviewMore:
      verses.length > QUEUE_PREVIEW_ROWS ? copy.learnSetup.previewMore(verses.length - QUEUE_PREVIEW_ROWS) : "",

    learnSetupCanStart: verses.length > 0,
    learnSetupNote: pool.length ? copy.learnSetup.note(verses.length, pool.length, started) : copy.learnSetup.noteEmpty,

    startLearnSession: () => actions.startLearnSession(verses.map((p) => p.id)),
    cancelLearnSession: () => actions.goto("board"),
    learnSetupGoReview: () => actions.goto("review-setup"),
  };
}
