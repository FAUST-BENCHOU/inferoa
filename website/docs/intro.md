---
id: intro
title: Inferoa
sidebar_label: Overview
---

Inferoa is an **Inference-native Tokenmaxxing Agent Harness** for long-horizon
coding and research work in the vLLM ecosystem.

Most agents treat inference as a black-box chat API. Inferoa starts from the
opposite direction: the agent loop is designed around the optimization surfaces
that modern inference systems expose. Long sessions, prefix-cache discipline,
context pressure, model routing, self-hosted serving signals, multimodal
artifacts, and verification belong to one durable harness.

## What Inferoa Coordinates

```mermaid
flowchart LR
  User["User objective"]
  Harness["Inferoa harness"]
  Context["Context optimization"]
  Routing["Model routing"]
  Serving["vLLM-compatible serving"]
  Evidence["Sessions, artifacts, and evidence"]

  User --> Harness
  Harness --> Context
  Context --> Routing
  Routing --> Serving
  Serving --> Harness
  Harness --> Evidence
```

- **Long-horizon modes** keep goals, plans, autoresearch state, completion
  reflection, and evidence attached to a durable session.
- **Prefix-cache discipline** keeps the stable parts of the prompt stable, so
  reusable prefixes are not invalidated by avoidable churn.
- **Context optimization** selects the evidence needed for the next turn using
  summaries, code intelligence, bounded tool output, and RTK.
- **Intelligent routing** can choose model paths by cost, safety, privacy,
  capability, and current session pressure.
- **Self-hosted serving** uses vLLM Engine-compatible endpoints as first-class
  inference surfaces instead of opaque chat backends.
- **Multimodal execution** routes image, video, audio, and speech work through
  vLLM-Omni-compatible endpoints and stores produced media as managed
  artifacts.

## Why Coding First

Coding is a high-pressure long-horizon task: large repositories, tool failures,
context limits, repeated model calls, and proof through tests all appear in the
same workflow. That makes it a strong first domain for co-designing agent
behavior with inference behavior.

## Documentation Map

- [Quickstart](./quickstart.md) when you want to run Inferoa.
- [Architecture](./architecture.md) for the system model.
- [Tokenmaxxing](./concepts/tokenmaxxing.md),
  [Context optimization](./concepts/context-optimization.md), and
  [Prefix cache](./concepts/prefix-cache.md) for the core disciplines.
- [Model endpoints](./configuration/model-endpoints.md),
  [vLLM Omni](./configuration/omni.md), and
  [Context and RTK](./configuration/context-and-rtk.md) for configuration.
- [Goal mode](./workflows/goal-mode.md),
  [Plan mode](./workflows/plan-mode.md),
  [Autoresearch mode](./workflows/autoresearch-mode.md),
  [Coding workflow](./workflows/coding-workflow.md), and
  [Daemon and jobs](./workflows/daemon-jobs.md) for long-horizon workflows.
- [Acceptance](./operations/acceptance.md) and
  [Evidence and sessions](./operations/evidence-and-sessions.md) for release
  validation.
- [CLI reference](./reference/cli.md),
  [Slash commands](./reference/slash-commands.md), and
  [Configuration reference](./reference/configuration.md) when you need exact
  command or key names.

## Current Implementation

Inferoa is a TypeScript and Node.js terminal application. It stores local state
under `~/.inferoa/` by default and keeps raw endpoint secrets in the local vault
instead of plain configuration files. Node.js 24 or newer is required; the npm
package is published as `inferoa` from the `agentic-in` organization.
