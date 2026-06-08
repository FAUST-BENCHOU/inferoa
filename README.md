<p align="center">
  <img src="assets/inferoa-logo.svg" alt="Inferoa" width="420" />
</p>

<p align="center">
  <strong>The Inference Optimized Agent Harness</strong>
</p>

<p align="center">
  <a href="https://github.com/agentic-in/inferoa">GitHub</a>
  ·
  <a href="https://inferoa.agentic-in.ai/docs/intro">Docs</a>
  ·
  <a href="website/blog/2026-06-08-announcing-inferoa.md">Blog</a>
</p>

Most agents call models as if inference were a **black box**. The agent loop,
router, serving engine, context system, and multimodal path are usually split
apart, so the agent does not follow the optimization rules that modern
inference systems make possible.

> Prefix cache stability is ignored. Routing is
bolted on later. Context is pasted until it fits. Users pay for that gap.

Inferoa is an **Inference Optimized Agent Harness** for long-horizon tasks. It
starts from the inference stack and designs the agent loop around it: goals,
plans, autoresearch, context optimization, intelligent routing, serving
signals, prefix-cache protection, multimodal capability, and verification all
belong to the same durable session.

## TUI Preview

<div align="center">
  <table>
    <tr>
      <th>Welcome</th>
      <th>Goal Mode</th>
    </tr>
    <tr>
      <td align="center"><img src="website/static/img/screenshots/inferoa-welcome.png" alt="Inferoa welcome screen" width="420" /></td>
      <td align="center"><img src="website/static/img/screenshots/inferoa-goal.png" alt="Inferoa goal mode" width="420" /></td>
    </tr>
    <tr>
      <th>Prefix Cache Status</th>
      <th>Prefix Cache Report</th>
    </tr>
    <tr>
      <td align="center"><img src="website/static/img/screenshots/inferoa-prefix-cache-status.png" alt="Inferoa prefix cache response status" width="420" /></td>
      <td align="center"><img src="website/static/img/screenshots/inferoa-prefix-cache-report.png" alt="Inferoa prefix cache report" width="420" /></td>
    </tr>
    <tr>
      <th>Plan Scope</th>
      <th>Plan Approval</th>
    </tr>
    <tr>
      <td align="center"><img src="website/static/img/screenshots/inferoa-plan-clarify.png" alt="Inferoa plan mode scope selection" width="420" /></td>
      <td align="center"><img src="website/static/img/screenshots/inferoa-plan-ready.png" alt="Inferoa plan approval screen" width="420" /></td>
    </tr>
    <tr>
      <th>Autoresearch Setup</th>
      <th>Autoresearch Iteration</th>
    </tr>
    <tr>
      <td align="center"><img src="website/static/img/screenshots/inferoa-autoresearch-start.png" alt="Inferoa autoresearch setup" width="420" /></td>
      <td align="center"><img src="website/static/img/screenshots/inferoa-autoresearch-iteration.png" alt="Inferoa autoresearch iteration" width="420" /></td>
    </tr>
  </table>
</div>

## Why Inferoa

Long-horizon agents are not one prompt. They are many turns of planning,
editing, tool use, retries, compaction, cache warmup, route selection, and
verification. If the harness treats every turn as generic chat traffic, it
throws away the optimization surface underneath it.

Inferoa makes those surfaces first-class:

- **Prefix cache is protected**, not merely reported after the turn.
- **Goals, plans, and autoresearch** are native long-horizon modes.
- **Context is optimized** through CodeGraph, RTK, and built-in harnesses that
  reduce token waste while improving task accuracy.
- **Routing is part of the agent design**, so not every turn has to use the
  same frontier model path.
- **Serving and endpoint signals** feed back into the loop instead of living in
  logs.
- **Multimodal work** stays inside the same session contract instead of
  becoming disconnected side calls.

## Why Coding First

Inferoa starts with coding agents because coding is one of the most demanding
long-horizon domains: large repositories, changing goals, tool failures,
context pressure, repeated model calls, and proof through tests all show up in
one workflow.

That makes coding a useful path toward stronger agent systems. It forces the
harness to co-optimize context selection, prefix-cache stability, routing, and
verification under real pressure.

## Across the Inference Stack

Inferoa is built on top of the vLLM Ecosystem and extends across the inference
stack:

| Layer | Substrate | Inferoa role | Optimization target |
| --- | --- | --- | --- |
| Agent Harness | Inferoa | Goals, plans, autoresearch, sessions, tools, recovery, verification | Keep long-horizon work coherent and resumable |
| Context Optimization | CodeGraph, RTK... | Select repo evidence, symbols, summaries, resources, and tool results | Spend fewer tokens and improve coding accuracy |
| Intelligent Routing | vLLM Semantic Router | Choose model paths by cost, safety, privacy, capability, and session pressure | Avoid using one expensive path for every turn |
| Serving | vLLM Engine | Use high-performance OpenAI-compatible inference and endpoint signals | Protect prefix cache stability across the session |
| Multimodal | vLLM Omni | Bring image, video, and audio understanding/generation into the same loop | Keep multimodal tasks durable and inspectable |

The product shape is:

```text
Agent Harness -> Context Optimization -> Intelligent Routing -> Serving -> Multimodal
```

The day-0 strategy is concrete: co-design with vLLM Engine, vLLM Semantic
Router, and vLLM Omni while keeping the product centered on the inference
optimized agent harness.

## Core Design

- **Long-horizon modes**: goal, plan, and autoresearch are native workflows,
  not prompt templates.
- **Prefix-cache discipline**: stable prompt epochs, deterministic tool schemas,
  bounded context sections, and cache reports protect reusable prefixes.
- **Context optimization**: CodeGraph, RTK, and built-in coding harnesses reduce
  token consumption while preserving the evidence the model needs.
- **Inference policy**: routing can respond to cost, safety, privacy,
  capability, and session pressure.
- **Serving feedback**: usage, cache, model, endpoint, and request signals are
  visible enough to influence the next agent action.
- **Durable multimodal loop**: image, video, and audio generation or
  understanding are part of the same session history and artifact model.

## Quickstart

```bash
npm install -g inferoa
inferoa setup
inferoa
```

For source development:

```bash
npm install
npm run build
make dev-bin
inferoa setup
inferoa
```

For one-shot print mode:

```bash
inferoa --print "Inspect this repository and summarize the test entrypoints."
```

Inferoa stores local state under `~/.inferoa/`. Model endpoint credentials are
stored through the local vault; config files keep references rather than raw
secrets.

## Development

```bash
npm test
make dev-bin
make docs-preview
make docs-build
```

The CLI binary is `inferoa`. The implementation is TypeScript/Node and targets
OpenAI-compatible vLLM endpoints first.

Publishing is automated from `main`: after `package.json` version is bumped,
the GitHub workflow builds, tests, packs, and publishes `inferoa@latest` to npm.
For the first release, either add an npm automation token as the `NPM_TOKEN`
repository secret or configure npm Trusted Publishing for package `inferoa`
with owner `agentic-in`, repository `inferoa`, and workflow filename
`npm-publish.yml`. The workflow file lives at
`.github/workflows/npm-publish.yml`; npm asks for the filename only. After the
package exists and the trusted publisher is configured, the workflow can publish
without a long-lived token.

## Acknowledgements

Inferoa is built for and with the vLLM ecosystem:

- [vLLM Engine](https://github.com/vllm-project/vllm)
- [vLLM Semantic Router](https://github.com/vllm-project/semantic-router)
- [vLLM Omni](https://github.com/vllm-project/vllm-omni)
