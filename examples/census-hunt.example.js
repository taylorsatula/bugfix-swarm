export const meta = {
  name: 'census-hunt',
  description: 'MIRA full census 2026-09-20: hunt → primed verify → blind/recheck → dedupe',
  phases: [
    { title: 'Hunt', detail: 'area/mechanism/seam investigators (4 pilot areas pre-hunted)' },
    { title: 'Verify', detail: 'primed verifier per finding' },
    { title: 'Third', detail: 'blind third pass on H survivors; recheck on refutations' },
    { title: 'Dedupe', detail: 'merge corpus into BUG_REPORT.md' },
  ],
}

const REPO = '/Users/taylut/Programming/GitHub/mira-OSS'
const RUN = 'scratch/census-20260920'
const REPORTS = REPO + '/' + RUN + '/reports'

const PREAMBLE = `
You are doing a read-only static bug hunt in the repo at /Users/taylut/Programming/GitHub/mira-OSS. Do not modify any file.

Reportable defect: logic errors, race conditions, data-loss or corruption paths, cross-user data leakage, security or auth bypasses, credential exposure, hangs/deadlocks/unbounded waits, silently-degraded failures, misreported errors (a failure path that reports success or wrong data), contract violations between components, incorrect gating arithmetic, check-then-act races on shared state, LLM output parsed by position/shape instead of an identity tag, external content reaching any model context without injection screening. Reportable requires a concrete runtime path in the tree today where wrong behavior manifests: who triggers it, and what goes wrong. "A working engineer would stop and fix this today" is the bar.

Not reportable:
- Style, naming, docstrings, missing type hints, formatting.
- Missing tests or test files — this repo prohibits test files by doctrine; verification is live probes. DO report: a comment or docstring claiming a defense ("wrapped", "enforced", "atomic", "verified") that no live probe exercises, or a probe-surface path (user-facing read/write/search, auth flow, failure path) that both lacks a probe AND behaves wrongly — the probe-gap alone is not the defect.
- Intentional doctrine decisions, boundaries drawn: greenfield with no back-compat (do not report breaking changes or missing migration paths); Optional[X] for genuine domain optionality is intended — Optional (or try/except-default) on the result of required infrastructure IS reportable; event-bus notification-not-call-return is intended — a handler that must return a result to its publisher IS reportable; RLS returning zero rows without user context is intended (fails closed); background threads/pollers are intended — losing user context or unbounded waits at their boundaries ARE reportable; the deploy path being greenfield-only (installs into an empty DB, no in-place upgrade) is intended; collapse/extraction tolerating-and-logging in background durability IS intended — but a degraded result that silently corrupts the deliverable for its consumer IS reportable.
- The uncommitted working tree as such — the dirty tree is the tree under audit; report defects in it, not its dirtiness. Untracked files (tui/, mlfactory_fs_tool.py) are in scope like everything else.
- training_data/ is excluded scratch data — never read it, never report it.
- Speculative design risks UNLESS you can point to a concrete current code path that already misbehaves. Max 2, in a separate "Design risks" section.
- The sanctioned mechanisms themselves (Vault, contextvars/RLS flow, load_prompt(), timezone utils, the event bus) are intended — code that bypasses or hand-rolls a parallel one IS reportable.

CALIBRATION RULE (strict): the defect must be reachable by code in the tree today — a real caller and a real trigger; a path nothing in the tree calls is marked latent and capped at L. Required-infrastructure failures must propagate; catching-and-defaulting required infrastructure IS reportable. Weigh frequency honestly and name it: common path / plausible in normal operation / requires a coincidence race / environment-armed (disk full, connection dropped mid-window) / no live trigger in tree today.

SEVERITY SCALE (pinned, by consequence):
- H — data loss or corruption; cross-user data access; security or auth bypass; hang/deadlock or unbounded wait on a common path; wrong data reported to the user.
- M — a degraded failure that silently corrupts the deliverable for its consumer; a race requiring plausible coincidence; an accumulating resource leak; a contract violation with a plausible trigger; wrong order of operations on a plausible path.
- L — latent (unreachable today); edge-case misbehavior needing environment-arming; hygiene-level correctness issues.

Method:
- Enumerate every file in your assignment first; then read each end-to-end (page through long files with offset/limit). Do not rely on grep excerpts alone.
- Where your assignment includes an enumeration task, build one composed command that closes the class (rg / find / awk over the tree) and return the command beside its output table. Enumeration answers "is the class closed"; reading answers "is this site wrong". Disposition EVERY enumerated instance in your report: finding / examined-clean / out-of-scope-with-reason. Un-dispositioned instances are a coverage hole.
- Trace each candidate across its callers/callees before reporting.
- Before finalizing, attempt to refute each candidate yourself. Drop anything you cannot defend in review. Zero findings is an acceptable result — do not manufacture findings.
- New discoveries outside your assignment are a side effect, not the goal; report them in a separate labeled section.

Output contract — two pieces:
1. Write your full report to the assigned report path (create the file; it is your only deliverable artifact). Report format:

## Findings
N. [SEVERITY] — title
- Location: file:symbol
- Evidence: short quote
- Trigger: exact runtime path — who causes it, what must coincide
- Outcome: what goes wrong, user-visible consequence
- Frequency: common path / plausible / coincidence race / environment-armed / latent
- Confidence: traced/suspected per component (mechanism / trigger / frequency); mark latent paths
## Checked and clean
what you examined and found correct, area by area
## Design risks (optional, max 2)
## Enumeration (if assigned)
command + table + a disposition for every instance

2. Then return ONLY an envelope via the structured output tool. Finding id format: <your-pass-id>-F<n>, e.g. cns-api-F1.
`

// Fail-loud sanity checks before any dispatch
if (PREAMBLE.indexOf('SEVERITY SCALE (pinned, by consequence)') < 0) throw new Error('SANITY FAIL: preamble missing severity scale')
if (PREAMBLE.indexOf('training_data/ is excluded') < 0) throw new Error('SANITY FAIL: preamble missing training_data exclusion')
if (PREAMBLE.indexOf('ENVELOPE') >= 0) throw new Error('SANITY FAIL: preamble must NOT contain the word ENVELOPE (stale revision)')
if (PREAMBLE.length < 3000) throw new Error('SANITY FAIL: preamble suspiciously short: ' + PREAMBLE.length)

const HUNT_SCHEMA = {
  type: 'object',
  properties: {
    report_path: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          severity: { type: 'string', enum: ['H', 'M', 'L'] },
          location: { type: 'string' },
          trigger: { type: 'string' },
          frequency: { type: 'string' },
          confidence: { type: 'string' },
        },
        required: ['id', 'title', 'severity', 'location', 'trigger', 'frequency', 'confidence'],
      },
    },
    clean: { type: 'array', items: { type: 'string' } },
    disputes: { type: 'array', items: { type: 'string' } },
  },
  required: ['report_path', 'findings', 'clean', 'disputes'],
}

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    report_path: { type: 'string' },
    verdict: { type: 'string', enum: ['CONFIRMED', 'REFUTED', 'ADJUSTED'] },
    severity_final: { type: 'string', enum: ['H', 'M', 'L'] },
    frequency_final: { type: 'string' },
    refuted_subclaims: { type: 'array', items: { type: 'string' } },
    added_mechanisms: { type: 'array', items: { type: 'string' } },
    fix_constraints: { type: 'array', items: { type: 'string' } },
    boundary: { type: 'string' },
  },
  required: ['report_path', 'verdict', 'severity_final', 'frequency_final', 'refuted_subclaims', 'added_mechanisms', 'fix_constraints', 'boundary'],
}

// Pilot areas were hunted before this script launched; findings baked in after orchestrator review.
// Each pilot area's stage-1 returns the baked envelope directly.
const PILOT_FINDINGS = {
  'cns-services-turn': [
    { id: 'cns-services-turn-F1', title: 'Keepsleeping heartbeat turns never filtered from live context (hot-cache compose path + live compaction selection)', severity: 'M', location: 'cns/services/live_context_compaction_service.py:filter_messages_for_live_context / select_range', trigger: 'see hunter report', frequency: 'common path', confidence: 'see hunter report' },
    { id: 'cns-services-turn-F2', title: '_last_turn_usage stores summed per-step input tokens, triggering premature live compaction', severity: 'M', location: 'cns/services/orchestrator.py:_stream_model_tool_loop / _consume_stream', trigger: 'see hunter report', frequency: 'plausible in normal operation', confidence: 'see hunter report' },
    { id: 'cns-services-turn-F3', title: '_process_checkin_response swallows required-infrastructure failures, silently dropping user check-in feedback', severity: 'L', location: 'cns/services/orchestrator.py:_process_checkin_response', trigger: 'see hunter report', frequency: 'environment-armed', confidence: 'see hunter report' },
  ],
  'cns-services-segments': [
    { id: 'cns-services-segments-F1', title: 'Tombstone collapse path skips SegmentCollapsedEvent and ManifestUpdatedEvent (poller thread leak, stale trinkets/manifest)', severity: 'M', location: 'cns/services/segment_collapse_handler.py:collapse_segment (tombstone branch)', trigger: 'see hunter report', frequency: 'deterministic once tombstone fires (persistent collapse failure)', confidence: 'see hunter report' },
    { id: 'cns-services-segments-F2', title: 'Manual collapse during an in-flight turn orphans that turn from the segment digest (summary/extraction/end_time)', severity: 'M', location: 'cns/services/segment_collapse_handler.py:collapse_segment pre-save recheck, via cns/api/actions.py', trigger: 'see hunter report', frequency: 'plausible in normal operation', confidence: 'see hunter report' },
    { id: 'cns-services-segments-F3', title: 'manifest get_segments catches builtin exception types the Valkey client never raises; documented outage degrade is dead code', severity: 'M', location: 'cns/services/manifest_query_service.py:get_segments', trigger: 'see hunter report', frequency: 'environment-armed (Valkey outage)', confidence: 'see hunter report' },
    { id: 'cns-services-segments-F4', title: 'SegmentPoller._on_compose check-then-act window can lose a concurrent SegmentCollapsedEvent stop', severity: 'L', location: 'cns/services/pollers/segment_poller.py:_on_compose', trigger: 'see hunter report', frequency: 'coincidence race', confidence: 'see hunter report' },
  ],
  'cns-services-models': [
    { id: 'cns-services-models-F1', title: 'Unparseable critic response treated as validation PASS; can let unvalidated/empty candidate replace stored user model', severity: 'M', location: 'cns/services/user_model_synthesizer.py:_validate_with_critic (+lora_service.py:_validate_with_critic)', trigger: 'see hunter report', frequency: 'plausible in normal operation', confidence: 'see hunter report' },
    { id: 'cns-services-models-F2', title: 'Critic-exhaustion fallback returns previous model as success; caller then destroys check-in feedback and marks signals synthesized', severity: 'M', location: 'cns/services/user_model_synthesizer.py:synthesize', trigger: 'see hunter report', frequency: 'plausible in normal operation', confidence: 'see hunter report' },
    { id: 'cns-services-models-F3', title: 'Assessment extractor wraps tool-role messages in <user> tags — external/tool content attributed to the user in assessment evidence', severity: 'M', location: 'cns/services/assessment_extractor.py:_format_messages', trigger: 'see hunter report', frequency: 'common path', confidence: 'see hunter report' },
    { id: 'cns-services-models-F4', title: 'Subcortical renders structured assistant messages as Python list/dict reprs (reasoning traces, tool-call JSON) into its prompt', severity: 'M', location: 'cns/services/subcortical.py:_format_recent_turns', trigger: 'see hunter report', frequency: 'common path', confidence: 'see hunter report' },
    { id: 'cns-services-models-F5', title: 'Observer LLM guidance text injected unescaped into main model prompt — injection screening gap at model-output boundary', severity: 'M', location: 'cns/services/peanutgallery_model.py:_parse_guidance → peanutgallery_trinket.py:generate_content', trigger: 'see hunter report', frequency: 'plausible in normal operation', confidence: 'see hunter report' },
    { id: 'cns-services-models-F6', title: 'Portrait/LoRA preview accept has no parent/version guard; accepted stale preview silently reverts newer automatic synthesis', severity: 'M', location: 'cns/services/portrait_service.py:accept_portrait + lora_service.py:accept_lora', trigger: 'see hunter report', frequency: 'coincidence race', confidence: 'see hunter report' },
    { id: 'cns-services-models-F7', title: 'Unparseable assessment output laundered into zero signals logged at INFO — failure reported as clean no-signal segment', severity: 'L', location: 'cns/services/assessment_extractor.py:extract_signals/_parse_assessment_xml', trigger: 'see hunter report', frequency: 'plausible', confidence: 'see hunter report' },
  ],
  'm-spawns': [
    { id: 'm-spawns-F1', title: 'heartbeat_tick runs a synchronous admin Postgres query directly on the asyncio event loop (AsyncIOScheduler runs the coroutine on the loop)', severity: 'M', location: 'cns/services/heartbeat_service.py:heartbeat_tick', trigger: 'see hunter report', frequency: 'common path (every 60s tick, default-enabled); multi-second magnitude environment-armed', confidence: 'see hunter report' },
    { id: 'm-spawns-F2', title: 'Unbounded future.result() at the thread→asyncio stream boundary (run_coroutine_threadsafe, no timeout, cancellation unreachable while blocked)', severity: 'M', location: 'cns/api/websocket_chat.py:stream_to_connection', trigger: 'see hunter report', frequency: 'plausible in normal operation composed with F1 loop stall; unbounded case environment-armed', confidence: 'see hunter report' },
  ],
}

const AREAS = [
  { id: 'cns-api', kind: 'area',
    files: ['cns/api/__init__.py','cns/api/actions.py','cns/api/base.py','cns/api/chat.py','cns/api/data.py','cns/api/federation.py','cns/api/files.py','cns/api/health.py','cns/api/heartbeat_api.py','cns/api/location.py','cns/api/tool_config.py','cns/api/trigger_rules.py','cns/api/update.py','cns/api/websocket_chat.py'],
    question: 'What defects exist in the HTTP/WS entry surfaces — websocket turn-protocol races (double connect, close ordering, interleaved messages, turn-in-flight rules), auth/rate-limit gaps on routes, user contextvar set exactly once at the boundary for every route, misreported errors, response shapes diverging from what the web client expects?',
    context: 'Read cns/api/AGENTS.md first. websocket_chat.py owns the server side of the WS turn protocol; user_id resolves via contextvar set at the API boundary. Federation and files routes are external-input surfaces.' },
  { id: 'cns-core', kind: 'area',
    files: ['cns/core/__init__.py','cns/core/continuum.py','cns/core/events.py','cns/core/message.py','cns/core/message_formatter.py','cns/core/segment_cache_loader.py','cns/core/state.py'],
    question: 'What defects exist in the immutable domain model — Continuum aggregate invariant violations (mutation paths that break immutability), event payload contracts, segment state-machine transitions, segment_cache_loader serving stale or wrong-segment data?',
    context: 'Read cns/core/AGENTS.md first. Events are the coordination backbone: a payload field a subscriber assumes but publisher omits is a defect.' },
  { id: 'cns-infra', kind: 'area',
    files: ['cns/infrastructure/__init__.py','cns/infrastructure/continuum_pool.py','cns/infrastructure/continuum_repository.py','cns/infrastructure/feedback_repository.py','cns/infrastructure/feedback_tracker.py','cns/infrastructure/persona_repository.py','cns/infrastructure/valkey_message_cache.py'],
    question: 'What defects exist in persistence — SQL where the guard lives outside the mutation (SELECT-then-UPDATE/DELETE without WHERE precondition), transaction boundary errors in UnitOfWork usage, continuum pool lifecycle races (checkout/checkin/evict), valkey cache invalidation gaps and TTL errors, dual-write inconsistencies between Postgres and Valkey?',
    context: 'Read cns/infrastructure/AGENTS.md first. These files are churned in the uncommitted tree; the dirty tree is the tree under audit.' },
  { id: 'cns-integration', kind: 'area',
    files: ['cns/__init__.py','cns/integration/__init__.py','cns/integration/event_bus.py','cns/integration/factory.py'],
    question: 'What defects exist in event-bus wiring and graph construction — handler registration by class __name__ mismatches, sync-handler rule violations, dependency-graph construction order (a subscriber constructed before a publisher it needs, or vice versa), per-request state smuggled through the bus?',
    context: 'Read cns/integration/AGENTS.md first. Handlers are synchronous by doctrine; async work inside a handler must spawn a thread with copied context.' },
  { id: 'auth', kind: 'area',
    files: ['auth/__init__.py','auth/account_gc.py','auth/api.py','auth/config.py','auth/database.py','auth/email_service.py','auth/exceptions.py','auth/mode.py','auth/provisioning.py','auth/rate_limiter.py','auth/security_logger.py','auth/security_middleware.py','auth/seed_lora.py','auth/service.py','auth/session.py','auth/types.py','auth/webauthn_service.py'],
    question: 'What defects exist in the auth surface — session lifecycle races (login/logout/GC against live sessions, token revocation racing use), CSRF gaps, WebAuthn verification shortcuts, rate-limiter accounting errors (wrong key, off-by-one windows, bypass via header manipulation), account GC deleting live data, provisioning idempotency, email service failure paths misreporting?',
    context: 'Read auth/AGENTS.md first. account_gc is destructive: races between lifecycle operations are high-stakes.' },
  { id: 'clients', kind: 'area',
    files: ['clients/__init__.py','clients/hybrid_embeddings_provider.py','clients/lattice_client.py','clients/llm_provider.py','clients/postgres_client.py','clients/sqlite_client.py','clients/valkey_client.py','clients/vault_client.py'],
    question: 'What defects exist in the infrastructure clients — connection lifecycle and pool handling, RLS canary correctness in postgres_client, vault client failing to fail fast on missing credentials (fallback defaults are defects), valkey client error taxonomy (infrastructure outage masked as empty result), sqlite_client user-data scoping, embeddings batching correctness, lattice_client contract?',
    context: 'Read clients/AGENTS.md first. Required infrastructure MUST propagate failures — never catch-and-default.' },
  { id: 'clients-llm', kind: 'area',
    files: ['clients/llm/__init__.py','clients/llm/artifacts.py','clients/llm/capabilities.py','clients/llm/dialect_registry.py','clients/llm/events.py','clients/llm/lifecycle.py','clients/llm/resolver.py','clients/llm/thinking.py','clients/llm/tool_messages.py','clients/llm/types.py'],
    question: 'What defects exist in the LLM boundary — route resolution by name (hardcoded models/endpoints are defects), stall detection policy in lifecycle.py (ProviderStallError propagation, no fallback route — a fallback IS a defect), thinking signature round-trip integrity, tool_messages translation fidelity, capability gating errors, artifact handling?',
    context: 'Read clients/llm/AGENTS.md first. There is no fallback route by design — stalls and provider failures propagate.' },
  { id: 'llm-dialects', kind: 'area',
    files: ['clients/llm/dialects/__init__.py','clients/llm/dialects/anthropic.py','clients/llm/dialects/base.py','clients/llm/dialects/groq.py','clients/llm/dialects/openai.py','clients/llm/dialects/openai_chat_base.py','clients/llm/dialects/openrouter.py'],
    question: 'What defects exist in the per-provider dialects — wire-format mapping errors (system/developer role handling, tool-call id mapping, multi-part content), error taxonomy gaps (a provider error class mapped to the wrong bucket so a retry policy mis-fires), thinking translation per provider, request fields a provider rejects, response parsing losing content?',
    context: 'Read clients/llm/dialects/AGENTS.md first. Each dialect must faithfully translate to/from the neutral internal contract; dialect-specific divergence from base must be deliberate.' },
  { id: 'lt-memory', kind: 'area',
    files: ['lt_memory/__init__.py','lt_memory/db_access.py','lt_memory/entity_extraction.py','lt_memory/entity_merge.py','lt_memory/factory.py','lt_memory/hub_discovery.py','lt_memory/hybrid_search.py','lt_memory/linking.py','lt_memory/models.py','lt_memory/proactive.py','lt_memory/vector_ops.py'],
    question: 'What defects exist in long-term memory — scoring/ranking errors in hybrid_search, entity merge colliding distinct entities or splitting the same one, linking creating wrong or duplicate links, user-scoping of every query (RLS contextvar flow into spawned work), vector_ops correctness, proactive surfacing wrong memories, factory construction order?',
    context: 'Read lt_memory/AGENTS.md first. Memory short IDs (mem_XXXXXXXX) are irreversible UUID prefixes — short form for LLM surfaces, full form for persistence; conversions that lose information are defects.' },
  { id: 'lt-memory-proc', kind: 'area',
    files: ['lt_memory/processing/__init__.py','lt_memory/processing/consolidation_handler.py','lt_memory/processing/execution_strategy.py','lt_memory/processing/extraction_engine.py','lt_memory/processing/memory_processor.py','lt_memory/processing/orchestrator.py'],
    question: 'What defects exist in the extraction pipeline and consolidation — queued memories lost to collapse faults (silent failure losing data), retry counters consuming budget on infrastructure/LLM outages, LLM output extracted by position/shape instead of identity tags, consolidation ordering errors, execution strategy starvation or duplication, extraction failure paths misreporting?',
    context: 'Read lt_memory/processing/AGENTS.md first. extraction_engine.py is churned in the uncommitted tree. Background durability tolerates-and-logs by doctrine — but a degraded result that silently loses a queued memory IS reportable.' },
  { id: 'wm', kind: 'area',
    files: ['working_memory/__init__.py','working_memory/composer.py','working_memory/core.py','working_memory/types.py'],
    question: 'What defects exist in system-prompt composition — trinket slot ordering/stability, missing-slot handling, a trinket variable_name that no consumer reads or a slot expecting a variable no trinket provides, per-user state on the composer singleton, event-driven recomposition races (two compositions interleaving)?',
    context: 'Read working_memory/AGENTS.md first.' },
  { id: 'trinkets', kind: 'area',
    files: ['working_memory/trinkets/__init__.py','working_memory/trinkets/asyncactivity_trinket.py','working_memory/trinkets/base.py','working_memory/trinkets/domaindoc_trinket.py','working_memory/trinkets/email_trinket.py','working_memory/trinkets/forage_trinket.py','working_memory/trinkets/live_context_compaction_trinket.py','working_memory/trinkets/location_trinket.py','working_memory/trinkets/lora_trinket.py','working_memory/trinkets/manifest_trinket.py','working_memory/trinkets/memory_curator_trinket.py','working_memory/trinkets/peanutgallery_trinket.py','working_memory/trinkets/persona_trinket.py','working_memory/trinkets/proactive_memory_trinket.py','working_memory/trinkets/reminder_manager.py','working_memory/trinkets/time_manager.py','working_memory/trinkets/whilethecatsaway_trinket.py'],
    question: 'What defects exist in the trinkets — per-user state stored on instance attributes of process-global singletons (THE rule: state must key on the contextvar), stale content served after segment collapse, external/model-authored content entering the system prompt without injection screening or escaping, trinket contracts violated (one variable_name slot each), reminder/time manager arithmetic?',
    context: 'Read working_memory/trinkets/AGENTS.md and HOW_TO_BUILD_A_TRINKET.md first. location/lora/proactive_memory trinkets are churned in the uncommitted tree.' },
  { id: 'tools-framework', kind: 'area',
    files: ['tools/__init__.py','tools/registry.py','tools/repo.py'],
    question: 'What defects exist in the tool framework — registration consistency (the four-piece registration: symbol anchors, schema, config, repo entry; collisions or gaps), return-envelope contract enforcement, user-scoped db/data-path access mechanisms, config registry merging (user override over global default; redaction sentinel round-trip)?',
    context: 'Read tools/AGENTS.md and tools/HOW_TO_BUILD_A_TOOL.md first — the guide is kept aligned with the code; a code/guide divergence IS reportable.' },
  { id: 'tools-impl-1', kind: 'area',
    files: ['tools/implementations/bash_tool.py','tools/implementations/contacts_tool.py','tools/implementations/continuum_tool.py','tools/implementations/domaindoc_tool.py','tools/implementations/email_tool.py','tools/implementations/feedback_tool.py','tools/implementations/forage_tool.py','tools/implementations/heartbeat_tool.py','tools/implementations/homeassistant_tool.py','tools/implementations/imagegen_tool.py','tools/implementations/inbox_tool.py','tools/implementations/invokeother_tool.py'],
    question: 'What defects exist in these tools — argument validation gaps (the LLM is an untrusted component: every argument is attacker-controlled), external content returned for the model to read without injection screening/wrapping, credentials mishandled (must inject server-side via UserCredentialService; the model names a credential it never sees), error envelopes without recovery guidance, user-data written outside user-scoped storage, bash_tool command surface, email/inbox content paths?',
    context: 'Read tools/implementations/AGENTS.md first. bash, email, inbox are churned in the uncommitted tree. Tool results entering model context are external content when they carry fetched/user data — screening applies.' },
  { id: 'tools-impl-2', kind: 'area',
    files: ['tools/implementations/maps_tool.py','tools/implementations/mlfactory_fs_tool.py','tools/implementations/memory_tool.py','tools/implementations/pager_tool.py','tools/implementations/phoneafriend_tool.py','tools/implementations/punchclock_tool.py','tools/implementations/reminder_tool.py','tools/implementations/sidebar_tool.py','tools/implementations/sidebaragents_tool.py','tools/implementations/weather_tool.py','tools/implementations/web_tool.py','tools/implementations/whilethecatsaway_tool.py'],
    question: 'Same tool-defect classes as the sibling group — argument validation, injection screening of fetched content, credential plumbing, error envelopes, user-data scoping — plus fresh-eyes scrutiny of mlfactory_fs_tool.py (untracked, never committed: it is a file-system-backed tool and a prime external-content boundary) and web_tool (fetched pages entering model context).',
    context: 'Read tools/implementations/AGENTS.md first. pager and web are churned; mlfactory_fs is new.' },
  { id: 'agents', kind: 'area',
    files: ['agents/__init__.py','agents/base.py','agents/sidebar.py','agents/implementations/__init__.py','agents/implementations/forage_agent.py','agents/implementations/memory_curator_agent.py','agents/implementations/whilethecatsaway_agent.py','agents/triggers/__init__.py','agents/triggers/memory_floor_trigger.py'],
    question: 'What defects exist in the sidebar-agent runtime — base-class loop mechanics (missed stop conditions, runaway iterations, unbounded work), dispatcher spawn paths (user context copied into spawned threads, double-spawn races, trigger discovery firing twice), Mode Contract adherence in the three implementations, work-item identity handling (extract by identity, not position)?',
    context: 'Read agents/AGENTS.md, agents/implementations/AGENTS.md, agents/triggers/AGENTS.md, agents/HOW_TO_BUILD_AN_AGENT.md first.' },
  { id: 'utils-1', kind: 'area',
    files: ['utils/artifact_store.py','utils/cost_accumulator.py','utils/database_session_manager.py','utils/device_binding.py','utils/distributed_lock.py','utils/document_processing.py','utils/domaindoc_shares.py','utils/http_client.py','utils/image_compression.py','utils/llm_tap.py','utils/logging_config.py','utils/lt_memory_jobs.py','utils/mcp_client.py','utils/nominatim_client.py','utils/perf.py','utils/playwright_service.py'],
    question: 'What defects exist in these utilities — distributed_lock correctness (lock expiry vs work duration, guard inside the mutation, fencing), database_session_manager session lifecycle (leaks, reuse across contexts), http_client timeouts on every outbound call, playwright_service browser lifecycle, artifact_store integrity, cost_accumulator accounting, mcp_client protocol handling?',
    context: 'Read utils/AGENTS.md first. distributed_lock is churned in the uncommitted tree. Every outbound HTTP call without a timeout is reportable (unbounded wait).' },
  { id: 'utils-2', kind: 'area',
    files: ['utils/power_on_self_test.py','utils/profile_validation.py','utils/prompt_injection_defense.py','utils/scheduled_task_monitor.py','utils/scheduled_tasks.py','utils/scheduler_service.py','utils/sidebar_jobs.py','utils/tag_parser.py','utils/text_sanitizer.py','utils/thread_monitor.py','utils/timezone_utils.py','utils/tool_config_store.py','utils/url_safety.py','utils/user_activity.py','utils/user_context.py','utils/user_credentials.py','utils/userdata_manager.py'],
    question: 'What defects exist in these utilities — prompt_injection_defense actual coverage vs its claimed defenses (wrap sites that bypass it), tag_parser identity-vs-position extraction (memory ID round-trips lossless both ways), timezone_utils DST edge handling (normalize_exact_local_wall_time, parse_time_string+ensure_utc), scheduled_tasks use-day gating arithmetic, scheduler_service job overlap/double-fire, tool_config_store redaction sentinel round-trip, userdata_manager Fernet encrypted__ prefix handling (double-decrypt), thread_monitor, POST boundedness (parks rather than exits)?',
    context: 'Read utils/AGENTS.md first. user_context contextvar is the sanctioned user-resolution path — code that threads user_id through parameters where the contextvar flows IS reportable (explicit set_current_user_id outside HTTP context is sanctioned).' },
  { id: 'config-main', kind: 'area',
    files: ['config/__init__.py','config/announcement.py','config/config.py','config/config_manager.py','config/prompts/__init__.py','config/prompts/loader.py','main.py','scripts/__init__.py','scripts/post_server_post.py','tests/protected/mlfactory_guardrail_probe.py'],
    question: 'What defects exist in config and lifecycle — config singleton mutation races (per-user merges on a process-global), config_manager per-user tool-config merge freshness, prompts loader (path traversal, load_prompt() contract), main.py lifespan startup/shutdown ordering (LT_Memory factory before CNS graph; websocket close_all_connections awaited; Valkey flush preserving heartbeat: prefixes), the pre-server POST gate before bind, announcement content, post_server_post probe correctness?',
    context: 'Read config/AGENTS.md, config/prompts/AGENTS.md, and the main.py sections of the root AGENTS.md. tests/protected holds the authorized permanent battery — audit the probe for realism (no mocks).' },
  { id: 'web-client-1', kind: 'area',
    files: ['web/assets/javascript/api-client.js','web/assets/javascript/core.js','web/assets/javascript/messaging.js','web/assets/javascript/events.js','web/assets/javascript/ui.js','web/assets/javascript/history.js'],
    question: 'What defects exist in the WS chat client — reconnect state machine (frames sent while socket half-open, missed close events, turn-in-flight on reconnect), frame inventory (every frame type the server sends has a handler — an unhandled sink is reportable), message ordering, XSS in rendered content (DOMPurify usage gaps, marked configuration), history rendering wrong data, api-client error handling misreporting?',
    context: 'Read web/AGENTS.md and web/assets/javascript/AGENTS.md first. The server side of the protocol is cns/api/websocket_chat.py — a seam pass checks the pair; your job is the client side read deeply.' },
  { id: 'web-client-2', kind: 'area',
    files: ['web/assets/javascript/sidebar.js','web/assets/javascript/domain-knowledge.js','web/assets/javascript/settings.js','web/assets/javascript/tool-config.js','web/assets/javascript/location.js','web/assets/javascript/notification_center.js','web/assets/javascript/collapse-animation.js','web/assets/javascript/repulsion-feedback.js','web/assets/javascript/segment-timeout.js','web/assets/javascript/theme.js','web/sw.js','web/chat/index.html','web/settings/index.html','web/memories/index.html','web/domaindocs/index.html'],
    question: 'What defects exist in these client modules — settings/tool-config forms sending wrong payloads, service worker cache serving stale assets or caching non-cacheable responses, segment-timeout races with collapse-animation, notification center losing/duplicating events, XSS in domain-doc and settings rendering, location reporting errors?',
    context: 'Read web/AGENTS.md and web/assets/javascript/AGENTS.md first.' },
  { id: 'tui', kind: 'area',
    files: ['tui/__init__.py','tui/__main__.py','tui/app.py','tui/client.py','tui/endpoints.py','tui/login.py','tui/protocol.py','tui/render.py'],
    question: 'What defects exist in the TUI chat client (untracked new code, fresh eyes) — sync-REST REPL correctness, endpoint store staleness, headless token bootstrap security (token handling, logging), login flow, protocol parsing of server responses, render filter diverging from the web client display filter, error paths misreporting?',
    context: 'Read tui/AGENTS.md first. It mirrors the web client protocol; divergence from the server contract is the defect class to chase.' },
  { id: 'deploy-core', kind: 'area',
    files: ['deploy/config.sh','deploy/dependencies.sh','deploy/deploy_database.sh','deploy/deploy.sh','deploy/finalize.sh','deploy/postgresql.sh','deploy/preflight.sh','deploy/python.sh','deploy/vault.sh','deploy/_mira_log_levels.py','deploy/mira_service_schema.sql'],
    question: 'What defects exist in the installer — shell scripts patching structured data by string-matching (sed/grep against SQL/JSON literals: a non-matching literal silently no-ops; enumerate every sed/grep site and disposition it), scripts vs schema/seed consistency (routes seeded vs what code expects), Vault state machine, greenfield-only assumption violated by a re-run path, preflight gaps, idempotency of finalize?',
    context: 'Read deploy/AGENTS.md and the orchestrator enumeration scratch/census-20260920/enumerations.md section E9 (sed/awk/grep sites — re-run and extend it; dispositions required). Known intended drift: schema seeds primary at the committed openrouter row (python.sh rewrite anchor); auxiliary routes seed at lunaroute glm-5.3-flash with subcortical_key; python.sh subcortical seds are intentional no-ops. Do NOT re-report these three as drift; DO report any OTHER seed/script inconsistency.' },
  { id: 'deploy-vm-docker', kind: 'area',
    files: ['deploy/vm/README.md','deploy/vm/extract.sh','deploy/vm/oneshot.sh','deploy/lib/*.sh','deploy/docker/scripts/*.sh'],
    question: 'What defects exist in the VM deploy/sarcophagus toolkit — extract.sh instance snapshotting (credential leakage into the sarcophagus, user remap errors: units User=, ownership, --vm-user), oneshot phase sequencing (deploy-only path, --fresh handling, phase 4 inject ordering), docker bootstrap scripts (supervision loops that respawn-loop or miss failure), lib helpers (Vault state machine, set -e discipline, quoting bugs under paths with spaces)?',
    context: 'Read deploy/AGENTS.md, deploy/vm/AGENTS.md, deploy/lib/AGENTS.md, deploy/docker/scripts/AGENTS.md, and deploy/vm/README.md first. Enumerate the shell files in the vm/ directory yourself (find deploy/vm -name "*.sh") and read each end-to-end; the file list above may be incomplete.' },
  { id: 'm-guards', kind: 'mechanism',
    files: ['cns/infrastructure/continuum_repository.py','cns/infrastructure/feedback_repository.py','cns/infrastructure/feedback_tracker.py','cns/infrastructure/persona_repository.py','cns/infrastructure/continuum_pool.py','utils/distributed_lock.py','lt_memory/db_access.py','auth/database.py','auth/account_gc.py'],
    question: 'ENUMERATION TASK: close the hazard class "check-then-act on shared state where the guard lives outside the mutation". Build one composed command enumerating every Python site where a read (SELECT/fetch/get/hexists/exists) is followed by a conditional write (UPDATE/DELETE/set/expire) on the same key/table within the same function. Use the orchestrator starting enumeration scratch/census-20260920/enumerations.md section E4 (re-run, extend; it is a partial). For each instance: does the write re-verify its precondition inside the statement (WHERE guard, GETDEL, compare-and-set), or does a concurrent writer between read and write corrupt it? Then read the listed files end-to-end and trace the worst instances to their callers.',
    context: 'Doctrine: guard clauses live in the mutation. A scan whose transaction commits before its action loop protects nothing.' },
  { id: 'm-sanctioned', kind: 'mechanism',
    files: ['(enumerate across tree)'],
    question: 'ENUMERATION TASK: close the hazard class "bypass of a sanctioned mechanism". Build composed commands enumerating, across the whole tree excluding venv/ and training_data/: (a) datetime.now( / utcnow( sites outside utils/timezone_utils.py (starting point: enumerations.md E3 — re-run, extend, disposition each: is it a UTC-naive bug, a wall-time-vs-UTC bug, or sanctioned?); (b) open( calls that read files under config/prompts/ outside load_prompt() (E5); (c) os.environ/getenv reads in runtime code (E6) — boundary: deploy scripts and shell entry points reading env config at boot is sanctioned; runtime Python code substituting env vars for Vault credentials IS reportable; (d) hardcoded model names/endpoints in Python runtime code (route by name only); (e) manual user_id filtering (WHERE user_id = %s) in queries where the contextvar/RLS flow exists — explicit set_current_user_id outside HTTP is sanctioned.',
    context: 'One sanctioned path per hazard; raw forms behind a sanctioned wrapper are defects.' },
  { id: 'm-boundary', kind: 'mechanism',
    files: ['tools/implementations/web_tool.py','tools/implementations/email_tool.py','tools/implementations/inbox_tool.py','tools/implementations/mlfactory_fs_tool.py','tools/implementations/domaindoc_tool.py','tools/implementations/contacts_tool.py','utils/prompt_injection_defense.py','utils/text_sanitizer.py','working_memory/trinkets/email_trinket.py','working_memory/trinkets/domaindoc_trinket.py','agents/base.py','cns/services/tool_result_summarizer.py','cns/services/summary_generator.py'],
    question: 'ENUMERATION TASK: close the hazard class "external content reaching a model context without crossing the screening boundary". Enumerate every path where content sourced outside the system (fetched pages, email headers/bodies, inbox items, file contents via mlfactory_fs, domain docs, user-supplied file content, agent work items) enters ANY model context — tool results, trinket content, system prompts, summarizer inputs. For each: does it pass through prompt_injection_defense screening or untrusted-content wrapping? Is text interpolated into XML-like prompt structures escaped at the interpolation point? A tool returning external text "for the model to read" unwrapped IS the defect, whatever a docstring claims.',
    context: 'The External Content Crosses One Boundary rule is absolute. Read utils/prompt_injection_defense.py and utils/text_sanitizer.py end-to-end first to know what the sanctioned wrapper actually does; then audit every ingestion site against it.' },
  { id: 'm-extract', kind: 'mechanism',
    files: ['utils/tag_parser.py','cns/services/system_prompt_parser.py','cns/services/assessment_extractor.py','cns/services/user_model_synthesizer.py','cns/services/persona_service.py','cns/services/portrait_service.py','lt_memory/processing/extraction_engine.py','lt_memory/entity_extraction.py','lt_memory/processing/memory_processor.py','clients/llm/tool_messages.py','clients/llm/thinking.py'],
    question: 'ENUMERATION TASK: close the hazard class "data recovered from an LLM output keyed by position or content shape instead of an emitted identity tag". Enumerate every site that parses LLM output (extraction pipelines, tag parsers, structured response consumers). For each: does the model emit an explicit type/identity tag alongside each item, and does the parser key on it — or does the parser use "the last one", "the first match", index position, or prefix/suffix sniffing? Also check storage round-trips lossless both ways (memory short IDs mem_XXXXXXXX as irreversible UUID prefixes: any conversion losing the mapping IS a defect), and thinking-signature/tool-call-id round-trips in clients/llm.',
    context: 'Doctrine: extract by identity, not position or shape; persist explicit type tags; storage round-trips must be lossless both ways.' },
  { id: 'm-degrade', kind: 'mechanism',
    files: ['cns/services/tool_loop.py','cns/services/segment_collapse_handler.py','cns/services/subcortical.py','cns/services/heartbeat_service.py','cns/services/manifest_query_service.py','lt_memory/processing/memory_processor.py','lt_memory/processing/consolidation_handler.py','agents/base.py','tools/repo.py'],
    question: 'ENUMERATION TASK: close the hazard class "catch-and-continue that degrades incorrectly". Build one composed command enumerating every except block in cns/, lt_memory/, tools/, agents/, utils/ that continues (returns a default, logs-and-returns, swallows) — group by file. For each site classify: request-path critical (must propagate — catching IS a defect), fire-and-forget consumer (log-and-swallow legal), background durability (tolerate-and-log legal). For every legal site: is the degraded result still correct for its consumer? If the degraded output would silently corrupt the deliverable (missing required sections, empty-required data, wrong shape), it is reportable regardless of position. Does each site log message state the user-visible consequence? Also: do retry counters that gate destructive fallbacks (tombstones, abandons) exclude infrastructure/LLM outages from the count?',
    context: 'Degrade-only-to-acceptable + retry counters never gate data on infrastructure failure. Positional classification FIRST, then judge each.' },
  { id: 'm-derived', kind: 'mechanism',
    files: ['cns/services/heartbeat_service.py','cns/infrastructure/feedback_tracker.py','lt_memory/linking.py','lt_memory/entity_merge.py','utils/cost_accumulator.py','utils/user_activity.py','lt_memory/proactive.py'],
    question: 'ENUMERATION TASK: close the hazard class "derived state that drifts". Enumerate every counter, tally, denormalized field, or incrementally-maintained aggregate in the tree (link counts, message counts, usage tallies, heartbeat counters, activity-day counters). For each: which write paths update it? Can two paths double-count or one path forget? Does anything recompute it on read or schedule a recompute so drift decays? A derivation relying on "every write path remembers" with no heal mechanism IS reportable if a real write path misses it.',
    context: 'Doctrine: derived state self-heals or computes on read. Trace each derivation to ALL its maintaining write paths — the missed one is the finding.' },
  { id: 'm-dualwrite', kind: 'mechanism',
    files: ['cns/infrastructure/continuum_repository.py','cns/infrastructure/valkey_message_cache.py','cns/services/persona_service.py','utils/userdata_manager.py','lt_memory/db_access.py','cns/services/segment_cache_loader.py'],
    question: 'ENUMERATION TASK: close the hazard class "dual-write inconsistency". Enumerate every operation that writes two stores in one logical action (Postgres + Valkey caches, Postgres + SQLite user data, preview save in Valkey + persist in Postgres, entity row + link rows, message row + segment aggregate). For each: what happens when the second write fails after the first commits? Is there cleanup, a recompute path, or a stale-forever window? Ordering: is the durable store written before the cache it feeds? Orphaned cache entries after a transaction rollback?',
    context: 'A cache inconsistent with its source that never heals IS a defect; the question is always "what heals it".' },
  { id: 'm-singleton', kind: 'mechanism',
    files: ['working_memory/trinkets/base.py','working_memory/composer.py','cns/integration/event_bus.py','tools/repo.py','config/config_manager.py','utils/user_context.py'],
    question: 'ENUMERATION TASK: close the hazard class "per-request state on process-global singletons". Enumerate every class instantiated once process-wide (trinkets, tool instances, event handlers, services held on module-level singletons, composer, config manager) and list its mutable instance attributes. For each attribute: is it construction-time wiring, an explicitly-keyed process-wide cache, or per-turn/per-user state smuggled onto the singleton? The third is reportable. Pay special attention to trinkets (doctrine: state keys on the contextvar) and event handlers that set state read back after a publish.',
    context: 'Instance attributes are for construction-time wiring and explicitly-keyed caches only. The event bus is notification, never call-and-return.' },
  { id: 'm-sched', kind: 'mechanism',
    files: ['utils/scheduled_tasks.py','utils/scheduler_service.py','utils/scheduled_task_monitor.py','utils/user_activity.py','utils/timezone_utils.py','cns/services/heartbeat_service.py','lt_memory/proactive.py'],
    question: 'What defects exist in scheduling — use-day interval gating arithmetic (*_use_days are modular activity-day gates, not calendar cadences: a job gated every 5 use-days must fire on the 5th activity day, not every 5 calendar days; check the modular arithmetic for off-by-one and boundary-day errors), timezone handling at DST boundaries (a daily job scheduled 01:30 local on a spring-forward night), double-fire or starvation in scheduler_service, monitor false-positives/negatives, activity-day counting races (midnight rollover, multi-device)?',
    context: 'Read utils/AGENTS.md and config/AGENTS.md use-day sections first. Enumerate every scheduled job registration in the tree and disposition its gating arithmetic.' },
  { id: 'seam-ws-protocol', kind: 'seam',
    files: ['web/assets/javascript/api-client.js','web/assets/javascript/messaging.js','web/assets/javascript/core.js','web/assets/javascript/events.js','cns/api/websocket_chat.py'],
    question: 'CONTRACT CHECK (seam pass — both sides read deliberately shallow; the deliverable is the contract table, not a findings count). Build the frame inventory: every frame/message type the client sends (grep client send( sites) against the server handler switch; every frame type the server sends against the client sink handlers. Deliverable: the two tables, every unhandled frame in each direction, state-machine agreement (connect/disconnect/reconnect/turn-in-flight/close ordering: who guards a second turn while one is in flight on each side, and do the guards agree), error-frame semantics match, heartbeat/ping cadence.',
    context: 'A frame one side sends that the other drops IS the finding. Neither side needs a deep read here — the pair contract is the artifact. Note the deployed client also has a TUI REST client (tui/) but this seam is WS chat only.' },
  { id: 'seam-event-taxonomy', kind: 'seam',
    files: ['cns/core/events.py','cns/integration/event_bus.py','cns/integration/factory.py'],
    question: 'CONTRACT CHECK (seam pass). Build the event taxonomy table: every event class defined in cns/core/events.py with its payload fields; every publish( site in the tree (composed command: rg "publish\\(" --type py) with the event class and payload it actually passes; every subscribe( site with the handler class name string. Deliverable: the three-way table; every published event with zero handlers (dead event OR missing subscriber — say which), every subscribed class name that matches no defined event class (silent never-fires registration — handlers register by class __name__, so a renamed class that keeps an old registration string never fires), every payload field mismatch between publisher and handler.',
    context: 'The bus registers by event class __name__ — renames are the classic silent break. The orchestrator starting enumeration is enumerations.md section E7 (re-run, extend, disposition).' },
  { id: 'seam-schema-repos', kind: 'seam',
    files: ['deploy/mira_service_schema.sql','cns/infrastructure/continuum_repository.py','cns/infrastructure/feedback_repository.py','cns/infrastructure/persona_repository.py','lt_memory/db_access.py','auth/database.py'],
    question: 'CONTRACT CHECK (seam pass). Read deploy/mira_service_schema.sql as text; enumerate every table, column, constraint (NOT NULL, UNIQUE, FK, RLS policy), and seed row. Then enumerate the SQL in the repository files and lt_memory/db_access.py: every column referenced, every WHERE constraint assumed, every INSERT expecting defaults. Deliverable: the comparison table — columns queried but absent from DDL, type mismatches (UUID vs TEXT round-trips), constraints the code violates on a plausible path (writes that would fail NOT NULL on a real trigger), RLS policies missing for a user-scoped table, seed rows the code expects but the schema does not seed.',
    context: 'The schema is the wire format between deploy and runtime; both sides read as data here, not code.' },
  { id: 'seam-prompt-parser', kind: 'seam',
    files: ['utils/tag_parser.py','cns/services/system_prompt_parser.py','lt_memory/processing/extraction_engine.py','config/prompts/loader.py'],
    question: 'CONTRACT CHECK (seam pass). Enumerate the prompt templates (ls config/prompts/ and any prompt strings embedded in Python) and their format instructions: what output shape does each template tell the model to emit (tags, sections, delimiters, example blocks)? For each format, find the parser that consumes it (utils/tag_parser.py, cns/services/system_prompt_parser.py, extraction parsers). Deliverable: the template-to-parser table — every format instructed with no parser (dead instruction), every parser expecting a shape no template emits, every hand-written example block in a template that drifts from the parser (doctrine: examples must be generated by the same code that parses the format), every unescaped interpolation of variable text into XML-like structures.',
    context: 'The model follows the example; the code follows the spec; the mismatch is silent. Generated-not-transcribed is the rule under test.' },
]

function huntReportPath(id) { return REPORTS + '/hunt-' + id + '.md' }

function huntPrompt(a) {
  const fileList = a.files.map(f => '- ' + f).join('\n')
  return PREAMBLE + '\n\nASSIGNMENT — pass id: ' + a.id + '\nReport path: ' + huntReportPath(a.id) + '\n\nFiles to read end-to-end (repo-relative to ' + REPO + '):\n' + fileList + '\n\nQuestion: ' + a.question + '\n\nContext: ' + a.context + '\n\nWrite the full report to the report path in the preamble format, then return the envelope via the structured output tool.'
}

function verifyPrompt(f, hunterReportPath) {
  return `You are an adversarial verifier in a read-only static bug hunt at ${REPO}. Do not modify any file.

A prior pass reported the finding below. Your job is NOT to stamp it: re-derive the claim's frame from source before checking its details. Read the cited files end-to-end (offset/limit for long files), trace the callers and callees, and assess the arithmetic honestly. Severity and frequency are yours to correct — never inherit the hunter's.

Claim under test:
- id: ${f.id}
- severity claimed: ${f.severity}
- title: ${f.title}
- location: ${f.location}
- trigger claimed: ${f.trigger}
- frequency claimed: ${f.frequency}

The full finding (evidence quote, outcome) is in the hunter's report at ${hunterReportPath} — read that report's matching Findings entry first.

Severity scale (pinned, by consequence): H = data loss/corruption, cross-user data access, security or auth bypass, common-path hang/deadlock/unbounded wait, wrong data reported to the user. M = degraded failure silently corrupting the deliverable for its consumer, plausible-coincidence race, accumulating leak, contract violation with plausible trigger, wrong order of operations on a plausible path. L = latent/unreachable today, environment-armed edge case, hygiene-level correctness.

Repo doctrine you must apply when judging: required-infrastructure failures must propagate (catch-and-default is a defect); RLS fails closed (zero rows without user context is intended); background durability paths tolerate-and-log — unless the degraded result silently corrupts the deliverable for its consumer; a path nothing in the tree calls is latent (severity capped at L); no back-compat is owed (greenfield).

Write your full verification report to ${REPORTS}/verify-${f.id}.md — format: verdict with evidence quotes at file:symbol, every correction traced, what you could not reach. Then return the envelope via the structured output tool. A refutation is as valuable as a confirmation; a wrong frame found is the best outcome.`
}

function blindPrompt(f) {
  const primary = (f.location || '').split(':')[0]
  return PREAMBLE + `\n\nASSIGNMENT — pass id: blind-${f.id}\nReport path: ${REPORTS}/blind-${f.id}.md\n\nFiles to read end-to-end: ${primary} (repo-relative to ${REPO}; also read the file's directory AGENTS.md if present, and any file the primary imports that its logic turns on). If the primary file cannot be identified from that path, enumerate the containing directory and read every file in it.\n\nQuestion: what defects exist in this file's logic — races, data loss, hangs, misreported failures, wrong data to the user, contract violations with callers/callees?\n\nYou have no other briefing. Write the full report to the report path in the preamble format, then return the envelope via the structured output tool.`
}

function recheckPrompt(f, hunterReportPath) {
  return `You are an independent evaluator in a read-only static bug hunt at ${REPO}. Do not modify any file.

A claim was reported by one pass and you are a second evaluation of it. Evaluate the claim on its own merits from source: read the cited files end-to-end, trace the runtime path yourself, and return your own verdict. Do not assume the claim is correct; do not assume it is wrong.

Claim:
- id: ${f.id}
- severity claimed: ${f.severity}
- title: ${f.title}
- location: ${f.location}
- trigger claimed: ${f.trigger}
- frequency claimed: ${f.frequency}

Full finding (evidence, outcome) in the original report at ${hunterReportPath} — read its matching Findings entry.

Severity scale (pinned, by consequence): H = data loss/corruption, cross-user data access, security or auth bypass, common-path hang/deadlock/unbounded wait, wrong data reported to the user. M = degraded failure silently corrupting the deliverable, plausible-coincidence race, accumulating leak, contract violation with plausible trigger, wrong order of operations. L = latent/unreachable today, environment-armed edge case, hygiene-level.

Write your full evaluation report to ${REPORTS}/recheck-${f.id}.md — verdict, evidence quotes at file:symbol, corrections — then return the envelope via the structured output tool.`
}

const VERIFY_PREAMBLE_NOTE = `Verdict envelope fields: verdict CONFIRMED/REFUTED/ADJUSTED; severity_final and frequency_final (your corrections); refuted_subclaims (which parts of the claim are wrong and why — a finding is often half right); added_mechanisms (earlier failure sites, additional reachability, new mechanisms on the same trace); fix_constraints (what a repair must account for beyond the reported symptom); boundary (what this pass could not reach). report_path is the report file you wrote.`

// ---- Stage functions ----

function stageHunt(a) {
  if (a.pilot) {
    return Promise.resolve({
      report_path: huntReportPath(a.id),
      findings: PILOT_FINDINGS[a.id] || [],
      clean: a.pilot_clean || [],
      disputes: [],
      pilot: true,
    })
  }
  return agent(huntPrompt(a), { label: 'hunt:' + a.id, phase: 'Hunt', schema: HUNT_SCHEMA, agentType: 'swarm-investigator' })
}

async function stageVerify(prev, a) {
  if (!prev) return null
  const findings = prev.findings || []
  if (!findings.length) return { area: a.id, findings: [], verdicts: [], third: [], hunter: prev.report_path }
  const verdicts = await parallel(findings.map(f => () =>
    agent(verifyPrompt(f, prev.report_path) + '\n\n' + VERIFY_PREAMBLE_NOTE, { label: 'verify:' + f.id, phase: 'Verify', schema: VERIFY_SCHEMA, agentType: 'swarm-verifier' })
  ))
  return { area: a.id, findings, verdicts, hunter: prev.report_path }
}

async function stageThird(prev, a) {
  if (!prev) return null
  const findings = prev.findings || []
  const third = await parallel(findings.map((f, i) => () => {
    const v = prev.verdicts[i]
    if (!v) return Promise.resolve({ fid: f.id, type: 'verifier-dead' })
    const sev = v.severity_final || f.severity
    if (v.verdict === 'REFUTED') {
      return agent(recheckPrompt(f, prev.hunter), { label: 'recheck:' + f.id, phase: 'Third', schema: VERIFY_SCHEMA, agentType: 'swarm-verifier' })
        .then(r => ({ fid: f.id, type: 'recheck', result: r, primed_verdict: v.verdict }))
    }
    if (sev === 'H' && (v.verdict === 'CONFIRMED' || v.verdict === 'ADJUSTED')) {
      // Model override: lunaroute/glm-5.3 (investigator default) was down at the gateway during the
      // 2026-09-21 09:40-10:00 window and killed 14/15 blind dispatches. deepseek-4.1-flash is a
      // reasoning model with 1M context and was verified healthy; rechecks and dedupe routes unaffected.
      return agent(blindPrompt(f), { label: 'blind:' + f.id, phase: 'Third', schema: HUNT_SCHEMA, agentType: 'swarm-investigator', model: 'lunaroute/deepseek-4.1-flash' })
        .then(r => ({ fid: f.id, type: 'blind', result: r, primed_verdict: v.verdict }))
    }
    return Promise.resolve({ fid: f.id, type: 'none', primed_verdict: v.verdict, sev_final: sev })
  }))
  return { area: a.id, hunter: prev.hunter, findings, verdicts: prev.verdicts, third }
}

phase('Hunt')
const ITEMS = [
  { id: 'cns-services-turn', pilot: true, pilot_clean: [] },
  { id: 'cns-services-segments', pilot: true, pilot_clean: [] },
  { id: 'cns-services-models', pilot: true, pilot_clean: [] },
  { id: 'm-spawns', pilot: true, pilot_clean: [] },
].concat(AREAS)

const results = await pipeline(ITEMS, stageHunt, stageVerify, stageThird)

// ---- Collect compact summary ----
const failures = []
const disputes = []
const tier = { H: 0, M: 0, L: 0, none: 0 }
const allFindings = []
for (const r of results) {
  if (!r) continue
  const fs = r.findings || []
  for (let i = 0; i < fs.length; i++) {
    const f = fs[i]
    const v = r.verdicts[i]
    const t = (r.third && r.third[i]) || {}
    const sevFinal = (v && v.severity_final) || f.severity
    tier[sevFinal] = (tier[sevFinal] || 0) + 1
    allFindings.push({ id: f.id, sev: sevFinal, verdict: v ? v.verdict : 'NO-VERDICT', third: t.type || 'none' })
    if (!v) failures.push({ stage: 'verify', id: f.id })
    if (v && v.verdict === 'REFUTED' && t.type === 'recheck' && t.result && t.result.verdict === 'CONFIRMED') {
      disputes.push(f.id + ': primed verifier REFUTED, recheck CONFIRMED — needs adjudication')
    }
    if (t.type === 'verifier-dead') failures.push({ stage: 'verify-dead', id: f.id })
    if (t.type === 'recheck' && !t.result) failures.push({ stage: 'recheck', id: f.id })
    if (t.type === 'blind' && !t.result) failures.push({ stage: 'blind', id: f.id })
  }
}
const huntFailures = results.map((r, i) => r ? null : { stage: 'hunt', id: ITEMS[i].id }).filter(Boolean)
for (const hf of huntFailures) failures.push(hf)

log('Hunt+verify complete: ' + allFindings.length + ' findings, tier ' + JSON.stringify(tier) + ', disputes ' + disputes.length + ', failures ' + failures.length)

// ---- Dedupe ----
phase('Dedupe')
const dedupePrompt = `You are the dedupe layer for a completed multi-pass bug hunt at ${REPO}. You operate on text only — never read source code, never judge whether a finding is real.

The corpus is every report file in ${REPORTS}/ (enumerate them with ls; expect files named hunt-<area>.md, verify-<finding-id>.md, blind-<finding-id>.md, recheck-<finding-id>.md). Read every report file. Merge into one report and write it to ${REPO}/${RUN}/BUG_REPORT.md.

Merge rules:
- One entry per defect: same site plus same mechanism is one entry, whatever the wording, whoever reported it, however many passes reached it. The convergence record carries the multiplicity (each pass type named); the entry does not.
- Same-site seam findings and local findings are NOT duplicates — a seam finding's frame is the boundary contract; carry edge-anchored provenance for seam entries.
- Keep distinct defects at one site separate: two mechanisms in one function are two entries.
- Apply these calibration exclusions to every entry: training_data/* is out of scope entirely; style/naming/docstring/test-absence findings are out; intentional doctrine (greenfield no-back-compat, RLS fails closed, Optional-for-domain-optionality, notification-only event bus, headers-only inbox polling, greenfield-only deploy) is out. List every dropped entry in the manifest with the rule.
- Carry per entry: final ID (H-n / M-n / L-n by tier, S-n for single-pass candidates), verifier-corrected severity and frequency, confidence per component (mechanism / trigger / frequency), latency marker, provenance (which passes reached it, with pass types: hunt / primed-verify / blind / recheck / convergent), fix-direction constraints recorded by verifiers, and every member site for convergent findings.
- Single-pass claims (one hunter, no confirming pass and no refuting pass) go in a separate "S- candidates" section marked needs-one-more-pass — neither promoted nor killed.
- Publish a merge manifest: EVERY input finding across all reports with its disposition (kept as <ID> / merged into <ID> / dropped by rule <n> / novel side-discovery). An input entry that vanishes without a manifest line is a merge failure.
- Carry the "Checked and clean" surfaces into a verified-clean section, and any census caveat bounding a clean verdict.
- Do NOT slice, rank, group, or recommend repairs. Merged evidence only.

Write ${REPO}/${RUN}/BUG_REPORT.md fully before returning. Then return exactly one line: the path you wrote.`
const dedupeLine = await agent(dedupePrompt, { label: 'dedupe:BUG_REPORT', phase: 'Dedupe', agentType: 'swarm-dedupe' })

return {
  tier_counts: tier,
  n_findings: allFindings.length,
  finding_index: allFindings,
  disputes,
  failures,
  dedupe_line: dedupeLine,
}
