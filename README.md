# KIVI — end-to-end demo

This is a real, running build, not a mockup: open `index.html` in Chrome or
Edge (voice input needs Web Speech API; everything else works in any
browser). All state lives in `localStorage` on your machine — there's no
server, which is itself a design choice: nothing here leaves the device.

## The one use case this was built around

> "Hey Kivi, find the dictation I did around 5pm yesterday about the vendor
> call and polish it for the meeting I'm walking into."

Everything below exists to make that single sentence work *trustworthily* —
not to demonstrate everything a memory system could theoretically infer.
Try it in the **hey kivi** tab (type or talk), then look at **memory** to see
exactly what it did and why.

## What Kivi actually remembers (three things, deliberately)

Semantic memory is capable of learning far more than this. Three
capabilities made the cut because they're each load-bearing for the one use
case above; everything else was left out on purpose.

1. **Time + topic retrieval over dictation history.** This is what makes
   "the one from around 5pm yesterday" resolvable at all. It's built from
   every dictation automatically — it's an index, not a learned preference,
   so there's no trust question here.
2. **Audience tone profiles** ("my manager" vs "the team" vs a named
   person). Learned *only* from explicit signals: a single correction
   ("too formal") is recorded as a **candidate** and shown as such; it only
   becomes **confirmed** — i.e. something Kivi will apply without asking —
   after a second, consistent correction. Check the Memory tab after giving
   feedback once vs. twice and watch the badge change.
3. **Glossary** — proper nouns and domain terms (project names, product
   names) that Kivi keeps mishearing. This is the one place a single signal
   is enough to confirm memory immediately, because teaching a term via the
   Memory tab's form *is* the explicit-confirmation signal, not an
   inference from it.

**Deliberately not built:** a general contact graph, mood/sentiment
tracking, cross-app inference, or any workflow automation beyond
find-and-polish. A system capable of learning ten things about a user
doesn't mean ten things should get built — the memory tab would stop being
inspectable at a glance, and half of it would be inference no one asked for.

## The dictation / Hey Kivi boundary

This is the part of the spec that most needed an explicit answer, so:

- **Dictation never reads memory back.** Typing or talking into the
  Dictate tab always produces the same thing regardless of what Kivi has
  learned about you — no silent rewriting, no tone changes, nothing
  surprising in the one place you're just trying to get a thought down
  fast. It *does* deposit low-trust "candidate" signals (proper nouns,
  keywords) — visible in Memory → "noticed, not learned" — but those never
  feed back into what you see.
- **Hey Kivi is the only place semantic memory acts.** Retrieval, tone
  application, and glossary substitution all happen only when you
  explicitly invoke Hey Kivi. This is the boundary the spec asked for made
  concrete: memory has "little reason to affect ordinary dictation" and is
  "central to an interactive request" — literally enforced in
  `kivi-engine.js`, where dictation-side code can only call
  `extractCandidateSignals()`, and everything else (retrieve, resolve,
  polish, learn) is reachable only from the Hey Kivi handler.

## When Kivi is unsure

Two separate ambiguity paths, both visible live in the chat:

- **Retrieval ambiguity** — if two dictations are close enough in score
  that guessing would be a coin flip, Kivi lists both as tappable options
  instead of picking one. Try asking without a topic hint, or with two
  similar entries close in time, to see this trigger.
- **No confirmed tone** — if there's no confirmed audience profile yet,
  Kivi says so explicitly ("no confirmed tone preference yet") rather than
  quietly picking a style, and uses a neutral default.

Every Hey Kivi reply has a **"why?"** toggle showing exactly what was
retrieved, what memory (if any) was used, the plain-language reasoning, and
the simulated latency/cost/model for that turn — this is the same
inspectability the corpus below provides, just live.

## Staying in control without being the administrator

The Memory tab is the whole control surface, and it's deliberately not a
database console:

- Every item shows in plain language what it is, how many signals
  confirmed it, and when — not a raw confidence slider to fiddle with.
- One "forget" button per item. No export/import, no bulk edit — the
  point is that a non-technical person can look at this tab and understand
  their own AI assistant's state completely, not administer it.
- "Noticed, not learned" candidates are shown so you can see what's being
  tracked before it ever becomes a behavior change.

## The 500-record development corpus

`scripts/generate_corpus.py` → `data/corpus.json`. **This is a separate
development dataset, not something Hey Kivi searches at runtime.** Hey Kivi
only ever searches *your own* dictation history — the entries you've
actually spoken or typed, stored in your browser. Wiring live retrieval to
a synthetic 500-record file would mean "your assistant" surfacing other
people's fabricated notes, which defeats the point. The corpus exists to
develop and stress-test the retrieval/tone/glossary logic before it runs
against real usage, and to browse in the **dev corpus** tab — that's it.

The app ships with six seeded dictation entries spanning yesterday and
today (including one at 5:05pm yesterday about a vendor call) specifically
so the example query in this README works out of the box. Dictate your own
notes from the Dictate tab to build up real history beyond that.

Each record has the fields the spec asked to be inspectable:

| field | what it shows |
|---|---|
| `raw_asr` | simulated raw ASR output (noisy, unpunctuated, occasional mishears) |
| `llm_formatted` | the cleaned-up version |
| `entities` | proper nouns detected |
| `memory_action` | `candidate_noticed`, `tone_learned`, `tone_candidate`, `glossary_taught`, `retrieved_and_polished`, `asked_clarification`, `rejected_low_confidence`, or `none` |
| `memory_provenance` | what evidence justified the action (or `null`) |
| `reason` | the plain-language decision reasoning |
| `latency_ms` / `latency_breakdown` | simulated per-stage timing |
| `cost_usd` | simulated per-record cost |
| `model_used` | which stand-in model handled it |

Browse and filter it from the **dev corpus** tab in the app. Regenerate
with `python3 scripts/generate_corpus.py` (seeded, so it's reproducible).

## Honest limitations of this demo

- ASR is the browser's Web Speech API; there's no real Indic-language
  ASR/LLM behind this (that's a vendor-integration decision, covered in the
  architecture doc from earlier in this conversation — Sarvam AI's Saaras
  v3 is the natural fit).
- "Polishing" and intent parsing are rule-based, not an actual LLM call —
  intentionally, so the demo is inspectable, deterministic, and runs
  offline. The interfaces (`parseIntent`, `polish`, `retrieveCandidates`)
  are written so a real model call could be swapped in without touching
  the memory/trust logic around them.
- Everything is single-user, single-device (`localStorage`). No real
  Gmail/Calendar/Slack integration — the "find in Slack" example from the
  spec is represented here as "find in dictation history" to keep the demo
  self-contained; the retrieval/confidence/clarification logic is the same
  either way.
