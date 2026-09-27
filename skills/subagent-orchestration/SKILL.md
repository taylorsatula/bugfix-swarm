---
name: subagent-orchestration
description: "Protocol for delegating work to subagents — what to keep for yourself, how to set a pass's information state, proven prompt language, dispatch and ledger mechanics, and dispute resolution. Organized by moment of use: design the pass, write the prompt, dispatch, receive, resolve disagreement. Load whenever delegating nontrivial work to subagents, planning a multi-pass review or audit, verifying another agent's claims, or running any task where a wrong-but-confident agent answer would be acted on. The bug-hunt runbook that drives these mechanics end to end is bugfix-swarm."
---

# Subagent Orchestration

## Objective

Subagent output is a probabilistic sample, not an answer. Agents are excellent at exhaustive,
tireless tracing and terrible at knowing what question they should be answering. Your job is
engineering, per pass: what the agent knows, what standard the output must meet, what would
falsify it — and never letting any single pass, in either direction, be the last word.

## Five principles

Everything below is one of these applied.

1. **The task implies its own success.** "Find X" tells the agent X exists, and agents
   manufacture deliverables to satisfy a request. Counter it explicitly — null-result permission
   plus a self-refutation step in the prompt.
2. **Independence is an information-design property, not an agent property.** Two agents handed
   the same framing are one sample with a rounding error. What you tell versus withhold defines a
   pass's independence.
3. **Primed passes validate details; blind passes catch framing errors.** A verifier told the
   claim checks faithfully *inside the claim's frame*, inheriting its arithmetic slips and wrong
   code paths. Only an unprimed pass can catch that *your* framing was wrong. Anything you will
   act on needs at least one pass that doesn't know what it's looking for.
4. **Refutations are samples too.** A "not a bug" verdict from one pass deserves the same doubt
   as a confirmation. Symmetric skepticism.
5. **The overseer holds the map, the state, and the standard.** Coverage is bounded by your map of
   the domain; agents never choose what to examine.

**Non-delegables** — principle 5 enumerated:

- The map: what areas exist, what files belong where, what to examine.
- The question form per pass: blind or primed, verdict-level or mechanism-level.
- The evidence bar and calibration rules — negotiated with the human, encoded per prompt.
- Noticing: convergence, contradiction, and dispute are visible only at the layer holding all
  reports.
- Dispute triage: which resolution mechanism, or none.
- Stopping rules: when a finding has enough passes, when a wave is done, what enters the artifact.
- Synthesis. Never write "based on the findings, fix it" into a prompt — what the evidence means
  is not delegable.

## 1. Design the pass

Choose the information state before writing a word of prompt.

| Pass | Told | Use | Limitation |
|---|---|---|---|
| Blind hunter | files + neutral question | discovery | lower yield per question |
| Primed verifier | claim + files | detail validation | inherits the claim's frame |
| Blind third pass | files + question, target withheld | framing-error catch; run wherever a wrong frame would produce a wrong repair | misses detail-level slips a primed pass catches — pair them |
| Adjudicator | both accounts, no verdicts | split settlement | must NOT be given the parties' frame — demand the mechanism |
| Tiebreaker | the decisive mechanism question | 2:2 splits | see Dispute resolution |
| Recheck | allegation, no verdict disclosed | testing refutations | refutations need samples too |

Wave structure that worked on audits: hunters → primed verifiers on every finding → blind third
passes on high-severity survivors + adjudicators on disagreements + verifiers for discoveries →
recheck wave on all refutations. Scale to stakes; the full structure is for consequential audits,
not casual lookups.

- **Redundancy versus coverage is a decision.** Two blind agents finding the same thing is
  validation — keep it and record the convergence. Two agents re-reporting a finding already in
  the ledger is merge noise — add explicit do-not-re-report lists to later prompts.
- **Pilot before scale.** Small first batch, compare output to intent, fix the preamble, then
  launch the rest. Every calibration rule worth adding arrives after batch 1.
- **Codify human feedback immediately.** A user correction becomes standing preamble text within
  one batch. An agent carries nothing between invocations: a run-specific rule stands only in the
  preamble quoted into every prompt, and a role requirement only in the agent definition.

## 2. Write the prompt

### Voice

- Flat, declarative, imperative — briefing an expert colleague with no context. The prompt is the
  first sample of the output you're requesting; write in the register you want back.
- Every content word is a pointer (`file:symbol`) or a rule. Fuzzy nouns force the agent to
  resolve abstractions, wrongly if unlucky.
- Stance, not personality. Role framing ("you are an independent verifier; do not assume the claim
  is correct") changes behavior. Urgency and motivation do not.
- No dramatic prose. It isn't only filler — it blurs traced and imagined, for you and for any agent
  seeded from your prose.
- Imperatives close interpretation space; hedged instructions license vague output. Ask FOR hedges
  in the output contract, don't GIVE them in the method.

These govern skill and agent-definition prose as well as prompts. Three conventions the corpus
follows:

- **Indicative is normative.** A statement in the timeless present — "a row needing a file open to
  understand is unfinished" — is a requirement, not an observation. Empirical content carries an
  `Observed:` tag. Where an obligation could read as a description, write `must`.
- **Second person for the reader acting now; third person only across a boundary.** "You read the
  ledger" when the reader acts this turn; "the orchestrator" when the statement is about the role as
  an abstraction, a predecessor, or a successor — "the resumed orchestrator is a primed pass on its
  predecessor's artifacts." Exit gates and table rows stay third person: they describe end-states,
  not actions.
- **Two settings, chosen by what the reader needs.** Condensed — block language, no copula frames,
  juncture punctuation carrying the subordination — for gates, rules, tables, and checklists:
  anything read at speed mid-run. Loose — finite causal clauses, subordination restored — where the
  reader has just lost context and needs a state model explained. Drifting between them is the
  defect, not mixing them: a loose sentence inside a rule list reads as a hedge, a condensed one
  inside an explanation reads as a gap.

### The proven preamble template

Same preamble for every pass in a wave — comparability beats cleverness. Vary only the assignment.
Adapt the bracketed parts; leave the structure alone.

```
You are doing a read-only <TASK> in the repo at <PATH>. Do not modify any file.

Reportable <DELIVERABLE>: <precise definition — what counts, in positive terms>.

Not reportable:
- <surface concerns: style, naming, missing tests, preferences>
- <intentional/known decisions, listed explicitly WITH the boundary drawn>:
  e.g. "<X mechanism> is intended — do not report the mechanism itself; code
  that <violates X's precondition> IS reportable."
- Speculative <situational> risks UNLESS you can point to a concrete current code path
  that already misbehaves. Max 2, in a separate "Design risks" section.
- <domain-specific noise you know will otherwise fill the report>

CALIBRATION RULE (strict): <the evidence bar>. Reachability alone is not the bar — the
swarm-investigator definition's Judgment section prices every candidate (who causes it, what it
costs); a run preamble may narrow the bar with run-specific exclusions, never loosen it. E.g.
"reachable by code in the tree today, and a defect a working engineer would stop and fix today."
EVERY finding names its concrete runtime trigger path (who causes it, what must coincide) —
a finding you can only describe as a code shape ("non-dict payload", "unvalidated form") without
a runtime picture is not reportable; hunts over contract-shaped surfaces (dialects, parsers,
wire formats) drift into shape-theory without this anchor (observed 2026-09-26: an entire bucket
of latent shape findings read as theoretical junk). Cap latent findings at 2 per report — a
report dominated by latent findings means the surface is clean; say so and stop.
FREQUENCY IS DEMONSTRATED, NOT ASSERTED: every finding's frequency names the concrete operation
population and cadence that produces its trigger — which users, which operations, how often those
occur in a normal deployment ("every restart with a pending queue", "any multi-step tool turn",
"an operator who chooses a /?# password"). A frequency the agent cannot ground is LATENT by
definition — say so and cap at L. This is the anti-hypothetical filter: an agent forced to prove
the bug can actually happen either produces the proof or downgrades its own claim (human-set
2026-09-26).

SEVERITY SCALE (pinned): <what makes each tier, stated by consequence>. Without one, every
agent invents its own tier boundaries and the merged ledger sorts by noise.

Method:
- Read every assigned file end-to-end (page through long files with offset/limit). Do not
  rely on grep excerpts alone.
- Where the question is enumerable, build one composed command that closes the class
  (rg / find / awk / git log -S) and return the command beside its output. Enumeration
  answers "is the class closed"; reading answers "is this site wrong". Both are required.
- Trace each candidate across its callers/callees before reporting.
- Before finalizing, attempt to refute each candidate yourself. Drop anything you cannot
  defend in review. Zero findings is an acceptable result — do not manufacture findings.
- New discoveries are a side effect, not the goal; report them in a separate labeled section.

Output format:
## <Primary deliverable>
N. [CLASSIFICATION] — title
- Location: file:symbol
- Evidence: <short quote>
- Trigger: <exact runtime path — who causes it, what must coincide>
- Frequency: <DEMONSTRATED — the operation population and cadence producing the trigger; ungroundable = latent>
- Outcome: <what goes wrong>
- Confidence: traced / suspected — per component, not per finding. State which part is
  unproven (mechanism / trigger / frequency), and mark a path nothing in tree calls as latent.
## Checked and clean
<what you examined and found correct>
## Design risks (optional, max 2)
Under <N> words, max <M> items.
```

Why each element is in the template:

- **Null-result permission + self-refutation** — the best anti-fabrication pair available. Agents
  exercise both, including arguing against seeded leads.
- **Intentional-decision exclusions with boundaries drawn** — without the boundary, agents either
  drown you in doctrine-as-bug noise or blanket-exclude real bugs adjacent to doctrine.
- **Explicit end-to-end read instruction** — explorer-type agents default to grep excerpts. "Done"
  does not mean "read"; depth must be demanded.
- **"Checked and clean" section** — exposes false negatives, hands later waves a coverage map,
  prevents complaint-only reports.
- **Fixed schema + classification taxonomy + caps** — outputs merge into one ledger; caps force
  prioritization and kill padding.
- **Pinned severity scale** — the one element keeping N agents on one axis. Omit it and every
  downstream merge, sort, and prioritization compares incommensurable labels.
- **Honesty-forcing phrasing** — "assess the arithmetic honestly," "state real-world frequency,"
  "weigh the external premise" produce calibrated output (frequency conjunctions) instead of binary
  verdicts.
- **Scope fence** — primary deliverable narrow, adjacent discoveries labeled. Preserves both focus
  and the discoveries.

### Seeded leads

Holding a half-formed hypothesis? Seed it as a verdict request: "evaluate; confirm or refute with a
full trace." The highest-yield device in the kit — the agent either upgrades the lead to a fully
traced result or refutes it in a way that builds confidence in the surrounding code. Grant explicit
authority to disagree and expect it exercised; sycophantic confirmation is the failure you're
guarding against.

### Verification passes report more than a verdict

A verifier asked "is this claim correct" returns corrections the finding's owner must apply, not a
stamp. Its output contract carries:

- Verdict: CONFIRMED / REFUTED / ADJUSTED.
- Severity and frequency corrections, each with the trace that produced them.
- Sub-claims refuted — a finding is often half right; name the refuted half.
- Additional mechanisms, earlier failure sites, or new reachability paths on the same trace.
- Fix-direction constraints: what a repair must account for beyond the reported symptom.
- What the pass could not reach, stated as a boundary rather than left as silence.

Blind passes routinely return more than they were asked to check. A confirm/refute-only schema
discards exactly the material the verification existed to produce.

### Sweep passes publish their enumeration

A census or grep-driven pass is bounded by its pattern. Require the enumeration table — every hit
site and its classification — together with the composed command that produced it, so the bound is
visible and reproducible. A reader can then see what shapes the pattern could not match, instead of
reading CLEAN as coverage.

## 3. Dispatch and track

- **Fire-and-forget.** Queue all agents at once; the harness runs them as slots free; collect as
  notifications arrive. Never block on a result you don't need yet.
- **Externalize state to a ledger file immediately.** With dozens of agents the conversation is not
  a reliable store. The ledger is the single source of truth for findings with verdicts, agent IDs
  and status, refuted claims with reasons, standing preamble, calibration rules. Notate as results
  land, not from memory.
- **Stale notifications are noise.** Late completions for already-notated agents are common. The
  ledger decides what's pending, not the notification stream.
- **Document every refutation** — claim, why, by which pass. An undocumented kill gets re-chased
  by whichever later session meets the same code.
- **Single-pass findings get a marked section.** Neither promote nor kill on one sample; label them
  for one more pass before work starts.
- **Provenance in the deliverable.** Every conclusion carries its pass history — who found it, who
  confirmed, who was blind, final tally. That is what lets a human audit your judgment calls rather
  than take them.
- **Grep locates; reading concludes.** A pattern search answers "where does this string occur". It
  never answers "what does this file do" and never "is the class closed" — the signals outside the
  words you chose are exactly the ones it cannot see. Read the file when you can, assign agents
  files rather than patterns, treat an enumeration as a bound to publish rather than a conclusion.
  Any negative claim resting on a pattern search — "no X remains", "nothing else calls this", "the
  cleanup is complete" — states the pattern that bounded it, or it is not a claim.

## 4. Resolve disagreement

1. **Don't ask "who's right" — identify the decisive artifact.** Verdict-level questions get
   verdict-level answers. Demand the mechanism: "map the exact statement sequence from entry to the
   loop, with line anchors, for both variants the accounts assumed." M-class bug disputes are won by
   statement order, not opinion.
2. **Narrow checkable disputes are yours.** A disagreement reducing to arithmetic or a 30-line read:
   read it yourself. Sample broadly; when the dispute is a direct fact, stop delegating.
3. **Watch for the shared frame.** An adjudicator given both accounts can inherit the blind spot
   both share — both traced the wrong configuration, say. Repair: enumerate the variants the
   accounts skipped and demand the mechanism for each. The same hazard runs through verification: a
   finding confirmed by two frame-sharing passes is one frame checked twice, not two independent
   confirmations. When a premise is challenged — blind pass, human note, an inconsistency —
   re-derive the frame (what rows the query returns, what the caller passes, what the constant
   holds), not merely the claim's details.
4. **Record the final tally and the decisive evidence** in the ledger. "Confirmed 3:2, tiebreak
   decisive, refutations traced only the fast path" is durable institutional knowledge.
5. **A pattern sweep cannot refute a named trace.** A sweep's CLEAN is bounded by its enumeration
   pattern and cannot see the shapes the pattern doesn't match — a decrement when it matched
   increments, a singleton-held instance when it assumed per-invocation. Sweep CLEAN conflicting
   with a traced site: the trace wins. Re-check the site by priority, record the conflict as a
   coverage caveat, never cite the sweep as the refutation.

## Pitfall checklist

- [ ] Null result permitted + self-refutation required?
- [ ] Evidence bar stated (what would make output invalid)?
- [ ] Known/intentional items excluded WITH boundaries?
- [ ] Severity scale pinned?
- [ ] End-to-end read depth demanded explicitly?
- [ ] Output schema + classification + caps fixed?
- [ ] Coverage map ("checked and clean") required?
- [ ] Scope fenced, side discoveries labeled?
- [ ] Right information state for this pass (blind/primed)?
- [ ] Pilot batch run before scaling? Feedback codified?
- [ ] Fire-and-forget queued, ledger updated on arrival?
- [ ] Refutations documented for the recheck wave?
- [ ] Any single pass treated as final on something you'll act on?
- [ ] Any negative claim resting on a pattern search — bound stated, file read?
