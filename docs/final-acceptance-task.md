# Final Acceptance Task

Inferoa is not considered complete until it passes a real end-to-end task
with actual model endpoints.

Unit tests, mock endpoints, and isolated smoke tests are necessary but not
sufficient. The final acceptance task must prove that the implemented agent can
use its built-in tools, manage context, and call vLLM ecosystem endpoints in one
durable coding session.

## Required Environment

The final task should use real configured endpoints:

- direct vLLM Engine endpoint for the coding model;
- vLLM Semantic Router `auto` endpoint when available;
- vLLM-Omni endpoint for multimodal tools;
- external OpenAI-compatible provider profile for required compatibility
  validation. The primary acceptance path should still prove vLLM ecosystem
  endpoints unless a specific run is intentionally testing an external
  provider.

The planned AMD validation hosts are:

- `165.245.131.56`
- `134.199.199.149`

One host should run or expose direct vLLM Engine. The other should run or expose
vLLM-Omni. The exact host assignment can change, but the final report must
record endpoint addresses, model names, server flags, and any unavailable
capabilities.

For project acceptance, these AMD endpoints are not assumed to already exist.
The acceptance work includes gaining SSH/deployment access, installing or
starting the required runtime stack, choosing models that fit the node GPU
memory, exposing OpenAI-compatible endpoints, and recording deployment evidence.
The Inferoa product should still treat those services as configured
endpoints rather than embedding a general deployment controller.

The AMD validation hosts are disposable for this project validation. Existing
containers, model processes, ports, and partial deployments may be stopped and
replaced during deployment. The final report should record what was cleaned,
but the implementation does not need to preserve host state for backwards
compatibility.

The external provider path is also required. At minimum, setup and validation
must prove one OpenAI-compatible external provider by entering credentials,
probing `/v1/models`, selecting a model, and running a chat request through
Inferoa. One current validation target exposes `tke/deepseek-v4-flash` from
its model list. Raw API keys must not be committed to docs, config, progress
logs, or evidence artifacts.

## Required Task Shape

Use a real coding task against a non-trivial local repository. The task must
force the agent to use the core coding workflow:

1. inspect the repository;
2. use `file_search`;
3. read files;
4. use code-intelligence where supported;
5. edit files;
6. run shell commands or tests;
7. maintain a task/evidence ledger;
8. handle at least one long-running or background process record;
9. produce a final explanation with evidence.

The task should be large enough to make context optimization meaningful. It must
trigger context compression either naturally or through a controlled test setup.
The final report must show:

- when compression was triggered;
- what was preserved;
- what was moved into managed resources;
- prompt/token counts when available;
- cached-token evidence when direct vLLM exposes it.

## Required Multimodal Coverage

The same acceptance run, or a linked continuation in the same durable session,
must exercise endpoint-backed Omni tools:

- image understanding;
- image generation;
- video generation.

If the deployed Omni endpoint also supports video understanding, include it.
If it does not, record the missing capability as an endpoint limitation rather
than a passed test.

Generated media should be stored as managed resources or artifacts, with stable
references in the session log. The agent should not paste large binary or media
payloads into the prompt.

## Required Session And Supervisor Coverage

The final acceptance task must prove long-horizon behavior:

- session creation and resume;
- durable event log replay;
- single-writer lock behavior;
- background process event records;
- context compression and continued work after compression.

After T9, the same task must also prove `inferoa daemon` behavior:

- start a supervised run;
- detach the terminal;
- keep a long-running process or agent run alive;
- reattach and inspect status/logs;
- cancel or complete the supervised run;
- suspend and resume safely if a permission prompt occurs.

Before T9, daemon behavior can be recorded as not implemented, but the
event/process schema must already be compatible with it.

## Pass Criteria

The final task passes only if all of these are true:

- the coding task is completed by Inferoa using a real model endpoint;
- built-in tools are used successfully, not only listed or mocked;
- context compression occurs and work continues after compression;
- image understanding works through the configured multimodal endpoint;
- image generation works through the configured multimodal endpoint;
- video generation works through the configured multimodal endpoint;
- session events, resources, prompt hashes, and endpoint evidence are persisted;
- direct vLLM cached-token evidence is recorded when the endpoint exposes it;
- failures are limited to explicitly unavailable endpoint capabilities and are
  recorded with concrete endpoint/model details.

The project is not complete if the final evidence only shows unit tests, mock
servers, or manual calls outside the agent.

## Runner

The prototype includes a real-endpoint acceptance runner:

```bash
node dist/src/cli.js debug acceptance --daemon
```

The runner checks configuration first and refuses to pass without:

- `model_setup.base_url`;
- `model_setup.model`;
- Omni `vision`, `image_generation`, and `video_generation` endpoint
  `base_url` plus `model` values.

When configured, the acceptance workflow creates a durable session, forces
compression, asks the model to complete a real repository edit using built-in
tools, runs Omni multimodal tools through the agent tool loop, records endpoint
evidence, and validates daemon attach/detach/status/cancel behavior.

The final product acceptance must be driven from the TUI. The current CLI
runner can remain as an automation scaffold, but it does not by itself satisfy
final acceptance.

The TUI acceptance run must show per-turn cache evidence after each chat turn.
For direct vLLM this means cached prompt tokens, total prompt tokens, cache hit
rate, output tokens, endpoint mode, model, and request id when the endpoint
exposes those fields.

The runner verifies persisted evidence rather than trusting the prompt alone.
It checks for:

- required tool calls by category: `file_search`, read, edit,
  shell/background process, git, todo, evidence, code intelligence, and Omni;
- background process start and stop/cancel events;
- context compression followed by later model or tool work;
- session resume evidence in the same durable session;
- managed resources;
- prompt hash and tool schema hash records;
- endpoint evidence and cached-token fields when the endpoint exposes them;
- daemon job status, attach, detach, and cancel records on the same session.

## Final Report Requirements

The final report must include:

- repository and task description;
- configured provider, direct vLLM, SR, and Omni endpoints;
- model names;
- vLLM engine flags relevant to prefix caching, prompt token details, request
  ids, chunked prefill, and tool calling;
- tool calls used by category;
- files changed;
- tests or commands run;
- context compression evidence;
- multimodal artifacts and resource ids;
- session id and resume evidence;
- daemon attach/detach evidence after T9;
- remaining endpoint limitations or blockers.
