---
title: Context And RTK
sidebar_label: Context and RTK
---

Inferoa uses context settings and RTK to reduce token waste while preserving
the evidence required for accurate work.

## Context Settings

```yaml
context:
  compression_threshold: 0.75
  context_window: 256000
  # Optional automatic compact trigger overrides:
  # output_reserve_tokens: 16000
  # compact_buffer_tokens: 12000
  auto_compact_failure_limit: 3
  compact_recent_file_limit: 5
  compact_recent_file_token_limit: 5000
  compact_recent_total_token_limit: 25000
  protected_recent_loops: 3
  engine:
    provider: auto
    startup: welcome
    require_ready_before_chat: true
    watch: true
```

By default, automatic compaction is triggered from usable headroom:
`effective_window = context_window - output_reserve`, then
`trigger = effective_window - compact_buffer`. If `output_reserve_tokens` or
`compact_buffer_tokens` are not configured, Inferoa derives bounded values from
the context window. Setting `compression_threshold` to a value other than the
default keeps the older ratio-based trigger as an explicit override.

Automatic compaction pauses after `auto_compact_failure_limit` consecutive
model-summary failures. Manual `/compact` remains available. Compaction retries
large summary requests as prefix-preserving, standalone, then trimmed
standalone payloads before falling back to deterministic memory. Recent read
file/resource evidence, the active plan, and invoked skills are attached to the
post-compact epoch with the configured caps. `protected_recent_loops` keeps
recent model and tool work visible. The context engine can use automatic
detection, CodeGraph, built-in behavior, or be turned off.

## RTK Settings

```yaml
rtk:
  enabled: true
  delivery: managed
  version: 0.42.3
  auto_download: true
```

Environment overrides:

```bash
INFEROA_RTK=false inferoa
INFEROA_RTK_PATH=/path/to/rtk inferoa
INFEROA_RTK_AUTO_DOWNLOAD=false inferoa
```

## Operational Views

```text
/context
/compact [instructions]
/tokenmaxxing
/tokenmaxxing trend
/tokenmaxxing signals
```

`/context` reports context usage and compression state. `/compact` forces a
conversation summary immediately and accepts optional summary instructions.
`/tokenmaxxing` reports RTK savings, prefix-cache safety, compact boundaries,
and token pressure alongside endpoint usage evidence. `/tokenmaxxing trend`
shows pageable metric charts; `/tokenmaxxing signals` shows raw lifecycle and
endpoint evidence.
