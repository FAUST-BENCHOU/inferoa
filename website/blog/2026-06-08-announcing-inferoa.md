---
slug: announcing-inferoa
title: "Inferoa: Inference-native Tokenmaxxing Agent Harness"
description: "Inferoa is an Inference-native Tokenmaxxing Agent Harness for long-horizon coding work across prefix-cache discipline, context optimization, routing, and self-hosted model serving."
image: /img/inferoa-line-hero.png
authors: []
tags: [inferoa, agents, inference, vllm]
---

![Inferoa Agent Harness](/img/inferoa-line-hero.png)

Most agents call models as if inference were a black box.

The agent loop lives in one place, routing policy in another, serving behavior
somewhere else, and context management becomes a last-minute fight with the
window. That split is tolerable for one-turn chat. It breaks down when agents
run for hours, recover from failures, compress context, warm prefix cache, route
between model paths, and still need to prove the work at the end.

> Prefix cache stability is ignored. Routing is bolted on later. Context is
> pasted until it fits. Users pay for that gap.

Inferoa is an **Inference-native Tokenmaxxing Agent Harness** for long-horizon
coding work. It starts from the inference stack and designs the agent loop
around tokenmaxxing: Prefix-cache discipline, Context Optimization with
CodeGraph and RTK, Intelligent routing, Self-Hosted Model Serving through vLLM
Engine and vLLM Omni, autoresearch, and verification all belong to the same
durable session.

<!-- truncate -->

![Inferoa welcome session](/img/screenshots/inferoa-welcome.png)

## What Breaks

Long-horizon agents are not one prompt. They are many turns of planning, repo
inspection, shell commands, edits, retries, compaction, cache warmup, route
selection, and verification. If the harness treats every turn as generic chat
traffic, it throws away the optimization surface underneath it.

The failure modes are familiar:

- prompt shape drifts, so prefix cache cannot be reused reliably;
- context selection becomes "paste more" instead of "select better";
- cheap, private, or mechanical turns still take expensive model paths;
- compression preserves a summary but loses continuity;
- multimodal work becomes a disconnected side call;
- serving and cache signals arrive too late to shape the next action.

inferoa treats those as harness design problems, not analytics problems.

## What Changes

inferoa makes inference behavior visible to the agent loop. The point is not to
add another dashboard. The point is to let the runtime choose better prompts,
better context, better routes, and better recovery behavior while the task is
still running.

| Surface | What inferoa Makes Native | Why It Matters |
| --- | --- | --- |
| Agent Harness | Goals, plans, sessions, tools, recovery, verification | Long work stays coherent and resumable |
| Prefix-cache discipline | Stable prompt epochs, deterministic tool schemas, cache reports | Serving can reuse the shape of the session |
| Context Optimization | CodeGraph, RTK, summaries, resources, bounded tool results | The model sees evidence, not raw sprawl |
| Intelligent Routing | Model paths respond to cost, privacy, capability, and pressure | Not every turn needs the same expensive path |
| Self-Hosted Model Serving | vLLM Engine usage/cache signals and vLLM Omni multimodal paths | Cache, cost, latency, and data-control surfaces stay native |

This is the core design: the agent is not merely calling an inference system.
It is shaped by it.

## What You Can Do Today

inferoa is a terminal-first harness, but the product surface is not just a
shell. It makes long-horizon state visible while the agent works.

Goal mode keeps the objective durable. The agent can decompose work, update
steps, attach evidence, and avoid mistaking an empty checklist for a finished
goal.

![Inferoa goal mode](/img/screenshots/inferoa-goal.png)

Plan mode turns ambiguous scope into an inspectable decision. A plan can stay in
drafting, move to approval, or become executable context without becoming a
hard runtime failure.

![Inferoa plan mode](/img/screenshots/inferoa-plan-ready.png)

Prefix-cache reporting separates warmup from steady state. The harness tracks
prompt epochs, schema hashes, cache salt, and cached-token evidence so the user
can see whether the session shape is staying reusable.

![Inferoa tokenmaxxing report](/img/screenshots/tokenmaxxing.png)

Autoresearch mode makes the evaluation loop native: define the experiment, run
the harness, record failures, patch the implementation, and keep the metric
trail inside the same session.

![Inferoa autoresearch iteration](/img/screenshots/inferoa-autoresearch-iteration.png)

The core command surface stays small: `/goal` for durable objectives, `/plan`
for inspectable scope, `/autoresearch` for metric-driven iteration, and
`/tokenmaxxing` for the savings ledger across prefix cache, CodeGraph/RTK
context savings, recent turn usage, and model-selection cost pressure.

## Why Coding First

Coding puts real pressure on the whole system.

A coding agent has to inspect repositories, choose relevant context, make edits,
run commands, recover from failures, maintain a goal, and prove the work through
tests. It is a long-horizon task with brutal context pressure and a clear
verification loop. That makes it a strong first domain for co-designing agent
behavior with inference behavior.

If the harness can preserve cache stability, optimize context, route
intelligently, use self-hosted model serving, and keep verification durable in
coding workflows, those patterns become useful far beyond coding.

## Proof Of Value

We ran a long-horizon stress suite on June 9, 2026 across the surfaces that
matter most for a tokenmaxxing harness: prefix-cache stability, compression
continuity, context optimization, RTK command savings, and model selection. The
goal was not to produce one benchmark score. It was to test whether the session
stays measurable and stable as the horizon grows.

The longest simulated run completed **64 tool loops** with **one prompt epoch,
one tool schema hash, and one cache salt**. The average steady-state simulated
cache hit rate was **54.6%**, and the final request reached **66.9%** as more
prior history became reusable prefix. A multi-turn profile kept the same prompt
epoch, schema hash, and cache salt across **8 turns**, with **44.7%**
steady-state cache reuse. DeepSeek v4 Pro also exposed the serving-layer cache
signal directly: after warmup, repeated stable-prefix requests reported
**99.2%** cached prompt tokens.

![Inferoa prefix cache stability](/img/experiments/inferoa-prefix-cache-stability.svg)

Compression is where long-horizon agents usually lose continuity. inferoa ran a
**256-turn** stress test with compression every 8 turns: **32 compression
cycles**, **32 archived context resources**, and **256 post-compression
interactive turns**. Every turn preserved the continuity marker and archive
pointer, while cache salt and tool schema stayed stable. The post-compression
interactive path averaged **31.8%** steady cache reuse.

![Inferoa compression continuity](/img/experiments/inferoa-compression-continuity.svg)

The savings do not come from prefix cache alone. At 64 loops, the raw-transcript
baseline was **3.48M prompt tokens**. inferoa's bounded prompt path used
**987.6K prompt tokens**. With cache-adjusted prefill work, that fell to
**507.1K input-token-equivalent tokens**, an **85.4%** reduction versus the raw
baseline.

The context and routing layers add independent leverage: CodeGraph-style
symbol/range context reduced inspected cache/runtime context by **80.8%**; RTK
command records reduced command-token footprint by **61.4%**; routing
projections lifted the DeepSeek-priced reference budget from **39.6%**
single-model accuracy to **91.0%** oracle-routed accuracy.

![Inferoa optimization surfaces](/img/experiments/inferoa-optimization-surfaces.svg)

Projected to a 10,000-loop reference run, the same measured shape is **98.6%**
lower input-token-equivalent work than a raw-transcript baseline. The exact
number will move with workload and pricing. The important part is the direction:
long-horizon agents need a harness that protects stability and uses every
inference surface available.

## Built With The vLLM Ecosystem

inferoa starts with the vLLM ecosystem because vLLM exposes the right surfaces:
serving behavior, routing, multimodal paths, endpoint signals, and prefix-cache
economics.

- **vLLM Engine** provides high-performance OpenAI-compatible inference and the
  prefix-cache behavior inferoa protects across long sessions.
- **vLLM Semantic Router** brings model routing into the agent loop so routes can
  respond to cost, safety, privacy, capability, and session pressure.
- **vLLM Omni** brings image, video, and audio understanding or generation into
  the same durable agent contract.

inferoa is the harness layer above that stack: the place where long-horizon
agent behavior and inference behavior meet.

## Try It

```bash
npm install -g inferoa
inferoa setup
inferoa
```

inferoa stores local state under `~/.inferoa/`. Model endpoint credentials are
stored through the local vault; config files keep references rather than raw
secrets.

The larger goal is simple: agents should not waste the inference stack they are
already paying for. inferoa makes those signals native to the loop.
