# GA GitHub Issues

This file is the source of truth for the GA GitHub project structure. It mirrors
the roadmap in `docs/ga-roadmap.md` and defines the exact labels, milestones,
epic issues, and task issues to create in GitHub.

## Labels

| Label | Color | Description |
| --- | --- | --- |
| `kind:research` | `5319e7` | Research questions, hypotheses, taxonomy, and policy design |
| `kind:evaluation` | `1d76db` | Benchmark adapters, eval runners, result schemas, and metrics |
| `kind:testing` | `0e8a16` | Automated checks, release gates, regression tests, and validation |
| `kind:engineering` | `fbca04` | Product/runtime implementation, docs wiring, and operational work |
| `area:loop-control` | `c2e0c6` | Goal, horizon, attempt, verifier, decision, HIL, and completion behavior |
| `area:evaluation-harness` | `bfd4f2` | Benchmark tasks, adapters, artifacts, and reproducible result records |
| `area:tokenmaxxing-sr` | `fef2c0` | Tokenmaxxing telemetry, context/cache evidence, SR policy, and routing metadata |
| `area:self-improve` | `d4c5f9` | Learning signals, skill proposals, replay gates, and post-adoption impact |
| `area:release-ops` | `f9d0c4` | Milestones, release gates, final acceptance, docs, and issue closure |

## Milestones

| Milestone | Description |
| --- | --- |
| `GA-M0 Evidence Contract` | Define GA evidence contracts, success gates, and GitHub execution structure |
| `GA-M1 Terminal-Bench Loop Eval` | Adapt a curated 10-task Terminal-Bench set as the first external loop eval anchor |
| `GA-M2 Tokenmaxxing + SR Policy` | Derive routing policy from loop traces and connect stable metadata to SR |
| `GA-M3 SWE-bench + Internal Corpus` | Add SWE-bench smoke coverage and internal real-loop regression corpus |
| `GA-M4 Acceptance & Release` | Run final real-endpoint acceptance and prepare release artifacts |

## Issue Body Template

Use this structure for every issue:

```markdown
## Goal

One sentence describing the outcome.

## Deliverables

- Concrete artifact or implementation output.

## Acceptance Criteria

- Observable result that closes the issue.

## Notes

- Important constraints, links, or dependencies.
```

## GA-M0 Evidence Contract

### `[GA-M0][Epic] Define GA evidence contract and issue system`

Labels: `area:release-ops`, `area:evaluation-harness`

Goal:

Define the GA control plane for evidence, milestones, labels, and issue
execution.

Deliverables:

- Canonical GA roadmap.
- Exact GitHub issue structure.
- Evidence schema and success-gate definitions.
- Clear boundary between product runtime and benchmark adapters.

Acceptance criteria:

- `docs/ga-roadmap.md` and `docs/ga-github-issues.md` exist.
- GA labels and milestones exist in GitHub.
- All GA-M0 through GA-M4 epic and task issues are created.
- The GA eval result record can represent Terminal-Bench, SWE-bench, internal
  corpus, SR replay, and final acceptance evidence.

### `[GA-M0][research] Define loop-engineering evidence taxonomy`

Labels: `kind:research`, `area:loop-control`

Goal:

Define what evidence proves an Inferoa loop task was actually closed.

Deliverables:

- Taxonomy for goals, horizons, attempts, verifier records, feedback, decisions,
  completion proof, and post-adoption impact.
- Mapping from existing loop events and projections to GA evidence fields.
- Definition of hard, soft, human, and comparative evidence tiers.

Acceptance criteria:

- The taxonomy is documented in the roadmap or a linked design note.
- Reflection-only evidence is explicitly excluded from hard unattended
  completion proof.
- The taxonomy maps to current `GoalLoopView`, verification records, metrics,
  and self-improve evidence.

### `[GA-M0][evaluation] Specify GA eval result schema and adapter contract`

Labels: `kind:evaluation`, `area:evaluation-harness`

Goal:

Specify a common result record for all GA evaluation sources.

Deliverables:

- `ga-eval/v1` schema covering task identity, loop state, verification,
  tokenmaxxing, SR metadata, artifacts, and reproduction command.
- Adapter rules for Terminal-Bench, SWE-bench, internal corpus, SR replay, and
  final acceptance.
- Ignored artifact directory convention.

Acceptance criteria:

- A single result shape can represent every GA evidence source.
- Benchmark-only behavior is kept outside normal `/loop` semantics.
- Every result record has a reproduction command and artifact directory.

### `[GA-M0][testing] Add validation gates for GA evidence artifacts`

Labels: `kind:testing`, `area:evaluation-harness`

Goal:

Define automated checks that prevent malformed GA evidence from being treated
as release proof.

Deliverables:

- Schema validation plan for `ga-eval/v1`.
- Fixture examples for pass, fail, partial, blocked, and error verdicts.
- Release-gate checklist for build, tests, eval, SR replay, and acceptance.

Acceptance criteria:

- The validation plan names exact commands or future scripts.
- Invalid records are expected to fail with actionable messages.
- Release gates distinguish hard blockers from comparative metrics.

### `[GA-M0][engineering] Add GA docs, labels, milestones, and issue templates`

Labels: `kind:engineering`, `area:release-ops`

Goal:

Land the GA roadmap documents and GitHub project metadata.

Deliverables:

- `docs/ga-roadmap.md`.
- `docs/ga-github-issues.md`.
- GitHub labels and milestones.
- Epic and task issue bodies.

Acceptance criteria:

- Local docs are tracked in git.
- Labels and milestones exist remotely.
- Issue titles and body text match this issue plan.

## GA-M1 Terminal-Bench Loop Eval

### `[GA-M1][Epic] Adapt Terminal-Bench as the first external loop eval`

Labels: `area:evaluation-harness`, `area:loop-control`, `area:tokenmaxxing-sr`

Goal:

Use a curated 10-task Terminal-Bench set to prove real terminal loop closure.

Deliverables:

- Curated task list and rationale.
- Adapter design and result ingestion.
- Baseline vs Inferoa comparison.
- Tokenmaxxing and SR trace evidence for each task.

Acceptance criteria:

- Ten selected tasks can run reproducibly.
- Each task emits a `ga-eval/v1` result record.
- Results record loop attempts, verifier outcomes, token/cache/context
  evidence, artifacts, and reproduction commands.

### `[GA-M1][research] Curate 10 Terminal-Bench tasks and baseline hypotheses`

Labels: `kind:research`, `area:evaluation-harness`

Goal:

Choose a small but hard Terminal-Bench set that exercises Inferoa's loop
harness rather than only simple command execution.

Deliverables:

- Ten task ids with selection rationale.
- Coverage tags such as debugging, build, data, security, long-running process,
  and multi-step verification.
- Baseline hypotheses for where loop control and tokenmaxxing should help.

Acceptance criteria:

- The curated set is documented before adapter tuning.
- No task is selected only because it is easy.
- Each task has a known verifier and estimated runtime/cost class.

### `[GA-M1][evaluation] Implement Terminal-Bench adapter and result ingestion`

Labels: `kind:evaluation`, `area:evaluation-harness`

Goal:

Run curated Terminal-Bench tasks through Inferoa and emit comparable GA evidence.

Deliverables:

- Adapter entrypoint for selected tasks.
- Isolated workspace or worktree setup per task.
- `ga-eval/v1` result writer.
- Raw log and artifact capture.

Acceptance criteria:

- A selected task can be run by id.
- The adapter does not change product `/loop` behavior.
- Result records include verifier verdict, artifacts, tokenmaxxing summary, and
  reproduction command.

### `[GA-M1][testing] Add reproducible Terminal-Bench smoke gate`

Labels: `kind:testing`, `area:evaluation-harness`

Goal:

Prevent Terminal-Bench evidence from regressing silently.

Deliverables:

- A smoke command for one or more cheap selected tasks.
- Artifact validation for result JSON, logs, and verifier outputs.
- Failure-mode fixtures for blocked and failed tasks.

Acceptance criteria:

- Smoke gate can run in CI or maintainer release workflow.
- Missing artifacts or malformed records fail the gate.
- The gate reports task id, command, and artifact directory on failure.

### `[GA-M1][engineering] Wire eval outputs into loop metrics and tokenmaxxing reports`

Labels: `kind:engineering`, `area:tokenmaxxing-sr`, `area:evaluation-harness`

Goal:

Make Terminal-Bench traces usable by existing loop metrics and tokenmaxxing
surfaces.

Deliverables:

- Result ingestion into loop/token metrics summaries.
- Prompt epoch, tool schema hash, cache evidence, compaction, and resource
  counts in GA reports.
- Baseline vs Inferoa comparison fields.

Acceptance criteria:

- A Terminal-Bench result can be inspected without reading raw logs first.
- Comparative tokenmaxxing fields are present even when provider cache fields
  are unavailable.
- Missing cache evidence is represented as unavailable, not zero.

## GA-M2 Tokenmaxxing + SR Policy

### `[GA-M2][Epic] Build Trace -> Policy -> SR model-selection evidence`

Labels: `area:tokenmaxxing-sr`, `area:evaluation-harness`

Goal:

Treat SR model selection as a core inference-native GA capability.

Deliverables:

- Routing feature extraction from loop traces.
- Offline policy replay over GA eval records.
- Live SR metadata pass-through for stable loop and token pressure fields.
- Tokenmaxxing report updates for route evidence.

Acceptance criteria:

- Offline replay compares baseline and candidate route choices.
- Live SR path receives deterministic metadata fields.
- Reports explain route evidence without requiring raw trace inspection.

### `[GA-M2][research] Derive SR routing features from loop workload traces`

Labels: `kind:research`, `area:tokenmaxxing-sr`

Goal:

Identify which loop workload signals should influence model selection.

Deliverables:

- Feature list from Terminal-Bench and internal loop traces.
- Hypotheses for route decisions by phase: planning, execution, verification,
  reflection, compaction, and release gate.
- Guardrails for privacy, self-hosting, cost, and quality.

Acceptance criteria:

- Features are small, stable, and safe to expose as metadata.
- Bulky task evidence is explicitly excluded from live route metadata.
- Feature usefulness is tied to measurable replay outcomes.

### `[GA-M2][evaluation] Build offline SR route-policy replay`

Labels: `kind:evaluation`, `area:tokenmaxxing-sr`

Goal:

Compare route policies over recorded loop traces before changing live behavior.

Deliverables:

- Replay input format from `ga-eval/v1` and raw route traces.
- Baseline policy and candidate policy comparison.
- Metrics for cost, latency proxy, pass-rate preservation, verifier strength,
  and self-hosted route usage.

Acceptance criteria:

- Replay can run without live model calls.
- Candidate policy reports deltas against baseline.
- Replay output is stored as GA evidence.

### `[GA-M2][testing] Add SR metadata and tokenmaxxing regression gates`

Labels: `kind:testing`, `area:tokenmaxxing-sr`

Goal:

Prevent route metadata and tokenmaxxing evidence from drifting.

Deliverables:

- Tests for metadata field stability.
- Tests for missing-cache handling.
- Tests for prompt epoch and tool schema hash accounting in eval records.

Acceptance criteria:

- Metadata changes require intentional test updates.
- Cache unavailable and cache zero are distinguishable.
- Tokenmaxxing regression tests cover prompt stability and compaction evidence.

### `[GA-M2][engineering] Pass stable loop and token pressure metadata to SR`

Labels: `kind:engineering`, `area:tokenmaxxing-sr`

Goal:

Connect stable Inferoa loop workload fields to the live SR path.

Deliverables:

- Metadata mapping from runtime/session/goal state to SR request fields or
  headers.
- Deterministic field ordering and bounded values.
- Endpoint evidence capture for selected route/model metadata when exposed.

Acceptance criteria:

- SR receives session identity and selected loop/token pressure fields.
- The mapping does not inject large task context.
- Route metadata appears in tokenmaxxing and endpoint evidence reports.

## GA-M3 SWE-bench + Internal Corpus

### `[GA-M3][Epic] Add SWE-bench smoke and internal real-loop corpus`

Labels: `area:evaluation-harness`, `area:self-improve`, `area:loop-control`

Goal:

Extend GA proof to coding issue repair and repeatable internal loop regression.

Deliverables:

- 3-5 task SWE-bench or SWE-bench Pro smoke set.
- 10-20 task internal real-loop corpus.
- Shared result records for patch, verifier, tokenmaxxing, and self-improve
  impact.

Acceptance criteria:

- SWE smoke emits patch/evidence artifacts.
- Internal corpus covers loop completion, verifier gates, compression,
  tokenmaxxing, and self-improve.
- Results are comparable to Terminal-Bench records.

### `[GA-M3][research] Select SWE-bench smoke tasks and internal corpus taxonomy`

Labels: `kind:research`, `area:evaluation-harness`, `area:self-improve`

Goal:

Choose task sets that prove coding-loop and learning behavior without becoming
a full benchmark platform.

Deliverables:

- 3-5 SWE-bench or SWE-bench Pro tasks with rationale.
- Internal corpus taxonomy covering docs, tests, bugfix, refactor, release,
  verifier failure, compression, and self-improve cases.
- Criteria for adding or retiring internal corpus tasks.

Acceptance criteria:

- SWE tasks have feasible setup and clear verifier outcomes.
- Internal tasks are not synthetic-only event replays.
- The taxonomy maps tasks to GA claims.

### `[GA-M3][evaluation] Add SWE-bench smoke adapter and internal corpus runner`

Labels: `kind:evaluation`, `area:evaluation-harness`

Goal:

Run SWE smoke tasks and internal corpus tasks through the same GA evidence path.

Deliverables:

- SWE smoke adapter for selected task ids.
- Internal corpus runner.
- Patch, command, verifier, and artifact capture.

Acceptance criteria:

- Each task emits `ga-eval/v1`.
- Patch artifacts and verifier logs are preserved.
- Result records include baseline/comparison fields where applicable.

### `[GA-M3][testing] Gate self-improve impact on internal corpus`

Labels: `kind:testing`, `area:self-improve`

Goal:

Prove self-improve changes future loop behavior rather than only generating
skill text.

Deliverables:

- Internal corpus tests for Loop Skill and Workspace Skill body load.
- Tests for rule application and completion-gate behavior.
- Post-adoption impact checks over verifier-backed records.

Acceptance criteria:

- A learned policy must be indexed, loaded, applied, and gated.
- Reflection-only completion remains blocked where hard evidence is required.
- Post-adoption result records show helped, regressed, or unused outcomes.

### `[GA-M3][engineering] Persist comparable corpus artifacts and patch reports`

Labels: `kind:engineering`, `area:evaluation-harness`, `area:self-improve`

Goal:

Make SWE and internal corpus outputs auditable and reproducible.

Deliverables:

- Artifact directory layout for patches, logs, resources, reports, and raw
  traces.
- Patch summary report.
- Corpus index linking task ids to result ids.

Acceptance criteria:

- A maintainer can inspect a task result from the corpus index.
- Artifacts include reproduction command and environment details.
- Reports distinguish product failures, verifier failures, and benchmark setup
  failures.

## GA-M4 Acceptance & Release

### `[GA-M4][Epic] Complete real-endpoint acceptance and release readiness`

Labels: `area:release-ops`, `area:tokenmaxxing-sr`, `area:evaluation-harness`

Goal:

Ship GA only after real endpoint acceptance and public evidence are ready.

Deliverables:

- Final real-endpoint acceptance report.
- Release gate checklist.
- Public roadmap and docs updates.
- Release notes with proven/partial/future-work sections.

Acceptance criteria:

- Build, tests, curated eval gates, SR replay, and real acceptance pass or have
  documented blockers.
- Release docs state evidence honestly.
- GitHub GA issues are closed only with linked evidence.

### `[GA-M4][research] Write GA public narrative and evidence interpretation`

Labels: `kind:research`, `area:release-ops`

Goal:

Turn GA evidence into a clear public explanation without overstating coverage.

Deliverables:

- Narrative for loop engineering closure.
- Tokenmaxxing value interpretation.
- SR model-selection interpretation.
- Known limitations and future work.

Acceptance criteria:

- Claims are backed by linked evidence artifacts.
- Small curated benchmark scope is stated explicitly.
- Partial or unavailable endpoint capabilities are not presented as passed.

### `[GA-M4][evaluation] Run final real-endpoint acceptance evidence report`

Labels: `kind:evaluation`, `area:release-ops`, `area:tokenmaxxing-sr`

Goal:

Produce the final release acceptance record with real configured endpoints.

Deliverables:

- Direct vLLM endpoint evidence.
- SR endpoint and route metadata evidence.
- Omni endpoint evidence where available.
- Loop, verifier, token/cache/context, compression, and artifact evidence.

Acceptance criteria:

- The final acceptance report includes endpoint URLs or redacted identifiers,
  model names, server flags where known, session id, result ids, and artifacts.
- Missing endpoint capabilities are recorded as limitations.
- The report can be reproduced from documented commands.

### `[GA-M4][testing] Add release-blocking gate for build, tests, eval, and acceptance`

Labels: `kind:testing`, `area:release-ops`

Goal:

Make GA release readiness mechanically checkable.

Deliverables:

- Release gate command list.
- Expected outputs and artifact checks.
- Failure triage checklist.

Acceptance criteria:

- `npm run build` and `npm test` are mandatory.
- Curated eval and acceptance evidence checks are mandatory for GA.
- A failed gate points to the issue or artifact that needs repair.

### `[GA-M4][engineering] Harden release docs, package metadata, and issue closure workflow`

Labels: `kind:engineering`, `area:release-ops`

Goal:

Prepare the repository and GitHub project for the GA release.

Deliverables:

- README/docs updates that point to GA evidence.
- Release notes draft.
- Issue closure workflow requiring linked evidence.
- Package metadata review.

Acceptance criteria:

- Public docs match the GA claim and evidence.
- Release notes separate implemented, partially implemented, and future product
  work.
- GA issues are closed with links to tests, eval artifacts, or acceptance
  reports.
