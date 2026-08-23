# Scoring a spoken recitation — design

Written 2026-08-22, against the repo as it stands. Companion to
[`asr.md`](./asr.md), which is about getting words *out of* a microphone. This
one is about what to do with them once you have them.

Everything below is measured against the shipped data — 183 passages in
`data/passages.js`, a 1,546-word vocabulary — rather than reasoned about in the
abstract. Where a number appears it was computed by running the real text
through the real code, and the script that produced it is described well enough
to re-run.

---

## Summary

**Replace `gradeWritten()` in Speak mode with a proper sequence aligner.** The
current grader walks the passage with a cursor that never advances on a miss, so
**any three consecutive words the recognizer inserts desynchronize it
permanently and the rest of the passage scores zero**. A three-word false start
— "Trust in the… Trust in the LORD with all your heart…", which is what real
recitation sounds like — takes a *word-perfect* recital of Proverbs 3:5–6 from
100% to **14%**. That single failure mode is almost certainly what "really
sucks" means.

The replacement is Needleman–Wunsch global alignment over normalized word
sequences, with **asymmetric gap costs**: a reference word the member failed to
produce costs a full point, and a heard word that isn't in the reference costs
almost nothing. That asymmetry is the whole design. Fillers, false starts,
self-corrections, doubled words and the recognizer's own noise become free *by
construction* — no filler word-list is doing the work — while a genuinely
forgotten clause still costs exactly what it should.

Three further pieces sit on top of it: a small tier of word-equivalence rules
(exact / curated homophone / one-edit fuzzy / narrowly-gated phonetic), a
transcript normalization pass (contractions, digits, disfluencies), and an
**abstention rule** so that a transcript carrying no real signal produces "I
didn't catch that" rather than a number.

**Two live bugs found on the way**, both worth fixing regardless of whether any
of this design ships:

1. **Verse-by-verse feedback throws on every real passage.** `perVerseOf()` in
   `src/speak.js` reads `verse.text.split(" ")`, but `verses` in
   `data/passages.js` is an array of **strings** — `test/passages.test.mjs:119`
   asserts `p.text === p.verses.join(" ")`. Calling
   `feedbackFor(psalm23, …, "verse")` raises
   `TypeError: Cannot read properties of undefined (reading 'split')`. All 16
   multi-verse passages in the set are affected. The unit test passes only
   because `test/speak.test.mjs`'s `MULTI` fixture invents a `[{ v, text }]`
   shape that no shipped passage has.
2. **Four passages carry an embedded scripture reference inside their text**, a
   fetch-time leak: Isaiah 54:2-3 contains `Isaiah 55:1-3a`, Habakkuk 3:17-18
   contains `Zechariah 4:6b`, Luke 12:32 contains `Luke 12:48b`, and
   1 Corinthians 6:19-20 contains `1 Corinthians 9:22b`. Nobody recites those,
   so they are guaranteed misses: a perfect recital of Luke 12:32 is capped at
   **95%**, below `COMMIT_SCORE`. Three passages also carry a missing space
   (`eagles;they`, `footstool;what`, `food,the`), which fuses two words into one
   token that no recognizer will ever produce.

---

## 1. Alignment, not positional matching

### What is wrong today

`gradeWritten()` (`src/grading.js:43`) walks the passage words in order holding a
cursor into the transcript tokens:

```js
const at = tokens.indexOf(key, cursor);
const hit = tokens[cursor] === key || (at > -1 && at < cursor + LOOKAHEAD);
if (hit) { cursor = Math.max(cursor + 1, at + 1); hits++; }
```

`LOOKAHEAD` is 3. Two properties follow, and the second is fatal.

**The cursor never advances on a miss.** That is the right behaviour for a
*deletion* — a word the member skipped — because the transcript token sitting at
the cursor is still owed to a later passage word. But it means the cursor can
only ever be *pushed forward* by matches.

**A match is only found within three tokens.** So if the recognizer emits three
or more tokens the passage does not want at that point, every subsequent passage
word looks for itself starting from a cursor that is now permanently three-plus
tokens behind, finds itself further ahead than the lookahead allows, and misses
— which fails to advance the cursor, which guarantees the next word misses too.
The grader is stuck for the remainder of the passage.

Measured on Proverbs 3:5-6 (`"Trust in the Lord with all your heart, and do not
lean on your own understanding. In all your ways acknowledge him, and he will
make straight your paths."`), inserting *n* junk tokens after word 3 into an
otherwise perfect transcript:

| inserted tokens | score today |
| --- | --- |
| 1 | 100% |
| 2 | 100% |
| **3** | **10%** |
| 4 | 10% |
| 5 | 10% |

There is no graceful degradation. It is a cliff at exactly `LOOKAHEAD`. And the
things that push a transcript over it are the ordinary furniture of speech:

| what the member did | today |
| --- | --- |
| said the verse perfectly | 100% |
| said "um" first | 100% |
| repeated the opening three words before continuing | **14%** |
| started a clause, caught themselves, said it right | **24%** |
| got six words into Psalm 23, restarted, then recited it perfectly | **8%** |

The diff for the false-start case shows the stall directly — `+` is a hit:

```
+Trust +in +the -Lord -with -all -your -heart, -and -do -not -lean -on -your
-own -understanding. +In -all -your -ways -acknowledge -him, -and -he -will
-make -straight -your -paths.
```

Three hits at the front, one accidental hit later, and nothing else. The member
recited Proverbs 3 correctly and was told they got one word in seven.

This is worse in Speak mode than in the typed box for a structural reason: in
Review the member is *looking at the textarea* and can repair a misheard word
before submitting (see CLAUDE.md, "Reciting aloud" — backspace is backspace).
Speak mode is hands-free by definition. Nobody repairs anything; the number
stands.

### The replacement

Global (Needleman–Wunsch) alignment over two token sequences: the passage's
words `R` (length *n*) and the transcript's tokens `H` (length *m*), both put
through `norm()`.

```
D[0][0] = 0
D[i][0] = D[i-1][0] + omit(R[i])          // nothing heard for this passage word
D[0][j] = D[0][j-1] + INS                 // heard something before the passage started

D[i][j] = min(
  D[i-1][j-1] + sub(R[i], H[j]),          // pair them
  D[i-1][j]   + omit(R[i]),               // OMISSION  — passage word not produced
  D[i][j-1]   + INS                       // INSERTION — heard word not in the passage
)
```

Traceback from `D[n][m]` yields the operation list.

**Global, not local.** Smith–Waterman would find the best-matching *substring*,
which is precisely wrong here: a member who recites the first third of Psalm 23
beautifully and then stops should not score 100% on a well-aligned fragment. The
denominator is the whole passage, so the alignment must span the whole passage.

#### The scoring matrix

| operation | cost | why |
| --- | --- | --- |
| `sub` exact (`norm`-equal) | **0** | the same word |
| `sub` homophone (curated table) | **0** | the member said the right *sound*; the recognizer picked a spelling |
| `sub` within one edit | **0.15** | almost certainly a transcription error, but not free — a tie should prefer the exact reading |
| `sub` phonetic (gated, §2) | **0.30** | plausible, and deliberately the most expensive match |
| `sub` mismatch | **1.00** | a different word |
| `omit` (reference word unmatched) | **1.00** | the thing being measured |
| `ins` (heard token unmatched) | **0.20** | cheap on purpose — see below |
| `merge` (one reference word ← two heard tokens) | **0.10** + tier | `steadfast` heard as "stead fast"; `eagles;they` heard as "eagles they" |
| `split` (two reference words ← one heard token) | **0.10** + tier | `do not` heard as "don't" |

**Why the asymmetry is the design.** The score answers one question: *how much
of the passage did the member produce, in order?* A word the recognizer added is
not evidence they forgot anything. Making insertion cheap means the aligner
*prefers* to explain unexpected tokens by absorbing them rather than by shifting
the alignment or paying full-price substitutions. Run the false start through
it: "trust in the" repeated costs 3 × 0.20 = **0.60** as insertions, against
3 × 1.00 = **3.00** for the alternative of substituting them against
`Lord with all` and then having to shift back. The cheap path wins by a factor
of five, and it wins for every disfluency of every length. **No filler word-list
is doing this work.** The gap asymmetry is.

**Why insertion is not free.** Three reasons. A zero cost makes the aligner
indifferent between many equal-cost paths, which makes the traceback (and so the
diff the member is shown) arbitrary. It also removes the tie-break that keeps
matched runs contiguous, which is what makes the diff readable. And it would let
a transcript grow without bound at no cost, which is the gaming vector discussed
in §4.

**One constraint the numbers must satisfy.** For a genuine one-for-one word swap
to be reported as a *substitution* rather than as an omission plus an insertion,
you need `INS + omit > sub(mismatch)`: 0.20 + 1.00 = 1.20 > 1.00. ✓ It holds
narrowly and deliberately. Both readings cost the same in the *score* (one
uncredited reference word either way), but only the substitution reading lets
the diff say "you said *hard* where the verse says *heart*", which is the
feedback worth giving. Assert this inequality in the test suite so a retune
cannot silently break it.

**Tie-breaking.** Evaluate diagonal first, then insertion, then omission, and
accept a later candidate only on strict `<`. This prefers matches over gaps and
insertions over omissions at equal cost, which keeps runs contiguous and makes
the false-start traceback land on "matched the second attempt, absorbed the
first" rather than an interleaving.

#### Complexity

`O(n·m)` time and space. The numbers, measured on this repo's data with
per-token records precomputed once (normalized form, stem, phonetic key) so each
cell is a handful of comparisons:

| case | cells | time |
| --- | --- | --- |
| median passage (35 words), clean transcript | 1,225 | **0.065 ms** |
| a 100-word passage vs a 120-token transcript | 12,000 | **0.32 ms** |
| worst in the set — Isaiah 9:1-7 (243 words) vs a 283-token transcript | 68,769 | **1.62 ms** |

Memory at the worst case: 271 KB for a `Float32Array` cost matrix plus 68 KB for
a `Uint8Array` traceback. Both are transient.

So yes, `O(n·m)` is fine, and "fine" understates it. `SPEAK_SILENCE_MS` is
2,500 ms — the app has already waited two and a half seconds of silence before
it calls the grader at all. The aligner is roughly **1,500× faster than the
pause that precedes it**, and about 250× faster on the median card. There is no
argument for banded alignment, Hirschberg's linear-space variant, or any other
optimization; they would buy microseconds and cost clarity.

One guard is worth having anyway, and it is about correctness rather than speed:
if `m` is absurd relative to `n` — a car radio, or the app's own voice bleeding
into an open microphone — do not allocate at all. Abstain (§5).

#### On transposition

A Damerau-style adjacent-swap term would be a third recurrence and a fourth op
kind. **It is not needed, and the asymmetry is why.** Measured on
Philippians 4:6-7 with `Christ Jesus` recited as "Jesus Christ": the aligner
prefers `omit(Christ) + match(Jesus) + insert(christ)` at 1.00 + 0 + 0.20 = 1.20
over two substitutions at 2.00, so **an adjacent transposition costs one word,
not two** — 41/42 = **98%**. That is a fair report of a small recall error, it
clears the commit bar, and it falls out of the gap costs rather than needing a
rule. Adding Damerau would buy the last 2% and cost a dimension.

---

## 2. Phonetic equivalence

### The candidates

| algorithm | year | key | verdict |
| --- | --- | --- | --- |
| **Soundex** | 1918, Russell & Odell | letter + 3 digits, fixed width | reject |
| **Metaphone** | 1990, Lawrence Philips | variable-length consonant key | superseded |
| **Double Metaphone** | 1998/2000, Philips | **two** keys, primary + alternate | **choose** |
| **NYSIIS** | 1970, NY State ID & Intelligence System | 6-char, vowels kept as `A` | reject |
| **Caverphone** | 2002/2004, David Hood | 10-char, padded with `1` | reject |

**Soundex is disqualified by measurement, not by reputation.** Keeping only the
first letter plus three consonant-class digits and truncating hard means a
long word's tail is simply thrown away. Computed over this repo's actual
1,546-word vocabulary, **336 Soundex keys hold more than one word**, and the
buckets are catastrophic:

- `S400` → **`shall`, `sheol`, `shell`** — `Sheol` is in Psalm 16, `shall` is in
  practically everything
- `S000` → `so, see, say, show, sea, she, saw`
- `F300` → `fat, feet, food, faith, fade`
- `L630` → `lord, lard, lured, laird`
- `S200` → `seek, sees, says, sake, shows, such, sows, seas`

Crediting on Soundex equality would hand a member "shall" for *Sheol* and
"food" for *faith*. Not close.

**NYSIIS** was tuned for American surnames on a police index; **Caverphone** was
built for one New Zealand electoral roll and encodes NZ English vowel mergers.
Both are good at their jobs and both have the wrong accent model for a Berkeley
congregation reading modern English. Both are also single-key.

**Metaphone → Double Metaphone.** Metaphone is a genuine advance on Soundex —
rule-based on English orthography, variable-length, no truncation-by-design. Its
successor returns *two* keys precisely so that a word with more than one
plausible English pronunciation can carry both, and its rule table is written
around **multiple-origin** pronunciation variants rather than around one
dialect. That is what recommends it here: the hard vocabulary in this data set
is transliterated Hebrew and Greek — `Zebulun`, `Naphtali`, `Jephthah`, `Sheol`,
`Midian`, `Rahab`, `Barak`, `Esau`, `Enoch`, `Jericho`, `Abba` — where a single
"correct" English pronunciation is exactly the assumption that fails. NYSIIS and
Caverphone each assume one, and it is not this one.

(Two keys are also what lets the match rule be *any of the four cross-pairs
equal*, which is a principled looseness rather than a tuned one.)

### The measurement that changes the recommendation

Having picked the algorithm, the more important question is **where to apply
it** — and here the data overrules the obvious answer.

**One caveat on the numbers in this section, stated up front.** The collision
counts below were measured with a *simplified* Metaphone-class key of my own —
same family, same reduced consonant alphabet, same vowel handling — not with a
reference Double Metaphone port. A real port will shift which specific pairs
collide (real DM's `WH` rule separates `what`/`hate`, for instance, where the
stand-in fuses them). It will not change the shape of the result, because the
two load-bearing facts do not depend on the key at all: a phonetic tier gated to
one edit adds nothing *by construction* — everything within one edit is already
the edit tier — and the proper-noun gate collapses the risk surface because it
removes the competing vocabulary, not because of how the key is computed. What
the caveat does mean is that **the eight-pair blocklist is a shape, not a final
list**, and that test 8 in §6 — assert the blocklist is the *complete* set of
collisions under the gate — is the thing that pins the real surface once a real
port lands. Treat that test as a requirement rather than a nicety.

Crediting a word whenever its phonetic key equals the reference word's key has
an unacceptable false-positive rate on *this* vocabulary. Measured over the
1,429 vocabulary words of four letters or more, requiring key equality **and** a
Levenshtein gate:

| gate | new pairs admitted beyond what the one-edit tier already catches |
| --- | --- |
| within 1 edit | **0** — contributes nothing |
| within 2 edits | **194** |
| within 3 edits | **440** |

At two edits the admitted list contains genuine, distinct words a member could
really confuse:

```
love/life   love/leave   holy/whole   blessed/pleased   shall/sheol
hand/want   still/steal  lack/look    heaven/even      great/create
from/form   mine/money   book/back    wars/years       called/killed
```

Crediting `life` for **love** in 1 Corinthians 13, or `whole` for **holy** in
Romans 12:1, is exactly the failure the brief forbids: giving marks for a word
the member genuinely got wrong. And at one edit the tier is a no-op, because
everything within one edit is already caught by the fuzzy tier the app has
today. **A general phonetic tier is either useless or dangerous.**

### So: Double Metaphone, scoped to proper nouns

The place where >1-edit transcription errors genuinely happen, and where there
is no competing vocabulary word to be confused with, is **names**. When the
reference word is `Naphtali`, the member either has the name or does not; there
is no near-neighbour in the passage's semantic space for a false positive to
land on.

The gate:

> The phonetic tier fires only when **the reference word is a proper noun** — it
> appears capitalized mid-sentence in `passage.text` — **and** both words are ≥ 5
> letters, **and** the Double Metaphone keys match, **and** the two spellings are
> within **two** edits, **and** the pair is not on the blocklist.

Under that gate, the *entire* false-positive surface across the 55 proper nouns
of five letters or more, checked against all 1,546 vocabulary words, is **eight
pairs**:

```
creator/greater   heaven/even    jesus/jews     peter/better
sheol/shall       david/divide   destroy/destroyer   barak/break
```

Eight. Hand-auditable, listed by name in a `BLOCK` table in the source, and
pinned by a test. That is a risk surface you can actually reason about, which is
the difference between a rule you can ship and a rule you have to trust.

What it buys, measured against plausible recognizer output for names:

| heard | reference | edit distance | rescued by |
| --- | --- | --- | --- |
| naftali | Naphtali | 2 | **phonetic tier** (`PH` → `F`) |
| pharoah | Pharaoh | 2 | **phonetic tier** |
| saira | Sarah | 2 | **phonetic tier** |
| zebulon | Zebulun | 1 | edit tier (already) |
| barack | Barak | 1 | edit tier |
| gidyon | Gideon | 1 | edit tier |
| midyan | Midian | 1 | edit tier |
| shiol | Sheol | 1 | edit tier |

Honest limits: `jeptha`/**Jephthah**, `jerico`/**Jericho** and `enock`/**Enoch**
are *not* rescued, because `PH`≠`P` and `CH`→`X`≠`K` are real distinctions in
the algorithm. Those stay misses. Hebrews 11:32-38, the proper-noun-densest
passage in the set, will be the hardest card in the app and no amount of
phonetics fixes it.

**Conclusion for implementation order.** The phonetic tier is a *phase two*
item. It rescues three spellings out of eight in a test list, on 55 words out of
1,546, and its correct scope was only discoverable by measurement. Ship
alignment + normalization + homophones + the one-edit tier first; that is where
the 14% → 100% lives.

### Is the hybrid better than either alone?

Yes, and the measurements say why. Edit distance alone misses `naphtali`/
`naftali` (2 edits, identical sound). Phonetics alone admits `love`/`life`.
**Edit distance measures whether these are plausibly two transcriptions of one
utterance; the phonetic key measures whether they sound alike.** Requiring both
— a conjunction, not the disjunction that "OR" suggests — is what collapses 194
false positives to 8. The tiers are then OR'd *as tiers*: exact OR homophone OR
one-edit OR (proper-noun AND key-equal AND within-two-edits).

### Double Metaphone, compactly

Enough to implement, with the honest caveat that the full rule table runs to
several hundred lines and should be ported from a reference implementation
(Philips' original *C/C++ Users Journal* article, June 2000) rather than
reconstructed from prose. What matters is the shape and the dozen rules this
vocabulary actually exercises.

**Shape.** Uppercase the word and strip non-letters. Scan left to right with a
window that can look 1–4 characters back and forward. Emit codes into **two**
accumulators — primary and alternate — which are identical except where a rule
declares a pronunciation variant. Return `[primary, alternate]`; two words match
if *any* of the four cross-pairs are equal.

**Alphabet.** The emitted codes are a restricted set: `A B F H J K L M N P R S T
X` plus `0` (theta, for *th*). Note `B` covers *b* and *p* is `P`; `D` emits
`T`; `V` emits `F`; `Z` emits `S`. The reduction is aggressive, which is exactly
why the tier needs the edit gate above.

**Entry rules.**
- Skip the first letter of an initial `GN`, `KN`, `PN`, `WR`, `PS` (silent).
- Initial `X` → `S`.
- A word-initial vowel emits `A`; every later vowel is skipped entirely.

**The rules this corpus exercises.**

| input | code | word here |
| --- | --- | --- |
| `PH` | `F` | **Naph**tali, **Ph**araoh, Je**ph**thah |
| `TH` | `0` | fai**th**, **th**eir, Jeph**th**ah |
| `CH` | `X` normally; `K` in Greek-derived contexts (`CHOR-`, `-ARCH-`, `CHEM-`, `CHIA-`) | **Ch**rist → `KRST`; Jeri**ch**o → `JRX` |
| `SCH` | `SK`, or `X` before certain vowels | — |
| initial `J` | `J` primary, `A` alternate (Spanish variant) | **J**esus, **J**acob, **J**ericho |
| `C` before `I E Y` | `S`; otherwise `K` | mer**c**y, **c**reator |
| `GH` | silent after a vowel | thou**gh**, bro**ugh**t |
| `D` | `J` before `GE`/`GI`/`GY`, else `T` | **D**avid |
| doubled letters | collapse to one | Abba, shall |
| `W` | `R` in initial `WR`; `A` in initial `WH`; often silent | **wh**at, **wr**ath |

**Do not truncate the key.** Philips' reference implementation caps at four
codes because it was built to feed a database index. Here there is no index and
truncation is precisely what makes Soundex collide; use the full key. Also
require the key be at least 2 codes long before it can grant a match — a
one-code key is a claim about almost nothing.

**Verify the port against this vocabulary**, not against a generic test corpus.
The test suite should pin the keys for `Naphtali`, `Zebulun`, `Jephthah`,
`Sheol`, `Christ`, `Pharaoh`, `Jericho`, `Rahab`, `Abba`, `Midian`, and assert
that the eight blocklisted pairs are the *complete* set of collisions between
the proper-noun list and the vocabulary. That last assertion is the one that
matters: it turns "we chose a phonetic algorithm" into "we know exactly what it
credits."

---

## 3. Scripture-specific normalization

The high-value, low-risk section — and three of the five items the brief
expected turned out not to apply to this data. Reporting that is part of the
work.

### 3a. Divine names — verified, and nothing to do

The set carries **both** renderings: `LORD` 20 times (the Psalms shelf plus
Isaiah 9) and `Lord` 62 times (the core shelf), a consequence of the two fetches
having landed different small-cap handling. `GOD` in small caps appears zero
times.

`norm()` lowercases, so `norm("LORD") === norm("Lord") === "lord"`. **This costs
nothing today and needs no rule.** The brief expected this to be a high-value
item; the data says it is already solved, and the place it is solved is
`src/text.js`. Say so and move on.

The one adjacent case that *is* real is the article — a recognizer routinely
writes "the Lord" where the reference has "LORD" alone, or drops it. That is an
insertion or an omission of `the`, handled by the aligner, and costs 0.20 or
1.00 respectively. No divine-name special case.

### 3b. Numbers — transcript-side only

Measured: `\d` matches in exactly **four** passages, and in every one of them
the digits are the embedded-reference leak described in the summary. **The
passage side of this corpus contains no real numerals at all.**

Number *words* do appear, all spelled out: `one` ×53, `first` ×5, `thousand` ×3,
`two` ×3, `three` ×2, `second` ×1, `seven` ×1.

So the risk is entirely one-directional: the member says "one" and the
recognizer writes `1`; says "second" and it writes `2nd`. The fix is a small
digit→word expansion applied to the transcript before alignment (and
symmetrically to the reference, which costs nothing since there is nothing to
expand):

```
0–20 cardinals, the tens through ninety, hundred / thousand / million
ordinals first–twentieth, plus the 1st / 2nd / 3rd / 4th surface forms
hyphenated compounds: "32" → "thirty two", "thirty-two" → "thirty two"
```

Expand to *tokens*, not to a single token: `"32"` becomes two tokens `thirty`
`two`, which the aligner's merge/split ops then reconcile against however the
reference happens to write it. That way the table never has to know which side
is which.

### 3c. Hyphens and the fused-word data bugs — one mechanism

Hyphenated words in the set, all four of them: `self-control`, `self-controlled`,
`sober-minded`, `two-edged`. `norm("two-edged")` is `twoedged`, but a recognizer
emits two tokens.

The three fused words — `eagles;they` (Isaiah 40:31), `footstool;what`
(Isaiah 66:1), `food,the` (Habakkuk 3:17) — are the same shape from the opposite
cause: `norm()` gives `eaglesthey`, which no recognizer will ever produce.

**Both are solved by the merge op**: allow `D[i-1][j-2] + MERGE` when the
reference word matches the concatenation of two consecutive heard tokens. One
recurrence term fixes four hyphenated words and three data bugs. Measured: with
the merge op, a perfect recital of Isaiah 40:28-31 scores **100%**; today it is
capped at 99%.

The fused words are still data bugs and should be fixed in `data/passages.js` /
`tools/fetch_passages.mjs` — the scorer should not be the thing that makes a
broken passage look fine. But the merge op is worth having anyway for the
hyphens, and it is the right kind of robustness: general, not a patch list.

### 3d. Embedded references — mark them optional, then fix the data

Luke 12:32's text ends `"…to give you the kingdom. Luke 12:48b Everyone to whom
much was given…"`. A member reciting it perfectly cannot score above **95%**,
which is the commit bar, which means that passage is currently uncommittable by
recitation.

**Fix the data.** Until then, the scorer should mark a token run matching
`[1-3]? Book Chapter:Verse[a-c]?` in the *reference* as **optional**: it costs 0
to omit and is excluded from the denominator. Measured: Luke 12:32 then scores
**100%** on a correct recital.

Important: optional words stay **in the diff**, flagged `optional: true`, and
only leave the *denominator*. That preserves the one-entry-per-reference-word
invariant that per-verse slicing depends on (§7).

### 3e. Contractions and possessives — verified

`norm()` strips apostrophes, and `src/text.js` says why at length. Verified
against the data: the passage text contains **no contractions at all**, only
possessives — `Father's` ×3, `God's` ×2, `Jesus’` ×2, `eagles'`, `Lord's`,
`another's`, `name’s`, `God’s`, `everyone’s`, `king’s`, `Pharaoh’s`. Every one
of those is already free, including the straight-vs-curly trap the comment
describes.

Contractions are therefore a **transcript-side** problem: the recognizer
routinely writes `don't` where the ESV has `do not`. Measured on Proverbs 3:5-6,
that costs a word today: **93%**.

Two ways to fix it, and both should ship:

1. **The split op** handles it structurally — `norm("do") + norm("not")` is
   `donot`, and `donot` vs `dont` is within one edit, so the split op with the
   edit tier credits both reference words. This generalizes: `it is`/`it's`,
   `you are`/`you're`, `there is`/`there's` all fall out.
2. **A small expansion table** for the ones one edit cannot reach — `I'll` →
   `i will` is `ill` vs `iwill`, two edits. Table:
   `don't doesn't didn't isn't aren't wasn't won't can't couldn't shouldn't
   wouldn't it's that's there's here's he's she's what's let's I'll you'll
   we'll they'll I'm you're we're they've I've I'd you'd`.

Measured with either: Proverbs 3:5-6 with `don't` scores **100%**.

### 3f. The at-risk vocabulary — measured, and mostly not what was expected

The brief guessed `thy/thigh`, `sow/sew/so`, `wrought`, `hallowed`. Checked
against the shipped text:

**Absent from the entire set:** `thy`, `thine`, `wrought`, `hallowed`,
`prosper`, `propitiation`, `piece`. This is the ESV — modern English — so the
KJV-era hazards do not apply. Nor do the Daniel 3 names: there is no `Shadrach`
and no `Nebuchadnezzar` in the corpus, and `Ephesians` appears only in `ref`
fields, never in text.

**What is actually at risk, from the data:**

- **`sows` / `reap`** (Galatians 6:7-9, the only occurrences). `sows`→"sews" is
  the case `src/voice.js` names in its own comment; the one-edit tier catches
  it. Measured: 96% → **100%**.
- **`steadfast`** ×6 — split as "stead fast". Merge op.
- **`righteousness`** ×13, **`supplication`**, **`workmanship`**,
  **`conformed`/`transformed`** (Romans 12:2, adjacent and near-identical) — all
  long enough that the one-edit tier covers ordinary slips.
- **`scoffers`** and **`chaff`** (Psalm 1) — "scholars" and "calf"/"chef" are
  plausible outputs and none of them are rescued by anything here. Honest miss.
- **Proper nouns**, 86 distinct, densest in Hebrews 11:32-38 and Isaiah 9:1 —
  see §2.

**Homophones actually present in the vocabulary**, checked pair by pair. These
are the highest-value, lowest-risk entries in the whole document, because a true
homophone is *not a recall error at all* — the member produced the correct
sound and the recognizer chose a spelling:

| in the set | note |
| --- | --- |
| `their` / `there` | both present, very common |
| `no` / `know` | both present; **both under `MIN_FUZZY_LEN`**, so no other tier can reach them |
| `to` / `two` / `too` | `to` and `two` both present |
| `hear` / `here` | `Hear, O Israel` opens Deuteronomy 6:4 |
| `soul` / `sole`, `peace` / `piece`, `way` / `weigh` | reference side present |
| `led` / `lead`, `whole` / `hole`, `son` / `sun` | reference side present |
| `wait` / `weight`, `right` / `write`, `heir` / `air`, `past` / `passed` | **both** members present |
| `throne` / `thrown`, `would` / `wood`, `our` / `hour`, `knew` / `new` | mixed |

Ship this as a **curated, bidirectional allowlist**, not a rule. Curated is the
point: every entry is a pair a human confirmed are genuinely homophones, so the
false-positive rate is whatever the curator allows and nothing more. It is the
mirror of the §2 blocklist, and the two tables together are the whole
hand-tuned surface of the design — perhaps sixty lines, all of it auditable.

The `no`/`know` case is the argument for having the table at all: both words are
under `MIN_FUZZY_LEN`, so the fuzzy tier is gated off them by design, and the
phonetic tier is gated off them too. Without an explicit entry they are simply a
miss, and `no` is a common word (`I will fear no evil`).

Homophone matches earn **full credit including in the strict score**, because
nothing was got wrong.

**One known false positive in the edit tier, and the blocklist should cover it
too.** `sin` and `son` are both three letters, both in this vocabulary, both
theologically loaded, and exactly one edit apart — so `same()` credits one for
the other today, in `voice.js`, and would credit it in the scorer. That is
inherited from a trade `voice.js` documents and makes on purpose, and it is
mostly harmless in the review box where the member can see and fix it. It is
less harmless in the strict score, which is the number allowed near the commit
rule. Raising `MIN_FUZZY_LEN` to 4 is not the fix — CLAUDE.md cites `Jews`/`Jew`
(4 and 3 letters) as a case the current constant exists to catch, and raising it
would break that. **The fix is the blocklist**, which is already being built for
the phonetic tier: apply it to *every* loose tier rather than to phonetics
alone. Starter entries drawn from the vocabulary: `sin`/`son`, `flesh`/`flash`,
`shall`/`Sheol`, `grace`/`grease`, `faith`/`face`. That the same mechanism
serves both tiers is a point in its favour — one curated table, one place to
audit what the app is willing to forgive.

### 3g. Fillers and self-corrections

**The aligner handles these, and that is the headline of this subsection.**
Because insertions cost 0.20 and credit nothing, and because the denominator is
the reference length, an inserted "um" is literally free. Measured on
Proverbs 3:5-6: a leading "um" scores 100% both today and under the new design;
a *three-word false start* scores 14% today and **100%** under the new design; a
mid-verse self-correction ("…with all your soul — no wait — with all your
heart…") scores 24% today and **100%**.

A short disfluency stop-list is still worth having, but for a different reason
and it should be labelled as such in the source: **not to make fillers free —
the gap cost already does that — but to stop them accidentally matching.** A
2-letter "um" is gated out of every loose tier, but "wait" is four letters and
would one-edit-match `want` (`I shall not want`), and "right" would match
`night`/`might`/`light`. Keep the list to genuine non-words:

```
um uh umm uhh er erm hmm mhm mm ah oh
```

and leave "wait", "sorry", "no" alone — they are real words, they are sometimes
in the verse, and the aligner absorbs them correctly as insertions anyway.

**Why a false start cannot hurt even when it accidentally matches.** Suppose the
member says "wait" just before the reference word `want`. The aligner may credit
`want` against "wait", and then absorb the real "want" as an insertion. Net: one
reference word, one credit. **Each reference word can be credited at most once,
so no amount of extra talking can inflate the score beyond what was produced.**
That is a property of scoring against the reference rather than against the
transcript, and it is why this design does not need to detect self-corrections
as such — it only needs to not be confused by them.

**How a false start should be treated, stated as a rule:** a false start
followed by the correct word is *one* production of that word, credited once,
with the false start absorbed at insertion cost. It must not be penalized,
because the member did in fact produce the passage — and it must not be credited
twice, because they produced it once.

---

## 4. Partial credit, and what the score should mean

### The figure

```
score = credited reference words / countable reference words
```

`countable` excludes optional (embedded-reference) words. Credit is **binary per
word**: 1 for exact, homophone, one-edit and phonetic tiers, 0 for substitutions
and omissions. Insertions never appear in the denominator and never subtract.

This is **word accuracy against a known reference** — `1 − (S + D) / N` — and it
is deliberately **not** WER.

**Why not WER.** Word Error Rate, the ASR convention, is `(S + D + I) / N`. It
counts insertions, and it is therefore unbounded above: a transcript longer than
the reference can score worse than 100% error. That is the right measure for
evaluating a *recognizer* against an unknown utterance. It is the wrong measure
here for two reasons. The insertions are mostly the recognizer's noise and the
member's disfluency, which is precisely what we decided not to charge for. And
reporting "your word error rate was 34%" to someone reciting Psalm 23 in a car
is both hostile and, on the thing they care about, wrong. Keep the ASR
literature's *alignment*, discard its *metric*.

The output range and shape stay identical to `gradeWritten().score` — a float in
`[0, 1]` — which is what lets `copy.speak.scoreSpoken`, `copy.speak.lastScore`
and the whole feedback path stay untouched.

### Substitutions vs omissions vs insertions

**Substitution and omission cost the same: one uncredited word.** For a
memorization app they are the same failure — the word was not produced.
Weighting one above the other would require an argument for which is worse, and
there isn't one: saying nothing and saying the wrong thing are both "did not
recall this word". They differ only in what the *feedback* can say, and that is
handled by the diff carrying the op kind.

**Insertions cost nothing in the score.** They cost only in the alignment, where
their price is what keeps the traceback honest.

### Function words

The data to weight them already exists and is already aligned. `data/keywords.js`
exports `keywordIndices`, spaCy content-word indices **aligned to
`text.split(" ")`** — the same indexing the diff uses — covering **183 of 183**
passages. Proverbs 3:5-6: 10 of 29 words are content
(`Trust heart, Lord understanding. ways acknowledge him, make straight paths.`).
Psalm 23: 44 of 113.

**Recommendation: do not weight the score. Do weight the feedback.**

The reason is a rule this codebase already states. `COMMIT_SCORE` is 0.95 and
`src/srs.js:212` says exactly why: *"one dropped article would otherwise deny a
passage the member plainly knows."* **That 5% margin is already the function-word
allowance, expressed once, in the one file that owns the commit rule.** Adding a
second allowance inside the scorer would be the same idea in two places, which
is the thing CLAUDE.md's conventions exist to prevent — and the two would
inevitably be tuned apart.

A weighted denominator is also unexplainable. A member who missed three of
twenty-nine words and is told "you got 92%" cannot check the arithmetic, and a
score you cannot check is a score you stop trusting. `3/29 = 90%` is a sentence
a person can verify in their head.

**Where `keywordIndices` should be used instead:** `feedbackFor()` currently
reads back `missed.slice(0, MAX_SPOKEN_MISSES)` — the first eight misses *in
passage order*. On a rough recital that is "the, and, of, your, in, to, a, his",
which is eight seconds of a synthesized voice saying nothing useful to somebody
driving. `keywordIndices` is ordered **most-important-first**, so sorting the
missed words by keyword rank before slicing turns the same eight seconds into
the eight words worth hearing. That is a real improvement, from data that
already ships, for about four lines.

(It also depends on the diff staying one-entry-per-`text.split(" ")`-word —
another reason for the invariant in §7.)

### Should a spoken score commit a verse?

First, read what the rule actually is. `srs.commitsVerse()` requires
`mode === "type"`, zero peeks, and `score >= threshold`, where the threshold is
`COMMIT_SCORE` = 0.95 by default and member-adjustable down to
`profile.MIN_COMMIT_THRESHOLD` = 90 (`src/profile.js:59`). `App.record()` is the
only caller. Speak mode never calls `App.record()` — CLAUDE.md is explicit that
it is practice only — so today a Speak-mode recital commits nothing.

But **recitation already commits today**, by a different door. CLAUDE.md's
"Reciting aloud" section: speaking fills `state.typed`, and `commitsVerse`
*"reads the attempt, never how the words arrived."* And that path already runs
`voice.js`'s one-edit forgiveness *before* grading, so a committed spoken verse
was never held to exact transcription in the first place. The question is
therefore not "should a spoken score ever commit" — it already does — but
"does Speak mode's noisier channel earn the same treatment."

**Recommendation, in four parts:**

1. **Yes, but on the strict score.** Report two numbers: `score` (all tiers) and
   `strictScore` (exact + homophone + one-edit only, phonetic excluded). The
   friendly number is what the member hears. The strict number is the only one
   allowed near the commit rule. This is the clean answer to "we must not credit
   a genuinely wrong word": the tier most likely to do so is fenced off from the
   one decision where being wrong has a consequence.
2. **At the member's own threshold, not a new one.** `reviewSettings(profile)
   .commitThreshold`, same as everything else. Inventing a spoken-specific bar
   would be a second definition of the commit rule, and CLAUDE.md's whole case
   for `commitsVerse` being the single definition is that there must not be one.
3. **Gate on channel quality, not on score.** Refuse to commit when the scorer
   abstained (§5), and when `verbose` is set — see below. These are statements
   about whether the transcript is *evidence*, which is a different question
   from whether the score is high, and they belong in the caller rather than in
   `commitsVerse`.
4. **Route it through `App.record()`** with `mode: "type"`, `peeks: 0`, so
   `commitsVerse` remains the only place the rule is written. No new rule
   anywhere.

Flag this as a scope decision for the owner rather than a conclusion: CLAUDE.md
already calls SRS credit for spoken recitals *"known follow-up work"*, and the
reason it gives — *"a recital graded through a car's road noise is not evidence
the scheduler should act on yet"* — is a good one. The design above is what
would make it defensible; whether to take it is a product call.

### The one gaming vector

Because alignment is global and monotonic but the *transcript* is unbounded, a
member who recites the passage twice — once badly, once well — gets the better
of the two, spliced. Measured on Proverbs 3:5-6: a deliberately wrong recital
followed by a correct one scores **100%** (today's grader gives 79%).

For practice mode this is arguably fine — they did recite it correctly, on the
second pass. If the score ever feeds commit it is not fine. **The guard is an
insertion-rate flag, not a score adjustment:**

```
verbose = heardCount > VERBOSE_RATIO * countableWords    // VERBOSE_RATIO = 1.5
```

A recital carrying more than 50% more tokens than the passage has words is not a
recital of the passage; it is a recital plus something else. Report `verbose` in
the result, let the feedback stay friendly, and let the commit gate refuse it.

The same guard is what holds the cross-passage floor. Measured over 3,660
sampled passage pairs, the highest score any passage reaches when fed *a
different passage's* text is 65% — and that case is a short reference swamped by
a long transcript, which `verbose` flags. **The highest that is neither
abstained nor flagged is 39%.** So the two channel guards, not the scoring
matrix, are what stop a scorer this forgiving from crediting the wrong verse.

---

## 5. Confidence and abstention

**The rule: abstain on insufficient signal, never on a low score.** A
full-length transcript that scores 30% is a real, honest failure and should be
reported as one. A three-token transcript that scores 3% is not a failure, it is
a microphone that cut out, and asserting a number about it is a lie.

The two cases are indistinguishable from the transcript alone, so the design
question is which way to be wrong — and the harms are wildly asymmetric.
Telling a member who recited well "I didn't catch that" costs them one retry.
Telling a member who recited perfectly "23%" is the failure that makes them stop
using the feature, which is the thing this whole document exists to fix.

### Concrete thresholds

Let `N` be countable reference words and `M` the transcript token count *after*
the disfluency strip.

```js
if (M === 0)                             abstain("empty");
if (M < Math.max(3, Math.ceil(N * 0.30))) abstain("too-short");
if (M > N * 4 + 32)                      abstain("flood");
```

**Why 0.30.** Below a third, the transcript cannot distinguish "the member knows
a third of this verse" from "the recognizer caught a third of what they said",
and under genuine indistinguishability the honest move is not to assert. Above a
third there is enough of a sequence for the alignment to be meaningful — a
member who really produced only 35% will get a 35% they can act on.

**Why `max(3, …)`.** Short passages. `Jesus wept.` is two words, so `0.30 × 2`
rounds to 1 and a single stray token would be scored. The floor of 3 means the
shortest passages effectively require the whole thing, which is correct: there
is no such thing as a partial recital of a two-word verse.

**Why the flood ceiling.** `N * 4 + 32` catches a car radio, a passenger, or the
app's own voice bleeding into an open microphone. It also caps the alignment
allocation before it is made, which is the only performance guard the design
needs (§1). Note that the half-duplex rule in `App.js` (`sayThen()` tears the
recognizer down before the speaker opens its mouth) is what *should* prevent the
self-transcription case; this is the belt to that braces.

### Shape of the abstention

Abstention must not be a zero, because a zero can be averaged, displayed, and
compared. Return:

```js
{ abstained: true, reason: "too-short", score: null, pct: null, total: N, heardCount: M }
```

`null` rather than `0` so nothing downstream can quietly treat it as a bad
recital. This is a **caller-visible change**: `viewmodel/speak.js` reads
`copy.speak.lastScore(last.pct)` unguarded, so it must check `last.abstained`
first. `copy.speak.nothingHeard` — *"I did not hear anything. Moving on."* —
already exists as the spoken line and covers `empty`; `too-short` and `flood`
want their own sentences, and those belong in `copy.js`, not here.

### One behavioural recommendation

In a hands-free loop, the honest response to abstention is **to re-prompt the
same verse once** rather than to move on. The member almost certainly did
recite; the app failed to hear it, and advancing the queue means they lost the
card to a microphone glitch. `nextPhase()` in `src/speak.js` should hold the
index for one retry on abstention and advance on the second. Cheap, pure,
testable, and it converts the worst remaining failure into a minor annoyance.

### Signal the pure module should be given, not invent

The browser knows things the transcript does not: `SpeechRecognitionAlternative
.confidence`, and whether `onText` ever fired at all versus fired and settled.
Those belong in `App.js`, which already owns the timers and the recognizer, and
should be passed **in** as options (`{ sawSpeech, confidence }`) rather than
guessed at. Keeping the pure module free of browser signals is what keeps
`node --test` able to run it, which is the same split that already keeps
`speak.js` testable.

---

## 6. Testability

### The fixtures

Twenty cases against real passage text. `today` is measured by running the
transcript through the current `gradeWritten()`; `target` is the range the new
scorer must land in; `strict` is the phonetic-excluded figure where it differs.

| # | passage | what the member did | today | target | strict | proves |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Proverbs 3:5-6 | recited perfectly (lowercase, unpunctuated — what a recognizer emits) | 100% | **1.00** | 1.00 | baseline; `norm()` handles case and punctuation |
| 2 | Proverbs 3:5-6 | `"um trust in the lord…"` | 100% | **1.00** | 1.00 | a leading filler is free |
| 3 | Proverbs 3:5-6 | **three-word false start** — `"trust in the trust in the lord…"` | **14%** | **≥0.98** | ≥0.98 | ★ **the headline.** the cursor stall is gone |
| 4 | Proverbs 3:5-6 | self-correction — `"…with all your soul no wait with all your heart and…"` | **24%** | **1.00** | 1.00 | a corrected false start is one production, credited once, penalized zero times |
| 5 | Proverbs 3:5-6 | `"and don't lean on…"` | 93% | **1.00** | 1.00 | contraction split op / expansion table |
| 6 | Proverbs 3:5-6 | `"…with all your hard…"` and `"…make straight your past"` | 93% | **0.90–0.94** | same | ★ **the negative control.** `hard` is *not* a proper noun so the phonetic tier does not fire; `past`/`paths` is 2 edits and genuinely different. Wrong words stay wrong |
| 7 | Proverbs 3:5-6 | dropped `and` | 97% | **0.95–0.97** | same | a single dropped conjunction still clears the commit bar, as `COMMIT_SCORE`'s comment intends |
| 8 | Proverbs 3:5-6 | `"lean on your own knowledge"` / `"make straight your ways"` | 93% | **0.90–0.94** | same | genuine recall errors score below commit |
| 9 | Proverbs 3:5-6 | `"trust in"` — recognizer cut out | 7% | **abstain** `too-short` | — | ★ never assert 7% about a two-token transcript |
| 10 | Proverbs 3:5-6 | `""` | 0% | **abstain** `empty` | — | `copy.speak.nothingHeard` |
| 11 | Psalm 23 | recited perfectly, all 113 words | 100% | **1.00** | 1.00 | length is not the problem |
| 12 | Psalm 23 | **verse 3 forgotten entirely** (`He restores my soul…name's sake.`) | 87% | **0.86–0.88** | same | ★ a genuinely forgotten clause is *not* rescued. 15 of 113 words gone = 87% |
| 13 | Psalm 23 | six words in, restarted, then perfect | **8%** | **≥0.98** | ≥0.98 | ★ the stall on a long passage |
| 14 | Deuteronomy 6:4-5 | `"here o israel…"` (homophone for `Hear,`) | 97% | **1.00** | 1.00 | curated homophone table; note `Hear,` carries punctuation |
| 15 | Galatians 6:7-9 | every `sows` heard as `"sews"` (three occurrences) | 96% | **1.00** | 1.00 | one-edit tier — the case `voice.js` documents, now reaching Speak mode |
| 16 | Isaiah 40:28-31 | `"…like eagles they shall run…"` | 99% | **1.00** | 1.00 | merge op absorbs the `eagles;they` data bug |
| 17 | Luke 12:32 | recited perfectly, without the embedded `Luke 12:48b` | **95%** | **1.00** | 1.00 | ★ optional-word handling; today this passage is uncommittable by voice |
| 18 | Philippians 4:6-7 | `"…in jesus christ"` (transposed) | 98% | **0.97–0.98** | same | the gap asymmetry makes an adjacent swap cost one word, not two — no Damerau term needed |
| 19 | Isaiah 9:1-7 | full recital, `Zebulun`→`"zebulon"`, `Naphtali`→`"naftali"` | 99% | **1.00** | **0.996** | ★ proper-noun tiers: `zebulon` by edit (strict-eligible), `naftali` by phonetics — and the phonetic one is exactly the strict/friendly gap |
| 20 | Proverbs 3:5-6 | recited wrong, then recited correctly (both in one transcript) | 79% | **1.00** + `verbose: true` | — | ★ the gaming vector is *flagged*, not silently scored |

Every number in the `today` column was measured, not estimated. The `target`
column is a range rather than a value on purpose: pinning an exact float makes
the suite brittle against tuning the cost matrix, and the assertions that matter
are "clears commit" / "does not clear commit" / "abstains".

### Structural and property tests

These are worth more than any individual fixture, because they hold over the
whole corpus and cannot be satisfied by tuning:

1. **`diff.length === passage.text.split(" ").length` for all 183 passages**, for
   any transcript. This is the invariant everything downstream leans on (§7).
2. **Every passage recited perfectly scores exactly 1.00.** Feed each passage its
   own text, `norm`'d and space-joined — the closest thing to ideal recognizer
   output — and assert 1.00 for all 183. *(Verified against the prototype: 183/183.)*
3. **Cross-passage floor.** Score each passage against a *different* passage's
   text; assert the result is below some floor, or abstained, or flagged
   `verbose`. *(Measured over 3,660 sampled pairs: the highest score any passage
   reaches against another passage's text is 65%, and that case is flagged
   `verbose`. The highest that is neither abstained nor `verbose` is **39%** —
   Galatians 6:14 against 1 Samuel 12:23, two short passages that share a lot of
   function words. So a floor of 50% on unflagged pairs holds with margin.)*
4. **Cost-matrix invariant:** `INS + OMIT > SUB_MISMATCH`. A one-line assertion
   that stops a retune from silently turning every substitution into a
   delete-plus-insert.
5. **Alignment monotonicity:** the heard-index of each credited reference word is
   non-decreasing across the diff.
6. **`perVerseOf` over all 16 real multi-verse passages** — does not throw, and
   the per-verse word counts sum to the whole. *(This test fails today; see
   below.)*
7. **`keywordIndices` in range:** every index in `data/keywords.js` is a valid
   index into `diff` for its passage.
8. **Phonetic blocklist completeness:** the eight blocklisted pairs are the
   *complete* set of collisions between the proper-noun list and the vocabulary
   under the §2 gate. This is the test that keeps the phonetic tier honest, and
   it will fail loudly the day someone adds a passage that introduces a ninth.
9. **Double Metaphone key pins** for this corpus's hard vocabulary (§2), so a
   ported implementation is verified against the words that matter rather than
   against a generic suite.

### One test that must change

`test/speak.test.mjs`'s `MULTI` fixture uses `verses: [{ v, text }]`. No shipped
passage has that shape — `data/passages.js` uses `string[]` and
`test/passages.test.mjs:119` asserts it. Change the fixture to the real shape.
Doing so will fail the verse-mode test, which is correct: it is finding the bug
described in the summary. A fixture that does not match the data is a test that
protects nothing.

### File naming

The brief names `test/scoring.test.mjs`. CLAUDE.md's convention is one test file
per module, named for it (`test/<module>.test.mjs`). If the module lands as
`src/recital.js` the test should be `test/recital.test.mjs`; if it lands as
`src/scoring.js`, `test/scoring.test.mjs`. Pick the module name first and let the
test follow it.

---

## 7. API design

### Modules

Two new pure modules, both `(input) => output`, no DOM, no timers, no imports
from `App.js` or `viewmodel/`.

**`src/wordmatch.js`** — when two words are the same word.

```js
export const MAX_EDITS = 1;          // moved from voice.js
export const MIN_FUZZY_LEN = 3;      // moved from voice.js
export const MIN_PHONETIC_LEN = 5;
export const MAX_PHONETIC_EDITS = 2;

export function withinOneEdit(a, b);              // unchanged from voice.js
export function stem(w);                          // unchanged from voice.js
export function same(heard, want);                // unchanged from voice.js — voice.js imports it back
export function doubleMetaphone(word);            // → [primary, alternate]
export const HOMOPHONES;   // curated allowlist, bidirectional (§3f)
export const BLOCKED;      // curated blocklist — pairs no loose tier may credit (§2, §3f)

/* The one predicate the aligner asks. `proper` is whether the *reference* word
 * is a proper noun, which is what gates the phonetic tier. */
export function wordMatch(heard, want, { proper = false } = {});
//   → "exact" | "homophone" | "edit" | "phonetic" | null
```

**`src/recital.js`** — scoring a recitation.

```js
export const COST = { EXACT: 0, HOMOPHONE: 0, EDIT: 0.15, PHONETIC: 0.30,
                      SUB: 1, OMIT: 1, INS: 0.20, MERGE: 0.10, SPLIT: 0.10 };
export const MIN_SIGNAL_RATIO = 0.30;
export const MAX_SIGNAL_TOKENS = (n) => n * 4 + 32;
export const VERBOSE_RATIO = 1.5;
export const ABSTAIN = { EMPTY: "empty", SHORT: "too-short", FLOOD: "flood" };

/* The aligner on its own — exported so it can be tested without a passage. */
export function alignWords(refWords, heardTokens, options = {});
//   → { ops, cost }   ops: [{ op, kind, ri, hi }]

/* The whole thing. */
export function scoreRecital(passage, transcript, options = {});
```

### The return shape

```js
{
  // the friendly figure — all four credit tiers. null when abstained.
  score, pct,

  // the honest figure — exact + homophone + edit only. Never the phonetic tier.
  // This is the one the commit gate is allowed to read.
  strictScore, strictPct,

  total,        // countable reference words (optional words excluded)
  credited,     // weighted sum, == number of credited words
  heardCount,   // transcript tokens after the disfluency strip

  abstained,    // bool
  reason,       // "" | "empty" | "too-short" | "flood"
  verbose,      // heardCount > VERBOSE_RATIO * total  — refuse commit on this

  counts: { exact, homophone, edit, phonetic, sub, omit, ins, merge, split },

  // ONE ENTRY PER passage.text.split(" ") WORD. Insertions are never here.
  diff: [{ word, hit, kind, heard, optional }],

  // the full operation list, insertions included, for anything that wants it
  ops: [{ op, kind, ri, hi }],
}
```

`diff[i].kind` is one of `exact | homophone | edit | phonetic | sub | omit`, and
`diff[i].hit` is `kind !== "sub" && kind !== "omit"`. **That makes `diff`
drop-in compatible with `gradeWritten().diff`**, which is the point: everything
already reading `.word` and `.hit` keeps working, and everything that wants to
be smarter can read `.kind` and `.heard`.

### How `feedbackFor()` calls it

The change in `src/speak.js` is three lines:

```js
export function feedbackFor(passage, transcript, mode) {
  const said = (transcript || "").trim();
  const graded = scoreRecital(passage, said);        // was: gradeWritten(passage.text.split(" "), said)
  const result = { score: graded.score, pct: graded.pct,
                   strictScore: graded.strictScore, verbose: graded.verbose,
                   abstained: graded.abstained, spokenFeedback: "" };

  if (graded.abstained) {
    result.spokenFeedback = copy.speak.notCaught(graded.reason);   // nothingHeard for "empty"
    return result;
  }
  // …everything below is unchanged: graded.diff has the same shape it always did
}
```

Two caller-side follow-ons, both small:

- `viewmodel/speak.js` reads `copy.speak.lastScore(last.pct)` unguarded — it must
  check `last.abstained` first, since `pct` is now `null` in that case.
- `nextPhase()` should hold the index for one retry on abstention (§5).

### Does per-verse slicing survive alignment?

**Two answers, and the first one is not the one the question expects.**

**It does not survive *today*, before any of this.** `perVerseOf()`
(`src/speak.js:42`) does:

```js
const count = verse.text.split(" ").length;
```

But `verses` in `data/passages.js` is `string[]`. Verified by running
`feedbackFor(psalm23, psalm23.text, "verse")`:

```
TypeError: Cannot read properties of undefined (reading 'split')
```

All 16 multi-verse passages are affected — every Psalm, every Hebrews 11
section, every 2 Corinthians 4 section, Isaiah 9. Verse-by-verse feedback, one
of the three modes on the Speak screen, throws on every passage it is supposed
to work on. The unit test passes because its fixture invented a shape. Fix:

```js
const count = String(verse.text ?? verse).split(" ").length;
```

— accepting both, and change the test fixture to the real shape.

**With the new aligner it survives by construction**, and that is a deliberate
design choice rather than a happy accident. The invariant is:

> `diff` has exactly one entry per `passage.text.split(" ")` word, in order.
> Insertions never appear in `diff`; they live in `ops` and in `counts.ins`.

That is *why* insertions are kept out of the diff. Everything positional in the
app is indexed against `text.split(" ")` — `perVerseOf`'s slicing,
`keywordIndices` in `data/keywords.js`, `blanks.js`'s precomputed blanks — and
`text` is the flat join of `verses` (asserted at `test/passages.test.mjs:119`).
Keep the invariant and every one of those keeps working untouched.

One refinement: per-verse denominators should exclude optional words, i.e.
`slice.filter((w) => !w.optional).length`, for the same reason the whole-passage
denominator does.

Verified on Psalm 23 with verse 3 omitted, through the prototype:

```
verse 1:  9 words,  9 credited = 100%
verse 2: 14 words, 14 credited = 100%
verse 3: 15 words,  0 credited =   0%
verse 4: 30 words, 30 credited = 100%
verse 5: 21 words, 21 credited = 100%
verse 6: 24 words, 24 credited = 100%
                          whole =  87%
```

Which is exactly the feedback verse-by-verse mode exists to give, and exactly
what it cannot give today.

### Where the loose comparison lives

CLAUDE.md currently says of `voice.js`'s `same()`: *"It is deliberately only
here. `grading.js` stays exact, so nothing a member **types** is forgiven."*

This design moves `same()` into `src/wordmatch.js` and has both `voice.js` and
`recital.js` import it — one definition, two callers, which is this codebase's
usual shape. `grading.js` is **not touched**, so the substance of the rule is
intact; only its location changes. The invariant, restated for the CLAUDE.md
paragraph that will need updating:

> **Nothing a member types is forgiven. What a microphone heard is.**
> `grading.js` is exact and stays exact. `wordmatch.js` is the one loose
> comparison in the app, it exists because a recognizer hands back a spelling
> rather than a sound, and the only two things allowed to import it are the two
> that have a microphone behind them.

### Conventions checklist

Pure modules of `(input) => output`; no DOM, no timers, no `setState`; no
imports from `App.js`, `viewmodel/` or `views/`; unit-testable under
`node --test`; prose comments that say *why* rather than *what*; 2-space indent,
Prettier at 120 columns, double quotes, trailing commas; one test file per
module. Words the member hears go in `copy.js` and nowhere else — the three new
abstention sentences included.

---

## Appendix: what to build first

Ordered by measured value per unit of risk.

1. **The aligner with asymmetric gaps**, and the exact/one-edit tiers only. This
   is fixtures 1–5, 11, 13, 15 and most of the value in the document: 14% → 100%
   on the case that is breaking the feature today.
2. **Abstention.** Fixtures 9–10. Small, self-contained, and it removes the
   second-worst experience (being told "7%" when the microphone died).
3. **The `perVerseOf` string fix and the test fixture that hides it.** Unrelated
   to the rest, ships in five minutes, un-breaks a whole feedback mode.
4. **Normalization:** contractions, digits, the merge/split ops, optional
   embedded references. Fixtures 5, 16, 17.
5. **The two curated tables — homophone allowlist and loose-tier blocklist.**
   Fixture 14. Curated, so their risk is exactly what the curator writes down.
   The blocklist is wanted even in phase one, for `sin`/`son` (§3f).
6. **`keywordIndices` for ordering spoken misses.** Four lines, data already
   ships.
7. **Double Metaphone, proper-noun-gated, with the blocklist and its
   completeness test.** Fixture 19. Last, because it is the most code for the
   least measured gain, and because its correct scope was only visible after the
   rest was measured.
8. **Strict score + commit gating** — only if and when SRS credit for spoken
   recitals is taken off the follow-up list.

And separately, in `data/` rather than `src/`: fix the four embedded references
and the three fused words. The scorer should tolerate them, but it should not be
the reason nobody notices them.
