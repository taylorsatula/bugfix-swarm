---
name: plan-investigation
description: Repository-agnostic investigation workflow for implementation plans, repair registers, technical proposals, ALHF-style work items, and reference documents. Use before changing code to verify claims against source, trace execution and ownership boundaries, find codebase-native solutions, identify characterization tests and knock-on touchpoints, control scope, and resolve remaining design decisions through the questionnaire tool.
---

# Plan Investigation

Use this skill when a user provides a plan, repair item, defect proposal, audit finding, or reference document and wants the codebase investigated before implementation.

## Objective

Turn a proposal into a source-backed implementation-readiness report. Establish what the repository actually does, where the relevant contract lives, which existing patterns should be reused, what the proposal gets wrong or leaves ambiguous, and which decisions genuinely require the user.

Do not treat the reference document as authority over source. Plans record intent and prior evidence; executable code, configuration, lockfiles, tests, and current repository instructions establish present behavior.

## Operating rules

- Start in **investigative-only mode** unless the user explicitly authorizes implementation.
- Do not edit files, install dependencies, start long-running services, mutate caches, deploy, commit, or discard work during investigation.
- Read and obey repository-local instructions before drawing conclusions.
- Preserve pre-existing worktree changes. Record their existence without attributing them to the current task.
- Keep bounded investigations in the main context so source evidence and synthesis remain connected. Use a subagent only when the search is genuinely broad or the user asks for one; never delegate the final synthesis.
- Prefer direct evidence over inference. Label unverified platform behavior, external callers, and runtime assumptions as unknown.
- Flag discrepancies instead of silently adapting the proposal to fit them.
- Prefer the smallest idiomatic repair at the existing ownership boundary. Avoid new abstractions, helper layers, flags, dependencies, or files when an established local pattern solves the problem clearly.
- Characterization precedes implementation where behavior can regress. Identify the red test before proposing the green change.

## Investigation workflow

### 1. Establish authority and scope

Read the supplied plan or work item completely. Extract:

- The stated defect and intended outcome.
- Claimed files, commands, callers, versions, environments, and ownership boundaries.
- Capabilities and compatibility behavior that must remain.
- Required evidence, tests, validation platforms, and status updates.
- Explicit exclusions and unresolved decisions.

Then inspect repository state and instructions:

```bash
git status --short --branch
git branch --show-current
```

Do not modify or clean an already-dirty worktree. Determine whether relevant files differ from the comparison base so the report describes the active branch rather than an assumed baseline.

### 2. Trace the real execution path

Start from public entrypoints and follow control flow inward:

1. Workflow/job, package script, CLI, hook, route, or service entrypoint.
2. Wrappers and command indirection.
3. Environment and argument propagation.
4. Inner runner or domain implementation.
5. Resource startup, readiness, failure, and cleanup boundaries.
6. Tests, receipts, manifests, fingerprints, documentation, and downstream consumers.

Search exact identifiers first, then naming variants and semantic equivalents:

```bash
rg -n --hidden -g '!node_modules' -g '!.git' \
  -e '<command>' -e '<symbol>' -e '<environment-variable>' .
```

Read enough surrounding code to understand ordering and failure behavior. Do not infer semantics from a matching line alone.

For each path, answer:

- Who owns setup, execution, assertion, recovery, and cleanup?
- Which failures are surfaced, suppressed, retried, or deferred?
- Which variables or arguments survive each process boundary?
- Does local behavior differ from CI, containers, or hosted workflows?
- Is the path automatic, manual, conditional, or only a compatibility alias?

### 3. Verify factual claims

Check versions and generated identities from authoritative local sources:

- Exact lockfile entries, not only permissive manifest ranges.
- Tool-owned manifests or public APIs for derived revisions and paths.
- Current CLI help for supported commands and flags.
- Workflow conditions and step ordering.
- Current tests and source-contract assertions.

Use read-only probes when they materially distinguish candidate designs. Prefer `--help`, `--dry-run`, path resolution, and isolated temporary directories. Never mutate a user's real cache or runtime state merely to confirm a hypothesis.

Classify every important claim as:

- **Confirmed** — directly supported by source or a controlled probe.
- **Contradicted** — current source behaves differently.
- **Qualified** — directionally correct but narrower or conditional.
- **Unknown** — requires runtime, platform, owner, or external-caller evidence.

### 4. Search for codebase-native approaches

Before designing anything new, search the repository for how it already solves the same class of problem. Look beyond exact names for established patterns involving:

- Explicit ownership or boundary environment variables.
- Preflight and executable/capability assertions.
- Structured errors, exit codes, and diagnostics.
- Environment sanitization and propagation.
- Lifecycle ownership and fail-fast placement.
- Source-contract and characterization tests.
- Mock command traces and failure injection.
- Version/path derivation from the installed tool.
- Qualification receipts, manifests, hashes, or file inventories that must include new helpers.
- Documentation/status conventions for completed work items.

Inspect the owning subsystem first, then nearby build/test/deployment tooling. When the repository has no suitable precedent, inspect the dependency's public API and CLI before considering internals.

Evaluate candidate approaches in this order:

1. Reuse an existing local pattern directly.
2. Adapt a nearby pattern at the same ownership boundary.
3. Use the dependency's documented public API.
4. Add a small local helper only when reuse would duplicate logic or weaken a contract.
5. Reject private APIs, cache-name parsing, broad heuristics, and new infrastructure when a public or existing path suffices.

For every recommended approach, explain concretely why it is native: identify the precedent, public API, ownership boundary, and behavior it preserves. Also name plausible alternatives that were rejected and the specific complexity or fragility they introduce.

### 5. Map all implementation touchpoints

Separate touchpoints by necessity:

- **Required behavior changes** — the actual owner and caller contract.
- **Required characterization** — focused red/green tests and failure cases.
- **Conditional knock-ons** — fingerprints, receipts, exports, or fixture inventories only if a new file/symbol is introduced.
- **Status/documentation updates** — only those required by the work item or changed behavior.
- **Observed but out of scope** — stale docs, adjacent defects, independent provisioning paths, or cleanup opportunities.

Do not convert every observed imperfection into scope. Bring material findings to the user while explicitly excluding unrelated repairs from the proposed change.

### 6. Resolve straightforward choices; ask consequential ones

Resolve choices that source and repository conventions determine. Use these defaults:

- Explicit contract beats ambient-environment heuristics.
- Public API beats dependency internals.
- Exact installed-tool identity beats hardcoded versions or arbitrary cache searches.
- Fail fast before expensive setup when cleanup ownership remains correct.
- Preserve useful underlying diagnostics instead of suppressing them and inventing replacements.
- Inline, focused logic beats a new helper when the logic is small and has one caller.
- The real operation remains the integrity proof when a cheap preflight can only establish existence.

When meaningful decisions remain, **use the `questionnaire` tool** (`questionnaire_tool` in harnesses that expose that name) before finalizing the report. Do not bury decisions in prose or guess the user's policy preference.

Questionnaire rules:

- Ask only decisions that source cannot answer; do not ask the user to choose factual matters.
- Keep the questionnaire to 1–5 focused questions.
- Offer a recommended option first and label it `(recommended)`.
- Give each option a concise description and a structured `detail` preview showing behavior, trade-offs, or control flow.
- Include a free-text option unless the choice must be closed.
- Avoid generic architecture menus. Present only repository-viable options found during investigation.
- Do not implement while waiting for answers.

Typical decision categories include ownership signals, compatibility/failure semantics, assertion strength, supported platforms, and whether a behavior change is authorized.

### 7. Produce the implementation-readiness report

Use the following format, omitting empty sections and adapting the title to the work item:

```markdown
# <work item> native-resolution report

## Decisions confirmed

Number the questionnaire decisions and state the selected behavior plainly.

## Confirmed execution flow

Trace the actual path in order with file paths and stable symbols or line references.

## Findings that complicate the proposal

### 1. <finding>

State the source-backed discrepancy, why it matters, and what not to assume.

## Recommended implementation

### 1. <boundary or file>

Describe the smallest concrete change and resulting contract. Use a short code or
flow excerpt only when it makes the behavior easier to understand.

## Why this is codebase-native

- Cite existing repository precedents.
- Cite relevant public tool APIs.
- Explain why new machinery is unnecessary.

## Characterization-test shape

### <case>

- Setup and controlled environment.
- Expected command/behavior.
- Failure assertion and forbidden downstream work.

## Files expected to change

1. `path`
2. `path`

Mention conditional files separately.

## Deliberately excluded

- Name adjacent findings that should not expand this repair.
- State rejected elaborate or fragile approaches.

## Validation and change status

State read-only probes performed, tests not run, unresolved platform validation,
and whether any files were modified.
```

Report requirements:

- Lead with the conclusion, not the search chronology.
- Use short sections, numbered decisions, bullets, and small code blocks.
- Distinguish confirmed behavior from recommendation.
- Give paths clearly and use line numbers only as current-location aids, not durable identifiers.
- State the expected change set so scope is reviewable before implementation.
- Always end with whether files changed during investigation.

## Transition to implementation

If the user later authorizes implementation:

1. Re-read current status and relevant files because concurrent work may have changed them.
2. Write the focused characterization test first and demonstrate the intended red failure.
3. Make only the approved changes.
4. Run the focused green test, then repository-required validation.
5. Recheck the diff against the expected file list and report any expansion before proceeding.
6. Update required plan/status records without rewriting unrelated investigation history.

Investigation approval is not implementation authorization. Do not commit, push, open a pull request, deploy, or clean up work unless separately requested and permitted by repository rules.
