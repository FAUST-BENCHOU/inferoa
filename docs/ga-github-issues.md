# GA GitHub Issues

This file records the current GA issue structure after triage. GitHub is the
active task board; this document explains which issues should be assigned first
and why.

## Labels

Task-kind labels:

- `kind:research`
- `kind:evaluation`
- `kind:testing`
- `kind:engineering`

Capability-area labels:

- `area:loop-control`
- `area:evaluation-harness`
- `area:tokenmaxxing-sr`
- `area:self-improve`
- `area:release-ops`

Priority labels:

- `priority:p0-blocker`: blocks the first credible GA evidence slice or a core
  GA claim.
- `priority:p1-ga`: required for GA, but not blocking the first closed evidence
  slice.
- `priority:p2-followup`: useful follow-up or release narrative work after the
  core GA proof.

## Milestones

| Milestone | Intent |
| --- | --- |
| `GA-M0 First Closed Loop Evidence Slice` | Produce the first runnable `ga-eval/v1` artifact from a real loop task |
| `GA-M1 Terminal-Bench Loop Eval` | Add a one-task Terminal-Bench vertical slice, then a curated 10-task track |
| `GA-M2 Tokenmaxxing + SR Policy` | Build `Trace -> Policy -> SR` model-selection evidence |
| `GA-M3 SWE-bench + Internal Corpus` | Add SWE smoke and internal real-loop corpus coverage |
| `GA-M4 Acceptance & Release` | Aggregate evidence, run real endpoint acceptance, and prepare release docs |

## Current Board Summary

- Open GA issues: 43
- Closed GA setup issue: #12
- P0 blockers: 20
- P1 GA tasks: 21
- P2 follow-ups: 2

## P0 Assignment Queue

These are the first tasks to assign. They are ordered by dependency, not by
issue number.

| Order | Issue | Task | Owner Profile |
| --- | --- | --- | --- |
| 1 | #9 | Define GA loop-closure rubric and evidence tiers | Research/architecture |
| 2 | #10 | Implement `ga-eval/v1` schema and result writer | Runtime/eval engineering |
| 3 | #11 | Implement `ga-eval` artifact validator command | Testing/eval engineering |
| 4 | #36 | Add GA artifact directory layout and manifest index | Eval infrastructure |
| 5 | #33 | Project `GoalLoopView` and loop metrics into `ga-eval/v1` | Loop/runtime engineering |
| 6 | #35 | Add validator fixtures for pass, fail, blocked, and error | Testing |
| 7 | #34 | Add first internal real-loop closed evidence fixture | Evaluation |
| 8 | #15 | Implement 1-task Terminal-Bench vertical slice adapter | Evaluation |
| 9 | #37 | Add baseline runner for Terminal-Bench comparison | Evaluation |
| 10 | #17 | Compute baseline vs Inferoa tokenmaxxing delta from eval results | Tokenmaxxing engineering |
| 11 | #19 | Define SR loop workload feature set from traces | SR research |
| 12 | #40 | Record SR route feature vectors per model request | Runtime/SR engineering |
| 13 | #20 | Implement offline SR route-policy replay over `ga-eval` traces | SR evaluation |
| 14 | #43 | Add offline route replay fixtures for cost and quality guardrails | Testing |
| 15 | #42 | Generate SR route policy replay report | Evaluation/reporting |
| 16 | #21 | Add tests for SR metadata stability and cache-unavailable semantics | Testing |
| 17 | #22 | Pass stable loop workload metadata to SR request path | Runtime/SR engineering |
| 18 | #41 | Capture SR selected route and model evidence from responses | Runtime/SR engineering |

Epics #8 and #18 track the P0 lines but are not intended as implementation
assignments.

## Issue Inventory

### GA-M0 First Closed Loop Evidence Slice

| Issue | Priority | Kind | Assignment |
| --- | --- | --- | --- |
| #8 `[GA-M0][Epic] First closed loop evidence slice` | P0 | Epic | Tracking only |
| #9 Define GA loop-closure rubric and evidence tiers | P0 | Research | Assign |
| #10 Implement `ga-eval/v1` schema and result writer | P0 | Engineering | Assign |
| #11 Implement `ga-eval` artifact validator command | P0 | Testing | Assign |
| #33 Project `GoalLoopView` and loop metrics into `ga-eval/v1` | P0 | Engineering | Assign |
| #34 Add first internal real-loop closed evidence fixture | P0 | Evaluation | Assign |
| #35 Add validator fixtures for pass, fail, blocked, and error | P0 | Testing | Assign |
| #36 Add GA artifact directory layout and manifest index | P0 | Engineering | Assign |
| #12 Add GA docs, labels, milestones, and issue templates | Done | Engineering | Closed completed |

### GA-M1 Terminal-Bench Loop Eval

| Issue | Priority | Kind | Assignment |
| --- | --- | --- | --- |
| #13 `[GA-M1][Epic] Terminal-Bench loop eval track` | P1 | Epic | Tracking only |
| #14 Curate Terminal-Bench 10-task manifest | P1 | Research | Assign after #15 vertical slice starts |
| #15 Implement 1-task Terminal-Bench vertical slice adapter | P0 | Evaluation | Assign |
| #16 Add Terminal-Bench smoke validation command | P1 | Testing | Assign after #15 |
| #17 Compute baseline vs Inferoa tokenmaxxing delta from eval results | P0 | Engineering | Assign after #10 |
| #37 Add baseline runner for Terminal-Bench comparison | P0 | Evaluation | Assign after #10 |
| #38 Materialize Terminal-Bench task workspaces in managed worktrees | P1 | Engineering | Assign after #15 |
| #39 Add adapter failure-mode fixtures for setup, verifier, and timeout | P1 | Testing | Assign after #15 |

### GA-M2 Tokenmaxxing + SR Policy

| Issue | Priority | Kind | Assignment |
| --- | --- | --- | --- |
| #18 `[GA-M2][Epic] Trace -> Policy -> SR model-selection evidence` | P0 | Epic | Tracking only |
| #19 Define SR loop workload feature set from traces | P0 | Research | Assign |
| #20 Implement offline SR route-policy replay over `ga-eval` traces | P0 | Evaluation | Assign after #19 |
| #21 Add tests for SR metadata stability and cache-unavailable semantics | P0 | Testing | Assign |
| #22 Pass stable loop workload metadata to SR request path | P0 | Engineering | Assign after #19 |
| #40 Record SR route feature vectors per model request | P0 | Engineering | Assign after #19 |
| #41 Capture SR selected route and model evidence from responses | P0 | Engineering | Assign |
| #42 Generate SR route policy replay report | P0 | Evaluation | Assign after #20 |
| #43 Add offline route replay fixtures for cost and quality guardrails | P0 | Testing | Assign after #20 |

### GA-M3 SWE-bench + Internal Corpus

| Issue | Priority | Kind | Assignment |
| --- | --- | --- | --- |
| #23 `[GA-M3][Epic] SWE-bench smoke and internal real-loop corpus` | P1 | Epic | Tracking only |
| #24 Select 3-5 SWE-bench smoke tasks | P1 | Research | Assign |
| #25 Implement SWE-bench smoke adapter | P1 | Evaluation | Assign after #24 |
| #26 Measure self-improve impact across internal corpus | P1 | Testing | Assign after #44/#45 |
| #27 Persist GA corpus artifact index and patch reports | P1 | Engineering | Assign after #25/#45 |
| #44 Define internal real-loop corpus taxonomy and manifest | P1 | Research | Assign |
| #45 Implement internal corpus runner | P1 | Evaluation | Assign after #44 |
| #46 Run GA eval tasks in managed worktrees | P1 | Engineering | Assign after #45 |
| #47 Add maker/checker policy for eval tasks | P1 | Engineering | Assign after #9 |
| #48 Add internal corpus smoke tasks for verifier, compression, and self-improve | P1 | Testing | Assign after #45 |

### GA-M4 Acceptance & Release

| Issue | Priority | Kind | Assignment |
| --- | --- | --- | --- |
| #28 `[GA-M4][Epic] Real-endpoint acceptance and release readiness` | P1 | Epic | Tracking only |
| #30 Generate final acceptance evidence report from `ga-eval` artifacts | P1 | Evaluation | Assign after evidence index exists |
| #31 Add GA release gate command | P1 | Testing | Assign after validator/index work |
| #49 Generate GA evidence index from `ga-eval` artifacts | P1 | Engineering | Assign after M1/M2/M3 artifacts exist |
| #50 Add evidence index consistency checks | P1 | Testing | Assign after #49 |
| #51 Compare final acceptance against Terminal, SWE, and internal evidence | P1 | Evaluation | Assign after #30/#49 |
| #29 Write GA evidence narrative after reports exist | P2 | Research | Assign late |
| #32 Prepare GA release docs from evidence report | P2 | Engineering | Assign late |

## Issues Closed Or Superseded

- #12 is closed as completed. The docs, labels, milestones, and initial issue
  structure were created, and future work is now split across assignable P0/P1
  tasks.

No other GA issue was closed. Broad issues were rewritten into narrower
assignable tasks, and new issues #33-#51 were added for missing implementation
work.
