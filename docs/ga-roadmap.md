# Inferoa GA Roadmap

Inferoa GA is scoped around a credible public evidence chain for an
inference-native tokenmaxxing agent harness for loop engineering.

The GA bar is not "all possible loop-engineering integrations are complete."
The GA bar is that Inferoa can repeatedly close real loop tasks, verify those
closures with durable evidence, show tokenmaxxing impact, and use Semantic
Router-oriented inference signals as part of the loop workload.

## Positioning

Inferoa's GA claim is:

```text
Inference-native Tokenmaxxing Agent Harness for Loop Engineering
```

That claim has three testable parts:

1. Loop engineering: a task is not complete because the model says so. It is
   complete when a durable loop records the goal, bounded work units, attempts,
   verification evidence, decisions, and completion proof.
2. Tokenmaxxing: the harness improves useful work per token by preserving
   prompt-prefix stability, bounding mutable context, recording cache evidence,
   compressing safely, and measuring token/cost pressure.
3. Inference-native routing: the loop exposes workload signals that can be used
   by vLLM Semantic Router policy and model selection, instead of treating every
   model call as generic chat traffic.

GA should be small but hard. The first public evidence set should be
reproducible, explainable, and grounded in real tasks rather than broad
leaderboard coverage.

## Success Standard

GA uses three evidence layers together:

| Layer | Purpose | GA expectation |
| --- | --- | --- |
| Absolute gates | Prevent release without working software | Build, full tests, schema checks, curated eval smoke, and real endpoint acceptance pass |
| Comparative proof | Support tokenmaxxing and SR claims | Baseline vs Inferoa traces compare pass rate, token pressure, cache stability, retries, and route choices |
| Case studies | Explain loop engineering closure | At least three end-to-end examples show goal, attempts, verifier, context/token evidence, decision, and final proof |

No single benchmark score is the product proof. GA requires a coherent evidence
chain across the harness.

## Milestones

### GA-M0 Evidence Contract

Define the GA evidence contract and GitHub execution structure.

Exit criteria:

- `docs/ga-roadmap.md` is the canonical roadmap.
- `docs/ga-github-issues.md` contains the exact milestone, label, and issue
  structure.
- GitHub labels and milestones exist.
- The GA eval result record is specified and can represent Terminal-Bench,
  SWE-bench, internal corpus, SR replay, and final acceptance results.
- The release gate distinguishes hard pass criteria from comparative metrics
  and narrative case-study evidence.

### GA-M1 Terminal-Bench Loop Eval

Adapt a curated 10-task Terminal-Bench set as the first external loop eval
anchor.

Why Terminal-Bench first:

- it is closest to Inferoa's terminal agent harness surface;
- tasks include an instruction, environment, verification script, and reference
  solution shape;
- it can prove end-to-end task closure without requiring the full SWE-bench
  patch infrastructure first.

Exit criteria:

- A curated 10-task Terminal-Bench set is recorded with selection rationale.
- Inferoa can run each selected task through a stable adapter without changing
  product runtime semantics.
- Each run emits GA eval result records with loop, verifier, tokenmaxxing, and
  artifact evidence.
- Results include a baseline comparison against a simple non-loop or reduced
  tokenmaxxing path.

### GA-M2 Tokenmaxxing + SR Policy

Make Semantic Router a core GA track through `Trace -> Policy -> SR`.

This milestone does not start by hard-coding policy into the product. It first
extracts routing signals from loop traces, evaluates policy offline, then sends
stable metadata into the live SR path.

Exit criteria:

- Loop eval traces expose routing feature candidates.
- Offline replay compares baseline route choice against a candidate SR policy.
- The live model path sends stable session and loop-pressure metadata to SR
  without leaking bulky task context.
- Tokenmaxxing reports include route choice, route rationale fields when
  available, token/cache pressure, and model-selection pressure.

### GA-M3 SWE-bench + Internal Corpus

Add SWE-bench smoke coverage and an internal real-loop corpus.

Why this is after Terminal-Bench and SR trace work:

- SWE-bench and SWE-bench Pro are important for the coding-agent brand, but the
  patch and verification pipeline is heavier.
- Internal corpus tasks are cheaper and should be used as a regression and
  self-improve control group, not as the sole public proof.

Exit criteria:

- A 3-5 task SWE-bench or SWE-bench Pro smoke set runs through the same GA eval
  result shape.
- A 10-20 task internal corpus covers loop completion, verifier gates,
  self-improve impact, context compression, tokenmaxxing regressions, and SR
  replay.
- Internal corpus runs prove that learned Loop Skill and Workspace Skill changes
  affect later loop behavior with verifier-backed evidence.

### GA-M4 Acceptance & Release

Run final real-endpoint acceptance and prepare release artifacts.

Exit criteria:

- `npm run build` passes.
- `npm test` passes.
- Curated GA eval gates pass.
- Real endpoint acceptance runs with configured direct vLLM, SR, and Omni
  endpoints where available.
- The final evidence report records endpoint details, model names, loop trace,
  token/cache evidence, context compression evidence, route metadata, verifier
  results, changed files, and artifacts.
- Release notes and public docs explain what was proven and what remains future
  work.

## Capability Modules

Issues use capability modules rather than file-path modules.

| Module | Label | Responsibility |
| --- | --- | --- |
| Loop Control | `area:loop-control` | Goal, horizon, attempt, verifier, decision, HIL, inbox, and completion gates |
| Evaluation Harness | `area:evaluation-harness` | Benchmark adapters, task corpus, result schema, artifact layout, reproducibility |
| Tokenmaxxing + SR | `area:tokenmaxxing-sr` | Prompt/cache/context telemetry, route features, SR replay, live route metadata |
| Self-Improve | `area:self-improve` | Learning signals, Loop Skill, Workspace Skill, replay gates, post-adoption impact |
| Release Ops | `area:release-ops` | GitHub metadata, release gates, final acceptance, docs, issue closure |

Every task issue also carries one task-kind label:

- `kind:research`
- `kind:evaluation`
- `kind:testing`
- `kind:engineering`

## GA Eval Result Record

The GA eval result record is the minimum common shape for Terminal-Bench,
SWE-bench, internal corpus, SR replay, and final acceptance evidence.

```ts
type GaBenchmarkSource =
  | "terminal-bench"
  | "swe-bench"
  | "swe-bench-pro"
  | "internal-corpus"
  | "sr-replay"
  | "final-acceptance";

type GaEvalVerdict = "pass" | "fail" | "partial" | "blocked" | "error";

interface GaEvalResult {
  schema_version: "ga-eval/v1";
  result_id: string;
  created_at: string;
  workspace_id: string;
  source: GaBenchmarkSource;
  task_id: string;
  task_title: string;
  task_suite?: string;
  task_tags: string[];

  command: string;
  reproduction_command: string;
  artifact_dir: string;

  loop: {
    session_id?: string;
    goal_id?: string;
    goal_kind?: "task" | "research";
    horizon_generations: number[];
    attempt_run_ids: string[];
    verifier_run_ids: string[];
    final_status: "complete" | "paused" | "blocked" | "failed" | "dropped";
  };

  verification: {
    verdict: GaEvalVerdict;
    verifier_family: string[];
    hard_passes: number;
    failures: number;
    summary: string;
    evidence_refs: string[];
  };

  tokenmaxxing: {
    model_calls: number;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cached_prompt_tokens?: number;
    cache_hit_rate?: number;
    prompt_epoch_count: number;
    tool_schema_hash_count: number;
    compaction_count: number;
    context_pressure_max?: number;
    managed_resource_count: number;
  };

  sr: {
    route_policy?: string;
    selected_models: string[];
    route_replay_baseline?: string;
    route_replay_candidate?: string;
    route_replay_delta?: Record<string, number>;
    metadata_fields: string[];
  };

  artifacts: {
    patch_refs: string[];
    log_refs: string[];
    resource_refs: string[];
    media_refs: string[];
    report_refs: string[];
  };
}
```

Adapters may store richer source-specific details next to this file, but this
record is the cross-suite contract.

## SR Routing Feature Candidates

SR policy research should start from trace features and only promote stable
fields into the live path.

Candidate fields:

- request class: interactive, reflection, verification, compaction, research,
  self-improve;
- goal kind: task or research;
- verifier phase: none, proposed, running, failed, hard-pass, human-review;
- horizon generation and attempt count;
- context pressure and compaction proximity;
- prompt epoch stability and tool schema hash stability;
- cached prompt tokens and cache hit rate when exposed by the endpoint;
- tool-heavy vs reasoning-heavy recent steps;
- shell/test/code-intelligence/media tool mix;
- privacy or self-hosting preference;
- latency and cost budget;
- background/unattended vs foreground/HIL path;
- final acceptance or release-gate path.

Live metadata must stay small, deterministic, and stable enough to preserve
prefix-cache discipline. Bulky task evidence belongs in artifacts and traces,
not in routing headers.

## Benchmark Adapter Boundaries

Benchmark adapters must stay separate from product runtime code.

Rules:

- invoke Inferoa through stable CLI or runtime entrypoints;
- create isolated workspaces or worktrees per task;
- store results in ignored evidence output directories;
- never make benchmark-only behavior part of normal `/loop` semantics;
- emit `GaEvalResult` plus source-specific raw logs;
- support dry-run and selected-task execution;
- preserve enough metadata to reproduce the result.

## Release Gates

GA release is blocked until these gates are satisfied:

1. Build and unit test gate: `npm run build` and `npm test`.
2. Evidence schema gate: GA result records validate against `ga-eval/v1`.
3. Terminal-Bench gate: curated 10-task run emits reproducible artifacts and
   records pass/fail outcomes.
4. SR replay gate: offline policy replay has baseline and candidate results
   over GA traces.
5. SWE/internal gate: SWE smoke and internal corpus emit comparable result
   records.
6. Acceptance gate: real endpoint acceptance records vLLM, SR, Omni, context,
   token/cache, and verifier evidence.
7. Documentation gate: docs and release notes state what is proven, what is
   partial, and what remains future work.

## Non-Goals For GA

- Do not build a hosted dashboard.
- Do not make broad connector coverage a GA blocker.
- Do not auto-merge, publish, or deploy without explicit configured policy.
- Do not claim large benchmark coverage from small curated runs.
- Do not treat reflection-only evidence as a hard verifier.
- Do not optimize model weights.
- Do not require cross-repository Semantic Router changes before trace-backed
  policy evidence exists.
