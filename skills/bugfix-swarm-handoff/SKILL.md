---
name: bugfix-swarm-handoff
description: Continuity protocol for bugfix-swarm runs that outlive a context window — the five things that exist only in conversation, what a FLUSH block indexes, what a compaction summary may carry, and the ordered resume gate including mandatory frame re-derivation and working-tree truth. Load at every decision point while orchestrating a swarm, before requesting compaction, and immediately after any compaction, restart, or session resume.
---

# Bugfix Swarm Handoff

Continuity across compaction, restart, and crash for a `bugfix-swarm` run. The state map below is
the funnel's — registry, reports, `BUG_REPORT.md`, ledger, journal, working tree. Another
multi-agent procedure needs its own.

A census routinely consumes more than one context window and will compact, usually several times.
The funnel already puts almost everything on disk, so the risk is narrow: a handful of facts that
exist only in conversation, and four hazards the files cannot protect against.

## Four invariants

1. Every fact the next context needs is in a file before the current turn ends.
2. A compaction summary carries pointers, not content.
3. After any boundary, re-read state from files and read it back to the human before acting.
4. **The resumed orchestrator is a primed pass on its predecessor's artifacts.** It will validate
   details faithfully and inherit framing errors. Re-derive before trusting — the resume gate makes
   this mandatory, not discretionary.

## State ownership

| State | Home | Notes |
|---|---|---|
| Decisions, refutations, FIXED markers, coverage summary, decay reading | Registry (the workspace's kata tracker — see `bugfix-swarm` State) | Written the moment a decision is made, never batched. Created at the run's FIRST decision. See `bugfix-swarm` State |
| Merged findings + merge manifest | `scratch/<run>/BUG_REPORT.md` | The only findings artifact the orchestrator reads |
| Raw evidence, one per pass | `scratch/<run>/reports/<pass-id>.md` | Read by the dedupe agent only — never pulled into the orchestrator's context |
| Run state: agent IDs, assignments, calibration rules, orchestrator annotations, human decisions with margin notes and each note's routing, FLUSH blocks | `scratch/<run>/ledger.md` | Single source of truth for coordination. Notate as results land, not from memory |
| Standing preamble | `scratch/<run>/preamble.md` | Quoted verbatim into every prompt; its currency is a resume-gate check |
| Agent return values | `<run id>.workflow.jsonl` | Authoritative for workflow-dispatched agents; `resumeFromRunId` replays the unchanged prefix |
| Agent transcripts | on-disk task output files | Fallback for plain dispatch; indexed by the ledger's agent-ID list |
| Fixes | working tree | Uncommitted until the human asks. **Truth for fix state** — not the ledger, not notifications |
| Procedure | the skill files | `bugfix-swarm` and companions |

## What is volatile

Only these five exist solely in conversation. Everything else is already on disk.

1. **Picker queue position and bucket order.** The ordering is a decision — Phase 6 forbids
   `BUG_REPORT.md` from ranking, so no file implies it.
2. **A picker on screen whose selection has not returned**, and any brief or answer being drafted
   this turn.
3. **Decisions made this turn, not yet notated** — run a blind pass on X, drop Y under rule Z,
   apply a calibration retroactively to the accepted set. Files record what happened, not what was
   decided and not yet done.
4. **The workflow `runId`, if a run is in flight.** Without it there is no `resumeFromRunId`; the
   wave re-dispatches, duplicating findings and blurring convergence records.
5. **Corrections issued but not yet applied** — a calibration rule that has not reached the preamble
   file, or has not been steered to in-flight agents. The quietest failure: the next wave is briefed
   from a stale preamble and produces findings the rule already excludes, with nothing on disk
   recording that the rule exists.

## Flush

**Cadence: after every decision point** — a picker round, a fix-wave dispatch, a category close, a
workflow launch or return. No pressure-sensing trigger. The cadence alone bounds the loss window to
one turn, which makes compaction safe to request at any moment.

**A FLUSH block is an index plus the five volatile items — not a state snapshot.** The state is on
disk; duplicating it here invites drift.

```
### FLUSH <n> — <timestamp> (index, not snapshot)
Queue: <ordered remaining units — buckets, waves, pickers>
Picker: <on screen, awaiting selection | selection returned, notes unrouted | none>
In flight: <agent IDs + assignment + where results land> · workflow runId <id> | none
Decided this turn, not yet written: <list, or none>
Pending corrections: <rules issued, not yet in preamble / not yet steered — or none>
Preamble file: <current | stale: what is missing>
Fix state: <per bucket — edits applied, verification owed> · tree <clean|dirty>
Harvest owed: <agent IDs whose results never arrived, or none>
Next: <2-3 concrete actions, in order>
Detail lives in: registry run section · ledger tail since FLUSH <n-1> · BUG_REPORT.md · journal <runId>
```

## Pre-compaction

1. Append a FLUSH block.
2. Request compaction with instructions that are pointers. Never let the summary retell findings,
   verdicts, or evidence — a retelling enters the next context as if authoritative and drifts.

```
Mid-swarm in <run type> over <repo>. Durable state is in files, not this summary.
Before any dispatch, picker, or question, work the resume gate in `bugfix-swarm-handoff`
in order: <registry> run section → <ledger> newest FLUSH → ledger tail since it →
journal <runId> if in flight → git status + compile → read position back to the human →
re-derive <highest-stakes item in flight> from source. Do not re-ask decided questions;
the registry's decision tables are authoritative.
```

**Register rules for the summary.** Vocabulary elicits a persona in whoever reads it next: counts
and pointers, flat and declarative, no drama. And attribute every judgment — "the census pass
classified these as per-invocation" rather than "these are per-invocation." An asserted judgment in
a summary becomes an unexamined premise for the resumed agent, which is how a predecessor's error
survives a boundary as fact.

## Resume gate (first act after any boundary, in order)

1. **Registry** — current run section: decisions, refutations, FIXED markers, coverage.
2. **Ledger** — newest FLUSH block, then the tail since it.
3. **Journal**, if a `runId` is recorded — read what each agent actually returned. Do not assume a
   cached entry is non-empty.
4. **Working tree** — `git status`, compile what is there, review uncommitted diffs. Edits may be
   complete, partial, or absent; only the tree says which. Record **verification owed** separately
   from **edits applied**: a dead fix agent can leave a complete change set that never ran its
   probe.
5. **Preamble currency** — does `preamble.md` carry every calibration rule in the ledger? A stale
   preamble silently mis-briefs the next wave.
6. **Read back to the human before dispatching or presenting anything**: queue position, in-flight
   agents, fix state, next actions. If the human's account disagrees with the files, the files are
   the state — fix the files, and record the disagreement, because it may mean a decision was never
   written down.
7. **Frame re-derivation, mandatory.** Take the highest-stakes item in flight and re-derive it from
   source — not from `BUG_REPORT.md`, not from the ledger. An over-merge in the report, a
   calibration rule applied too broadly, a mis-sliced bucket: none is visible from inside the
   predecessor's framing, and the manifest reads as ground truth.
8. **Harvest** anything owed before claiming a queue position that depends on it.

Do not re-ask decided questions.

## Harvest

- **Journal first** for workflow-dispatched agents; `resumeFromRunId` retries a journaled failure
  and replays the cached prefix before it.
- Otherwise **on-disk transcripts**, indexed by the ledger's agent-ID list. Read the final assistant
  message; notate the envelope as if the notification had arrived.
- **For report-bearing passes, confirm `reports/<pass-id>.md` exists.** A dead agent may have
  written it, half-written it, or never reached it. A missing report is not a clean pass, and a
  half-written one is not a complete enumeration.
- **For fix agents, inspect the tree** — then compile, review the diff, and dispatch the
  verification still owed. Never a second blind edit pass over work whose state you have not read.
- Trust files over the notification stream. Late or duplicate notifications for already-notated
  agents are noise, discarded without action.

## Rules

- The summary is not the state; the files are. Anything worth carrying across a boundary goes into
  a file first.
- Idempotent across many compactions. Each FLUSH supersedes the prior for *position*; never rewrite
  or prune earlier blocks — they are the run's history.
- A crash between flush and compaction costs one turn of work, provided the cadence held. A crash
  mid-category costs the notations since the last flush — which is why flush follows every decision
  point.
- Never defer a registry write because the run is still going. Compaction does not wait for
  convenient moments.
- Conversation holds only the current turn's work: the picker on screen, the report being notated,
  the answer being drafted.
