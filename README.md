# bugfix-swarm

A read-only static-analysis bug-hunt swarm for coding agents. A human opens a
run; waves of hunter and adversarial-verifier subagents each write a report
file and return only an envelope; a dedupe agent merges everything into one
findings report; the human decides every repair at a picker; executor agents
fix what was accepted and verify by live execution. The registry is the
[kata](https://katatracker.com) issue tracker — no per-repo BUG-AUDIT files.

**USER-GATED.** The skill never loads autonomously. You open a run by saying
"run a bug hunt / swarm / audit / sweep"; the funnel returns to you at every
decision point.

## Requirements

- **Any coding-agent harness** — everyharness generates native installers for
  12 of them (see `docs/install/`); the doctrine is harness-agnostic. The
  runbook speaks Pi's tool vocabulary (`SubagentWorkflow`, `checkbox_picker`,
  the four swarm subagent types), so on other harnesses your agent substitutes
  its native equivalents: Claude Code dispatches the emitted agents via the
  Task tool, and harnesses without a subagent component inline the role
  prompts from `agents/*.md`.
- **kata CLI** — `brew install kata`. The run registry lives in kata;
  `kata init` binds each project before its first run decision.
- **Models**: the four swarm agents pin `lunaroute/*` routes in their
  frontmatter. If you don't have those routes, edit the `model:` line in
  `agents/*.md` — that is the only portability edit.

## Installing

Each harness's installer is in `docs/install/`. For Pi:

```
pi install git:github.com/taylorsatula/bugfix-swarm
```

Then one manual step — Pi plugins can register skills but not subagent
definitions, so copy the four swarm agents where Pi looks for them:

```
cp agents/*.md ~/.pi/agent/agents/
```

## First run

In any project: `kata init`, then tell your agent to run a bug hunt. Phase 1
of the runbook asks three kickoff inputs (run type, stakes tier, calibration
changes) and every repair decision comes back to a picker.

## Contents

| Path | What it is |
|---|---|
| `skills/bugfix-swarm/` | The runbook — nine phases, run types, kata registry doctrine. |
| `skills/bugfix-swarm-handoff/` | Compaction/crash continuity for runs that outlive a context window. |
| `skills/subagent-orchestration/` | Pass design, the preamble template, dispatch and dispute mechanics. |
| `skills/plan-investigation/` | Fix-wave discipline: verify claims against source before changing code. |
| `skills/git-workflow/` | Commit protocol (runs commit only when the human asks). |
| `skills/sitrep/` | Session status reports on request. |
| `skills/writing-probes/` | Live-verification doctrine for fix waves. |
| `agents/` | The four funnel roles: swarm-investigator, swarm-verifier, swarm-dedupe, swarm-executor. |
| `examples/census-hunt.example.js` | A filled wave script from one project's census — copy the shape, not the areas. Saved per-project under `.pi/workflows/`. |
| `everyharness.yaml` | Single source of truth; per-harness files are generated ([everyharness](https://github.com/prime-radiant-inc/everyharness)), committed, and drift-checked. |

## Regenerating harness files

After editing `everyharness.yaml` or any skill:

```
npx everyharness generate   # from a clone; see everyharness for install
npx everyharness validate   # exit 3 = drift
```

## License

MIT
