---
slug: announcing-inferoa
title: "Inferoa: Inference-native Tokenmaxxing Agent Harness for Loop Engineering"
title_meta: "Inferoa: Inference-native Tokenmaxxing Agent Harness for Loop Engineering"
description: "Inferoa is an Inference-native Tokenmaxxing Agent Harness for Loop Engineering: goal loops, verification, memory, prefix-cache discipline, context optimization, routing, and high-throughput model serving."
image: /img/blog/inferoa-banner.png
authors: []
tags: [inferoa, tokenmaxxing, agents, inference, vllm]
---

![Inferoa: Inference-native Tokenmaxxing Agent Harness for Loop Engineering](/img/blog/inferoa-banner.png)

The most interesting agent work is moving from better prompts to better loops.

**Loop Engineering** means giving the model a goal, feedback, verification, memory,
and tools, then letting it self-correct until the work is proven. Primitives
like `/goal`, rubric-driven outcomes, verifier sub-agents, and memory-backed
sessions matter because they move the work from "prompt the next answer" to
"design the system that keeps improving."

That loop is also an inference workload. As turns accumulate, prompt prefixes
drift, cache reuse collapses, stale evidence fills context, model routing gets
harder, and serving choices start to matter.

![Loop Engineering as a recursive system of goals, tools, feedback, memory, verification, reflection, and proof](/img/blog/inferoa-loop-inference-workload.png)

That is where Loop Engineering has to become inference-native. A long-horizon
loop needs to see the substrate it is consuming: tokens, cache, context, routes,
endpoints, and model capacity. Tokenmaxxing is the discipline of keeping those
surfaces explicit so every horizon can reuse, compress, route, and recover
instead of sending another blind chat turn.

That is the gap Inferoa is built around. The name is deliberately literal:

Inferoa = **Infer**(Inference-native)**o**(Tokenmaxxing Loop
Engineering)**a**(Agent Harness).

Inferoa is an **Inference-native Tokenmaxxing Agent Harness for Loop
Engineering**. It brings the pieces a serious loop needs into one runtime:
goal/rubric feedback, verification evidence, memory and context control,
prefix-cache discipline, intelligent routing through
[vLLM Semantic Router](https://github.com/vllm-project/semantic-router),
high-throughput serving with
[vLLM Engine](https://github.com/vllm-project/vllm), [vLLM Omni](https://github.com/vllm-project/vllm-omni)
multimodal capability, and tokenmaxxing observability across every turn.

![Inferoa welcome session](/gif/welcome.gif)

<!-- truncate -->

## What Breaks

Long-horizon agents are not one prompt. They are loops: plan, act, observe,
verify, remember, and decide whether to continue. If the runtime treats every
turn as generic chat traffic, it loses both sides of the optimization surface:
the feedback that drives self-correction and the inference signals that keep the
workload efficient.

![What breaks when loop engineering cannot see inference signals](/img/blog/inferoa-what-breaks.png)

The failure modes are familiar:

- the goal is present, but the feedback loop is too weak to drive correction;
- grading is collapsed into self-critique instead of independent evidence;
- memory becomes a folder of notes rather than a reusable outer loop;
- prompt shape drifts, so prefix cache cannot be reused reliably;
- context selection becomes "paste more" instead of "select better";
- cheap, private, or mechanical turns still take expensive model paths;
- serving and cache signals arrive too late to shape the next action.

These are runtime design problems, not analytics problems.

## What Changes

Inferoa makes inference behavior visible while the loop is still running. The
point is not to add another dashboard. The point is to let the runtime choose
better prompts, better context, better routes, and better recovery behavior
before the next turn is sent.

![What changes when inference signals become native to the agent loop](/img/blog/inferoa-what-changes.png)

| Surface | Substrate | What Inferoa Makes Native | Why It Matters |
| --- | --- | --- | --- |
| Loop Engineering | [Inferoa Goal Mode](https://inferoa.agentic-in.ai/docs/workflows/goal-mode) | Recursive long-horizon goals, horizons, candidate work, reflection, and completion evidence | The engineering loop keeps running until the work is proven |
| Agent Harness | [Inferoa](https://github.com/agentic-in/inferoa) | Sessions, tools, plans, autoresearch, resources, recovery, and prefix-cache discipline | Long work gets a durable runtime while preserving reusable prompt prefixes |
| Context Optimization | [CodeGraph](https://www.npmjs.com/package/@colbymchenry/codegraph), [RTK](https://github.com/rtk-ai/rtk) | Compression, graph-shaped repo context, bounded tool output, and evidence selection | The model sees evidence, not raw sprawl |
| Intelligent Routing | [vLLM Semantic Router](https://github.com/vllm-project/semantic-router) | Model paths respond to cost, safety, privacy, capability, and session pressure | Turns can route between self-hosted vLLM models and external frontier models |
| Model Serving | [vLLM Engine](https://github.com/vllm-project/vllm), [vLLM Omni](https://github.com/vllm-project/vllm-omni) | High-throughput, memory-efficient serving and multimodal endpoints stay visible to the harness | Self-hosted paths make cost, safety, privacy, and data sovereignty controllable when an external frontier model is unnecessary |

This is the core design: the agent is not merely calling an inference system;
the loop is shaped by it.

## Goal Mode: Loop Engineering For Long-Horizon Work

Prompt engineering improves the next answer. Loop engineering designs the
system that decides what to do after that answer. In Inferoa, `/goal` is the
entry point: it starts a recursive long-horizon loop, expands work through
horizons, preserves evidence, uses reflection as a checkpoint, and requires
proof before completion.

![Inferoa goal mode](/gif/goal.gif)

Goal Mode is deliberately not just a persistent note in the prompt. It gives the
runtime a durable outcome, a visible Horizon 0 orientation, a strategy,
candidate work, step status, verifier-ready evidence, reflection decisions, and
a completion report. That is the difference between asking for the next step and
engineering the loop that can keep going.

## Inferoa At A Glance

The product surface is terminal-first, but it is not just a shell. Each mode
exposes a different part of the loop while the agent works.

Run `/goal` to start a long-horizon recursive goal. The agent can decompose
work, update steps, attach evidence, reflect between horizons, and avoid
mistaking an empty checklist for a finished outcome.

Plan mode turns ambiguous scope into an inspectable decision. A plan can stay in
drafting, move to approval, or become executable context without blocking the
runtime on process overhead.

![Inferoa plan mode](/gif/plan.gif)

Autoresearch mode makes the evaluation loop native: define the experiment, run
the harness, record failures, patch the implementation, and keep the metric
trail in the same session.

![Inferoa autoresearch iteration](/gif/research.gif)

Tokenmaxxing is the savings ledger for prefix-cache reuse, context optimization,
[RTK](https://github.com/rtk-ai/rtk) tool-output savings, recent turn usage, and
model-selection pressure. It shows whether the loop is actually becoming more
efficient, not just how many tokens were spent.

![Inferoa tokenmaxxing report](/img/screenshots/tokenmaxxing.png)

The command surface stays small: `/goal` for durable objectives, `/plan` for
inspectable scope, `/autoresearch` for metric-driven iteration, and
`/tokenmaxxing` for the savings ledger across prefix cache,
[CodeGraph](https://www.npmjs.com/package/@colbymchenry/codegraph) and
[RTK](https://github.com/rtk-ai/rtk) context savings, recent turn usage, and
model-selection cost pressure.

## Proof Of Value

The value story is not one benchmark score. It is whether the tokenmaxxing path
stays stable, measurable, and cheaper as the horizon grows. The public eval is
split into measured stress runs and calibrated projections: measured runs check
runtime invariants and continuity; projections ask what happens if the measured
shape is carried to 1k-10k loops.

Key results:

- **Prefix cache and continuity**: measured profiles kept **one prompt epoch,
  one tool schema hash, and one cache salt** while cache reuse improved after
  warmup. A **256-turn compression regression** preserved continuity markers and
  archive pointers, and 1k-10k projections were calibrated from measured tail
  slope instead of claimed as live 10k-request runs.
- **CodeGraph context reduction**:
  [CodeGraph](https://www.npmjs.com/package/@colbymchenry/codegraph)-style
  symbol/range selection saved **80.8%** of inspected context.
- **RTK tool-output reduction**: [RTK](https://github.com/rtk-ai/rtk) command
  records saved **61.4%** of command-token footprint.

![Inferoa tokenmaxxing surfaces](/img/experiments/inferoa-optimization-surfaces.svg)

- **Routing economics**: the
  [Routeworks leaderboard](https://routeworks.github.io/?p=/leaderboard) makes the
  inference-cost tradeoff visible on a log scale. At similar accuracy, routed
  paths can sit at **1/10** or even **1/100** of a frontier-heavy route's cost.

![Routeworks routing leaderboard](/img/experiments/routeworks-routing-leaderboard.png)

The exact numbers will move with workload, model pricing, and local RTK command
corpus. The direction is the important part: long-horizon loops need a runtime
that protects stability, preserves continuity through compression, and uses
every inference surface available.

## Built With The Inference Stack

![Inferoa built with the inference stack](/img/blog/inferoa-stack.png)

### vLLM Ecosystem

Inferoa starts with the vLLM ecosystem because vLLM exposes the right surfaces:
serving behavior, routing, multimodal paths, endpoint signals, and prefix-cache
economics.

- [**vLLM Engine**](https://github.com/vllm-project/vllm) provides
  high-performance OpenAI-compatible inference and the prefix-cache behavior
  Inferoa protects across long sessions.
- [**vLLM Semantic Router**](https://github.com/vllm-project/semantic-router)
  brings model routing into the agent loop so routes can respond to cost,
  safety, privacy, capability, and session pressure.
- [**vLLM Omni**](https://github.com/vllm-project/vllm-omni) brings image,
  video, and audio understanding or generation into the same durable agent
  contract.

### Context Optimization

Inferoa also uses the context optimization projects that make long-horizon loops
practical:

- [**CodeGraph**](https://www.npmjs.com/package/@colbymchenry/codegraph)
  turns repository context into graph-shaped symbol and range evidence.
- [**RTK**](https://github.com/rtk-ai/rtk) rewrites command-heavy tool output
  into compact records that preserve evidence while reducing token pressure.

Inferoa is the harness layer above that stack: the place where long-horizon
agent behavior and inference behavior meet.

## Try It

```bash
npm install -g inferoa@dev
inferoa setup
inferoa
```

The larger goal is simple: agents should not waste the inference stack they are
already paying for. Inferoa makes those signals native to the loop.
