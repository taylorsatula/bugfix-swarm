---
name: writing-probes
description: "The full doctrine and protocol for writing, running, and reviewing verification probes in an agent-written codebase with no test suite: probe vs test, the three homes and the execution venue, the prime directive, the fake rule, probe anatomy, the static scaffold, the shape catalog, the EXECUTED/UNVERIFIED discipline, the probe-bug taxonomy, how to write probe-able code, permanent POST path-probes, and offline batteries. Load whenever verifying a change against reality, answering 'does this actually work?', writing a path-probe, reproducing a defect live, deciding whether a check earns permanence, or diagnosing a failed probe. Not for writing test suites."
---

# Writing Probes

Distilled from 1,070 curated top-level and 804 high-quality child-session probe commands across
MIRA sessions 2026-09-13 → 2026-09-27; measurements are over the full deduped command corpus of
**3,168** probes unless stated otherwise. Drawn also from the permanent-probe machinery
(`utils/power_on_self_test.py`), the admission-gated batteries (`tests/protected/`), the
disposable exhibit (`tests/tmp/`), the builder guides, and the `swarm-executor` / `bugfix-swarm`
verification contracts.

## The one rule

**Probe the shipped artifact, against the real world, and say what you actually ran.**

Type-clean, pyflakes-clean, never-executed code is the standard failure product of an
agent-written tree. Linters and the compiler check syntax and shape; they do not check that a
handler runs, that a row round-trips, or that a guard refuses. A probe executes the real code
against real infrastructure and observes.

## What a probe is — and what a test is

A probe asks **"what does this code actually do, right now, against the real world?"** A test
asks "does the code still do what it did?" The relation is a progression: **a test is a frozen
probe.** A probe is a one-question instrument, usually discarded. When its question turns out to
be one whose answer must never change, it is frozen — a boot-time path-probe or an
admission-gated battery — and that frozen probe is the only kind of test worth keeping.

A probe is a measurement, not a proof. It can return a datum that disconfirms the question you
asked. That is the point. A check that cannot fail is decoration.

### The three homes

These rows are **persistence homes** — where a probe is stored and for how long.

| Kind | Home | Lifetime | Purpose |
|---|---|---|---|
| **Disposable probe** | `/tmp`, inline in the conversation, or a throwaway fixture user | One question, then discarded | Verify one change. Never committed. |
| **Permanent path-probe** | `utils/power_on_self_test.py`, registered as a `CheckSpec` | Runs every boot/bind | Guard a critical path whose failure is silent |
| **Protected battery** | `tests/protected/` (admission-gated by the exact phrase `AUTHORIZE PROTECTED TEST SAVE`) | Permanent, offline | Regression battery for a decision function, corpus-driven |
| **Display exhibit** | `tests/tmp/jsonb_roundtrip_probe.py` | Never runs again | Show the shape to future sessions |

Orthogonal to the home is the **execution venue**, and pinning it is what makes a probe real:
same process; same machine; the host over SSH; a nested VM; or the deployed service's own venv
and env (the probe `scp`'d and run as the service user). A probe run in the wrong venue measures
the wrong artifact.

**Shared scaffolding is not a home.** Reusable setup and teardown lives in `tests/fixtures/` —
`probe_user` (throwaway user), `scratch_database` (schema-backed DB), `live_infra.require`
(reachability gate), `residue` (cleanup checks), `harness` (results collector). Import it
(`sys.path.insert(0, "tests/fixtures")`) instead of rewriting the fixture-user lifecycle in every
probe. It is claim-free real-infra scaffolding — never a simulated subject; see
`tests/fixtures/AGENTS.md`.

**The offline floor.** Some build environments have no Vault, database, or model routes. That is
not a licence to simulate. The floor is real-but-absent-infra: `py_compile` + pyflakes; importing
the module directly (`ToolRepository._process_module(...)`) when full discovery dies on an
unrelated optional dep; `ToolDefinition.from_mapping(Tool.schema)` (the boot gate's own envelope
check); registration confirmation; **pure functions executed for real** against direct inputs.
Everything above the floor is reported **UNVERIFIED**, naming the live probe that would cover it.

## The prime directive: probe the shipped artifact

Every probe that **claims behavior** executes the real subject (the static/observational shapes
in *Moment two* are the explicit exception). The failure product this prevents: a check that
passes against a copy, a remembered API, or a mock, while the shipped bytes fail live.

- **No transcription.** The guardrail battery (`tests/protected/mlfactory_guardrail_probe.py`)
  imports the real `_validate_command`. Where it cannot (the deployed interpreter differs by
  version), `/tmp/guardrail_compat_check.py` *extracts the shipped source region by line marker*,
  `exec`s that exact text, and **loads its corpora from the shipped probe by AST + `literal_eval`
  — "so the cases are the real ones, not a copy."** It then runs a faithfulness control: the
  extracted-region digest must match the real module's digest on the reference interpreter before
  the second interpreter's digest is trusted.
- **Real infrastructure.** Live Postgres/Valkey/Vault/LLM endpoints, real credentials from the
  sanctioned store (`get_api_key` / AppRole), real user rows and real data. The JSONB exemplar
  round-trips *real memories with real links* through the app's own `LTMemoryDB`.
- **Real entry surfaces.** Use `ToolRepository.invoke_tool(name, params)` (production param
  filtering + coercion), never bare `run()`. Build the real `AnthropicDialect` and call it. Drive
  the real HTTP route via `create_app()` + `TestClient`. Send real WebSocket frames.

### The one legal simulation: a named boundary

When a leaf cannot be driven live — a remote IMAP server, a provider that would bill or fail on a
bad key, a truncated SSE stream — simulate **a boundary**, never the subject, and **state the
bound in the probe**. Three distinct boundary forms:

- **The transport, at the protocol level.** `/tmp/truncation_probe.py` starts a real `HTTPServer`
  on localhost that emits a truncated SSE body, then runs the real `OpenAIDialect.stream()` against
  it. Case A (cut without `[DONE]`/`finish_reason`) must raise `ProviderProtocolError`; Case B
  (clean end) must complete. Protocol stand-in, real code.
- **A collaborator, scripted.** `FakeConn` / `FakeResp` replay scripted IMAP responses into the
  real method and record `.calls`, so the probe also **witnesses side effects** (`BODY.PEEK[]`,
  `STORE`) — "the transport is un-drivable live, but the branch under test is real." A hand-written
  `FakeValkey` implements the real client interface (`set_if_not_exists`, `compare_and_delete`,
  `compare_and_expire`) to exercise `utils.distributed_lock`'s control flow.
- **A dependency, neutralized at one seam.** `vc.get_valkey = lambda: None` when "the probed
  accounting path makes no Valkey calls (every Result has `container_id=None`)"; or fake connection
  objects forcing the `__exit__` commit-failure branch — "this verifies control flow, not
  infrastructure."

**Rule.** A fake is legal when it replaces a **collaborator**, never the subject, and the probe
states the bound its fake imposes — *what it verifies* and *what it does not*. Reachability ("the
real path is un-drivable") is the common case, not the rule: `FakeValkey` and the fake-conn probes
ran while the real store was available, and were legitimate because their claims were scoped to the
subject's control flow. A fake of the subject is never legal — the mock prohibition, absolute.

## Moment one — decide

Before writing a line:

1. **The question.** One sentence. "Does `update_memory` accept a JSONB column?" Not "test the
   memory layer."
2. **The real surface** that reaches it — the exported function, the tool via
   `ToolRepository.invoke_tool`, the HTTP route, the stored procedure.
3. **The venue** — where must this run for the observation to be true of production?
4. **The fixture and its destruction** — a throwaway user, a scratch database, a temp root, a local
   server on port 0. Reach for `tests/fixtures/` (`probe_user`, `scratch_database`,
   `live_infra.require`) before hand-rolling. Know now how it is removed, and how you will prove it
   is gone.

If you cannot name all four, the probe is not ready. Read the code until you can. Do not simulate.

## Moment two — choose the shape

Pick the **cheapest shape that reaches the real path.** Escalate only when the cheap shape cannot
reach. The catalog is a menu, not a sequence.

### Cheap / static
| Shape | Answers | Notes |
|---|---|---|
| **compile + lint gate** | Parse and lint? | `python3 -m py_compile F && pyflakes F && echo CLEAN` — always first, short-circuits the run. Tier 0. |
| **AST / `inspect.getsource`** | Is the wiring present as claimed (call-site count, kwargs, ordering)? | Reads source structure without executing the subject; run read-only over code that cannot be imported. |
| **library ground-truth** | What does the installed dependency *actually* do? | `inspect.signature`, MRO, `psycopg` dumper OID, `SHOW` a pragma. 130 occurrences; converts a remembered API into an observed value. |
| **source-region exec / byte-identity** | Are the shipped bytes what I think? | Extract lines, `exec`; or `guard(git show HEAD:F) == guard(open(F))` to prove a region untouched. |
| **module-constant derivation** | Do two paths derive the same number? | Independently recompute; assert equality. Catches silent drift. |

### Live, in-process
| Shape | Answers | Notes |
|---|---|---|
| **`__new__` + attribute injection** | Does this method behave without a side-effectful `__init__`? | 116 occurrences. Set only the attrs it needs. **Pitfall:** misses init-built state (`_turn_counts`, pattern lists). |
| **real constructor in degraded mode** | Does it fail closed when its dependency is absent? | `PromptInjectionDefense()` constructs without Vault by design; flipping `_llm_available=False` faithfully simulates the init-failure branch. |
| **duck-typed exception / request** | Does the error-mapping branch fire? | `class FakeStatusError(Exception)` with `status_code`; a real `starlette.Request` built from a scope dict with `x-forwarded-for`. |
| **pure-logic consequence** | What decision does the old vs new row produce? | Call the pure `_dispatch_decision` directly; feed old-row vs fixed-row; assert retry vs skip. |
| **cross-user isolation** | Does user A's state leak into B's view, or B's cleanup destroy A's? | `set_current_user_id("attacker")` → pin → `set_current_user_id("victim")` → assert no leak *and* no destruction. 59 `set_current_user_id` probes. |
| **boundary input matrix** | Does every classified input land in the right bucket? | A `(inputs, expected)` table incl. match-everything, empty, malformed, unicode, oversized. Print the failing tuples. |
| **exhaustive fuzz** | Is *any* partial window wrong? | Loop `start × end` over the raw buffer; count spurious raises; supply genuinely-invalid bytes that must still raise. |
| **concurrency / race** | Does it resolve to exactly one winner? | Two threads / two background drains; assert epoch delta exactly 1, no intermediate observable state. Postgres: two concurrent transactions racing the guarded UPDATE (`UPDATE 1` + `UPDATE 0`). |
| **longitudinal / counter** | Does a retry budget resist infra outages? | Repeated sequential drains + a concurrent pair; compare against the pre-fix dead-letter threshold. |
| **process / thread lifetime** | Does a background spawn return promptly, survive, finish? | Non-blocking return, live PID, empty log, then `DONE_MARKER` present and PID reaped. |
| **clock / timezone boundary** | Does the date branch actually fire? | Construct the reference time *inside* the tz so the branch under test fires; assert the wall-time semantics. |
| **refutation / premise** | Is the hypothesized defect mechanically possible? | Drive the minimal input and let it raise — a refutation is a first-class result. |
| **derivation / cross-implementation** | Do two implementations agree? | Bash `urllib.parse.quote` vs Python's, byte-for-byte. |

### Live, external
| Shape | Answers | Notes |
|---|---|---|
| **round-trip persistence** | Does write→read return the same value, stay idempotent? | Real store; assert both return values and both stored forms; second call idempotent. |
| **temp-schema / temp-table / rollback** | Does the DB accept the shape without leaving state? | `CREATE TEMP TABLE … ON COMMIT DROP`; `BEGIN; INSERT…; ROLLBACK;`. |
| **reproduce-then-fix (RED/GREEN)** | Does the fix change the observable? | Reproduce the pre-fix error (`could not determine data type of parameter $2`), then show the cast resolves it. |
| **real local server stand-in** | Does the client speak the real protocol? | `ThreadingHTTPServer` on port 0; SSE emit; stall (connection open, no bytes); real SDK/httpx/socket. |
| **shim module at a plugin seam** | Does the loader handle every branch? | Write `/tmp/shim_ok.py`, `/tmp/shim_raises.py`, `/tmp/shim_bad.py`; point `config.<plugin>.module_path`; assert all three. |
| **fixture user** | The user-scoped path with no pollution? | `uuid4()` + `set_current_user_id`; rmtree `data/users/<id>` at the end. |
| **seed-through-sanctioned-path** | Does a real write read back correctly? | Insert via the app's own service, read via its own search; drop the scratch DB. |
| **HTTP route via `TestClient`** | Does the real route return the right status end-to-end? | `create_app()`, override `get_current_user`, `raise_server_exceptions=False` so a 500 is observable; one hostile + one valid row. |
| **UI / pty / browser** | Does the real interface render / behave? | Textual `run_test(size=…, pilot.pause())`; a CPR-answering pty harness with ANSI stripping; `file://` DOM probes with an `onerror` spy. ~70 probes. |
| **stall / wedge injection** | Does the bound fire and free the caller? | Block the loop deliberately (synchronous sleep inside a coroutine; a stalled SSE socket); assert timeout, cancel, elapsed wall-time. |
| **raw-wire / two-hop remote** | Which layer owns the defect? | Bypass the client to raw frames; `scp` the probe to the host/VM and run under the service's own venv + env. |
| **two-hop payload / PATH-stub** | What argv does the far shell receive? | Stub the leaf binary (`psql`, `curl`) to print its argv while the real quoting chain runs; force a script's error branch with a stub exit code. |
| **background probe + journal** | What does the server do during the client window? | Run the probe detached to a log, then read `journalctl` over the same window. |
| **infra inspection** | Is the live dependency reachable / correct? | Non-secret health/readiness polls; `valkey-cli TYPE`/`TTL`; `journalctl` grep; Vault secret length/prefix. |

### Documentation / repo
| Shape | Answers | Notes |
|---|---|---|
| **anchor resolution** | Does every `file.py:symbol` citation resolve? | Regex the maps/guides, resolve file + symbol, print the misses. How the AGENTS.md corpus is audited. |
| **fence balance / structure** | Is the markdown well-formed? | Count fenced blocks; assert even. |
| **reciprocity** | Does each wiring edge have its counterpart? | Check one-line citations on both sides of a stated edge. |
| **import-graph reachability** | What loads eagerly at boot; what is offline-importable? | AST BFS of eager vs lazy imports from `main.py`. |

### ML / data
| Shape | Answers | Notes |
|---|---|---|
| **production-parser replay** | Does every generated target parse under the *exact* production regexes? | Use the copied canonical regexes; gate semantic values (`complexity ∈ {…}`, 8-hex ids), not just presence. |
| **prompt / format consistency** | Do the prompt's examples match the real formatter's output? | `load_prompt()` then assert `format_memory_id()` output appears in the prompt's example tokens. |
| **distribution fingerprint** | What does the gold corpus look like, numerically? | Histograms of passage counts, complexity, pins, turns, non-ascii — measured before synthesis. |
| **split disjointness** | Is train/val leakage-free? | Group by persona user id; assert no user spans two splits. |
| **set-algebra completeness** | Does output cover exactly the intended ID set? | Bidirectional set difference + dupe counter on stable ids (general record↔verdict reconciliation). |
| **response-shape smoke** | Is the endpoint answer clean? | Inspect `reasoning_content`, `content`, `finish_reason` together — the three signals of thinking-budget starvation / truncation. |
| **readiness by served name** | Is the model actually loadable? | Poll until the model *name* is served, not until the port opens; then one real inference. |
| **artifact integrity** | Did the transfer arrive complete? | Byte/size compare across the boundary; prefer a hash over a size. |

### Operations
| Shape | Answers | Notes |
|---|---|---|
| **deploy → compile → restart → poll** | Does the patched file survive install and come back? | `md5sum` before/after; `py_compile` as the service user; bounded health poll with a `journalctl` dump on exhaustion. |
| **quoted heredoc over SSH** | What does the guest actually run? | `cat <<'REMOTE' \| ssh host 'bash -s'` — quoted delimiter prevents local expansion; `set -eu`. |
| **quoting-safe delivery** | How do I avoid nested-quote hell? | Write the script to a file and `scp`; or base64-encode it. Multi-layer quoting is the most frequently flagged recurring probe bug. |
| **token-minting chain** | How do later probes authenticate? | `local/session` → CSRF → `api-tokens`; store the token; verify with a Bearer request. |
| **reversible mutation** | How do I write safely? | Survey FK/columns → CSV backup → `ON_ERROR_STOP=1` transaction → read back. |
| **irreversible-op precondition** | Is it safe to destroy/rebuild? | Refuse if a lock key exists (`user_lock:*`); refuse if the live disk *is* the template. |
| **detached durable job** | How does a long job survive logout? | `systemd-run --user` (not `nohup` inside the session scope, killed ~21 min after logout). |
| **profiler attach** | Where does the time go? | `py-spy record -d N --pid $(MainPID)`; bounded window; parse samples. |

## Moment three — write it

### Anatomy

```
"""<Kind label>. <One-sentence question>. <Real surface>. <What it deliberately does not touch>."""
setup    → the fixture (throwaway user, scratch schema, shim module, local server)
exercise → call the REAL changed path
assert   → exact values; a control where the outcome is a classification
print    → a terminal marker: PROBE PASSED / ALL PASS / PASS <check>
exit     → nonzero on any failure (sys.exit(1) / raised SystemExit)
teardown → remove every fixture; then assert no residue
```

Conventions:

1. **State the question in the docstring.** The JSONB exemplar's header names what it verified,
   when, against what, and *why it was disposable*. The next reader knows why it exists.
2. **Controls where the outcome is a classification.** A guard probe must prove the hostile input
   is refused *and* the legitimate input is admitted: `bogus 413` → `ProviderProtocolError`;
   `overflow 413` → `ProviderContextOverflowError`; `tool_use_failed on 413` stays 400-only. A
   guard that blocks everything passes a "blocked" assertion forever.
3. **Assert exact values, not truthiness.** `assert (deleted, epoch) == (1, 2)`, not `assert
   deleted`. `assert vip == "192.168.1.50"`, not `assert ip`.
4. **Witness the raise.** `try: ...; raise SystemExit("FAIL: did not raise") except Expected as e:
   assert <message>`. An absent raise is a defect; the probe makes the absence fail the probe.
5. **Terminal marker + nonzero exit.** `print("PROBE PASSED: ...")`, `sys.exit(0 if ok else 1)`.
   Without a marker a silent probe is indistinguishable from a hung one.
6. **Bound every wait.** `timeout N python3`, `curl --max-time`, `future.result(timeout=…)`,
   `psycopg connect_timeout`, `ServerAliveInterval`. A possibly-unbounded probe makes its own
   failure unobservable.
7. **Clean up, then assert cleanliness.** Remove the fixture dir, drop the scratch DB, destroy the
   minted AppRole secret-id, restore the mutated secret, `rm` the temp script. Scan:
   `assert not [k for k in client.scan_iter('probe:*')]`; `git status --porcelain`; `ls data/users/`.
8. **Namespace scratch state** (`probe:*`, `mira_probe_*`, `_vtest`) so residue is attributable.
9. **Never leak a secret.** Print length/prefix only; the probe asserts `key not in out` where
   stdout is captured.
10. **Credentials from the sanctioned store only** — never a literal, env var, or default.

**Observed vs required.** This shape is the doctrine's requirement, and the corpus met it
unevenly: explicit control language appears in ~61 probes (~2%) and `assert` in ~302 (~10%).
Controls are asynchronous — the permanent batteries are where they became mandatory, and
disposable probes largely ran without them. The gap is itself the finding.

### The static scaffold does the conceptual work

The surrounding fixed strings declare *what kind of act this is*, *what counts as done*, *what is
real*, and *what is excluded*. They condition the model writing the next line as much as the reader
after it.

- **The invocation skeleton removes transport layers.** Prefer a file you run, or a simple
  `-c`/heredoc, over deeply nested inline quoting. Measured: heredoc 1,278 / inline `-c` 1,464 /
  file+`scp` 67 / quoted-`REMOTE` 40; `timeout`-bounded 318; `2>&1` 688; `| tail` 357; path pinned
  271; env exported 185; service user 54. Bound with `timeout`; merge and bound output; pin the
  root and export the env so the probe runs as production does.
- **The first line names the kind and the bound.** "Disposable path-probe", "live verification
  battery" — the label carries the disposition: throw it away, or treat it as permanent.
- **Bind the probe to the defect's identity.** Put the finding id in the header comment (`# L-7:`,
  `# --- Probe 1 (M-11):`). A partial run stays locatable; shape-based re-derivation is prevented.
- **Adjacent to the dynamic input, put the expectation.** "Case A must raise; Case B must
  complete"; `must_block`/`must_allow`; `DESTRUCTIVE`/`BENIGN`; `PROBE 1..5`. The label is the
  oracle annotation.
- **Write the bound as a comment before the dynamic code.** What is real, what is deliberately
  bypassed, and why — "real connection-refused, no mocks"; "this verifies control flow, not
  infrastructure." These stop the model drifting into a fake of the subject.
- **Emit one fixed success token, and grep for it.** `PROBE PASSED`, `ALL PASS`, `ALL-CLEAN`,
  `DB-PROBE-BLOCKED`, `MIRA_POST_REPORT_BEGIN/END`. Keep it a shared constant so emitter and parser
  cannot drift; sanity-check the static string's presence before trusting the run.
- **Failure messages are templates with a dynamic slot.** `assert before == after, f"mismatch on
  {mem.id}"` — the static text names the check; the slot carries the identity.
- **Vocabulary is the frame.** Probe, not test. Disposable, not temporary. Witness, not assertion.
  Hostile input, not edge case. The renaming is the mechanism.
- **Negative space is load-bearing.** "Not reportable", "out of scope", "do not fix", "never
  re-run." Exclusions close the space the model would otherwise fill creatively.
- **Register: flat, declarative; indicative is normative.** Narration is a pointer ("Now the live
  probe — real X, exercising Y"), not mood.
- **Bake static constants; verify delivery.** A string that must arrive intact is a literal,
  sanity-checked — never routed through a fragile channel.
- **Survive the transport.** Quoted delimiters, tags built from `chr()`, and a byte-compare of the
  delivered script against the edited file.

### Controls and the fake rule

Carry a **positive and a negative control** where the outcome is a classification. A fake replaces
a **collaborator**, never the subject, and the probe states the bound it imposes — a scripted
`FakeConn`, a `FakeValkey` implementing the store's real interface, or `get_valkey = lambda: None`
when the probed path makes no store calls. A fake of the code under test is never legal.

## Moment four — run it and read the result

- **Bound every wait** (see anatomy).
- **Print the raw before judging.** When it fails, the output must contain enough to adjudicate
  code-versus-probe.
- **Adjudicate first, conclude second.** Before believing a failure: is the probe or the subject
  wrong? Reduce to the smallest thing that still fails. If the raw output is consistent with
  correct behavior, the assertion is wrong. The corpus's most repeated line is *"my probe harness
  was wrong again, not the code"* — determine it, do not assume it.

## Moment five — report

**EXECUTED and UNVERIFIED are separate from applied.** A change set can be fully applied and
entirely unverified. Report both, always.

- **EXECUTED** — you ran the changed path against live infrastructure with hostile input; say
  exactly what ran and what the input was.
- **UNVERIFIED** — you did not; name the probe that would cover it and what blocked the run.

An honest UNVERIFIED with a named covering probe is a complete deliverable. A false EXECUTED is a
defect you introduced. Also:

- **Reproduce before you fix.** The strongest probes show the old behavior failing and the new
  passing in one run (RED/GREEN).
- **A passing probe is not coverage.** Root doctrine: "Every Claimed Defense Has a Witness" — a
  sentence claiming something is wrapped/enforced/atomic/verified corresponds to a live
  path-probe, or the claim is deleted.
- **The probe can find the fix incomplete.** The M-25 health-endpoint probe passed its "no infra
  detail leaks" goal for a psycopg failure, then found a Vault outage leaked `str(e)` through
  `BaseHandler`'s catch-all — and drove a further fix. Probes are for finding out, not stamping.
- **Faithfulness controls.** When a probe extracts or reimplements part of the shipped code, prove
  the extraction is faithful (digest) before trusting the measurement.
- **State the bound.** "SUSPECTED (upstream strictness unverifiable)" is a complete answer.
- **Environment blockers are findings, not probe failures.** Print the real traceback
  (`DB-PROBE-BLOCKED: …`), exit nonzero, do not fake it. Recovery: re-establish the tunnel
  (`ssh -fN -o ExitOnForwardFailure=yes -L`), mint fresh AppRole creds, provision the missing Vault
  mount, restart the hung dev service — announced and justified.

## Moment six — promote or discard

Default: **discard.** A probe that answers one question adds nothing on re-run. Promote it only
when the question turns out to be one whose answer must never change:

- Needs live infrastructure → register a `CheckSpec` path-probe in `utils/power_on_self_test.py`.
- Runs offline, and the user authorized it → `tests/protected/` (admission is the exact phrase
  `AUTHORIZE PROTECTED TEST SAVE`, per-file, per-save).
- Otherwise → it is display only, or it is gone.

Never leave a disposable probe in the tree. `/tmp` or inline is the home. `tests/fixtures/` is
scaffolding, not a home — a probe never lives there; only claim-free setup and teardown does.

## When the instrument is wrong

A notable share of `FAIL` lines are probe bugs, not code bugs. Diagnose before acting.

| Probe bug | Symptom | Fix |
|---|---|---|
| **shared frame / transcription** (false pass) | probe green; live code wrong | Import the real symbol; when copying, prove faithfulness (digest) |
| **no-op assertion** (false pass) | green; the assertion never ran (early return, swallowed exception, narrowed case table) | Make it reachable; run it in the passing branch; a control |
| `object.__new__` skips `__init__` | `AttributeError` on `_turn_counts`, empty pattern list | Set the init-built attrs, or use the real constructor |
| user context unset | `RuntimeError: No user context set` | `set_current_user_id(...)` first |
| wrong symbol / module | `AttributeError: … has no attribute …` | `inspect.signature` / read the real module |
| wrong assertion encoding | `AssertionError` on correct behavior — compact JSON spacing, `quote=True`, wrapper's leading newline | Assert containment or the realized form; print `repr` |
| catch-and-continue hides the sentinel | the probe's exception never propagates | Assert on the **log record**, not on a raise |
| singleton / pool not reset | probe hits the live server though config points at a dead port | Clear the client *and* the pool; force a real refusal |
| environment failure as subject failure | `FAIL` while infra was down | Gate on the environment; print `could not run` distinctly |
| invalid fixture | a library cannot open the hand-built file | Fix the fixture, not the code |
| cap too tight | a real artifact truncated at a byte cap | Size the cap to the artifact |
| nested quoting | `JSON decode error`, `here-document` delimiter | Write a file and `scp`/run; quoted delimiter |
| fixed `sleep` instead of readiness | premature check while the gate loads | Poll the real readiness signal |
| literal tags in a heredoc | `SyntaxError` / mangled source | Build from `chr()` / concatenation |
| glob / set-algebra mismatch | "0 extra" from the wrong glob | Separate the globs; the set difference is the check |
| placeholder lines left in | `SyntaxError`, stray `with self_cm` | Re-read the probe before running it |
| `except … as e` lifetime | `NameError: e` after the block | Save to a plain variable |
| `pkill -f 'ssh -fN -L …'` misses | stale forward stays | `lsof -ti tcp:<port> -sTCP:LISTEN` |
| def-time default not patched | a `_TOKEN_NAME` change had no effect | Patch at the call boundary |
| raw `<` count over the whole output | false positive on the wrapper's prose | Reparse the emitted **grammar**; assert no raw `<`/`>` *inside* the element |
| coarse polling misses a sub-second burst | "client stalls" | Observe inside the event mapper, not a poll loop |
| local `conn.close()` ≠ a network drop | clean close never trips `_reconnecting` | Kill the tunnel to force `ConnectionClosedError` |
| stand-in server bug | `int("flaky")`, missing `do_POST` → `ValueError`, 501 | The stand-in server has bugs too; handle verbs, guard parses |
| eager loop-literal evaluation | the "bad input" is constructed before `try` | Build each bad input lazily inside the `try` |
| assumed class-level schema | `getattr(cls, "tool_schema")` is `None` on a `@property`/instance-built schema | Skip dynamic schemas by name; they are documented by design |

The corpus's own summary: **"My probe harness was wrong again, not the code."** Distinguishing the
two is part of the work; fixing the probe and saying so is the deliverable.

## Writing code that is probe-able

1. **Separate the pure decision from the I/O.** `_validate_command(command, root, cwd)` is regex +
   `posixpath` + `raise`; its battery drives the corpus with **zero** process execution. A pure
   function is the highest-value probe surface there is.
2. **Inject dependencies; keep connections lazy.** `DistributedLock.__new__` constructs with
   `_valkey is None` and resolves on first use. A constructor that eagerly opens Vault/Postgres
   makes offline import impossible.
3. **Make seams configurable and deterministic.** `config.heartbeat.device_power_binding.module_path`
   lets a probe point the loader at `/tmp/shim_*.py`. A hardcoded import path cannot be probed.
4. **Fail loud with typed exceptions carrying identity.** `ProviderContextOverflowError` distinct
   from `ProviderProtocolError`; `PostgresPoolError` distinct from `PoolTimeout`. A probe asserts
   `type(e).__name__`.
5. **Guard in the mutation.** `UPDATE/DELETE … WHERE <guard>`, compare-and-set, `GETDEL`. A probe
   can race two writers and assert exactly one row changed.
6. **Provide a sanctioned surface for setup and teardown.** `db.get_memories_paginated`,
   `add_webauthn_credential` / `remove_webauthn_credential`, `UserDataManager(uuid, session_key=…)`.
7. **Return diagnostics, not only raises.** POST `CheckSpec` probes return `dict[str, Any]` details
   and let `_run_one_check` record the diagnostic + traceback.
8. **Keep IDs stable and round-trips lossless.** Short memory IDs are irreversible prefixes; probes
   key on identity, never position or shape.
9. **Namespace state so residue is attributable.** `probe:*` Valkey keys, `post-owner-*@mira.local`
   canary users.
10. **Make irreversible operations refuse on a precondition.** The VM rebuild script refuses if a
    `user_lock:*` key exists or the live disk is the template.
11. **Idempotent writes.** Same-day duplicate marks return existing state; a re-run verifies rather
    than double-applies.
12. **Small, single-purpose modules.** A probe should import one module without the whole app.
    Eager import-time side effects are the enemy of the offline floor.

**Unprobeable-code signature:** whole-column read-modify-write; `try/except: return ""` around
infrastructure; `Optional[X]` for a required result; per-turn state on a singleton attribute;
hand-written `WHERE user_id` where the owning service exists; stored rows validated against the
current schema.

## Permanent probes: the POST registry pattern

`CheckSpec(component, required, probe)`; `probe` returns `dict[str, Any]` or raises. One failing
check never aborts the phase; phases are bounded by a deadline; required vs advisory is explicit;
reports are marker-delimited Pydantic models parsed from a subprocess. The gate **parks** on
repeated failure rather than exiting into a restart loop that would re-run billed probes.

The flagship is the **RLS canary** (`_run_postgres_rls_canary`): two throwaway users, owner sees 1
/ other sees 0, a self-healing sweep of stale debris that fails loud, and a `finally` cleanup. The
LLM reachability probe (`_probe_llm_target`) builds the real dialect and drives real
`LLMLifecycle.complete()`, then asserts the response has text, reasoning, or tool calls — the
signature of a thinking model that starved its own output.

## Offline batteries

For a destructive decision function: `sys.addaudithook` installed **before** any project import,
refusing process-spawn / network / filesystem mutation so the surface is structurally unreachable;
`dis`-walk the validator's globals to prove it is pure; disable bytecode caching; no transcription
of the code under test; the benign half mandatory; safe-disposition movement reported as DRIFT, and
only a safety failure fails the run.

## Gates

- [ ] One question; the real surface; the venue; the fixture and its destruction.
- [ ] Shape chosen: cheapest that reaches the real path.
- [ ] Docstring declares kind, question, bound.
- [ ] Real artifact, real infra, sanctioned credentials; no fake of the subject.
- [ ] A control where the outcome is a classification.
- [ ] Exact-value assertions; the raise witnessed.
- [ ] Every wait bounded; terminal marker; nonzero exit.
- [ ] Teardown in `finally`; residue asserted absent; no secret printed.
- [ ] Ran it; adjudicated code-versus-probe before concluding.
- [ ] Reported EXECUTED (what ran, what input) or UNVERIFIED (why, which probe).
- [ ] Promoted only if the answer must never change; otherwise discarded.

## References

- Exemplars: `tests/tmp/jsonb_roundtrip_probe.py` (disposable), `tests/protected/mlfactory_guardrail_probe.py`
  and `tests/protected/injection_defense_probe.py` (batteries), `utils/power_on_self_test.py`
  (permanent probes, `_run_postgres_rls_canary`, `_probe_llm_target`).
- Shared scaffolding: `tests/fixtures/AGENTS.md` — fixture user, scratch database, reachability
  gate, residue checks, results harness; real-infra and claim-free.
- `tools/HOW_TO_BUILD_A_TOOL.md` and the sibling guides carry the per-surface verification tiers
  and the offline floor.
