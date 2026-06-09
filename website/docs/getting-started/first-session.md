---
title: First Session
sidebar_label: First session
---

A session is the durable unit of work in Inferoa. It keeps the transcript,
workspace identity, prompt epochs, tool traces, managed resources, and endpoint
evidence together.

## Start

```bash
inferoa
```

Describe a concrete task in the composer. For coding work, include the outcome
you want and any constraints that matter:

```text
Inspect this package, find the test entrypoints, and add a missing docs build check.
```

You can also start a session and submit a prompt from the shell:

```bash
inferoa "Inspect this package and add a missing docs build check."
```

## Use Modes Deliberately

- Use plain chat for small questions and one-turn inspections.
- Use [`/plan set`](../workflows/plan-mode.md) when scope is ambiguous and you
  want a plan before execution.
- Use [`/goal set`](../workflows/goal-mode.md) when the work should continue
  until a durable objective is done.
- Use [`/autoresearch`](../workflows/autoresearch-mode.md) when the task is
  experiment-shaped and needs repeated measurement.
- Use [`/acceptance`](../operations/acceptance.md) when validating a
  release-quality endpoint setup.

## Inspect Evidence

During or after the session:

```text
/context                      Show context and compression state
/tools last                   Show the latest tool trace
/tokenmaxxing                 Show token, cache, RTK, and routing pressure
/sessions all                 Show active and archived sessions
```

The session log is designed to prove what happened: which files were read,
which tools ran, which endpoint handled the request, and which artifacts were
stored. See [Evidence and sessions](../operations/evidence-and-sessions.md)
for the event log model.

## Resume Later

Open the session picker from the TUI:

```text
/sessions resume
```

Or run the top-level `/resume` slash command to attach to a previous session.
The resumed session keeps its workspace identity and event log; you can keep
using `/goal`, `/plan`, `/autoresearch`, and the rest of the TUI surfaces
without losing continuity.
