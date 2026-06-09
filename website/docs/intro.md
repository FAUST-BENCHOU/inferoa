---
id: intro
title: Inferoa
sidebar_label: Overview
---

Inferoa is an **Inference-native Tokenmaxxing Agent Harness**.

Most agents treat inference as a black-box chat API. inferoa starts from the
opposite direction: the agent loop is designed around tokenmaxxing across the
inference stack. Long sessions, prefix-cache discipline, context pressure,
model routing, self-hosted serving signals, multimodal artifacts, and
verification all belong to one durable harness.

## What inferoa Tokenmaxxes

- Goal, plan, and autoresearch modes for long-horizon work.
- Prefix-cache discipline through prompt epochs and deterministic tool schemas.
- Context Optimization with CodeGraph, RTK, and built-in coding harnesses.
- Intelligent routing through vLLM Semantic Router.
- Self-Hosted Model Serving through vLLM Engine-compatible endpoints.
- Native multimodal paths through vLLM Omni in the same session loop.

## Why Coding First

Coding is a high-pressure long-horizon task: large repositories, tool failures,
context limits, repeated model calls, and proof through tests all appear in the
same workflow. That makes it a strong first domain for co-designing agent
behavior with inference behavior.

## Current Implementation

inferoa is a TypeScript/Node terminal application. It uses OpenAI-compatible
endpoints first, stores local state under `~/.inferoa/`, and keeps raw secrets
in the local vault instead of plain config files.
