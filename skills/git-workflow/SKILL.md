---
name: git-workflow
description: Repository-agnostic protocol for inspecting, staging, committing, and reporting Git changes. Load before every commit or when drafting a commit message. Produces precise, self-contained commit records that carry forward causality, implementation rationale, durable session insight, contracts, invariants, and side effects without session narration or AI boilerplate.
---

# Git Workflow

Use this workflow before every commit.

## Objective

Treat each commit message as a durable state-transition record. Assume the reader encounters it months later with no session context, no unwritten institutional knowledge, and no familiarity with the original author. Preserve the information needed to understand or safely revise the change:

- What defect, requirement, or constraint caused the change.
- Which non-obvious discovery from the interactive session should influence future work.
- Why the solution belongs at the chosen boundary.
- Which behavior, contract, invariant, schema, or side effect changed.
- Which behavior intentionally remains unchanged.

A commit message is not a transcript, approval request, release note, or restatement of the diff. Carry forward durable conclusions from the session, not the chronology of reaching them.

## Non-negotiable rules

- Do not commit unless the User explicitly requests a commit.
- Read and obey repository-local instructions before staging. Local rules override this skill when they are stricter.
- Review the worktree before staging. Pre-existing changes are not permission to include them.
- Stage explicit paths. Never use `git add .` or `git add -A` without explicit authorization for that operation.
- Do not amend, rebase, reset, restore, clean, force-push, or discard work without explicit authorization.
- Keep one concern per commit. Split independent concerns unless explicitly directed otherwise.
- Never add AI attribution, `Generated with`, agent `Co-Authored-By` lines, emojis, or session narration.

## Procedure

### 1. Inspect

```bash
git status --short
git diff -- <relevant-paths>
```

Separate requested changes from unrelated or pre-existing work. Resolve ambiguous scope before staging.

### 2. Stage intentionally

```bash
git add path/to/file1 path/to/file2
git status --short
git diff --cached --check
git diff --cached
```

Read the complete staged diff. Check for credentials, debug artifacts, generated junk, unrelated edits, accidental deletions, and undocumented side effects.

### 3. Write the message

The title is the commit's index entry. `git log --oneline` must identify the kind of change, the codebase area that owns it, and the resulting behavior without opening the body.

Use this required structure:

```text
<type>(<scope>): <brief>
<type>(<scope>)!: <brief>   # breaking change
```

Examples:

```text
fix(json-parser): reject truncated responses
feat(status-cli): emit machine-readable JSON
refactor(cache): route invalidation through public API
```

#### Type

Choose the type by the change's effect:

- `feat` — adds a capability.
- `fix` — corrects behavior that violated an intended contract.
- `refactor` — changes internal structure while preserving behavior.
- `perf` — changes runtime or resource behavior.
- `security` — changes a security boundary or hardening policy.
- `docs` — changes documentation only.
- `chore` — performs repository maintenance without changing product behavior.
- `style` — changes formatting without changing semantics.
- `revert` — reverses an identified commit.

#### Scope

The scope is mandatory. Name the smallest stable codebase area that owns the change: a subsystem, package, service, command, interface, schema, deployment area, or document. Use the repository's canonical term so the title is searchable.

- Prefer the owning boundary, not every directory touched by the implementation.
- Do not list multiple scopes. A commit with independent owners should normally be split.
- Use `repo` only for a genuinely repository-wide concern.
- Use stable scopes such as `auth`, `parser`, `status-cli`, `database-schema`, `deploy`, or `readme`; do not use temporary task names or session labels.

#### Brief

The brief states what the commit does at that scope.

- Start with a precise active verb and name the affected behavior or contract.
- Include the triggering condition or important qualifier when it distinguishes the change.
- Describe the resulting behavior, not the editing action, investigation, source of the patch, or hoped-for benefit.
- Make the title cover the complete staged change. If one brief cannot do that coherently, split the commit.
- Include searchable domain terms and identifiers when useful.
- Avoid empty terms such as `updates`, `improvements`, `cleanup`, `misc`, `minor`, or `fixes`.
- Do not end with a period.
- Keep the complete title to 72 characters or fewer.

Use the title alone when it completely explains a small change and the session produced no durable insight. Add a body when causality, session insight, design constraints, hidden effects, or preservation requirements would otherwise be lost.

For a non-trivial commit, use this structure:

```text
type(scope): specific outcome

ROOT CAUSE:
State the concrete defect, missing capability, constraint, or invalid assumption. Include the causal chain from trigger to consequence.

INSIGHT FROM THE SESSION THIS COMMIT WAS CREATED IN:
State a non-obvious, durable discovery that should influence future work. Examples include a hidden coupling, misleading interface, operational constraint, invalidated assumption, surprising behavior, or plausible approach that fails for a specific reason.

SOLUTION RATIONALE:
State why the solution belongs at this boundary and which invariant or contract it establishes. Mention a rejected alternative only when a future agent could plausibly reintroduce it.

CHANGES:
- Record significant resulting behavior, contracts, data flow, side effects, or operational requirements.

PRESERVES:
- For refactors or replacements, record behavior that must remain unchanged.
```

Omit `INSIGHT FROM THE SESSION THIS COMMIT WAS CREATED IN` when the session produced no durable, non-obvious knowledge. Omit `PRESERVES` when it does not apply. Keep `ROOT CAUSE`, `SOLUTION RATIONALE`, and `CHANGES` for non-trivial commits.

Message rules:

- State the final causal model, not the chronological investigation.
- Write session insight as a context-independent fact. Do not write “we discovered,” “during debugging,” “as discussed,” or a diary of failed attempts.
- Include session insight only when it prevents likely rediscovery, regression, or misuse. Do not manufacture an insight to fill the heading.
- Keep session insight distinct from root cause and solution rationale: it records reusable knowledge, not the defect or chosen patch.
- Use exact nouns, conditions, and before/after behavior. Locate code with stable identifiers such as paths, symbols, schema objects, configuration keys, and endpoint names; do not use line numbers as durable references.
- Distinguish the initiating symptom from the root cause.
- Describe the convergence point or contract boundary when multiple code paths are involved.
- Record hidden side effects such as persistence, event emission, cache invalidation, security scope, migration behavior, or compatibility changes.
- Explain why an implementation choice matters; do not inventory every edited line or file.
- Do not repeat the same fact under multiple headings.
- Avoid subjective claims such as “cleaner,” “better,” “stronger,” or “simpler” unless followed by a concrete mechanism.
- Avoid ceremonial language, marketing language, exhaustive lists, and miniature design documents.
- When a change reverses, supersedes, or corrects an earlier decision, cite the exact commit, issue, ADR, migration, or version and state which prior assumption or contract became invalid.
- Avoid unstable temporal or external references such as “today,” “recently,” “the remote version,” or “the earlier attempt.” If no durable reference exists, state the prior repository behavior and relevant condition directly.
- For a breaking change, add `!` after the scope and include `BREAKING CHANGE:` in the body when callers, schemas, configuration, persisted data, or operations must change.

## Gold-standard example

```text
feat(git-workflow): add agent-oriented commit protocol

ROOT CAUSE:
Git guidance was duplicated between repository instructions and a project-specific agent skill. Reusing that workflow across unrelated repositories would propagate project terminology, AI attribution, human-facing ceremony, and unstable conventions; maintaining project copies would also allow the rules to diverge.

INSIGHT FROM THE SESSION THIS COMMIT WAS CREATED IN:
Structured commit messages are useful only when each section preserves distinct information. Root cause records causality, session insight carries reusable knowledge that is not encoded in the diff, and solution rationale protects the chosen boundary from plausible regressions. Session chronology, line numbers, vague external references, and generated attribution add volume without preserving durable context.

SOLUTION RATIONALE:
Install one repository-agnostic global Pi skill and make repository instructions reference it as the authoritative workflow. A stable structure gives future agents predictable retrieval points while optional INSIGHT and PRESERVES sections prevent empty ceremonial prose.

CHANGES:
- Added `~/.pi/agent/skills/git-workflow/SKILL.md` with authorization, intentional staging, semantic subjects, and post-commit inspection rules.
- Defined ROOT CAUSE, optional session INSIGHT, SOLUTION RATIONALE, CHANGES, and optional PRESERVES contracts.
- Required historical decisions to use durable commit, issue, ADR, migration, or version references.
- Required paths, symbols, schema objects, configuration keys, and endpoint names instead of line-number references.
- Updated project and global agent maps to reference the global skill.

PRESERVES:
- Commits still require an explicit User request.
- Unrelated worktree changes remain excluded through path-specific staging.
- Independent concerns remain separate commits unless the User directs otherwise.
```

Use literal newlines in the `git commit -m` argument. Do not use a heredoc.

### 4. Commit and inspect

```bash
git status --short
git show --stat --oneline --decorate --no-renames HEAD
git rev-parse --short HEAD
```

Confirm that the commit contains only the intended paths and that unrelated work remains untouched.

## Post-commit report

Report:

- Commit hash and subject.
- Concise resulting behavior or changed paths.
- Remaining uncommitted changes.

Do not add celebratory filler, generic benefits, or invented next steps.
