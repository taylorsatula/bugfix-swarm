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

## Install

All five harnesses below were install-verified against their real CLIs on
2026-09-27. Pick yours:

### Pi

```sh
pi install git:github.com/taylorsatula/bugfix-swarm
cp agents/*.md ~/.pi/agent/agents/   # Pi plugins can't register subagents
```

### Claude Code

```sh
claude plugin marketplace add taylorsatula/bugfix-swarm
claude plugin install bugfix-swarm@bugfix-swarm-dev
```

All 7 skills and 4 agents register (~2k always-on tokens).

### Codex

```sh
codex plugin marketplace add taylorsatula/bugfix-swarm
codex plugin add bugfix-swarm@bugfix-swarm-dev
```

### OpenCode

In your project root:

```sh
opencode plugin "bugfix-swarm@git+https://github.com/taylorsatula/bugfix-swarm.git"
cp <plugin-checkout>/.opencode/agent/*.md .opencode/agent/  # see note below
```

The skills load from the package; the four agents register only when OpenCode
runs inside this repo, so for a swarm run either clone the repo and work
there, or copy `.opencode/agent/*.md` from a clone into your project's
`.opencode/agent/`.

### Hermes

```sh
hermes plugins install taylorsatula/bugfix-swarm --enable
```

**Blocked by Hermes' content scanner by default.** A bug-hunt corpus reads
as dangerous to it — "Never: Edit orientation maps…" prohibition lines score
as persistence instructions, and the tool vocabulary (`websocat`, `py-spy`)
scores as network/execution hazards. `--force` cannot override the dangerous
verdict; installing requires `plugins.scan_on_install: false` in your Hermes
config. Your call whether that trade is acceptable.

## Requirements (after install)

- **kata CLI** — `brew install kata`. The run registry lives in kata;
  `kata init` binds each project before its first run decision.
- **Models**: the four swarm agents pin `lunaroute/*` routes in their
  frontmatter. If you don't have those routes, edit the `model:` line in
  `agents/*.md` — that is the only portability edit.
- **Tool vocabulary**: the runbook speaks Pi's tool names
  (`SubagentWorkflow`, `checkbox_picker`, the four swarm subagent types), so
  on other harnesses your agent substitutes its native equivalents — Claude
  Code dispatches the emitted agents via the Task tool.

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
