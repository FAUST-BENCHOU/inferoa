# Inferoa GA Roadmap

Inferoa GA is scoped around a credible public evidence chain for an
inference-native tokenmaxxing agent harness for loop engineering.

The GA bar is not broad feature coverage. The GA bar is a working loop system
that can close real tasks, verify them with durable evidence, expose
tokenmaxxing impact, and provide Semantic Router-ready inference workload
signals.

## GA Claim

```text
Inference-native Tokenmaxxing Agent Harness for Loop Engineering
```

The claim has three proof obligations:

1. **Loop engineering**: the system carries the goal, work unit, attempt,
   verification, memory, and next decision instead of relying on manual
   prompt-by-prompt steering.
2. **Tokenmaxxing**: the harness shows useful work per token through prompt
   stability, bounded context, cache evidence, compression continuity, and
   baseline comparison.
3. **Inference-native routing**: loop workload signals are structured enough
   for SR model-selection policy rather than treating every model request as
   generic chat traffic.

## Priority Model

GitHub issues use explicit priority labels:

| Priority | Meaning |
| --- | --- |
| `priority:p0-blocker` | Blocks the first credible GA evidence slice or a core GA claim |
| `priority:p1-ga` | Required for GA, but not blocking the first closed evidence slice |
| `priority:p2-followup` | Useful follow-up or release narrative work after the core proof |

Milestones are sequencing groups, not priority. P0 issues can appear in M0, M1,
or M2 when they are needed for the first credible evidence chain.

## Milestones

### GA-M0 First Closed Loop Evidence Slice

Goal: run one real loop task and emit a valid GA evidence artifact.

This milestone replaces the earlier internal "Evidence Contract" framing. Docs,
labels, and issue setup are already done; M0 now means a runnable closed-loop
slice.

Exit criteria:

- `ga-eval/v1` schema, writer, validator, artifact layout, and fixtures exist.
- `GoalLoopView` and loop metrics can be projected into `ga-eval/v1`.
- One internal real-loop fixture runs from a clean temp workspace.
- The fixture records goal, horizon, attempt, hard verifier, tokenmaxxing
  fields, and SR feature-vector fields.
- The artifact validates and has a reproduction command.

P0 issues:

- #8 `[GA-M0][Epic] First closed loop evidence slice`
- #9 Define GA loop-closure rubric and evidence tiers
- #10 Implement `ga-eval/v1` schema and result writer
- #11 Implement `ga-eval` artifact validator command
- #33 Project `GoalLoopView` and loop metrics into `ga-eval/v1`
- #34 Add first internal real-loop closed evidence fixture
- #35 Add validator fixtures for pass, fail, blocked, and error
- #36 Add GA artifact directory layout and manifest index

### GA-M1 Terminal-Bench Loop Eval

Goal: adapt Terminal-Bench through one vertical slice first, then expand to a
curated 10-task proof set.

Why Terminal-Bench first:

- it is closest to Inferoa's terminal harness surface;
- tasks have instructions, environments, verifier scripts, and reference
  solution shape;
- it can prove end-to-end closure before the heavier SWE patch pipeline.

Exit criteria:

- One selected task runs through Inferoa and emits `ga-eval/v1`.
- A baseline runner emits comparable `ga-eval/v1`.
- Tokenmaxxing delta can be computed from paired results.
- A curated 10-task manifest exists before broad adapter tuning.
- Smoke validation covers success and setup/verifier/timeout failures.

P0 issues:

- #15 Implement 1-task Terminal-Bench vertical slice adapter
- #17 Compute baseline vs Inferoa tokenmaxxing delta from eval results
- #37 Add baseline runner for Terminal-Bench comparison

P1 issues:

- #13 Terminal-Bench loop eval track
- #14 Curate Terminal-Bench 10-task manifest
- #16 Add Terminal-Bench smoke validation command
- #38 Materialize Terminal-Bench task workspaces in managed worktrees
- #39 Add adapter failure-mode fixtures for setup, verifier, and timeout

### GA-M2 Tokenmaxxing + SR Policy

Goal: make SR model selection a core GA proof line through
`Trace -> Policy -> SR`.

The product should not start by hard-coding live route policy. First extract
feature vectors from loop traces, replay policies offline, then promote stable
fields into live SR metadata and route evidence capture.

Exit criteria:

- Loop traces produce bounded SR route feature vectors per model request.
- Offline replay compares baseline and candidate route policies.
- Replay report shows cost/latency proxy, pass preservation, verifier strength,
  and self-hosted route ratio.
- Live SR request path receives stable metadata without bulky task context.
- Route/model evidence is captured when SR exposes headers or metadata.

P0 issues:

- #18 Trace -> Policy -> SR model-selection evidence
- #19 Define SR loop workload feature set from traces
- #20 Implement offline SR route-policy replay over `ga-eval` traces
- #21 Add tests for SR metadata stability and cache-unavailable semantics
- #22 Pass stable loop workload metadata to SR request path
- #40 Record SR route feature vectors per model request
- #41 Capture SR selected route and model evidence from responses
- #42 Generate SR route policy replay report
- #43 Add offline route replay fixtures for cost and quality guardrails

### GA-M3 SWE-bench + Internal Corpus

Goal: add coding issue smoke coverage and a repeatable internal corpus for
regression, self-improve, compression, verifier, and tokenmaxxing behavior.

SWE-bench is important for the coding-agent brand, but it should follow the
closed evidence slice and Terminal/SR foundations. The internal corpus is the
control group for repeatability and self-improve impact.

Exit criteria:

- 3-5 SWE-bench or SWE-bench Pro smoke tasks are selected and at least one runs.
- Internal real-loop corpus has a taxonomy, manifest, runner, and 3-task smoke
  subset.
- Self-improve impact is measured across corpus tasks, not only one hand-built
  case.
- Eval tasks that mutate repositories run in managed worktrees.
- Maker/checker policy is explicit for eval tasks and records checker use or
  skip reason.

P1 issues:

- #23 SWE-bench smoke and internal real-loop corpus
- #24 Select 3-5 SWE-bench smoke tasks
- #25 Implement SWE-bench smoke adapter
- #26 Measure self-improve impact across internal corpus
- #27 Persist GA corpus artifact index and patch reports
- #44 Define internal real-loop corpus taxonomy and manifest
- #45 Implement internal corpus runner
- #46 Run GA eval tasks in managed worktrees
- #47 Add maker/checker policy for eval tasks
- #48 Add internal corpus smoke tasks for verifier, compression, and
  self-improve

### GA-M4 Acceptance & Release

Goal: aggregate evidence, run real-endpoint acceptance, and publish only claims
backed by result artifacts.

Exit criteria:

- Build and tests pass.
- GA evidence index validates all required result artifacts.
- Final acceptance report includes direct vLLM, SR, and Omni evidence where
  available.
- Final comparison explains consistency or gaps across Terminal-Bench, SWE,
  internal corpus, SR replay, and real-endpoint acceptance.
- Public docs and release notes link claims to evidence and mark limitations.

P1 issues:

- #28 Real-endpoint acceptance and release readiness
- #30 Generate final acceptance evidence report from `ga-eval` artifacts
- #31 Add GA release gate command
- #49 Generate GA evidence index from `ga-eval` artifacts
- #50 Add evidence index consistency checks
- #51 Compare final acceptance against Terminal, SWE, and internal evidence

P2 issues:

- #29 Write GA evidence narrative after reports exist
- #32 Prepare GA release docs from evidence report

## Capability Gaps Driving The Roadmap

The current codebase already has the first goal-native loop closure: goal
horizons, session/event memory, verification records, skills, automation,
worktree isolation, checker roles, self-improve, and tokenmaxxing observability.
The GA roadmap focuses on the remaining gaps that block a credible public proof.

| Gap | Why It Matters | Roadmap Response |
| --- | --- | --- |
| No common GA evidence artifact | Tests and demos cannot be compared or released as proof | `ga-eval/v1`, projector, validator, artifact index |
| Eval path is not yet a loop workload | Benchmarks must prove goal/horizon/attempt/verifier closure, not only command success | internal closed slice, Terminal vertical slice, SWE smoke |
| Tokenmaxxing is observable but not yet comparative | GA claims need baseline-vs-Inferoa deltas | baseline runner and tokenmaxxing delta reports |
| SR only sees shallow metadata today | Model selection needs loop workload features | feature vectors, replay, live metadata, route capture |
| Self-improve proof is narrow | One case does not prove corpus-level impact | internal corpus and impact measurement |
| Maker/checker policy is not default for eval | Reflection-only completion is too weak for unattended proof | eval maker/checker policy and verifier gates |
| Release evidence is fragmented | Public GA claims need traceable artifacts | evidence index and final acceptance report |

## Non-Goals For GA

- Hosted dashboards.
- Broad connector coverage beyond the workflows needed for GA evidence.
- Auto-merge, publish, or deploy without explicit configured policy.
- Large leaderboard claims from small curated runs.
- Treating reflection-only evidence as a hard verifier.
- Cross-repository SR changes before trace-backed policy evidence exists.
