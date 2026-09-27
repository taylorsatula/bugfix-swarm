---
name: bugfix-swarm
description: "USER-GATED — load only when the user explicitly asks for a bug hunt, code audit, swarm run, sweep, or re-audit. Never load autonomously mid-session, never because the current task would benefit; the user decides when a run opens. Runbook for read-only static-analysis bug-hunt swarms, run as a funnel: short human kickoff → waves of agents each writing a report file and returning only an envelope → verification layer → dedupe agent merges all reports into one BUG_REPORT.md → orchestrator slices it into repair buckets → one picker per bucket → background fix waves dispatched while the user answers the next round. Raw reports and source code stay out of the human's and the orchestrator's context; the user is in the loop at every decision point. Covers orchestrator pacing and when to administer waves with SubagentWorkflow. Prompt mechanics: swarm-orchestration. Continuity across compaction: bugfix-swarm-handoff."
---

# Bugfix Swarm — Runbook

**Invocation.** A human opens every run. Never start a swarm on your own initiative, never load
this skill mid-session because the task would benefit from an audit. Finish the task; if a run
seems warranted, say so in one line and let the human decide.

One run, in order: bootstrap → decompose → hunt → verify → dedupe into one report → slice into
buckets → decide → fix → close. The human opens it and settles every decision in it. Companions
own the mechanics; load by phase, do not re-derive them here.

| Skill | Load | Owns |
|---|---|---|
| `swarm-orchestration` | always | preamble template, pass information-states (blind / primed / adjudicator / recheck), voice, dispute resolution, the overseer's non-delegables |
| `bugfix-swarm-handoff` | always | the five volatile facts, FLUSH blocks, compaction-summary rules, the ordered resume gate, harvest — a full census routinely outlives a context window |
| `plan-investigation` | fix waves | verifying claims against source before changing code, scope control for fix agents |
| `git-workflow` | commit time | staging and commit protocol — commits only when the human asks |
| `sitrep` | on request | status report over the run's diff |

**Instrument boundary.** Agents read and trace code; nothing executes against live
infrastructure. When yield decays (Phase 9), change the instrument — live path-probes and
red-team passes are a different exercise, not a bigger version of this one.

**What is scarce.** Runs go overnight, every few weeks, on unmetered endpoints. Tokens and
wall-clock are not the constraint; the human's attention and the ledger's correctness are. Choose
a pass for the information it adds, never for what it saves. Reach for one composed shell
enumeration before another agent: an enumeration closes a hazard class and shows its own bound,
which more readers cannot.

**Vocabulary is an input.** Hunt, swarm, hunter, kill — this runbook's own words elicit an
aggressive frame, and an elicited frame shapes what gets reported. The anti-noise rule and the
null-result permission in every preamble are the deliberate counterweight, not decoration.

## Pacing contract

A funnel: short human direction in, waves of agents widen it, every decision narrows back to the
human. Consultation is continuous, not a kickoff event.

**The human settles, at each decision point:**

| Point | Settles |
|---|---|
| Kickoff | run type, stakes tier, calibration changes. A short directional message — detail arrives later as prepared rows, not as upfront questions |
| Mid-wave correction | any calibration rule; stated once it becomes standing preamble text within one batch |
| Unsettled dispute | a disagreement the code cannot settle, a scope change, a doctrine or security conflict, a stall only the human can break |
| Each bucket picker | which rows become repairs. Margin notes bind, redirect, or refute |
| Note follow-up | a premise challenge answered from code; a re-offer after a comprehension question |
| Run close | whether coverage and the decay reading warrant another round |

**Two modes: reading and writing.** Investigation agents read and trace, change nothing. Repair
agents write, dispatched only after the human accepted the row. A human decision moves a site
from read to write — never an agent's judgment, never the orchestrator's.

**Agents never resolve ambiguity in-context.** Settle it before dispatch — you read the code, or
the human settles at a gate — and it arrives inside the problem statement. An agent
meeting genuine ambiguity reports it and moves on: a report is where ambiguity surfaces, not
where it gets argued out. In-agent deliberation settles nothing durably; the answer dies with the
transcript.

**Two channels to the human, never mixed in one turn.**
- **Brief** — aggregate state, no decision required: kickoff, each wave land, run close.
- **Picker** — a decision required: one bucket, one turn, rows prepared ahead of time.

**Never narrate dispatch.** The progress UI shows agents launching and landing. Aggregates go in
briefs.

**Never idle, never poll.** Agents run in background; notifications arrive by themselves. Between
dispatch and land, prepare: notate envelopes, pre-draft the next bucket's rows from
`BUG_REPORT.md`, write the next wave's assignments. End every turn with an artifact — dispatch,
file write, brief, picker; never "waiting on agents."

**Pipeline the human's attention.** Accepted rows go to background repair agents immediately; the
next bucket's picker goes up while they run. Keep the human from blocking on agents and agents from
blocking on the human except at a gate. Ordering that serves this: dispatch the accepted bucket's
repairs first, then open the next picker — never the reverse, never two pickers in flight.

**Gates, none skippable.**
1. No picker before its bucket's verifier verdicts land — a row accepted then killed spends the
   human's decision and a fixer's work on nothing.
2. No slice before the dedupe write completes. Phase 5 closes before Phase 6 opens.
3. No fix dispatch before its row is accepted.
4. No commit before the human asks.
5. No promotion of a single-pass claim; it goes to S- candidates.
6. Flush after every decision point (`bugfix-swarm-handoff`).

**Stop rules.** A finding has enough passes at the Phase 4 convergence bar. A wave is done when
every agent returned or its transcript was harvested. The run is done when every bucket is
decided, every accepted row dispatched, coverage summary and decay reading written.

**Stalls.** An agent whose notification never arrives is harvested from its on-disk transcript
(`bugfix-swarm-handoff`, Harvest) before anything else. Re-dispatching first puts duplicates in the
ledger and blurs the convergence record. For a fix agent harvest is not enough — inspect the working tree
(Phase 8).

**Queued is not dead.** A queued agent has a tiny or absent output file and no terminal error —
under the concurrency cap that is the NORMAL state of a queued run, not death. Harvest rules that
conclude "died before editing" from a small output file produce false verdicts; the re-dispatch
built on them lands beside the still-queued original. Before declaring an agent dead: check its
launch receipt for a queue position, and check for a terminal error notification. Only a terminal
error (or a harvested transcript with no edit calls AND a completion state) is death. The
converse costs nothing: a re-dispatch made anyway with build-on-current-state instructions lands
idempotently and acts as a free review pass — but the ledger must record the duplicate so the
convergence record stays honest.

## State — what lives where, and when written

Context is disposable; these are not. Write timing is part of the contract.

| State | Home | Written when |
|---|---|---|
| Conclusions — findings with convergence records, decisions, refutations, coverage summary, decay reading | Registry (the workspace's kata tracker; `kata init` binds it if the project is not yet registered) | the moment of the decision, never batched. Created at the run's FIRST decision |
| Raw evidence — one report per pass | `scratch/<run>/reports/<pass-id>.md` | by each swarm agent, as its last act |
| Merged findings for this run, with merge manifest | `scratch/<run>/BUG_REPORT.md` | by the dedupe agent (Phase 5); durable conclusions promoted to the registry as decisions are made |
| Run state — agent IDs and status, prompt assignments, the standing preamble file, calibration rules, orchestrator self-verifications and dispute settlements, every human decision with margin notes and each note's routing, FLUSH blocks | Per-run ledger (`scratch/`, disposable) | on every dispatch, decision, note — as results land, not from memory |
| Terrain — orientation maps (AGENTS.md corpus or equivalent) | repo | read at bootstrap; edited by the orchestrator after a fix wave lands (Phase 8) |
| Fixes | working tree | uncommitted until the human asks |

Registry conventions (kata; set by the human 2026-09-27): the registry is the workspace's kata
tracker, not a file in the repo. Run `kata init` from the workspace before the run's first
decision if the project is not yet bound. Each finding becomes one kata ticket; its short ID
(derived from the issue's ULID) is the stable ID carried in the ledger, picker rows, and fix
prompts, and picker row IDs (`BND1`) are recorded beside the kata ID they decided. Dispositions
map to close forms: repaired → `kata close <id> --done --message <fix narrative> --evidence
reviewed-paths:<file>` (add `--commit <sha>` when the human asks for the commit — this replaces
the old in-place `FIXED <date>` marker, and closed tickets remain searchable as the regression
list); declined → `--wontfix` with the recorded rationale; refuted claims and entries never
offered to a picker → `--audit-no-change` holding the convergence record. Close each ticket as
its work is verified, never in a batch. Each run also writes one run-level ticket (closed at
Phase 9) holding scope, pass counts, adjudications, standing calibration rules, the coverage
summary, and the decay reading. The refuted set is permanent and grows monotonically — refuted
tickets are never deleted or reopened by later runs; each body carries claim, why refuted,
passes, and the bootstrap pass reads them as the do-not-re-chase list. The run-level ticket's
coverage summary names areas examined with which pass types; that is what turns a clean result
into verified absence within method coverage.

**Wielding kata** (verified against kata v0.18.0; worked example: the mira-OSS migration,
2026-09-27). Run from the workspace — `--workspace` overrides, `--project` picks another;
author resolves `$KATA_AUTHOR > $USER > git user.name`. Refs are short IDs derived from each
issue's ULID (`abc4`); cross-project `kata#abc4`; full 26-char ULIDs also resolve.

- **Bind**: `kata init` from the workspace (daemon DB at `~/.kata/kata.db`; `.kata.toml` is
  committed, `.kata.local.toml` gitignored). `kata quickstart` prints the agent contract;
  `kata health` checks the daemon.
- **Create**: `kata create "<title>" --body-file <f> --label <run> --label tier:<h|m|l> [--json]`
  — one ticket per finding, the run label on every ticket, tier label from the pinned severity
  scale; `--json` returns the short ID that becomes the stable ID.
- **Enumerate**: `kata list --label <run> --status open|all [--json]` — the bootstrap read and
  the what-still-stands check; `kata search`, `kata show <ref> [--comments]`, `kata events <ref>`
  read the audit trail back.
- **Close asserts completion.** Never close unverified work — instead
  `kata label add <ref> needs-review` + `kata comment <ref> --body "what was attempted, what
  remains"`. Close each ticket as its work verifies, never in a batch. Typed evidence is
  required: `commit:<sha>`, `test:<cmd>`, `reviewed-paths:<path>`, `external:<account>`,
  `no-change-audit:<text>`, `duplicate-of:<N>`, `superseded-by:<N>` (repeatable `--evidence`).
  `--wontfix` demands a substantive message (the daemon enforces ≥60 chars of rationale).
- **Narrate before closing**: root-cause and repair traces land as comments
  (`kata comment <ref> --body "ROOT CAUSE …"`, then `"REPAIR …"`) and the close message
  summarizes them — the trace lives on the ticket, outliving the run's scratch directory.
- **Correct**: `kata edit <ref> --title …` re-words; `kata label remove <ref> tier:l` +
  `kata label add <ref> tier:m` applies a verifier-corrected severity; `--priority` (0..4,
  0 highest) orders work.
- **Delete is for smoke tests only**: `kata delete <ref> --force --confirm "DELETE <project>#<ref>"`.
  Real findings are never deleted — refuted set permanence lives here. The daemon refuses
  parent-close while open children remain.

Per-decision writes are what make compaction survivable anywhere in the run. Continuity mechanics
are `bugfix-swarm-handoff`, mandatory here.

## Context tiers

Your context is the run's coordination state and must survive several compactions.
Raw evidence never enters it.

| Layer | Reads | Writes | Hands up |
|---|---|---|---|
| `swarm-investigator` (hunter, census) / `swarm-verifier` (primed, blind, adjudicator, tiebreak, recheck) | its assigned files, end to end | `reports/<pass-id>.md` | an envelope: report path plus counts (findings by tier, areas clean, disputes). Never report content |
| `swarm-dedupe` | every report file in the run | `BUG_REPORT.md` | one line: the report's path |
| Orchestrator | `BUG_REPORT.md`; source only to settle a narrow named dispute | ledger, registry, picker rows, fix prompts | briefs and pickers |
| Human | briefs and picker rows | decisions and margin notes | — |

The four agent types are global (`~/.pi/agent/agents/`), `prompt_mode: replace`, skills off, tools
unrestricted with write authority bounded by directive instead of allowlist — each needs `write` for
its report file. Each pins its own `model`: investigator and executor on the full model, verifier
and dedupe on flash tiers, matching the depth each role's work needs. Each definition pins its own
`thinking` default (human-set 2026-09-20: investigator high, executor medium, verifier medium,
dedupe low). Resolution per dispatch: explicit `thinking` parameter > pinned default > inherit
(agent-runner.js) — the pins set each role's baseline, dispatch parameters still override per pass,
which is how a blind framing pass runs deep while a mechanical census runs shallow.
Repair uses `swarm-executor` (Phase 8).

Neither you nor the human reads raw reports, and neither reads code to synthesize them. A
picker row is self-contained: the human decides from the row alone, and a row needing a file open
to understand is unfinished. You read source only where Phase 4 requires — a dispute
reducing to arithmetic or a 30-line read — and record what you found as an annotation in
`BUG_REPORT.md`.

Observed: 133 findings across 28 reports. They do not fit a context also holding queue position,
verdict tallies, note routings, and in-flight agent IDs across several compactions. Merging in a
dedicated context and handing up one file keeps orchestrator load flat as the wave grows.

## Administering waves with `SubagentWorkflow`

The user's request for a swarm run is the opt-in this tool requires — say so once in the kickoff
brief, never re-ask per wave. Scale gate: a 6-12 agent churn sweep needs no script; a 30-50 agent
census across several stages does.

**Script owns** fan-out and file plumbing: `pipeline(areas, hunt, verify)` with no barrier, so one
area hunts while the previous area's findings verify; refutation recheck as a `parallel()`
fan-out; dedupe as a final `agent()` call. Scripts pass **file paths, never report content**, so
the script's own context stays flat.

**Script does not own** judgment. Slicing, adjudicating disputes, deciding whether a census CLEAN
conflicts with a trace, and every picker stay in the main loop — a script has no filesystem and no
access to `checkbox_picker` or `questionnaire`, so a human gate cannot live inside one. The run is
segmented: script a wave, return, decide, script the next.

**Envelope by `schema`, payload by file.** Each pass returns a schema-validated envelope (report
path, counts by tier, areas clean, disputes) and writes its full report to its assigned path.
`agent()` returns null for a child that never answers through the tool — filter after every schema
stage.

**The journal is authoritative.** `<run id>.workflow.jsonl` holds every agent's actual return value
on disk; `resumeFromRunId` replays the unchanged prefix instantly. Stronger than transcript
harvest — a session restart loses nothing the journal lacks. Read the journal before claiming a
queue position, not your memory of notifications.

**Constraints that bite.**
- `Date.now()`, `Math.random()`, bare `new Date()` throw. Timestamps and the churn sweep's random
  untouched-area sample are computed in the main loop, passed in through `args`.
- A running workflow cannot be steered. A mid-wave calibration correction waits for the wave
  boundary; then edit the script's prompt-builder and resume. Completed agents keep old-preamble
  output, which Phase 5's retroactive-calibration rule absorbs. Size waves so corrections land
  between them.
- Concurrency caps at min(16, CPUs−2). A 28-hunter wave queues; the wave-land brief states counts,
  never a promised wall-clock.
- `isolation: 'worktree'` rejected: it puts each agent's changes on a branch, and Phase 8 requires
  one reviewable working tree with no commits.
- Save the script to `.pi/workflows/<name>.js`, invoke by name. The funnel shape is stable across
  runs even when the areas are not.

**Script format rules (learned 2026-09-20 — args propagation failed silently and voided a wave).**

- Bake run constants — the standing preamble, the run directory — into the script file as string
  literals. Never pass correctness-critical text through `args`: the args mechanism has failed
  silently once (every child received the literal string `undefined` as its preamble), and nothing
  in the launch receipt reveals it.
- Fail loud at startup, before any dispatch: throw if a baked constant fails its sanity check
  (e.g. the preamble lacks its severity-scale marker).
- Verify delivery after launch: spot-check a few child session files for the preamble header and
  the correct report paths before trusting a running wave. A launch receipt is not evidence of
  prompt delivery.
- Build prompts with deterministic in-script functions; finding IDs and report paths derive from
  the pass id, so the dedupe layer can enumerate the corpus from paths alone.
- Name labels `<role>:<passId>` and set `phase` per call inside pipeline stages — the global
  `phase()` state races under pipelining.
- Filter nulls after every schema stage; a child that never answers through the schema tool
  returns null, not an error.
- Byte-compare the persisted script copy against the edited file when resuming or re-launching —
  a stale persisted copy means the run launched an older text.
- Keep the script free of judgment: slicing, disputes, and pickers stay in the main loop. A script
  that ranks, groups, or resolves disputes has overstepped.

**`gate:` for repair verification.** Where a bucket's files share one verification command, script
the fix wave with `gate: '<command>'` per agent — non-zero exit marks the agent failed, command
output becomes the error. Live-verification doctrine made mechanical: verify by running, not by
asking the fixer whether it worked. A bucket needing per-file judgment stays plain dispatch.

**Model outage policy (set by the human 2026-09-21 10:08).** When a pinned model's backend is
unavailable, fall back ONLY within Lunaroute — its own alternate models are the sanctioned
substitutes (e.g. investigator pinned to glm-5.3 may ride deepseek-4.1-flash, both Lunaroute
routes). Never switch providers: OpenRouter or any non-Lunaroute provider incurs real billed cost
at swarm scale and is prohibited. If Lunaroute itself is fully down, stop the run and wait for
recovery — do not route around it.

## Run types

Agent counts are what past runs looked like, not budgets — scope sets the count.

**Churn sweep** — routine, every 1-2 weeks of active development.
- Scope: every area touched since the anchor, plus 2-3 untouched areas sampled at random (fights
  orchestrator-attention bias).
- Waves: hunters → primed verifiers on all findings → blind third passes on high-severity
  survivors → adjudicate disagreements → dedupe agent → slice by round → round pickers → fix waves.
  No refutation recheck — the refuted list is stable over a short interval; recheck quarterly.
- Observed: 6-12 agents.

**Full census** — quarterly, before releases, or on demand.
- Scope: the complete area taxonomy, re-weighted by the previous census's coverage summary. Areas
  clean under blind coverage get a rotation sample or a different instrument, not the same reading
  pass repeated — re-running an exhausted distribution returns nothing new (Phase 9). Churned
  areas and areas with prior findings get the full wave set.
- Waves: hunters → primed verifiers → blind third passes on all high-severity confirms +
  adjudicators on disagreements + verifiers for wave-discovered findings → refutation recheck of
  every claim killed this run AND a sample of the permanent refuted list (cross-time: old
  refutations are samples from an older model distribution) → dedupe agent → slice by round →
  round pickers → fix waves as each round closes.
- Observed: 30-50 agents. A first census of a ~90k-LOC tree ran 28 hunters, 21 verifiers, 4
  orchestrator self-verifications, 133 findings.

**Fix-verification micro-swarm** — after any remediation session.
- Scope: the fixed paths plus their callers and callees.
- Checks: the fix addresses the traced trigger, not the symptom; no neighbor broke;
  orientation-map bullets updated in the same commit (stale maps corrupt every future bootstrap).
- In doctrine-compliant repos prefer live path-probes over re-reading. This run type is where
  static analysis hands off.
- Observed: 2-4 agents.

## Phase 1 — Bootstrap (ordered)

1. Read the registry — the workspace's kata tracker (`kata init` first if the project is not
   bound): open tickets via `kata list`, the refuted set via closed `--audit-no-change` tickets,
   and the last run's run-level ticket for coverage summary and standing calibration rules.
2. Establish the anchor — the date of the last run's run-level ticket. No previous run means
   first census: no anchor, full map build.
3. Rebuild the map from change, not scratch: `git log --stat --since=<anchor>`. Areas touched
   since the anchor are hunt candidates; untouched areas are rotation samples.
4. Ask the three kickoff inputs below, recommending a run type from the churn picture just built.
   If the human's choice contradicts the data, say so before dispatching anything.
5. Distill the exclusion payload: every open finding and refuted claim compressed to one line,
   grouped by area. Never feed full registry entries to hunters — an exclusion list not scoped to
   the assignment is noise the agent must filter. Known-open findings become "known; check whether
   it changed or got worse," not "re-report."
6. Read the terrain: the repo's orientation maps. Any in-scope directory with no map gets a
   parallel Explore pass to build one before it is hunted.

### Kickoff inputs — the only upfront questions

Ask with `questionnaire`; record each answer in the ledger and the run section's header.
Everything else the human decides arrives later as prepared rows and notes — never as a question
asked before the funnel has produced the material to decide on.

1. **Run type** — or an anchor-date / scope override.
2. **Stakes tier** — decides whether blind third passes run at all.
3. **Calibration changes** — "we now support X, so assumptions about not-X are findings." These
   become standing preamble text in every prompt this run issues.

Model is not a kickoff input. Each agent type pins its own; changing the roster is an edit to
`~/.pi/agent/agents/`, not a per-run decision.

Exit gate: anchor recorded; churn mapped to areas; three inputs recorded and kickoff brief sent;
exclusion payload distilled; calibration rules current; **model gate verified** — every agent
definition's pinned model resolves against the harness's enabled-model gate BEFORE any dispatch
(a pinned-but-disabled model kills an entire wave silently, observed 2026-09-21: all 201
verifiers rejected at the gate, discovered only at wave-failure time).

### Census frontload kit (first census in a repo — factory steps, not deliberation)

A first full census needs none of its bootstrap to be novel. The mechanical steps, in order,
each one command or one template fill:
1. **Model gate check** (above) — first, cheapest, prevents the silent wave death.
2. **File-assignment table**: one composed enumeration (`find` over source extensions) buckets
every file by the census facet taxonomy below — that IS the area decomposition for a first run;
no per-directory reading required to launch.
3. **Hazard-enumeration recipe library**: the recurring composed commands are stable across
runs — spawn/contextvar propagation (`rg "Thread\(|run_in_executor|copy_context"`), unbounded
waits (`rg "\.result\(|Queue\(|wait_for"`), sanctioned-path violations (`rg "datetime\.now\(|getenv|open\("`),
publish/subscribe inventory, check-then-act read-then-write pairs, except-and-continue sites,
dual-write sequences, derived counters, singleton mutable attributes, string-patching in
installers. Each mechanism hunt starts from the pre-run enumeration instead of deriving it.
4. **Workflow script template**: the wave shape (pipeline areas → hunt → primed verify →
blind/recheck → dedupe, envelope schemas, preamble-baking rules) is run-stable — keep a filled
example per harness and slot in the area list and preamble. Sanity-check strings must
byte-match the preamble (a paren in the check string killed a launch, observed 2026-09-21).
5. **Pilot shrinks with a battle-tested preamble**: with a preamble already calibrated by a
previous run, the pilot is a one-agent smoke test (delivery, schema, report path), not a
four-hunter calibration batch.

## Phase 2 — Decompose

For census runs and new codebases, decompose by MECHANISM — a systemic pattern whose instances the
codebase can name (destructive-consume pipelines, external-content ingestion boundaries, event-bus
wiring, contextvar flow, credential plumbing, dispatch routes, persistence write paths,
async/thread boundaries) — not by directory listing and not by line count. Build the mechanism
list from three sources: (1) the repo's own preventive-mechanism rules and map corpus — each
sanctioned mechanism is a hunt candidate, because sanctioned mechanisms are exactly where
violations recur; (2) the registry's historical finding families — every confirmed family seeds a
hunt; (3) the enumerations, run FIRST, whose instances are pre-binned and attached to mechanism
hunts as starting points.

Assign each mechanism one of three instruments:

- **Area scope** (file set) — the mechanism has a home subsystem. End-to-end reads; produces the
  verified-clean coverage list.
- **Question scope** (enumeration) — the mechanism is a repeated act with no home. One composed
  command closes the class; its instances feed the hunt.
- **Seam scope** (pair) — the mechanism is a disagreement at a boundary contract. One agent per
  CONTRACT, not per point; both sides read deliberately shallow; the deliverable is a contract
  check, not a findings count. Deepen a found disagreement via the verification layer, not
  in-channel.

A complete census covers at minimum these facets:

- Entry surfaces (HTTP/WS transports, schedulers and triggers, background jobs)
- The orchestration core (request / turn / event flow, state machines)
- Persistence (repositories, caches, transaction boundaries, dual-write consistency)
- External boundaries (provider clients, dialects, credentials, vault and secret handling)
- Multi-tenancy seams (user-context plumbing, isolation enforcement at every spawn)
- Async and threading (every `Thread(`, executor, contextvar crossing; locks and TTLs)
- Prompt-as-contract surfaces (anything an LLM reads or writes — templates vs parsers)
- Config and lifecycle (singletons, import-time effects, boot gates)
- Auth surface (sessions, tokens, races between lifecycle operations)
- Deploy and install path (scripts vs schema/seed consistency, documented vs actual)
- Frontend protocol client (frame inventory, state machines, sink reachability)
- Scheduled and background cadences (gating arithmetic, timezone, job overlap)

Exit gate: every mechanism has a name, instrument, and file/contract/instance list; the
enumerations have run and their instance ledger is built; the seam inventory is built from
composed per-family commands — each publishing its own CLOSED/WEAK bound — and kept as a
maintained artifact. Churn sweeps and micro-swarms inherit their scope list from Phase 1 step 3
or the prior fix set.

## Phase 3 — Hunt

Prompt construction, preamble template, pass design, and voice are `swarm-orchestration`. This
phase is sequencing.

1. Build the wave from the run type's scope: one `swarm-investigator` per mechanism scope — area,
   question, or seam (pair).
   hunt.
2. **Write the standing preamble to a file** (`scratch/<run>/preamble.md`), quoted verbatim in
   every prompt. It carries: reportable classes stated positively; doctrine exclusions, each with
   its boundary drawn and the reportable side named; the evidence bar and anti-noise rule;
   known-fixed and known-open territory; a pinned severity scale; method and output schema.
   Unpinned severities are how 28 agents produce 28 scales, and dedupe then compares noise.
3. **Write each assignment as a complete problem statement before dispatching** — files, neutral
   question, exclusion payload, calibration rules, evidence bar. Assign files to read, not patterns
   to match: an agent handed a pattern returns a pattern-bounded report, blind to the defect living
   between the matches. Where the question is enumerable, say so and ask for the command that closes
   it — enumeration and full reads are complementary. An assignment you cannot state unambiguously
   is not ready to send: read the code, or carry the question to the human at the next gate. Never
   hand an agent an ambiguity to work out in context. A hunt that receives enumerated instances
   from the ledger must disposition each one in its report — finding / examined-clean /
   out-of-scope-with-reason; un-dispositioned instances are a coverage hole.
4. **One fixed report schema for every pass, written to a file.** Each pass writes
   `scratch/<run>/reports/<pass-id>.md` — path derived from its label, so the dedupe agent can
   enumerate the corpus — and returns only its envelope. Uniform reports are what make the funnel
   mergeable and keep orchestrator load flat as agent count grows.
5. Pilot batch — 3-4 hunters on the single highest-churn area. Compare output to intent:
   exclusions holding? read depth real? evidence bar applied? schema filled completely? Fix the
   preamble file, then queue the rest. Every calibration rule worth adding arrives after batch 1.
6. Fire-and-forget the full wave in background. Never block on a result not yet needed.
7. Notate envelopes to the ledger as they arrive, and **annotate convergence while the detail is
   hot**: when a second or third pass lands the same root mechanism in an unrelated area, write
   "same root pattern as <ID>" on both entries then — not at slice time, when the first instance
   has gone cold. Late or duplicate notifications for already-notated agents are noise; the ledger
   and workflow journal decide what is pending, not the notification stream.
8. A human correction **edits the preamble file, is steered to agents still in flight, and rides
   in every later prompt.** A rule reaching only the next batch leaves this one producing findings
   the rule already excludes. Role requirements stand in the agent definitions; a run-specific rule
   stands only in the preamble file, because no agent carries it between invocations.

Cross-cutting hunts that pay regardless of area: enumerate every spawn, check context
propagation; enumerate every dual-write, check atomicity; every documented contract against its
implementation; every error path — does it misreport. **These are shell assignments.** Each asks
for an exhaustive enumeration built from composed commands over the tree — `rg`, `find`, `awk`,
`git log -S`, a checked-in schema or seed file read as text — and the report returns the command
beside the table. One composed enumeration closes a hazard class and shows its own bound; agents
reading file-by-file find instances but can never tell you the class is closed.

**Instruments, by job.** The obvious ones — git, rg, grep, find, curl, jq, awk, psql, sqlite3,
docker, ssh, python3 — are assumed. Worth keeping in reach:

- Structural search and rewrite (shape, not spelling): `ast-grep scan --rule`, `--json=stream`,
  `--debug-query=ast`, `tree-sitter parse`, `semgrep --config p/python --json`, `libcst`,
  `universal-ctags --output-format=json`
- Set comparison and tabulation (contract drift, documented vs actual): `comm -3`, `uniq -d`,
  `diff <(…) <(…)`, `mlr`, `xsv`, `gron`, `jq -s 'group_by(…)'`, `pg_dump --schema-only`
- Reading a diff, for the read-every-diff gate: `difftastic`, `delta --side-by-side`,
  `git diff --word-diff-regex='[^ ]+'`, `icdiff`
- git features that are not obvious: `git log -S<literal>` and `-G<regex>`,
  `git log -L :func:file`, `git blame -w -C -C -C`, `git grep <pat> <rev>`, `git add -p`,
  `git apply --check --3way`, `git worktree add`, `git restore`
- Prompt and container contracts (the XML-like interpolation class): `xmllint --noout`,
  `xmlstarlet sel` / `val`, `shellcheck`, `bash -n`, `shfmt -d`
- Wire and protocol probes: `websocat`, `socat`, `openssl s_client -starttls imap|smtp`, `swaks`,
  `mitmdump`, `valkey-cli` (`TTL`, `SCAN`, `MEMORY USAGE`, `EVAL`)
- Runtime observation (hung worker, leaked fd, pinned socket): `py-spy dump` / `record`, `dtruss`
  on macOS or `strace -f -e trace=network,file`, `lsof -p` / `+D`, `fs_usage`, `procs`
- Measured claims instead of adjectives: `hyperfine`, `radon cc`, `tokei`, `scc`
- Supply chain and secrets: `osv-scanner`, `pip-audit`, `gitleaks`, `trivy`
- A bound on every probe: `timeout` / `gtimeout`, `node --check`, `py_compile`, `pyflakes`,
  `pyright --outputjson`, `tsc --allowJs --checkJs --noEmit`

Two collisions: `sg` is also the POSIX set-group utility, so scripts invoke `ast-grep`; `-U` means
multiline in `rg` and `--update-all` — a destructive rewrite — in `ast-grep`, which has no
`--stats` (count with `--json=stream | wc -l`).

**A zero from a structural search is not a clean result.** Rules are shape-exact. A relational
rule missing `stopBy: end`, or a metavariable in a position the parser rejects, returns zero
matches and looks exactly like a clean tree. Before believing any zero, confirm the rule matches
one site you know exists — the reason the pilot batch exists. A malformed rule fails loud; a
wrong-but-valid rule fails silent.

Exit gate: preamble file written and quoted verbatim; every assignment unambiguous at dispatch;
preamble adjusted from pilot output; full wave queued; every pass writing its own report file;
ledger receiving envelopes.

## Phase 4 — Verify

Two jobs: kill hallucinated findings, catch what the hunters missed. Not a formality before a
picker. Verification passes run as `swarm-verifier`, write report files, and return envelopes as
hunters do.

- Every finding gets a primed verifier. High-severity survivors — and anything the human will act
  on — also get a blind third pass: a primed verifier checks faithfully *inside* the claim's frame,
  inheriting its arithmetic slips and wrong code paths.
- **Complete coverage before verification concludes.** Diff the files all hunts traced against the
  tree; files nothing traced get one residual pass each ("no mechanism reaches here — what breaks
  locally?"). Un-dispositioned instances in the ledger are a coverage hole until a hunt disposes
  them.
- **Convergence bar:** two passes agreeing, at least one not sharing the claim's frame, before a
  finding may reach a decision. Single-pass claims go to S- candidates marked "needs one more
  pass" — neither promoted nor killed on one sample.
- **Independent convergence meets that bar.** One defect reached by two hunters from different
  assignments is two frame-independent samples: record it skip-verified with both IDs. Convergence
  between passes handed the same framing counts for nothing. A seam finding is frame-disjoint from
  any area finding at its endpoints — cross-channel agreement on a seam mechanism satisfies the
  bar directly. It settles existence, not shape — a
  blind pass on a converged finding still returns added mechanisms, earlier failure sites, severity
  corrections, so run one wherever the repair's shape depends on them.
- **Enumeration-decidable claims you verify directly** — an absent pragma, an absent
  literal, a missing auth dependency, a seed row that does not exist. Record as a self-verification
  pass: it counts, and your own read is the decisive artifact rather than an agent's summary of it.
  The converse fails — what a file *does* is settled by reading it, not grepping it, and a negative
  claim bounded by a pattern states its bound (`swarm-orchestration`, Mechanics).
- **A verifier's report is not yes/no.** It returns corrections, refuted sub-claims, added
  mechanisms, fix-direction constraints — fields owned by `swarm-orchestration`. Those rewrite
  the finding, not annotate it; a blind pass routinely returns more than it was asked to check.
- **Confidence per component, not per finding** — traced on mechanism, suspected on trigger,
  unproven part named. Latency (path exists, nothing calls it) is its own marker, separate from
  frequency. A real defect in a documented-orphaned file is a ledger note, not a picker row.
- Side discoveries ride the same schema and enter the funnel where hunter findings do — deduped,
  ledgered, sliced — never appended to a picker as an afterthought.
- Refutations are samples too. In a census, recheck every claim killed this run plus a sample of
  the permanent refuted list. An overturn is recorded with evidence; the prior entry stays visible.
- Disputes: identify the decisive artifact, not "who is right" (`swarm-orchestration`). One
  reducing to arithmetic or a 30-line read is yours to settle — read it, stop delegating. One the
  code cannot settle goes to the human.
- **A census CLEAN never refutes a named trace** (`swarm-orchestration`, Dispute resolution 5).
  Re-check the conflicting site by priority; record the conflict as a coverage caveat.
- Severity and frequency are verifier-corrected, never hunter claims. Record pass disagreements;
  never resolve them silently.
- Orchestrator self-verifications and dispute settlements go to the ledger as annotations and to
  the dedupe agent as input, entering `BUG_REPORT.md` labeled orchestrator-decided.

Exit gate: every pass has written its report file; every finding carries a verdict and the material
for a convergence record — passes and their types (blind / primed / convergent / self-verified),
final tally, decisive evidence; refuted claims recorded with reason and passes. That record lets
the human audit your judgment instead of trusting it.

## Phase 5 — Dedupe (a dedicated agent, not the orchestrator)

One `swarm-dedupe` agent whose whole job is the corpus: reads every report file in
`scratch/<run>/reports/`, merges, writes `scratch/<run>/BUG_REPORT.md`, returns one line — the
report's path. You read that file and nothing else.

Corpus too large for one context (measure the reports directory; Observed: the last census ran 28
reports and 133 findings) → dedupe in two levels: N agents over disjoint report subsets each writing
a partial merge, then one agent merging the partials. Record which level ran.

**The dedupe agent's brief carries these rules:**

- One entry per defect: same site plus same mechanism is one entry, whatever the wording, whoever
  reported it, however many passes reached it. Same-site seam and local findings are NOT
  duplicates — a seam finding's frame is the boundary contract, not either module; carry
  edge-anchored provenance (boundary class + contract name + endpoint symbols). The
  convergence record carries the multiplicity,
  naming each pass type; the entry does not.
- Keep distinct defects at one site separate. Two mechanisms in one function are two entries —
  merging them forfeits the ability to accept one and decline the other.
- Apply current calibration rules to every entry, including entries from an older preamble
  revision. Drop what a now-standing exclusion covers, and list the drop.
- Carry per entry: verifier-corrected severity and frequency, confidence per component, latency
  marker, provenance, any fix-direction constraint a verifier recorded.
- **Publish a merge manifest** — every input entry with its disposition: kept, merged into <ID>,
  dropped by rule <n>, or novel. An over-merge is otherwise silent, and a finding vanishing
  between reports and picker is unrecoverable.
- Carry verified-clean surfaces and any census caveat that bounded a clean verdict.
- Do not slice, rank, group, or recommend. The report is merged evidence; grouping is Phase 6, the
  orchestrator's.

**Write everything before slicing anything.** Phase 6 begins by reading `BUG_REPORT.md`. A
bucketing assembled from memory is a bucketing of whichever reports were most recent, most
dramatic, or most recently argued about.

Exit gate: `BUG_REPORT.md` written and read by the orchestrator; merge manifest accounts for every
input entry; nothing grouped yet.

## Phase 6 — Slice into buckets

Separate from Phase 5, strictly downstream. Begin by reading `BUG_REPORT.md` — not by recalling
reports, not by opening the report files behind it.

- Slice by defect class — the defect's family and its repair's shape — into the round that
  consequence assigns. Within a round a bucket is one of two shapes: one mechanism tree-wide, or
  one subsystem's remainder. A bucket must be answerable as one decision: one systemic fix, one
  accepted pattern, one decline rationale.
- A site whose defect family differs from its neighbours moves to its family's bucket.
- Convergent findings in unrelated areas sharing one root mechanism → **one systemic entry**
  closing them all, sites kept as members. The human decides one repair instead of N site patches,
  and the systemic row is where a consolidation also closing an implausible-trigger sibling
  becomes visible.
- One bucket = one picker = one registry category (registry titles them `CATEGORY C1`). 5-25 rows;
  split larger buckets, ask in sequence.
- Write the slice down — bucket names, member entry IDs, one-line defect class per bucket — before
  drafting any picker. On paper it is reviewable, and a re-slice after a human note is a file edit
  rather than a re-read of every report.
- Slice into rounds: round 1 — egregious (data loss, security, cross-user) plus informs-downstream
  findings other pending fixes build on; round 2 — consistency (convergent-path divergence, missed
  conventions, wrong order of operations, workarounds); round 3 — polish (stale docstrings,
  best-practice nits), opt-in, skipped unless the human asks. Round 1 first: the human's scarcest
  attention goes to the highest-stakes decisions, and the round teaches the codebase's real
  failure modes, sharpening judgment for the rest.
- The rounds filter: each round's decisions remove its findings before the next round sees them.
  Fix ground truth before aligning anything to it — consistency work against a moving target is
  waste, and round-1 decisions cannot be invalidated by later rounds.
- Within a round, tree-wide mechanisms first, sub-module instances after — the mechanism fix
  closes the instances, and the sub-module pass sees only what is genuinely local. Systemic-first
  applies inside a round.
- Say the round order and the bucket sequence in the wave-land brief: the human should know what
  is coming before the first picker arrives.

Exit gate: every ledger entry in exactly one bucket, or explicitly unfiled with a reason; slice
written to the ledger; bucket order stated to the human.

## Phase 7 — Decide (the per-bucket picker)

**Instrument.** `checkbox_picker` when the answer is a subset — which rows to act on.
`questionnaire` when it is one mutually-exclusive choice — which approach. Never put
approach-level options inside a picker: the selection is the strategy, and checking every row
means "do all of them."

Rows come from `BUG_REPORT.md`, your only findings source, each self-contained per
Context tiers.

**Row anatomy.**
- `id`: 3-6 chars, returned verbatim in the selection, identical in picker, ledger, registry, fix
  prompt — the join key.
- `label`: about eight words, the scannable line.
- `detail`: newline-separated labeled fields, one fact per line:
  `Location:` file:symbol (edge-anchored for seam findings: boundary class + contract + endpoint
  symbols). No line numbers (symbols outlive them).
  `Mechanism:` what actually happens, in operational language — paint the failure picture
  ("the guard is inert on every run and the failure is silenced"), not the code's shape
  ("non-dict payload", "invariant unenforced"). Same facts, different carrier: the reader
  decides from the picture.
  `HOW:` the concrete change — **one approach, never an inline OR.** If the evidence supports two
  materially different repairs, the orchestrator resolves it before drafting (pick the one the
  verifier's fix-constraints favor, and say which) or promotes it to a questionnaire row — an
  OR in a checkbox leaves the implementer's choice to chance.
  `WHY:` the consequence it prevents or property it restores.
  `Frequency:` REQUIRED on every row — common path / plausible in normal operation /
  coincidence race / environment-armed / latent, plus the concrete trigger in one phrase
  ("re-run with changed password", "occupied port at install"). A row whose frequency cannot be
  grounded is not ready to present.
  The HOW/WHY pair flows verbatim into the fix prompt — HOW binds the fixing agent's approach,
  WHY anchors the repair to the point of the change.
- **Severity and frequency, separately.** Severity is consequence. A high-consequence
  finding with an implausible trigger is presented as exactly that, both facts on the row —
  whether it clears the bar (hygiene fix, registry entry, drop) is the human's call. A dramatic
  failure mode is not a likelihood claim; a speculative premise with no demonstrable benefit is a
  rejection, not a finding.
- **Provenance** on every row depending on a trust boundary: external / verbatim-user /
  internal-model-authored. Unstated provenance pushes the trust classification onto the human.
- **Dependencies**, stated on both rows: if one row's reachability depends on another's
  disposition, say so ("deciding this row down logically drops <ID>"). Independent toggles over
  dependent rows produce an incoherent set and a repair the other decision voids.

**Picker shape.**
- `summary`: 2-5 lines, plain and factual — what the code does correctly, how many sites deviate,
  verification status. No framing language.
- Rows arrive pre-grouped by Phase 6's slice. Do not re-sort at presentation; if the slice is
  wrong, re-slice the file and re-present.
- One picker = one mental model: one mechanism across the tree, or one subsystem's remainder.
  Never rows from unrelated corners — disjointed rounds waste the human's context on
  re-orientation.
- Shared context once in the section `context`, never repeated per row. Tiers in broad strokes.
- Timestamp the decision point.

**Margin notes.** Every note is binding, taking exactly one of six routes:

| Type | Signal | Route |
|---|---|---|
| Acknowledgment | praise, no directive | none |
| Premise challenge | questions reachability or provenance | answer by writing the trigger out — precondition, window width, what must coincide — and concede plainly when the human is right; may refute a finding several passes confirmed |
| Rejection + redirect | refusal plus a proposed alternative | record the refutation; check whether it names a different defect at the same site, re-file the row accordingly |
| Comprehension question | did not understand the wording | the detail text was unclear — answer plainly, re-offer once |
| Implementation constraint | names a location, mechanism, ordering | bind it to the fix |
| Intent rationale | explains why the code stays as it is | candidate for a persisted code comment |

**Propagation.**
- A refuted premise is dropped. Never re-offer at lower severity, never in new words. One
  exception, offered once: a differently-framed repair at the same site whose rationale stands
  without the refuted premise — a hygiene fix, a consolidation also closing a second entry. That
  row states the rationale it rests on.
- Answering a premise challenge is where frequency finally surfaces, because it was never on the
  row. Write the assessment honestly, invent no numbers, let the concession stand.
- A calibration rule learned from one note applies retroactively across the already-accepted set:
  apply it, report the cleanup once, do not re-ask row by row.
- Unchecked row with a question note is deferred, not rejected. Unchecked with no note is a
  decline — record it without inventing a reason.

**Persisted code comment** — all three must hold: the site is not changing (a fix removes the
need); a reader without this run's reasoning would re-flag or "fix" it; the reason is
site-specific (one that generalizes belongs in the directory map or doctrine file). The
refutation enters the registry's Refuted section in every case.

Exit gate: every row decided and in the registry with convergence record and note outcome; every
note routed; new calibration rules in the standing preamble before the next picker; FLUSH block
appended.

## Phase 8 — Fix waves

Dispatch a bucket's repairs the moment its picker returns, in background, then put the next
bucket's picker up. Repairs and human review run concurrently by design.

**Dispatch.**
- One `swarm-executor` per file, files disjoint across agents. Group rows by file, not tier.
  Seam repairs are the exception: both sides of the boundary go in ONE executor's prompt —
  splitting a seam repair across executors ships a half-fix.
- Each fix prompt as prepared as a hunt assignment: no ambiguity left for the agent to settle in
  context.
- A fix agent editing a file a running verifier is reading: confine the edit to the named
  functions, record the overlap in the ledger. Verdicts on the *other* functions stay valid; a
  verifier citing post-fix code as "missing" is reading a moved target — discount that clause,
  keep the rest.
- No commits unless the human asked. Changes stay in the working tree for review.

**Every fix prompt carries:** the verified defect with its evidence; the row's HOW/WHY pair
verbatim; the sibling pattern to mirror, naming the exemplar file; an explicit out-of-scope list;
the repo's verification requirement — live execution of the changed path with hostile input,
reported EXECUTED or UNVERIFIED. No mocks, no test files, no simulation.

**Terse-brief shape (default for all executor prompts).** Executors die on long investigations
followed by long final outputs — the observed failure mode (2026-09-25 run: three agents lost to
output-limit deaths on single assignments). The countermeasure, validated on the same run: name
the exact functions/line regions to read (grep first, then reads ≤120 lines), forbid full-file
reads of large files, cap the report length (<40 lines), cap the final message (≤5 lines), and
forbid narrated investigation steps. A terse-brief executor that died at 54k tokens completed the
same assignment in 14k tokens and 73 seconds.

Verify an API contract at its call site, and the necessity of each enumerated edit, before
instructing agents: a signature quoted from memory propagates one error into every prompt quoting
it, and a multi-edit change set missing one required edit ships a half-fix no agent could have
known about.

**Review.**
- Read every fix diff. Same-hazard extension inside the named function is accepted — an agent also
  escaping the fourth sibling branch did the job properly. Anything outside the out-of-scope list
  is reverted or taken back to the human.
- An UNVERIFIED report names the probe that would cover it and what blocked the run ("full IMAP
  path not exercised — no live mailbox"). Verification state travels with the change into the
  registry and close brief.
- **A dead fix agent is not a rollback.** Inspect the working tree before re-dispatching: edits
  may be complete, partial, or absent, and only the tree says which. Compile what is there, review
  the diff, dispatch the verification the agent owed — never a second blind edit pass.

**Orientation maps.** Fix agents never touch maps. Once a bucket's fix wave lands and before
anything commits, you edit maps: for each file the wave changed, read its directory
map and ancestor maps; test each map claim against post-fix code; edit only statements now false
or that would materially mislead a fresh session when the map auto-loads. One edit per false
statement — no elaboration, no coverage notes for details the repo-wide rules already cover. Map
edits ride in the same commit as the triggering change.

Exit gate: every accepted row dispatched or explicitly deferred in the ledger; every fix diff
read; each fix recorded EXECUTED or UNVERIFIED with covering probe named; map claims tested for
every changed file; nothing committed unasked; FLUSH block appended.

## Phase 9 — Close the run

1. Read the registry back: every decision ticket closed with the right form, every refutation
   recorded, nothing decided left open. They were written as they happened — this is verification,
   not a batch write.
2. Write the **coverage summary** from `BUG_REPORT.md`'s verified-clean list and census caveats:
   areas examined with which pass types, verdicts harvested versus outstanding, and the two clean
   lists kept separate. **Refuted** holds claims that entered the funnel and were killed, with
   mechanism and passes. **Verified-clean** holds surfaces examined and found correct, including
   candidates an agent self-refuted before reporting and any census caveat bounding a clean
   verdict. Both make "clean" auditable; only the first is a do-not-re-chase entry.
3. Write the **decay reading** — counts by severity tier, and the fraction of findings
   churn-adjacent versus found in untouched code — then act on it. Read the run's own failures
   against the published multi-agent failure taxonomy (MAST, arXiv:2503.13657 — specification
   failures, inter-agent misalignment, task-verification failures); a recurring mode names the
   next instrument change.

| Signal | Action |
|---|---|
| Yield mostly minor/low, no highs | Reading distribution depleted. Change instrument — live probes, adversarial red-team, concurrency or load scenarios — instead of scheduling more static runs |
| Previously dirty areas come back clean | Record as verified absence; extend the next interval for those areas |
| Old refutations overturn in cross-time rechecks | Model distribution improved. Worth one full census with fresh eyes on "settled" areas |

4. Send the close brief: coverage, decay reading, fix and verification state, open items — and the
   human's decision on whether another round is warranted.

Exit gate: registry section closed; final FLUSH block marks the run complete.
