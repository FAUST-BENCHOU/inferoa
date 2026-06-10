# Roadmap

This roadmap supersedes the earlier CLI-first M0-M8 implementation labels.
The existing backend prototype is useful as scaffolding, but it does not satisfy
the product goal until the user workflow is TUI-first end to end.

## Product Contract

Inferoa is a branded terminal application, not a collection of CLI
subcommands with a small readline fallback.

- `inferoa` launches the TUI by default.
- `inferoa "prompt"` launches the TUI and submits the initial prompt in the
  new or resumed session.
- `inferoa setup` opens the TUI setup wizard.
- `inferoa --print "prompt"` is the explicit non-interactive path.
- This is a fast-development product, so there is no compatibility requirement
  for the current CLI-first scaffold. Any command, flag, output format, or
  workflow that conflicts with the TUI-first product contract should be removed
  instead of preserved.
- JSON and narrow debug commands may exist only when they support tests or
  acceptance automation. They should not shape the user workflow.
- The chat `/` command registry is a first-class TUI surface with its own
  product-specific command set. It must not be a mirror of legacy CLI
  subcommands.
- The user-facing identity stays simple: current directory plus session
  id/title. Internal workspace, run, client, prompt epoch, and cache salt ids
  remain implementation details.

## T0: Goal Reset And UI Direction

- mark the earlier CLI-first prototype as scaffolding, not complete product;
- lock the TUI-first entrypoint contract;
- use `docs/tui-product-design.md` as the UI product contract;
- define the Inferoa brand language for the terminal UI: inference-native,
  fast, technical, cache-aware, and visually distinct;
- define core scenes: welcome, setup, chat, sessions, tools, endpoints, daemon,
  and acceptance;
- define terminal animation rules for smooth streaming, tool progress, endpoint
  probing, compression, and artifact creation;
- define the canonical TUI slash command registry and delete incompatible CLI
  subcommands or chat commands from the active user path;
- update public docs after validation.

Validation:

- `inferoa --help` documents TUI-first behavior;
- roadmap and README no longer present CLI-first commands as the main path.
- no legacy command is retained solely for backwards compatibility.

## T1: TUI Application Shell

- implement a real terminal app shell with transcript, input editor, status
  line, overlays, selector lists, notifications, and keyboard bindings;
- add branded Inferoa welcome screen with workspace, endpoint, model,
  session, git, context, and daemon status;
- add slash command palette for setup, status, sessions, tools, endpoints,
  daemon, and doctor views;
- add responsive terminal layout that works in narrow and wide panes;
- keep rendering deterministic and testable through snapshot or ANSI output
  checks.

Validation:

- `inferoa` opens the TUI;
- slash command palette opens and can select a command;
- terminal resize does not corrupt the layout.

## T2: TUI Setup Wizard

- move provider setup into TUI scenes, not plain CLI output;
- support direct vLLM setup with endpoint URL, vault-backed API key, `/v1/models`
  probing, and model selection;
- support external OpenAI-compatible setup with endpoint URL, masked vault
  secret entry, `/v1/models` probing, and model selection;
- support `auto` setup through vLLM Semantic Router with `/v1/models` probing
  when available;
- support Omni endpoint setup for vision, image generation, video
  understanding, video generation, audio understanding, and audio generation;
- after the user enters a key or endpoint, actively probe the endpoint and show
  a model picker instead of asking the user to type model ids manually;
- write config only after a final review screen;
- never persist raw pasted API keys in config; setup stores secrets in the
  local encrypted vault and writes only `api_key_ref`.

Validation:

- setup can configure the provided OpenAI-compatible provider and list
  `tke/deepseek-v4-flash`;
- setup can configure direct vLLM and Omni endpoints from the AMD validation
  deployment;
- invalid endpoints produce actionable TUI errors.

## T3: Chat And Tool Interaction TUI

- render streaming assistant output in the transcript;
- render tool calls as cards with status, duration, bounded output, and
  expandable managed resources;
- animate pending tools with smooth but bounded redraw cadence;
- render file edits with diff previews and approval controls where policy
  requires approval;
- stabilize streaming edit previews so partial removals do not jitter before
  matching additions arrive;
- render line-numbered diffs with added/removed colors, indentation markers,
  syntax-highlighted context, and intra-line changed-token emphasis;
- render shell and background process tools with live output, stop controls,
  and bounded buffers;
- render git, todo, evidence, and code-intelligence results in compact
  workflow cards;
- support image and video artifacts as first-class transcript resources.

Validation:

- a real coding task uses file search, read, edit, shell/process, git, todo,
  evidence, and code intelligence through the TUI;
- permission prompts are handled inside the TUI.
- file diff and shell/process output are visually inspectable without raw JSON.

## T4: Sessions And Workspace UX

- add TUI session picker with title, id, status, last updated time, and
  workspace path;
- add resume, archive, rename, and new-session flows;
- support multiple independent sessions per workspace with a single active
  writer lock per session;
- show lock conflicts and stale lock recovery in the TUI;
- keep internal workspace ids and client ids out of normal user output.

Validation:

- a session can be resumed from the TUI and continues the same event log;
- concurrent terminals show clear session ownership state.

## T5: Endpoint Evidence And vLLM Optimization

- record direct vLLM cached-token usage when exposed;
- record prompt hashes, tool schema hashes, endpoint request ids, response ids,
  model ids, and usage metadata;
- record `/tokenize` availability as optional endpoint evidence when available,
  but do not require it for workflow token budgeting;
- show endpoint capability status in the TUI without assuming direct access to
  serving metrics;
- after every assistant turn, render a compact cache/usage footer with prompt
  tokens, cached prompt tokens, cache hit rate, output tokens, endpoint mode,
  model, and request id when available;
- expose a `/cache` or equivalent TUI view for recent turns and aggregate cache
  evidence;
- keep stable prompt sections and deterministic tool schema order within each
  prompt epoch.

Validation:

- endpoint evidence is persisted and visible from the TUI;
- direct vLLM cache evidence is recorded when the endpoint exposes it.
- turns without provider cache fields omit cache-hit fields entirely; cache
  hit rate is shown only when the endpoint exposes cached prompt tokens.

## T6: Context Compression UX

- estimate prompt size against configured context windows;
- compact older middle context at the configured threshold;
- mechanically prune large raw tool outputs into managed resources before
  model summarization;
- render compression events in the transcript with what was preserved, moved,
  and summarized;
- continue work after compression in the same session.

Validation:

- a controlled long task triggers compression;
- the agent continues after compression, surfaces compression status in the
  TUI transcript, and persists resume/compression evidence.

## T7: AMD Endpoint Deployment And Validation

Product code must not become a deployment controller, but the project
acceptance environment must be deployed and validated by the project team.

Planned AMD validation hosts:

- `165.245.131.56`
- `134.199.199.149`

Required deployment shape:

- one host exposes a direct vLLM Engine OpenAI-compatible endpoint for the
  coding model;
- one host exposes vLLM-Omni OpenAI-compatible endpoints for multimodal
  tools;
- deployed models must fit the host GPU memory and support the required node
  GPU/runtime stack;
- existing containers, model processes, and occupied ports on the validation
  hosts may be cleaned during deployment. The runbook should record what was
  stopped or replaced, but it does not need to preserve pre-existing services;
- the final report records endpoint URLs, model names, server flags, and
  unavailable capabilities.

Validation:

- direct vLLM `/v1/models`, chat, tool calling, streaming, token usage, and
  cached-token evidence work when exposed;
- Omni image understanding, image generation, and video generation work through
  Inferoa tools;
- SSH/deployment access to both hosts is documented before this milestone can
  pass.

## T8: Auto Mode Through vLLM Semantic Router

- configure `auto` mode through the TUI;
- connect to vLLM Semantic Router as an endpoint, not as an owned deployment;
- pass stable session identity headers;
- preserve tool-loop continuity from the agent side;
- record router-visible model selection metadata when available.

Validation:

- TUI setup can configure SR;
- a coding session runs through SR and persists router evidence.

## T9: Long-Horizon Supervisor TUI

- add daemon job view with queued, running, detached, cancelled, failed, and
  complete states;
- support attach, detach, status, logs, and cancel from the TUI;
- keep long-running processes alive after terminal detach where possible;
- suspend safely when approval is required and resume after attach;
- transfer session writer ownership to the daemon while a supervised run is
  active.

Validation:

- daemon attach, detach, status, and cancel work from the TUI on the same final
  acceptance task.

## T10: Final Real-Endpoint Acceptance

The project is complete only when the TUI-driven product completes a real
end-to-end coding task with actual configured endpoints.

Required coverage:

- complete a real coding task using a real model endpoint;
- use built-in tools: file search, read, edit, shell/process, git, todo,
  evidence, and code intelligence where supported;
- trigger context compression and continue after compression;
- run image understanding through the configured Omni endpoint;
- run image generation through the configured Omni endpoint;
- run video generation through the configured Omni endpoint;
- persist session events, resources, prompt hashes, endpoint evidence, and
  resume evidence;
- record direct vLLM cached-token evidence when exposed;
- validate daemon attach, detach, status, and cancel behavior on the same final
  task.

## Later

- local HTTP API;
- local web dashboard;
- standalone binary packaging;
- richer codegraph index layer;
- expanded multimodal workflows beyond endpoint-backed built-ins;
- Responses API continuation support;
- richer Semantic Router replay integration;
- remote or multi-machine long-horizon supervision;
- endpoint capability discovery for scheduler hints and cache diagnostics.
