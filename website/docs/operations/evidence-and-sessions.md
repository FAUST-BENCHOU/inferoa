---
title: Evidence And Sessions
sidebar_label: Evidence and sessions
---

Inferoa records work as events attached to a session. This lets a later turn,
resumed TUI, or acceptance audit reconstruct what happened without trusting the
final message alone.

## Session Evidence

The event log can include:

- model runs and token usage;
- tool calls and summaries;
- background process records;
- prompt epochs and hashes;
- endpoint evidence;
- managed resources;
- goal and plan state;
- daemon job state.

## Managed Resources

Large or binary outputs should be stored as resources, not pasted into the
prompt. This is especially important for generated images, videos, audio, and
long reports.

## Useful Commands

```text
/sessions all                 Show active and archived sessions
/sessions resume              Attach to a previous session
/tools last                   Show the latest tool trace
/tokenmaxxing                 Show token, cache, RTK, and routing savings
/context                      Show context and compression state
```

Use these commands to inspect the session before writing a final report or
debugging a failed workflow. The full registry, including aliases, is in
[Slash commands](../reference/slash-commands.md).
