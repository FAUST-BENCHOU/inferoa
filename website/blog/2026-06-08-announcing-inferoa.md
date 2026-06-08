---
slug: announcing-inferoa
title: "Inferoa: The Inference Optimized Agent Harness"
description: "Inferoa is an inference optimized agent harness for long-horizon coding work across context optimization, routing, serving, prefix cache, and multimodal inference."
image: /img/inferoa-line-hero.png
authors: []
tags: [inferoa, agents, inference, vllm]
---

![Inferoa Agent Harness](/img/inferoa-line-hero.png)

Agents are getting longer-horizon. Their inference path has not caught up.

Most agent products still treat the model as a black-box API call. The agent
loop lives in one place, routing policy in another, serving behavior somewhere
else, and multimodal capability as a side path. That separation leaves real
inference optimization on the table. Prefix cache stability is broken by prompt
shape drift. Every turn often takes the same model route. Context is expanded
until the window complains. Users pay for a stack that the agent itself cannot
see.

Inferoa exists to make that stack visible to the agent loop.

<!-- truncate -->

Inferoa is an **Inference Optimized Agent Harness**. It is built for
long-horizon work where the next action depends on more than the latest chat
message: goals, plans, tool traces, context pressure, route choices, serving
signals, prefix-cache behavior, multimodal artifacts, and verification all
need to survive as one session.

![Inferoa welcome session](/img/screenshots/inferoa-welcome.png)

The product thesis is simple: agents should not merely call inference systems.
They should be shaped by them.

## The Broken Layering

Modern inference systems expose useful optimization surfaces: prefix cache,
endpoint load, model capability, token usage, routing metadata, and multimodal
paths. Modern agents usually ignore most of them.

That mismatch creates familiar failure modes:

- long sessions lose cache stability because prompt structure keeps changing;
- context selection becomes "paste more" instead of "select better";
- cheap or private turns still take expensive model paths;
- multimodal work becomes a disconnected call rather than part of the durable
  loop;
- serving and cache signals appear only after the agent has already made the
  next decision.

Inferoa treats those as harness design problems, not analytics problems.

## Prefix Cache Is A Product Surface

For long-horizon work, prefix cache is not a backend detail. It is one of the
core things the harness must protect.

Inferoa keeps prompt epochs stable, orders tool schemas deterministically,
bounds mutable context, separates warmup turns from steady-state cache hits,
and exposes cache reports without turning the UI into noise. The goal is not
just to show cache hit rate. The goal is to preserve the session shape that
lets the serving engine reuse work across turns.

![Inferoa prefix cache report](/img/screenshots/inferoa-prefix-cache-report.png)

## Why Coding First

Inferoa starts with coding because coding puts real pressure on the whole
system.

A coding agent has to inspect repositories, choose relevant context, make
edits, run commands, recover from failures, maintain a goal, and prove the work
through tests. It is a long-horizon task with brutal context pressure and a
clear verification loop. That makes it a strong first domain for co-designing
agent behavior with inference behavior.

If the harness can preserve cache stability, reduce token waste, route
intelligently, and keep verification durable in coding workflows, those
patterns become useful far beyond coding.

## Across the Inference Stack

Inferoa is designed from the inference stack outward:

```text
Agent Harness
  -> Context Optimization
  -> Intelligent Routing
  -> Serving
  -> Multimodal
```

The day-0 co-design strategy starts with the vLLM ecosystem:

- **vLLM Engine** provides high-performance serving and the prefix-cache
  behavior Inferoa protects across long sessions.
- **vLLM Semantic Router** brings intelligent model routing into the agent
  loop, so routes can respond to cost, safety, privacy, capability, and session
  pressure.
- **vLLM Omni** brings image, video, and audio understanding or generation into
  the same durable agent contract.

Inferoa also treats context optimization as a first-class product surface.
CodeGraph, RTK, and built-in harnesses help select repo evidence, symbols,
summaries, resources, and tool results so coding agents spend fewer tokens and
improve accuracy.

## What Inferoa Makes Native

Inferoa is not just a terminal shell. It makes long-horizon behavior native:

- goals and plans for durable task direction;
- autoresearch mode for iterative experiments and evaluation;
- prefix-cache reports that distinguish warmup from steady state;
- session resume and transcript replay;
- model/provider setup for direct, routed, and external OpenAI-compatible
  endpoints;
- context compression and managed resources;
- multimodal artifacts inside the same session.

Goal mode keeps the long-horizon objective visible while the agent gathers
evidence, updates steps, and avoids losing the thread of the work.

![Inferoa goal mode](/img/screenshots/inferoa-goal.png)

Plan mode turns ambiguous scope into an inspectable decision. The user can
approve execution or keep the plan in drafting without turning that into a hard
runtime failure.

![Inferoa plan mode](/img/screenshots/inferoa-plan-ready.png)

Research mode is the benchmark-driven loop: define the experiment, run the
harness, record failures, patch the implementation, and keep the metric trail
inside the same session.

![Inferoa autoresearch iteration](/img/screenshots/inferoa-autoresearch-iteration.png)

The larger goal is an agent harness that follows inference optimization
principles by default. Not because that is elegant architecture, but because
users should benefit from the inference stack they are already paying for.
