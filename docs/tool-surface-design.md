# Tool Surface Design

This refactor keeps the model-visible tool schema stable while preserving the full runtime capability set.

## Layers

| Layer | Model-visible schema | Runtime execution | Intended use |
| --- | --- | --- | --- |
| Direct | Included in the session tool snapshot | Called by name | Default coding loop: repository exploration, search, reads, patches, commands, git, todos, clarification, subagents, and capability discovery/execution wrappers. |
| Deferred | Not included in the direct schema | Discovered with `tool_search`, executed with `capability_call` | Precision or less-common capabilities such as LSP, AST tools, resources, web, skill loading, directory/glob helpers, and non-patch file writes. |
| Mode-only | Not included in the direct schema | Executed with `capability_call` when active mode context makes it relevant | Plan, goal, autoresearch, and Omni capabilities. Mode state remains tail context rather than a system-prompt or schema mutation. |

## Defaults

CodeGraph is the default structural exploration entry point when available. It gives the agent one broad repository-level tool before it reaches for narrower mechanisms.

LSP and AST tools remain available, but as deferred precision tools. This avoids making the agent choose among overlapping exploration primitives in the default schema. The intended order is:

1. Use `codegraph` for architecture, call flow, impact, and cross-file exploration.
2. Use `file_search` and `read_file` for text evidence and source-of-truth reads.
3. Use `tool_search` plus `capability_call` for LSP/AST when exact symbol or structural evidence is needed.

## Prefix Cache Strategy

The direct tool schema is the prefix-cache boundary. Enabling optional endpoints or entering/exiting a mode does not widen the model-visible schema and therefore does not change the tool schema hash.

`tool_search` only returns selected hidden capability schemas as ordinary tool-result evidence in the tail. It does not mutate the top-level tool list. `capability_call` is a stable wrapper that validates the target against the full runtime registry, applies the target permission policy, then executes the target handler.

## Prompt Contract

The system prompt describes the stable direct surface and the discovery/execution protocol. It does not list every hidden tool, does not mention provider-specific deferred loading, and does not ask the model to create profiles or expand schemas. Active mode state continues to be rendered as tail context.
